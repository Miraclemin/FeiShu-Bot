import { resolveAppPaths } from '../config/app-paths';
import { loadRootConfig } from '../config/profile-store';
import type { UiSupervisor } from './types';

/** Local bindings only: never infer full Feishu membership from configuration. */
export async function listWorkbenchGroups(supervisor: Pick<UiSupervisor, 'isOnline'>, rootDir?: string) {
  const root = await loadRootConfig(resolveAppPaths({ rootDir }).configFile);
  const groups = new Map<string, { id: string; name: string; agents: { profile: string; name: string; avatarId?: string; agentKind: string; running: boolean; enabled: boolean; role?: string; workspace: string }[] }>();
  for (const [profile, config] of Object.entries(root?.profiles ?? {})) {
    for (const [id, binding] of Object.entries(config.workbench?.groups ?? {})) {
      let group = groups.get(id);
      if (!group) { group = { id, name: binding.name || id, agents: [] }; groups.set(id, group); }
      if (group.name === id && binding.name) group.name = binding.name;
      group.agents.push({ profile, name: config.displayName || profile, avatarId: config.avatarId,
        agentKind: config.agentKind, running: supervisor.isOnline(profile), enabled: binding.enabled,
        role: binding.role, workspace: binding.workspace });
    }
  }
  return { groups: [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')) };
}
