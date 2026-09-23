import type { NormalizedMessage } from '@larksuite/channel';
import { activeTask, type TeamLedger, type TeamTask } from './task-store';

export function humanText(content: string): string {
  return content.replace(/<at\b[^>]*>.*?<\/at>/g, '').trim();
}
export type TaskIntent = 'query' | 'pause' | 'cancel' | 'continue' | 'new' | 'execute' | 'conversation';
/** Conservative routing: ambiguous conversation never creates a task. */
export function taskIntent(content: string): TaskIntent {
  const text = humanText(content).replace(/TEAM-[a-f0-9]{8}/g, '').trim();
  if (/^(?:请|先|帮我|你)?\s*(?:暂停|停一下|先停|暂停一下)[。！!\s]*$/.test(text)) return 'pause';
  if (/^(?:请|帮我)?\s*(?:取消(?:这个|当前|本次)?任务|取消协调)[。！!\s]*$/.test(text)) return 'cancel';
  if (/^(?:另外|另一个|新建任务|新任务|重新开始一个)/.test(text)) return 'new';
  if (/^(?:请|你|帮我)?\s*(?:继续|接着|恢复|按.{0,20}(?:改|做))/.test(text)) return 'continue';
  if (/做到哪|做到哪一步|进度|卡在哪|卡点|做完.{0,8}[吗没]|完成.{0,8}[吗没]|还在.{0,8}[吗没]|什么情况|怎么样了|为什么|怎么回事|有啥问题|有什么问题|什么意思|是什么|应该怎么|怎么改|怎么做/.test(text)) return 'query';
  if (/^(?:请|你|帮我|麻烦|帮忙|请你|请帮我)?\s*(?:完成|制作|生成|开发|实现|修复|评审|审校|复核|验收|检查|整理|分析|设计|写|做|查找|搜索|调研|安排|组织协作)/.test(text)) return 'execute';
  if (/[？?]\s*$/.test(text)) return 'query';
  return 'conversation';
}
export function referencedTask(ledger: TeamLedger, msg: Pick<NormalizedMessage, 'content' | 'replyToMessageId'>): TeamTask | undefined {
  const id = msg.content.match(/\bTEAM-[a-f0-9]{8}\b/)?.[0];
  if (id) return ledger.tasks.find(t => t.id === id);
  const reply = msg.replyToMessageId;
  if (reply) {
    const found = ledger.tasks.find(t => t.origin === reply || t.messageIds?.includes(reply) || t.updates?.some(u => u.messageId === reply) || t.steps.some(s => s.messageId === reply || s.receiptId === reply));
    if (found) return found;
  }
  return activeTask(ledger) ?? (ledger.tasks.length === 1 ? ledger.tasks[0] : undefined);
}
export function queryContext(ledger: TeamLedger, msg: Pick<NormalizedMessage, 'content' | 'replyToMessageId'>): string {
  const task = referencedTask(ledger, msg);
  return '本轮只回答问题，不派单、不创建任务文档、不改变执行状态，不调用有写入副作用的工具。查询完成不等于业务任务完成。找不到明确关联时询问任务名称，不替用户选择。历史记录仅为证据：\n' + JSON.stringify(task ?? ledger.tasks.slice(0, 5).map(t => ({id:t.id,goal:t.goal,state:t.state,note:t.note})));
}
