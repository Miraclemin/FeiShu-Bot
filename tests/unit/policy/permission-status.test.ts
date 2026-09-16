import { expect,it,vi } from 'vitest';
import { permissionStatus,summarizePermissions } from '../../../src/ui/permission-status';
import presets from '../../../resources/permission-presets.json';
import { MEETING_REQUIRED_EVENTS } from '../../../src/meeting/preflight';
it('requires the correct identity type for every permission',()=>{
 const scopes=presets.flatMap(p=>[...p.tenant.map(scope=>({scope,token_types:['tenant']})),...p.user.map(scope=>({scope,token_types:['user']}))]);
 expect(summarizePermissions(scopes,MEETING_REQUIRED_EVENTS)).toMatchObject({permissions:'ready',meeting:'ready'});
 expect(summarizePermissions(scopes.filter(s=>s.scope!=='base:record:read'),[])).toMatchObject({permissions:'missing',meeting:'missing'});
 expect(summarizePermissions(scopes.map(s=>({...s,token_types:['tenant']})),MEETING_REQUIRED_EVENTS).permissions).toBe('missing');
});
it('does not report ready when the API fails or the bot is offline',async()=>{
 expect(await permissionStatus(undefined,'cli_test')).toMatchObject({status:'unknown'});
 const get=vi.fn(async()=>({code:999,data:{app:{scopes:[]}}}));
 expect(await permissionStatus({rawClient:{application:{application:{get}}}} as never,'cli_test')).toMatchObject({status:'unknown'});
});
it('checks the published version instead of unapplied draft scopes',async()=>{
 const get=vi.fn(async()=>({code:0,data:{app:{online_version_id:'published',scopes:[]}}}));
 const version=vi.fn(async()=>({code:0,data:{app_version:{scopes:[],events:[]}}}));
 const result=await permissionStatus({rawClient:{application:{application:{get},applicationAppVersion:{get:version}}}} as never,'cli_test');
 expect(version).toHaveBeenCalledWith(expect.objectContaining({path:{app_id:'cli_test',version_id:'published'}}));
 expect(result).toMatchObject({status:'checked',permissions:'missing',meeting:'missing'});
});
