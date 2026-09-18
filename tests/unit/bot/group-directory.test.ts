import * as profileStore from '../../../src/config/profile-store';
import { describe, it, expect, vi } from 'vitest';
import { fetchGroupDirectory, directoryInstructions, directoryError, enrichMemberRoles } from '../../../src/bot/group-directory';
import type { VcRequestClient } from '../../../src/meeting/api';
const client = (request: ReturnType<typeof vi.fn>) => ({request}) as VcRequestClient;
describe('group directory', () => {
 it('paginates within one chat and resolves owners without guessing', async () => {
  const request = vi.fn().mockResolvedValueOnce({code:0,data:{users:[{member_id:'ou_human',name:'甲'}],bots:[],has_more:true,page_token:'p2'}})
   .mockResolvedValueOnce({code:0,data:{users:[],bots:[{member_id:'ou_bot',app_id:'cli_app',name:'研发'}],has_more:false}})
   .mockResolvedValueOnce({code:0,data:{app:{owner:{owner_id:'ou_human'}}}});
  const d = await fetchGroupDirectory(client(request),'oc_one');
  expect(d.complete).toBe(true); expect(d.members[1]?.ownerOpenId).toBe('ou_human');
  expect(request.mock.calls[1]?.[0].params.page_token).toBe('p2');
  expect(request.mock.calls[0]?.[0].url).toContain('/oc_one/');
 });
 it('reports permission failure without fabricating members', async () => {
  const d=await fetchGroupDirectory(client(vi.fn().mockResolvedValue({code:99991672})),'oc_one');
  expect(d.complete).toBe(false); expect(d.members).toEqual([]); expect(d.issues[0]).toContain('99991672');
 });
 it('retains server truncation and unknown ownership', async () => {
  const request=vi.fn().mockResolvedValueOnce({data:{users:[],bots:[{member_id:'ou_bot',app_id:'cli_x'}],truncations:[{}]}}).mockRejectedValue(new Error('denied'));
  const d=await fetchGroupDirectory(client(request),'oc_one');
  expect(d.complete).toBe(false); expect(d.members[0]?.ownerOpenId).toBeUndefined();
  expect(directoryInstructions(d,{})).toContain('不授予执行或审批权限');
 });
 it('does not request arbitrary paths', async () => {
  const request=vi.fn(); await fetchGroupDirectory(client(request),'../another'); expect(request).not.toHaveBeenCalled();
 });
});

it('surfaces thrown HTTP authorization code without exposing credential headers',()=>{
 const result=directoryError({response:{status:400,data:{code:99991672}},config:{headers:{Authorization:'SECRET'}}});
 expect(result).toContain('99991672');expect(result).not.toContain('SECRET');
});

it('exposes only enabled same-group role descriptions',async()=>{
 const group={enabled:true,role:'developer',rolePrompt:'实现并验证，发布需确认',cwd:'/private',resources:['private']};
 const spy=vi.spyOn(profileStore,'loadRootConfig').mockResolvedValueOnce({profiles:{a:{accounts:{app:{id:'cli_one',secret:'SECRET'}},workbench:{groups:{oc_one:group}}},b:{accounts:{app:{id:'cli_two',secret:'SECRET'}},workbench:{groups:{oc_other:group}}}}} as any);
 const d={chatId:'oc_one',complete:true,issues:[],members:[{openId:'ou_one',name:'A',kind:'bot' as const,appId:'cli_one'},{openId:'ou_two',name:'B',kind:'bot' as const,appId:'cli_two'}]};
 await enrichMemberRoles(d,'unused');
 expect(JSON.stringify(d)).toContain('实现并验证');expect(JSON.stringify(d)).not.toContain('SECRET');expect(JSON.stringify(d)).not.toContain('/private');expect((d.members[1] as any).responsibilities).toBeUndefined();spy.mockRestore();
});
