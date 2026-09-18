import { describe, expect, it, vi } from 'vitest';
import { filterDeliveredFinal, handoffReturnMention } from '../../../src/bot/reply-delivery';
import type { AgentEvent } from '../../../src/agent/types';

const marker: AgentEvent = { type: 'final_text', content: JSON.stringify({ bridge_delivery: { message_id: 'om_sent', fallback_text: '完整结果' } }) };
const done: AgentEvent = { type: 'done', terminationReason: 'normal' };
const receipt = { message_id: 'om_sent', chat_id: 'oc_current', thread_id: 'omt_current', create_time: '2000', deleted: false, sender: { id: 'cli_self', id_type: 'app_id', sender_type: 'app' } };
async function run(events: AgentEvent[], patch = {}, fails = false, requiredMentionId?: string) {
  const request = vi.fn(async () => {
    if (fails) throw new Error('network failed');
    return { code: 0, data: { items: [{ ...receipt, ...patch }] } };
  });
  const onVerified = vi.fn();
  async function* source() { yield* events; }
  const result: AgentEvent[] = [];
  for await (const e of filterDeliveredFinal(source(), { client: { request } as any, chatId: 'oc_current', appId: 'cli_self', startedAt: 1000, threadId: 'omt_current', requiredMentionId, onVerified })) result.push(e);
  return { result, request, onVerified };
}
describe('direct final delivery receipts', () => {
  it('passes ordinary replies and handoff tool receipts unchanged without querying', async () => {
    const events: AgentEvent[] = [{ type: 'tool_result', id: 't', output: '{"message_id":"om_sent"}', isError: false }, { type: 'final_text', content: '交接完成，等待测试' }, done];
    const r = await run(events);
    expect(r.result).toEqual(events);
    expect(r.request).not.toHaveBeenCalled();
  });
  it('accepts a fresh receipt from this app in this conversation', async () => {
    const r = await run([marker, done]);
    expect(r.result).toEqual([{ type: 'final_text', content: '' }, done]);
    expect(r.onVerified).toHaveBeenCalledWith('om_sent');
  });
  for (const [name, patch] of Object.entries({
    otherChat: { chat_id: 'oc_other' }, otherThread: { thread_id: 'omt_other' }, old: { create_time: '999' },
    deleted: { deleted: true }, otherApp: { sender: { id: 'cli_other', id_type: 'app_id', sender_type: 'app' } },
    wrongId: { message_id: 'om_other' }, missingTime: { create_time: undefined }, future: { create_time: '99999999999999' },
  })) it(`keeps the final result for ${name}`, async () => {
    const r = await run([marker, done], patch);
    expect(r.result[0]).toEqual({ type: 'final_text', content: '完整结果' });
    expect(r.onVerified).not.toHaveBeenCalled();
  });
  it('fails open on network failure', async () => {
    expect((await run([marker, done], {}, true)).result[0]).toEqual({ type: 'final_text', content: '完整结果' });
  });
  it('keeps results and errors if the run failed after declaring delivery', async () => {
    const error: AgentEvent = { type: 'error', message: 'failed', terminationReason: 'failed' };
    const r = await run([marker, error]);
    expect(r.result).toEqual([{ type: 'final_text', content: '完整结果' }, error]);
    expect(r.request).not.toHaveBeenCalled();
  });
  it('restores fallback when the stream closes without successful completion', async () => {
    expect((await run([marker])).result).toEqual([{ type: 'final_text', content: '完整结果' }]);
  });
});

describe('handoff result routing', () => {
  const message = { senderId: 'ou_dispatcher', senderIsBot: true, mentionedBot: true, chatType: 'group' as const };
  it('uses actual sender identity for executor results', () => {
    expect(handoffReturnMention([message], { enabled: true, role: 'inspector' })?.openId).toBe('ou_dispatcher');
  });
  it('does not ping executors back from coordinator summaries', () => {
    expect(handoffReturnMention([message], { enabled: true, role: 'coordinator' })).toBeUndefined();
  });
  it('does not invent recipients for humans, mixed senders, unmentioned or disabled groups', () => {
    for (const batch of [[{ ...message, senderIsBot: false }], [{ ...message, mentionedBot: false }], [message, { ...message, senderId: 'ou_other' }], [{ ...message, senderId: 'cli_app' }]]) {
      expect(handoffReturnMention(batch, { enabled: true, role: 'developer' })).toBeUndefined();
    }
    expect(handoffReturnMention([message], { enabled: false })).toBeUndefined();
  });
  it('does not suppress a final result when direct delivery omitted the required mention', async () => {
    const r = await run([marker, done], {}, false, 'ou_dispatcher');
    expect(r.onVerified).not.toHaveBeenCalled();
    expect(r.result[0]).toEqual({ type: 'final_text', content: '完整结果' });
  });
  it('suppresses duplicates when direct delivery includes the required real mention', async () => {
    const r = await run([marker, done], { mentions: [{ id: 'ou_dispatcher' }] }, false, 'ou_dispatcher');
    expect(r.onVerified).toHaveBeenCalledWith('om_sent');
  });
});
