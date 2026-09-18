import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { LarkChannel } from '@larksuite/channel';
import { activeTask, expireTask, mutateTasks, readTasks, taskStatus, watchTasks, type TeamLedger } from './task-store';
import { log } from '../core/logger';

/** One local deadline per active task. No chat polling and no model calls. */
export async function startTaskDeadlines(root: string, profile: string, channel: LarkChannel, enabled: (chatId: string) => boolean): Promise<() => void> {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let stopped = false;
  const schedule = (file: string, ledger: TeamLedger) => {
    const context = ledger.context;
    if (context?.profile !== profile || dirname(file) !== join(root, 'team-tasks')) return;
    clearTimeout(timers.get(file)); timers.delete(file);
    const task = activeTask(ledger);
    if (stopped || !enabled(context.chatId) || !task?.deadlineAt || task.deadlineNotified || !task.steps.some(s => ['waiting','sending','uncertain'].includes(s.state))) return;
    const timer = setTimeout(() => {
      timers.delete(file);
      void (async () => {
        if (stopped || !enabled(context.chatId)) return;
        const expired = await mutateTasks(file, l => expireTask(l, task.id, Date.now()));
        if (!expired) return;
        await channel.send(context.chatId, {markdown: taskStatus(expired)}, {
          replyTo: expired.origin, ...(context.threadId ? {replyInThread:true} : {}),
          mentions:[{key:'@requester',openId:expired.requester,isBot:false}],
        });
      })().catch(() => log.warn('team', 'deadline-notice-failed', {profile, taskId:task.id}));
    }, Math.max(0, task.deadlineAt - Date.now()));
    timer.unref(); timers.set(file, timer);
  };
  const unwatch = watchTasks(schedule);
  try {
    for (const name of await readdir(join(root, 'team-tasks'))) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
      const file = join(root, 'team-tasks', name);
      schedule(file, await readTasks(file));
    }
  } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') log.warn('team','deadline-restore-failed',{profile}); }
  return () => { stopped = true; unwatch(); for (const timer of timers.values()) clearTimeout(timer); timers.clear(); };
}
