import type { NormalizedMessage, MentionInfo } from '@larksuite/channel';
import type { AgentEvent } from '../agent/types';
import type { VcRequestClient } from '../meeting/api';

export const deliveryInstructions = `当前会话的最终回答由软件自动发送，普通结果不要先用工具发送一遍。
仅当本轮已通过发消息工具向当前会话成功发送了完整最终结果（例如包含真实 @负责人的完成汇报），且没有新信息需要补充时，最终回答只输出以下 JSON：
{"bridge_delivery":{"message_id":"实际成功回执中的 om_ 消息ID","fallback_text":"本轮完整最终结果"}}
软件会核验回执；核验失败时会发送 fallback_text，因此必须提供真实完整结果。不要把 JSON 放在代码块里。
仅发送了交接、进度、其他会话通知、旧消息或失败请求时不得使用此格式，仍应正常回答。此格式不授予额外发消息权限。`;

type Delivery = { message_id: string; fallback_text: string };
type Context = {
  client: VcRequestClient;
  chatId: string;
  appId: string;
  startedAt: number;
  threadId?: string;
  requiredMentionId?: string;
  onVerified?: (messageId: string) => void;
};

function parseDelivery(text: string): Delivery | undefined {
  try {
    const value = JSON.parse(text);
    const d = value?.bridge_delivery;
    if (Object.keys(value).length === 1 && /^om_[a-zA-Z0-9]+$/.test(d?.message_id)
      && typeof d?.fallback_text === 'string' && d.fallback_text.trim()) return d;
  } catch { /* Ordinary final answers are not delivery receipts. */ }
  return undefined;
}

async function verifyDelivery(d: Delivery, ctx: Context): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      ctx.client.request<{ code?: number; data?: { items?: Array<{
        message_id?: string; chat_id?: string; thread_id?: string; create_time?: string;
        mentions?: Array<{ id?: string }>;
        deleted?: boolean; sender?: { id?: string; id_type?: string; sender_type?: string };
      }> } }>({ method: 'GET', url: `/open-apis/im/v1/messages/${d.message_id}` }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('receipt timeout')), 3000); }),
    ]);
    const m = response.data?.items?.find(item => item.message_id === d.message_id);
    return response.code === 0 && !!m && m.chat_id === ctx.chatId && m.deleted === false
      && m.sender?.sender_type === 'app' && m.sender.id_type === 'app_id' && m.sender.id === ctx.appId
      && Number(m.create_time) >= ctx.startedAt && Number(m.create_time) <= Date.now()
      && (!ctx.requiredMentionId || !!m.mentions?.some(mention => mention.id === ctx.requiredMentionId))
      && (!ctx.threadId || m.thread_id === ctx.threadId);
  } catch {
    // Never drop a final answer on missing permissions, network errors or an invalid receipt.
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Only Codex has an explicit final_text channel. Keep protocol text out of renderers. */
export async function* filterDeliveredFinal(events: AsyncIterable<AgentEvent>, ctx: Context): AsyncGenerator<AgentEvent> {
  let pending: Delivery | undefined;
  for await (const event of events) {
    if (event.type === 'final_text') {
      if (pending) yield { type: 'final_text', content: pending.fallback_text };
      pending = parseDelivery(event.content);
      if (!pending) yield event;
      continue;
    }
    if (pending && (event.type === 'done' || event.type === 'error')) {
      const delivered = event.type === 'done' && event.terminationReason === 'normal'
        && await verifyDelivery(pending, ctx);
      if (delivered) ctx.onVerified?.(pending.message_id);
      yield { type: 'final_text', content: delivered ? '' : pending.fallback_text };
      pending = undefined;
    }
    yield event;
  }
  if (pending) yield { type: 'final_text', content: pending.fallback_text };
}

/** Route executor results to the actual bot sender, never an ID guessed from task text.
 * Coordinator summaries deliberately do not ping executors back.
 */
export function handoffReturnMention(
  batch: Pick<NormalizedMessage, 'senderId' | 'senderIsBot' | 'senderType' | 'mentionedBot' | 'chatType'>[],
  group?: { enabled?: boolean; role?: string; coordinationEnabled?: boolean },
): MentionInfo | undefined {
  if (!group?.enabled || (group.role === 'coordinator' && group.coordinationEnabled !== false) || !batch.length) return;
  const first = batch[0]!;
  if (!/^ou_[a-zA-Z0-9]+$/.test(first.senderId)) return;
  if (!batch.every(m => m.chatType !== 'p2p' && m.mentionedBot &&
    (m.senderIsBot === true || m.senderType === 'bot' || m.senderType === 'app') && m.senderId === first.senderId)) return;
  return { key: '@handoff_sender', openId: first.senderId, isBot: true };
}
