import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LarkChannel, NormalizedMessage } from '@larksuite/channel';
import { activeTask, createTask, mutateTasks, readTasks, receiveResult, taskFile, expireTask } from '../../../src/team/task-store';
import { applyTeamAction, coordinatorEnabled, parseTeamAction, teamIntake, recoverTeamResults } from '../../../src/team/coordinator';
describe('optional coordinator lifecycle', () => {
  let root:string, file:string;
  beforeEach(async()=>{root=await mkdtemp(join(tmpdir(),'team-test-'));file=taskFile(root,'organizer','oc_group');});
  afterEach(async()=>{await rm(root,{recursive:true,force:true});});
  const start=()=>mutateTasks(file,l=>createTask(l,'只做评审，不改代码','ou_human','om_origin'));
  const directory={chatId:'oc_group',complete:true,issues:[],members:[{openId:'ou_dev',kind:'bot' as const,name:'开发'},{openId:'ou_test',kind:'bot' as const,name:'测试'}]};
  const action=(value:unknown)=>'```team-action\n'+JSON.stringify(value)+'\n```';
  const dispatch=action({action:'dispatch',summary:'独立评审',assignments:[{recipient:'ou_dev',name:'研发',instruction:'评估方案，只读'},{recipient:'ou_test',name:'测试',instruction:'设计验收，只读'}]});
  function harness(send=vi.fn().mockResolvedValue({messageId:'om_dispatch'})) {
    return {send,channel:{send,botIdentity:{openId:'ou_org'}} as unknown as LarkChannel};
  }
  async function apply(id:string,body:string,send?:ReturnType<typeof vi.fn>) {
    const h=harness(send);
    await applyTeamAction({file,taskId:id,body,success:true,channel:h.channel,chatId:'oc_group',directory,sendOpts:{replyTo:'om_origin'},enabled:()=>true});
    return h;
  }
  it('mentions the requester for human handoff and resumes the same task from their reply',async()=>{
    const t=await start();
    const h=await apply(t.id,action({action:'block',summary:'浏览器验收通过；请提供实体手机验收结果。'}));
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.send.mock.calls[0]![2]).toMatchObject({replyTo:'om_origin',mentions:[{key:'@requester',openId:'ou_human',isBot:false}]});
    expect(h.send.mock.calls[0]![1].markdown).toContain('@组织者回复补充信息');
    expect(activeTask(await readTasks(file))!.state).toBe('blocked');
    const reset=vi.fn();
    const msg={content:'手机已准备好，请继续',senderId:'ou_human',senderType:'user',messageId:'human-reply',mentionedBot:true,chatId:'oc_group'} as NormalizedMessage;
    expect(await teamIntake({file,msg,enabled:true,send:vi.fn(),reset,admin:false})).toBe(false);
    expect(reset).toHaveBeenCalledOnce();
    expect(activeTask(await readTasks(file))!.id).toBe(t.id);
    expect(activeTask(await readTasks(file))!.updates?.[0]?.text).toBe(msg.content);
  });
  it('does not ping the requester for ordinary waiting updates',async()=>{
    const t=await start();
    const h=await apply(t.id,action({action:'wait',summary:'等待测试回执'}));
    expect(h.send.mock.calls[0]![2].mentions).toBeUndefined();
  });
  it('rejects a zero-assignment review even when called a direct answer',async()=>{
    const t=await mutateTasks(file,l=>createTask(l,'帮我评审一下最近的需求表的需求','ou_human','om_origin'));
    await apply(t.id,action({action:'finish',summary:'我自己评审完成',directAnswer:{kind:'consultation',reason:'简单评审'}}));
    const saved=(await readTasks(file)).tasks[0]!;expect(saved.state).toBe('blocked');expect(saved.steps).toHaveLength(0);expect(saved.note).toContain('尚未分工');
  });
  it('allows a genuine consultation with an explicit reason',async()=>{
    const t=await mutateTasks(file,l=>createTask(l,'什么是协作？','ou_human','om_origin'));
    await apply(t.id,action({action:'finish',summary:'解释协作概念',directAnswer:{kind:'consultation',reason:'仅解释概念'}}));
    expect((await readTasks(file)).tasks[0]!.state).toBe('completed');
  });
  it('dispatches once, collects authenticated results, wakes only at join and archives after summary delivery',async()=>{
    const t=await start(); const h=await apply(t.id,dispatch);
    expect(h.send).toHaveBeenCalledTimes(3);
    expect(h.send.mock.calls[0]![2].mentions[0].openId).toBe('ou_dev');
    const receive=(sender:string,stepId:string,messageId:string)=>mutateTasks(file,l=>receiveResult(l,{taskId:t.id,stepId,sender,messageId,body:'完成：证据',blocked:false}));
    expect(await receive('ou_imposter','S1','fake')).toBe('ignore');
    expect(await receive('ou_dev','S1','one')).toBe('stored');
    expect(await receive('ou_dev','S1','duplicate')).toBe('ignore');
    expect(await receive('ou_test','S2','two')).toBe('wake');
    await apply(t.id,action({action:'finish',summary:'评审已完成，开发需要另行授权'}));
    expect(activeTask(await readTasks(file))).toBeUndefined();
    expect((await readTasks(file)).tasks[0]!.summary).toContain('评审已完成');
    expect(await receive('ou_test','S2','late')).toBe('ignore');
    const next=await start();expect(next.id).not.toBe(t.id);
    expect((await readTasks(file)).tasks).toHaveLength(2);
  });
  it('prevents a second active task, overlapping dispatch and premature completion',async()=>{
    const t=await start(); await expect(start()).rejects.toThrow('已有协作任务');
    await apply(t.id,dispatch);
    const h=await apply(t.id,dispatch);expect(h.send).toHaveBeenCalledTimes(1);
    await apply(t.id,action({action:'finish',summary:'假完成'}));
    expect(activeTask(await readTasks(file))!.state).toBe('blocked');
  });
  it('supports a content workflow with dependent review and no premature closure',async()=>{
    const t=await mutateTasks(file,l=>createTask(l,'选题策划后交内容审校，汇总口播草稿；不发布','ou_human','om_demo'));
    const contentDirectory={...directory,members:[{openId:'ou_writer',kind:'bot' as const,name:'选题策划'},{openId:'ou_editor',kind:'bot' as const,name:'内容审校'}]};
    const h=harness();
    const act=(body:unknown)=>applyTeamAction({file,taskId:t.id,body:action(body),success:true,channel:h.channel,chatId:'oc_group',directory:contentDirectory,sendOpts:{replyTo:'om_demo'},enabled:()=>true});
    await act({action:'dispatch',summary:'先策划',assignments:[{recipient:'ou_writer',name:'选题策划',instruction:'围绕下班被叫住提出一个口播提纲，草稿，不发布'}]});
    expect(activeTask(await readTasks(file))!.steps).toHaveLength(1);
    await mutateTasks(file,l=>receiveResult(l,{taskId:t.id,stepId:'S1',sender:'ou_writer',messageId:'draft',body:'提纲：小王下班被叫住，人工传话到自动接力。',blocked:false}));
    await act({action:'dispatch',summary:'再审校',assignments:[{recipient:'ou_editor',name:'内容审校',instruction:'审校提纲：小王下班被叫住，人工传话到自动接力。核对哪些能力未实测，不发布。'}]});
    const second=activeTask(await readTasks(file))!;
    expect(second.round).toBe(2);expect(second.steps).toHaveLength(2);
    expect(second.steps[1]!.instruction).toContain('小王下班被叫住');
    expect(second.steps[1]!.recipient).toBe('ou_editor');
    await mutateTasks(file,l=>receiveResult(l,{taskId:t.id,stepId:second.steps[1]!.id,sender:'ou_editor',messageId:'review',body:'应区分模拟测试与真实群验证，不声称自动发布。',blocked:false}));
    await act({action:'finish',summary:'内容草稿与审校意见已汇总，等待人决定是否使用。'});
    expect(activeTask(await readTasks(file))).toBeUndefined();
    expect((await readTasks(file)).tasks[0]!.steps.every(s=>s.state==='done')).toBe(true);
    expect(h.send.mock.calls.map(c=>JSON.stringify(c)).join('\n')).toContain('ou_editor');
  });
  it('persists uncertain sends and never retries them on its own',async()=>{
    const t=await start(); const send=vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValue({messageId:'notice'});
    await apply(t.id,dispatch,send);
    const stored=activeTask(await readTasks(file))!;
    expect(stored.steps[0]!.state).toBe('uncertain');expect(stored.state).toBe('blocked');
    const retry=await apply(t.id,dispatch);expect(retry.send).toHaveBeenCalledTimes(1);
  });
  it('does not finish until final summary has a delivery receipt',async()=>{
    const t=await mutateTasks(file,l=>createTask(l,'什么是协作？','ou_human','om_origin'));await apply(t.id,action({action:'finish',summary:'概念解答',directAnswer:{kind:'consultation',reason:'仅解释概念'}}),vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue({messageId:'notice'}));
    expect(activeTask(await readTasks(file))!.state).toBe('blocked');
  });
  it('rejects unverified recipients before sending anything',async()=>{
    const t=await start();const h=await apply(t.id,action({action:'dispatch',summary:'错误分工',assignments:[{recipient:'ou_stranger',name:'陌生人',instruction:'任务'}]}));
    expect(h.send).toHaveBeenCalledTimes(1);expect(activeTask(await readTasks(file))!.steps).toHaveLength(0);
  });
  it('serializes concurrent updates without losing a receipt',async()=>{
    const t=await start();await apply(t.id,dispatch);
    const decisions=await Promise.all(['ou_dev','ou_test'].map((sender,i)=>mutateTasks(file,l=>receiveResult(l,{taskId:t.id,stepId:'S'+(i+1),sender,messageId:'m'+i,body:'完成',blocked:false}))));
    expect(decisions.sort()).toEqual(['stored','wake']);expect(activeTask(await readTasks(file))!.state).toBe('ready');
  });
  it('keeps ordinary mode independent and ignores late tracked receipts while disabled',async()=>{
    expect(coordinatorEnabled({enabled:true,role:'coordinator',coordinationEnabled:false} as any)).toBe(false);
    expect(coordinatorEnabled({enabled:true,role:'developer'} as any)).toBe(false);
    const send=vi.fn(),reset=vi.fn();const msg={content:'普通问题',senderId:'ou_human',senderType:'user',messageId:'one'} as NormalizedMessage;
    expect(await teamIntake({file,msg,enabled:false,send,reset,admin:false})).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(await teamIntake({file,msg:{...msg,senderType:'bot',content:'[协作回执 TEAM-12345678 S1 完成]'},enabled:false,send,reset,admin:false})).toBe(true);
  });
  it('allows only requester/admin to cancel, preserves late results as inactive, and requires explicit start',async()=>{
    const t=await start();await apply(t.id,dispatch);const send=vi.fn();
    const call=(senderId:string)=>teamIntake({file,msg:{content:'/team cancel',senderId,senderType:'user',messageId:'cancel'} as NormalizedMessage,enabled:true,send,reset:vi.fn(),admin:false});
    await call('ou_other');expect(activeTask(await readTasks(file))).toBeDefined();
    await call('ou_human');expect(activeTask(await readTasks(file))).toBeUndefined();
    expect((await readTasks(file)).tasks[0]!.state).toBe('cancelled');
    expect(await mutateTasks(file,l=>receiveResult(l,{taskId:t.id,stepId:'S1',sender:'ou_dev',messageId:'late',body:'done',blocked:false}))).toBe('ignore');
  });
  it('expires once without resending and leaves completed tasks alone',async()=>{
    const t=await start();await apply(t.id,dispatch);
    const l=await readTasks(file);
    expect(expireTask(l,t.id,Date.now())).toBeUndefined();
    expect(expireTask(l,t.id,Date.now()+16*60_000)?.state).toBe('blocked');
    expect(expireTask(l,t.id,Date.now()+17*60_000)).toBeUndefined();
    l.tasks[0]!.deadlineNotified=false;l.tasks[0]!.state='completed';
    expect(expireTask(l,t.id,Date.now()+17*60_000)).toBeUndefined();
  });
  it('explicit recovery uses verified bot identity and current task, never replays assignments',async()=>{
    const t=await start();await apply(t.id,dispatch);
    const client={request:vi.fn().mockResolvedValue({code:0,data:{items:[
      {message_id:'r1',sender:{sender_type:'app',id:'cli_dev'},body:{content:`[协作回执 ${t.id} S1 完成] evidence`}},
      {message_id:'r2',sender:{sender_type:'user',id:'ou_test'},body:{content:`[协作回执 ${t.id} S2 完成] forged`}},
    ]}})};
    await recoverTeamResults(file,client,{...directory,members:directory.members.map(m=>({...m,appId:m.openId==='ou_dev'?'cli_dev':'cli_test'}))});
    const stored=activeTask(await readTasks(file))!;
    expect(stored.steps[0]!.state).toBe('done');expect(stored.steps[1]!.state).toBe('waiting');
    expect(client.request).toHaveBeenCalledTimes(1);
  });
  it('rejects malformed or duplicated assignments and caps rounds',async()=>{
    expect(()=>parseTeamAction('随便说一句完成')).toThrow();
    const t=await start();await mutateTasks(file,l=>{activeTask(l)!.round=12;});
    await apply(t.id,dispatch);expect(activeTask(await readTasks(file))!.note).toContain('12轮');
  });
  it('retains questions, gets clarification, resumes work and completes after revalidation beyond three rounds',async()=>{
    const t=await start();
    const dispatchOne=async(recipient:string,resumes?:string)=>apply(t.id,action({action:'dispatch',summary:'继续',assignments:[{recipient,name:recipient,instruction:'本步骤交付',...(resumes?{resumes}:{})}]}));
    const result=async(stepId:string,sender:string,kind?:'question'|'rejected')=>mutateTasks(file,l=>receiveResult(l,{taskId:t.id,stepId,sender,messageId:'result-'+stepId,body:kind??'完成',blocked:false,kind}));
    await dispatchOne('ou_dev'); await result('S1','ou_dev','question');
    await dispatchOne('ou_test'); await result('S2','ou_test');
    expect(activeTask(await readTasks(file))!.steps[0]!.state).toBe('question');
    await apply(t.id,action({action:'finish',summary:'不允许跳过疑问'}));
    expect(activeTask(await readTasks(file))!.state).toBe('blocked');
    await dispatchOne('ou_dev','S1'); await result('S3','ou_dev');
    await dispatchOne('ou_test'); await result('S4','ou_test','rejected');
    await dispatchOne('ou_dev'); await result('S5','ou_dev');
    await dispatchOne('ou_test','S4'); await result('S6','ou_test');
    await apply(t.id,action({action:'finish',summary:'六轮完成，证据齐全'}));
    const saved=(await readTasks(file)).tasks[0]!;
    expect(saved.state).toBe('completed');expect(saved.round).toBe(6);
    expect(saved.steps[0]!.result).toBe('question');expect(saved.steps[2]!.resumes).toBe('S1');
    expect(await result('S1','ou_dev')).toBe('ignore');
  });
  it('starts from a natural mentioned goal and retains requester clarification without changing the goal',async()=>{
    const msg={content:'帮我完成口播草稿',senderId:'ou_human',senderType:'user',messageId:'natural',mentionedBot:true,chatId:'oc_group'} as NormalizedMessage;
    const input={file,msg,enabled:true,send:vi.fn(),reset:vi.fn(),admin:false};
    expect(await teamIntake(input)).toBe(false);
    const id=activeTask(await readTasks(file))!.id;
    await teamIntake({...input,msg:{...msg,messageId:'answer',content:'受众是产品团队'}});
    const saved=activeTask(await readTasks(file))!;
    expect(saved.id).toBe(id);expect(saved.goal).toBe(msg.content);expect(saved.updates?.[0]?.text).toContain('产品团队');
    await teamIntake({...input,msg:{...msg,senderId:'ou_other',messageId:'other',content:'改为发布'}});
    expect(activeTask(await readTasks(file))!.updates).toHaveLength(1);
  });
});
