import { createHash } from 'node:crypto';
import type { VcRequestClient } from '../meeting/api';
import type { TeamStep } from './task-store';

export function assignmentEnvelope(taskId: string, step: TeamStep) {
  const encoded = Buffer.from(JSON.stringify({ taskId, stepId:step.id, recipient:step.recipient, instruction:step.instruction, kind:step.kind ?? 'work' })).toString('base64');
  const hash = createHash('sha256').update(encoded).digest('hex');
  return { hash, text: `BOT-INSTRUCTION ${hash}\n${encoded}\nEND-BOT-INSTRUCTION` };
}
/** A digest in the bot's message binds the instruction to that dispatch revision. */
export async function readAssignment(client: VcRequestClient, content: string, taskId: string, stepId: string, recipient?: string): Promise<string> {
  const match = content.match(/https:\/\/feishu\.cn\/docx\/([a-zA-Z0-9]+)#bot-instruction=([a-f0-9]{64})/);
  if (!match) return content; // Older senders still carry the complete instruction.
  const r = await client.request<{code?:number;data?:{content?:string}}>({method:'GET',url:`/open-apis/docx/v1/documents/${match[1]}/raw_content`});
  if (r.code || !r.data?.content) throw new Error('无法读取任务文档，请组织者检查文档访问权限。');
  const encoded = r.data.content.match(new RegExp(`BOT-INSTRUCTION ${match[2]}\\s+([A-Za-z0-9+/=\\s]+?)\\s+END-BOT-INSTRUCTION`))?.[1]?.replace(/\s/g, '');
  if (!encoded || createHash('sha256').update(encoded).digest('hex') !== match[2]) throw new Error('任务指令尚未同步或已变化，请组织者核对。');
  const value = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  if (value.taskId !== taskId || value.stepId !== stepId || !recipient || value.recipient !== recipient || typeof value.instruction !== 'string' || value.instruction.length>12000) throw new Error('任务指令与本次派单不匹配。');
  return `[协作派单 ${taskId} ${stepId}]\n${value.kind==='preflight'?'[执行环境检查：只读，不生成、不付费、不修改配置。只检查本任务明确涉及的目录、工具和凭证是否可用，不输出密钥。]\n':''}${value.instruction}\n最终以完成、需要补充、验收未通过或阻塞开头，详细证据附记录链接；软件自动回执，不自行发送消息。`;
}
