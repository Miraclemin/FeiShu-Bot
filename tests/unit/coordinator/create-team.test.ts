import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const state=vi.hoisted(()=>({settings:{} as any}));
vi.mock('../../../src/ui/workbench',()=>({getWorkbench:vi.fn(async()=>structuredClone(state.settings)),updateWorkbench:vi.fn(async(_s,_p,b)=>{state.settings=structuredClone(b);return b;})}));
vi.mock('../../../src/agent/workbench-skills',()=>({discoverSkills:()=>['lark-shared','lark-im','lark-base','lark-doc'].map((name,i)=>({name,id:String(i).repeat(24)}))}));
import { createTeam, prepareTeamHandbook } from '../../../src/ui/create-team';
let dir:string;
beforeEach(async()=>{dir=await mkdtemp(join(tmpdir(),'team-create-'));state.settings={agentKind:'codex',accessMode:'workspace',workbench:{revision:0,protectDocuments:true,groups:{}}};});
afterEach(async()=>{await rm(dir,{recursive:true,force:true});});
function fixture(){let failShare=true;const calls:any[]=[];const request=vi.fn(async(arg:any)=>{calls.push(arg);if(arg.url==='/open-apis/im/v1/chats') return {code:0,data:{chat_id:'oc_new'}};if(arg.url==='/open-apis/docx/v1/documents') return {code:0,data:{document:{document_id:'Doc123'}}};if(arg.url.endsWith('/raw_content')) return {code:0,data:{content:''}};if(arg.url.endsWith('/members')&&failShare)return {code:99991672};return {code:0};});const sup:any={isOnline:()=>true,channelFor:()=>({rawClient:{request}}),controlsFor:()=>({ownerRefreshState:'ok',botOwnerId:'ou_owner'}),startProfile:vi.fn()};return {sup,calls,allow:()=>{failShare=false;}};}
it('resumes sharing without duplicating group/doc; enables only after group sharing; creator owns group',async()=>{
 const f=fixture(),input={name:'团队',goal:'协作',workspace:dir};
 await expect(createTeam(f.sup,'organizer',input,dir)).rejects.toThrow('编辑权限失败');
 expect(state.settings.workbench.groups.oc_new.enabled).toBe(false);
 f.allow();const r=await createTeam(f.sup,'organizer',input,dir);
 expect(r.ready).toBe(true);expect(state.settings.workbench.groups.oc_new.enabled).toBe(true);
 expect(state.settings.workbench.groups.oc_new.documents).toEqual([]);
 expect(state.settings.workbench.groups.oc_new.resources).toContain(r.handbook);
 await createTeam(f.sup,'organizer',input,dir);
 expect(f.calls.filter(x=>x.url==='/open-apis/im/v1/chats')).toHaveLength(1);
 expect(f.calls.filter(x=>x.url==='/open-apis/docx/v1/documents')).toHaveLength(1);
 expect(f.calls.filter(x=>x.url==='/open-apis/im/v1/messages')).toHaveLength(1);
 expect(f.calls.find(x=>x.url==='/open-apis/im/v1/chats').data).toMatchObject({chat_type:'private',owner_id:'ou_owner',user_id_list:['ou_owner']});
 expect(f.calls.some(x=>x.data?.member_type==='openchat'&&x.data.member_id==='oc_new'&&x.data.perm==='view')).toBe(true);
});
it('refuses an existing worker with another group before creating remote resources',async()=>{
 state.settings.workbench.groups.oc_old={enabled:true};const f=fixture();
 await expect(createTeam(f.sup,'worker',{name:'团队',goal:'协作',workspace:dir},dir)).rejects.toThrow('独立的新组织者');expect(f.calls).toHaveLength(0);
});
it('does not repeat uncertain group creation',async()=>{
 const f=fixture();f.sup.channelFor=()=>({rawClient:{request:vi.fn().mockRejectedValue(new Error('timeout'))}});
 const input={name:'团队',goal:'协作',workspace:dir};await expect(createTeam(f.sup,'organizer',input,dir)).rejects.toThrow('timeout');
 await expect(createTeam(f.sup,'organizer',input,dir)).rejects.toThrow('结果不确定');
});
it('clears document create marker on explicit HTTP rejection and resumes original group',async()=>{
 const f=fixture();f.allow();const channel=f.sup.channelFor();const original=channel.rawClient.request;let reject=true;
 f.sup.channelFor=()=>({rawClient:{request:async(a:any)=>{if(a.url==='/open-apis/docx/v1/documents'&&reject)throw {response:{status:400,data:{code:99991672,msg:'denied'}}};return original(a);}}});
 const input={name:'团队',goal:'协作',workspace:dir};
 await expect(createTeam(f.sup,'organizer',input,dir)).rejects.toThrow('99991672');reject=false;
 expect((await createTeam(f.sup,'organizer',input,dir)).ready).toBe(true);
 expect(f.calls.filter(x=>x.url==='/open-apis/im/v1/chats')).toHaveLength(1);
});
it('retains uncertain document creation after timeout',async()=>{
 const f=fixture();const original=f.sup.channelFor().rawClient.request;
 f.sup.channelFor=()=>({rawClient:{request:async(a:any)=>{if(a.url==='/open-apis/docx/v1/documents')throw new Error('timeout');return original(a);}}});
 const input={name:'团队',goal:'协作',workspace:dir};
 await expect(createTeam(f.sup,'organizer',input,dir)).rejects.toThrow('结果不确定');
 await expect(createTeam(f.sup,'organizer',input,dir)).rejects.toThrow('上次创建结果待确认');
});

it('handbook entrance completes a pending team but does not unpause an already completed team',async()=>{
 const f=fixture(),input={name:'团队',goal:'协作',workspace:dir};
 await expect(createTeam(f.sup,'organizer',input,dir)).rejects.toThrow();
 f.allow();const result=await prepareTeamHandbook(f.sup,'organizer','oc_new',dir);
 expect(result.teamCompleted).toBe(true);expect(state.settings.workbench.groups.oc_new.enabled).toBe(true);
 expect(f.calls.filter(x=>x.url==='/open-apis/im/v1/messages')).toHaveLength(1);
 state.settings.workbench.groups.oc_new.enabled=false;
 expect((await prepareTeamHandbook(f.sup,'organizer','oc_new',dir)).teamCompleted).toBe(false);
 expect(state.settings.workbench.groups.oc_new.enabled).toBe(false);
 expect(f.calls.filter(x=>x.url==='/open-apis/im/v1/chats')).toHaveLength(1);
 expect(f.calls.filter(x=>x.url==='/open-apis/docx/v1/documents')).toHaveLength(1);
 expect(f.calls.filter(x=>x.url==='/open-apis/im/v1/messages')).toHaveLength(1);
});
