import { dirname } from 'node:path';
import type { CommandContext } from './index';
import { fetchGroupDirectory } from '../bot/group-directory';
import type { VcRequestClient } from '../meeting/api';
import { canRunAdminCommand } from '../policy/access';
import { readReview,reviewPath,updateReview,newReview,decideReview } from '../team/review-store';
export const reviewFile=(ctx:CommandContext)=>reviewPath(dirname(ctx.controls.configPath),ctx.controls.profile,ctx.scope);
const clean=(s:string)=>s.replace(/[<>`]/g,'');
export async function handleTeamReview(args:string,ctx:CommandContext):Promise<void>{
 const send=(markdown:string)=>ctx.channel.send(ctx.msg.chatId,{markdown},{replyTo:ctx.msg.messageId,...(ctx.chatMode==='topic'?{replyInThread:true}:{})});
 const [action,...rest]=args.trim().split(/\s+/);
 try{
 if(action==='members'){
  const d=await fetchGroupDirectory(ctx.channel.rawClient as unknown as VcRequestClient,ctx.msg.chatId);
  await send(`本群成员${d.complete?'':'（可能不完整）'}\n`+d.members.map(m=>`${m.kind==='bot'?'机器人':'成员'}：${clean(m.name)} · ${m.openId}${m.ownerOpenId?' · 拥有者 '+m.ownerOpenId:''}`).join('\n')+'\n'+d.issues.join('\n')+(d.issues.some(x=>x.includes('99991672')) ? `\n权限入口：https://open.feishu.cn/page/scope-apply?clientID=${encodeURIComponent(ctx.controls.cfg.accounts.app.id)}&scopes=im%3Achat.members%3Aread` : ''));return;
 }
 if(action==='request'){
  if(!canRunAdminCommand(ctx.controls.profileConfig,ctx.controls,ctx.msg.senderId).ok)throw new Error('发起确认需机器人拥有者或管理员操作。');
  if(ctx.activeRuns.get(ctx.scope))throw new Error('当前任务还在运行，请先 /stop，再登记确认事项。');
  const owner=ctx.controls.ownerRefreshState==='ok'?ctx.controls.botOwnerId:undefined;
  if(!owner)throw new Error('机器人拥有者尚未验证，请先恢复身份查询。');
  const d=await fetchGroupDirectory(ctx.channel.rawClient as unknown as VcRequestClient,ctx.msg.chatId);
  if(!d.members.some(m=>m.kind==='user'&&m.openId===owner))throw new Error('尚未确认拥有者在本群，请检查群成员权限或邀请负责人入群。');
  const r=await updateReview(reviewFile(ctx),p=>newReview(p,rest.join(' '),owner));
  await send(`<at id="${owner}"></at> 请确认：${clean(r.title)}\n编号：${r.id}\n本机器人在当前会话暂停接收新的 Agent 任务。\n同意：@本机器人 /review approve ${r.id}\n拒绝：@本机器人 /review reject ${r.id}\n确认只登记决定，不会自动上线。`);return;
 }
 if(action==='approve'||action==='reject'){
  const raw=ctx.msg.raw as {sender?:{sender_type?:string}}|undefined;
  if(raw?.sender?.sender_type!=='user')throw new Error('必须由负责人的真实用户消息确认。');
  const r=await updateReview(reviewFile(ctx),p=>decideReview(p,rest[0]??'',ctx.msg.senderId,action==='approve'?'approved':'rejected'));
  await send(`事项 ${r.id} 已${r.state==='approved'?'同意':'拒绝'}。已记录负责人及时间。${r.state==='approved'?'如需执行，请明确发送下一步指令；不会自动上线。':'请调整方案后重新发起确认。'}`);return;
 }
 if(action==='status'){
  const r=await readReview(reviewFile(ctx));await send(r?`确认事项 ${r.id}\n${clean(r.title)}\n状态：${({pending:'待确认',approved:'已同意',rejected:'已拒绝'})[r.state]}\n负责人：${r.owner}`:'当前没有确认事项。');return;
 }
 await send('群内命令：\n/review members 查看本群成员及可查询的机器人拥有者\n/review request 具体事项（默认由本机器人的拥有者确认）\n/review status 查看状态\n/review approve 编号\n/review reject 编号\n这是负责人确认功能，尚非自动派单系统。');
 }catch(e){await send(e instanceof Error?e.message:'确认操作失败，未继续执行。');}
}
