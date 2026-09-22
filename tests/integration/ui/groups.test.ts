import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it, expect } from 'vitest';
import { createDefaultProfileConfig } from '../../../src/config/profile-schema';
import { createRootConfig, loadRootConfig, saveRootConfig } from '../../../src/config/profile-store';
import { listWorkbenchGroups } from '../../../src/ui/groups';
it('groups local bindings by chat ID, including paused agents without exposing credentials or changing configuration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'groups-view-'));
  try {
    const profile = createDefaultProfileConfig({ agentKind: 'claude', accounts: { app: { id:'cli_test', secret:'never-export-this', tenant:'feishu' } } });
    const group = { enabled:true, name:'研发群', workspace:root, persona:'简洁', documents:[] };
    profile.workbench={revision:3,protectDocuments:true,groups:{oc_shared:group}};
    profile.displayName='研发';
    const config=createRootConfig('dev',profile);
    config.profiles.qa={...structuredClone(profile),displayName:'测试',workbench:{revision:7,protectDocuments:true,groups:{oc_shared:{...group,enabled:false},oc_other:{...group,name:'另一群'}}}};
    const file=join(root,'config.json');await saveRootConfig(config,file);
    const before=await loadRootConfig(file);
    const result=await listWorkbenchGroups({isOnline:(p:string)=>p==='dev'},root);
    expect(result.groups).toHaveLength(2);
    expect(result.groups.find(g=>g.id==='oc_shared')?.agents).toMatchObject([{profile:'dev',name:'研发',running:true,enabled:true},{profile:'qa',name:'测试',running:false,enabled:false}]);
    expect(JSON.stringify(result)).not.toContain('never-export-this');
    expect(await loadRootConfig(file)).toEqual(before);
  } finally {await rm(root,{recursive:true,force:true});}
});
