import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({resolve:null as null|((v:unknown)=>void)}));
vi.mock('@larksuite/channel',()=>({registerApp:vi.fn(({onQRCodeReady})=>{onQRCodeReady({url:'https://example.test/qr',expireIn:3600});return new Promise(r=>{mock.resolve=r;});})}));
vi.mock('../../../src/cli/agent-detection',()=>({detectInstalledAgents:async()=>[{kind:'codex'}]}));
vi.mock('../../../src/utils/feishu-auth',()=>({validateAppCredentials:async()=>({ok:true,botName:'新机器人'})}));
import {registerApp} from '@larksuite/channel';
import {startQrRegistration,qrStatus,persistRegisteredApp} from '../../../src/ui/qr-register';
import {loadRootConfig} from '../../../src/config/profile-store';
const roots:string[]=[];
afterEach(async()=>{for(const r of roots.splice(0))await rm(r,{recursive:true,force:true});});
it('persists completed registration without the browser polling or calling finish',async()=>{
 const root=await mkdtemp(join(tmpdir(),'qr-autosave-'));roots.push(root);
 const session=await startQrRegistration(root);
 mock.resolve!({client_id:'cli_test_auto',client_secret:'test-secret',user_info:{tenant_brand:'feishu'}});
 await Promise.resolve();
 expect(qrStatus(session.sessionId).status).toBe('saving');
 await vi.waitFor(()=>expect(qrStatus(session.sessionId).status).toBe('done'));
 const config=await loadRootConfig(join(root,'config.json'));
 expect(config?.profiles['新机器人']?.accounts.app.id).toBe('cli_test_auto');
 expect(config?.profiles['新机器人']?.workbench?.groups).toEqual({});
 expect(JSON.stringify(config)).not.toContain('test-secret');
});
it('keeps simultaneous same-name bots and avoids duplicates on retry',async()=>{
 const root=await mkdtemp(join(tmpdir(),'qr-autosave-'));roots.push(root);
 const app={appId:'cli_one',appSecret:'test-secret',tenant:'feishu' as const};
 const a=await Promise.all([persistRegisteredApp(app,'助手',root),persistRegisteredApp({...app,appId:'cli_two'},'助手',root)]);
 expect(a.map(x=>x.profile)).toEqual(['助手','助手-2']);
 expect(await persistRegisteredApp(app,'助手',root)).toEqual(a[0]);
 expect(Object.keys((await loadRootConfig(join(root,'config.json')))!.profiles)).toHaveLength(2);
});

it('selects existing apps without the default permission preset', async()=>{
 const root=await mkdtemp(join(tmpdir(),'qr-mode-'));roots.push(root);
 await startQrRegistration(root,'existing');
 expect(registerApp).toHaveBeenLastCalledWith(expect.objectContaining({createOnly:false,addons:{preset:false}}));
 await startQrRegistration(root,'new');
 expect(registerApp).toHaveBeenLastCalledWith(expect.objectContaining({createOnly:true}));
});
