import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeFileAtomic } from '../platform/atomic-write';

export interface TeamStep {
  id: string; recipient: string; name: string; instruction: string;
  state: 'sending' | 'waiting' | 'done' | 'blocked' | 'uncertain' | 'question' | 'rejected' | 'superseded';
  resumes?: string;
  messageId?: string; result?: string; receiptId?: string;
}
export interface TeamTask {
  id: string; goal: string; requester: string; origin: string;
  state: 'planning' | 'waiting' | 'ready' | 'blocked' | 'completed' | 'cancelled';
  createdAt: string; updatedAt: string; round: number; steps: TeamStep[];
  summary?: string; note?: string;
  history?: {at:string;text:string}[];
  document?: {token?:string;url?:string;creating?:boolean;shared?:boolean;hash?:string;error?:string};
  deadlineAt?: number; deadlineNotified?: boolean;
  updates?: {sender:string;messageId:string;text:string}[];
}
export interface TeamLedger { tasks: TeamTask[]; context?: { profile: string; chatId: string; threadId?: string } }
export const terminalTask = (t: TeamTask) => t.state === 'completed' || t.state === 'cancelled';
export const activeTask = (l: TeamLedger) => l.tasks.find(t => !terminalTask(t));
export function taskFile(root: string, profile: string, scope: string): string {
  return join(root, 'team-tasks', createHash('sha256').update(JSON.stringify([profile, scope])).digest('hex') + '.json');
}
export async function readTasks(file: string): Promise<TeamLedger> {
  try { return JSON.parse(await readFile(file, 'utf8')) as TeamLedger; }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { tasks: [] }; throw e; }
}
// The supervisor owns one runtime per profile. Serialize intake, UI and final
// delivery mutations; never hold this lock across network/model calls.
const queues = new Map<string, Promise<unknown>>();
const listeners = new Set<(file: string, ledger: TeamLedger) => void>();
export function watchTasks(listener: (file: string, ledger: TeamLedger) => void): () => void {
  listeners.add(listener); return () => { listeners.delete(listener); };
}
export async function mutateTasks<T>(file: string, change: (ledger: TeamLedger) => T): Promise<T> {
  const next = (queues.get(file) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const ledger = await readTasks(file);
    const before = new Map(ledger.tasks.map(t => [t.id, structuredClone(t)]));
    const result = change(ledger);
    for (const task of ledger.tasks) {
      const old = before.get(task.id);
      const changes: string[] = [];
      if (!old) changes.push(`任务创建：${task.goal}`);
      if (old?.state !== task.state) changes.push(`状态：${labels[task.state]}`);
      if (old?.note !== task.note && task.note) changes.push(task.note);
      if (old?.summary !== task.summary && task.summary) changes.push(task.summary);
      for (const step of task.steps) {
        const prev = old?.steps.find(s => s.id === step.id);
        if (JSON.stringify(prev) !== JSON.stringify(step)) changes.push(`${step.id} ${step.name}：${labels[step.state]}\n${step.result || step.instruction}`);
      }
      for (const u of task.updates ?? []) if (!old?.updates?.some(v => v.messageId === u.messageId)) changes.push(`人的反馈（${u.sender}）：${u.text}`);
      if (changes.length) { task.history ??= []; task.history.push({at:new Date().toISOString(),text:changes.join('\n\n')}); }
    }
    await writeFileAtomic(file, JSON.stringify(ledger, null, 2), { mode: 0o600 });
    for (const listener of listeners) listener(file, structuredClone(ledger));
    return result;
  });
  queues.set(file, next);
  try { return await next; } finally { if (queues.get(file) === next) queues.delete(file); }
}
export function expireTask(ledger: TeamLedger, id: string, now: number): TeamTask | undefined {
  const t = ledger.tasks.find(t => t.id === id);
  if (!t || terminalTask(t) || t.deadlineNotified || !t.deadlineAt || now < t.deadlineAt || !t.steps.some(s => s.state === 'waiting' || s.state === 'sending' || s.state === 'uncertain')) return;
  t.deadlineNotified = true; t.state = 'blocked';
  t.note = '等待回执超过15分钟。已有结果已保存；不会重复派单。请核对执行者是否在线，或 /team resume 检查历史回执。';
  touchTask(t); return structuredClone(t);
}
export function createTask(ledger: TeamLedger, goal: string, requester: string, origin: string): TeamTask {
  if (activeTask(ledger)) throw new Error('本会话已有协作任务，请先完成或取消，再开始新任务。');
  if (!goal.trim() || goal.length > 12000) throw new Error('请说明协作目标（最多 12000 字）。');
  const now = new Date().toISOString();
  const task: TeamTask = { id: 'TEAM-' + randomUUID().slice(0, 8), goal, requester, origin,
    state: 'planning', createdAt: now, updatedAt: now, round: 0, steps: [] };
  ledger.tasks.unshift(task); return task;
}
export const touchTask = (t: TeamTask) => { t.updatedAt = new Date().toISOString(); };
export function receiveResult(ledger: TeamLedger, input: { taskId: string; stepId: string; sender: string; messageId: string; body: string; blocked: boolean; kind?: 'question'|'rejected' }): 'ignore' | 'stored' | 'wake' {
  const t = ledger.tasks.find(t => t.id === input.taskId);
  if (!t || terminalTask(t)) return 'ignore';
  const s = t.steps.find(s => s.id === input.stepId && s.recipient === input.sender);
  if (!s || s.receiptId || s.state === 'done' || s.state === 'blocked') return 'ignore';
  s.result = input.body.slice(0, 24000); s.receiptId = input.messageId;
  s.state = input.kind ?? (input.blocked ? 'blocked' : 'done'); touchTask(t);
  if (input.blocked || input.kind) { t.state = 'blocked'; return 'wake'; }
  if (!t.steps.some(s=>['sending','waiting','uncertain'].includes(s.state))) { t.state = 'ready'; return 'wake'; }
  return 'stored';
}
const labels: Record<TeamTask['state'] | TeamStep['state'], string> = {
  planning: '整理分工', waiting: '等待回执', ready: '待汇总', blocked: '阻塞', completed: '已完成', cancelled: '已取消',
  sending: '正在派发', done: '已返回', uncertain: '发送结果待核对',
  question: '需要补充', rejected: '验收未通过', superseded: '已交后续任务继续',
};
export function taskStatus(t?: TeamTask): string {
  if (!t) return '当前没有协作任务。直接 @我提问，或发“组织协作：具体目标”开始。';
  const age = Math.floor((Date.now() - Date.parse(t.updatedAt)) / 60000);
  return `**${t.id} · ${labels[t.state]}**\n${t.goal}\n` +
    t.steps.map(s => `- ${s.name}：${labels[s.state]}`).join('\n') +
    (t.document?.url ? `\n任务文档：${t.document.url}` : '') + (t.document?.error ? `\n文档同步待处理：${t.document.error}` : '') +
    (t.note ? `\n${t.note}` : '') + (t.summary ? `\n${t.summary}` : '') +
    (!terminalTask(t) && age >= 10 ? `\n已有 ${age} 分钟无新进展，可用 /team resume 核对；不会自动重复派单。` : '');
}
