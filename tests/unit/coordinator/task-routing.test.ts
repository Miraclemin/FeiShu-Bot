import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NormalizedMessage, LarkChannel } from '@larksuite/channel';
import { teamIntake, applyTeamAction } from '../../../src/team/coordinator';
import { createTask, readTasks, mutateTasks, receiveResult } from '../../../src/team/task-store';
import { taskIntent, referencedTask } from '../../../src/team/task-routing';
import { assignmentEnvelope, readAssignment } from '../../../src/team/assignment-document';

describe('conversation continuity',()=>{
 let root:string,file:string;
 beforeEach(async()=>{root=await mkdtemp(join(tmpdir(),'continuity-'));file=join(root,'task.json');});
 afterEach(async()=>{await rm(root,{recursive:true,force:true});});
 const msg=(content:string,extra={})=>({content,senderId:'ou_owner',messageId:content,chatId:'oc_group',senderType:'user',mentionedBot:true,...extra}) as NormalizedMessage;
 const intake=(m:NormalizedMessage)=>teamIntake({file,msg:m,enabled:true,send:vi.fn(),reset:vi.fn(),admin:false});
 it('the three real progress questions do not create tasks',async()=>{
  for(const text of ['帮我看看我 Codex 里面视频任务做完了没有？','看看德绒背心现在卡在哪一步','这个有什么卡点吗？']) {expect(taskIntent(text)).toBe('query');await intake(msg(text));}
  expect((await readTasks(file)).tasks).toHaveLength(0);
 });
 it('queries do not modify an active task or its document',async()=>{
  await mutateTasks(file,l=>{const t=createTask(l,'制作短样','ou_owner','origin');t.document={token:'doc',url:'https://feishu.cn/docx/doc'};});
  const before=await readTasks(file);await intake(msg('进度怎么样了？'));expect(await readTasks(file)).toEqual(before);
 });
 it('pause stores a receipt without waking, then continues same task and document',async()=>{
  const t=await mutateTasks(file,l=>{const t=createTask(l,'制作短样','ou_owner','origin');t.document={token:'doc'};t.steps.push({id:'S1',recipient:'ou_dev',name:'开发',instruction:'检查',state:'waiting'});return t;});
  await intake(msg('先停一下'));
  expect((await readTasks(file)).tasks[0]!.paused).toBe(true);
  expect(await mutateTasks(file,l=>receiveResult(l,{taskId:t.id,stepId:'S1',sender:'ou_dev',messageId:'receipt',body:'完成',blocked:false}))).toBe('stored');
  await intake(msg('继续做'));
  const saved=(await readTasks(file)).tasks[0]!;expect(saved.id).toBe(t.id);expect(saved.paused).toBe(false);expect(saved.document?.token).toBe('doc');expect(saved.steps[0]!.result).toBe('完成');
 });
 it('resolves replies to old task messages before the current task',async()=>{
  const l={tasks:[{...createTask({tasks:[]},'新任务','u','new')},{...createTask({tasks:[]},'旧任务','u','old'),state:'completed' as const,messageIds:['summary']}]};
  expect(referencedTask(l,msg('卡在哪一步？',{replyToMessageId:'summary'}))?.goal).toBe('旧任务');
 });
 it('does not revive cancelled tasks or guess between completed tasks',async()=>{
  await mutateTasks(file,l=>{createTask(l,'旧任务','ou_owner','origin').state='cancelled';});
  expect(await intake(msg('继续做'))).toBe(true);expect((await readTasks(file)).tasks[0]!.state).toBe('cancelled');
 });
 it('requires preflight and independent review before finishing execution',async()=>{
  const t=await mutateTasks(file,l=>createTask(l,'生成短样','ou_owner','origin'));
  const send=vi.fn().mockResolvedValue({messageId:'sent'});const channel={send,botIdentity:{openId:'ou_org'}} as unknown as LarkChannel;
  const directory={chatId:'oc_group',complete:true,issues:[],members:[{openId:'ou_dev',name:'开发',kind:'bot' as const},{openId:'ou_test',name:'检查',kind:'bot' as const}]};
  const act=async(a:unknown)=>applyTeamAction({file,taskId:t.id,body:'```team-action\n'+JSON.stringify(a)+'\n```',success:true,channel,chatId:'oc_group',directory,sendOpts:{replyTo:'origin'},enabled:()=>true});
  await act({action:'dispatch',summary:'制作',assignments:[{recipient:'ou_dev',name:'开发',kind:'work',instruction:'生成短样'}]});
  expect((await readTasks(file)).tasks[0]!.steps).toHaveLength(0);
  await act({action:'dispatch',summary:'检查',assignments:[{recipient:'ou_dev',name:'开发',kind:'preflight',instruction:'只读检查生成入口'}]});
  const receive=(id:string,sender:string)=>mutateTasks(file,l=>receiveResult(l,{taskId:t.id,stepId:id,sender,messageId:'receipt'+id,body:'完成',blocked:false}));
  await receive('S1','ou_dev');
  await act({action:'dispatch',summary:'制作',assignments:[{recipient:'ou_dev',name:'开发',kind:'work',preflight:'S1',instruction:'生成短样'}]});await receive('S2','ou_dev');
  await act({action:'finish',summary:'完成'});expect((await readTasks(file)).tasks[0]!.state).toBe('blocked');
  await act({action:'dispatch',summary:'验收',assignments:[{recipient:'ou_test',name:'检查',kind:'review',verifies:['S2'],instruction:'核对短样结果'}]});await receive('S3','ou_test');
  await act({action:'finish',summary:'验收通过'});expect((await readTasks(file)).tasks[0]!.state).toBe('completed');
 });
 it('does not apply a stale model plan after a newer human update',async()=>{
  const t=await mutateTasks(file,l=>createTask(l,'任务','ou_owner','origin'));
  await mutateTasks(file,l=>{l.tasks[0]!.updatedAt='2099-01-01T00:00:00Z';});
  const send=vi.fn();
  await applyTeamAction({file,taskId:t.id,expectedUpdatedAt:t.updatedAt,body:'```team-action\n'+JSON.stringify({action:'block',summary:'旧决定'})+'\n```',success:true,channel:{send} as unknown as LarkChannel,chatId:'oc_group',directory:{chatId:'oc_group',complete:true,issues:[],members:[]},sendOpts:{replyTo:'origin'},enabled:()=>true});
  expect(send).not.toHaveBeenCalled();expect((await readTasks(file)).tasks[0]!.note).toBeUndefined();
 });
 it('loads only the exact document dispatch and rejects changed content or recipient',async()=>{
  const envelope=assignmentEnvelope('TEAM-12345678',{id:'S1',recipient:'ou_dev',name:'开发',instruction:'检查目录和凭证，不付费',state:'waiting',kind:'preflight'});
  const client={request:vi.fn().mockResolvedValue({data:{content:envelope.text}})};
  const content=`[任务要求](https://feishu.cn/docx/doc#bot-instruction=${envelope.hash})`;
  expect(await readAssignment(client,content,'TEAM-12345678','S1','ou_dev')).toContain('只读');
  await expect(readAssignment(client,content,'TEAM-12345678','S1','ou_other')).rejects.toThrow('不匹配');
  client.request.mockResolvedValue({data:{content:envelope.text.replace('END-BOT','CHANGED-BOT')}});
  await expect(readAssignment(client,content,'TEAM-12345678','S1','ou_dev')).rejects.toThrow('尚未同步');
 });
});
