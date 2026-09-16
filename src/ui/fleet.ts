import { runProfileRemove } from '../cli/commands/profile';
import { defaultAvatarId, isAvatarId } from '../config/avatar';
import { resolveAppPaths } from '../config/app-paths';
import {
  loadRootConfig,
  saveRootConfig,
  withConfigFileLock,
  writeActiveProfile,
} from '../config/profile-store';
import { listAllProfiles } from '../runtime/profile-discovery';
import type { AgentKind } from '../config/profile-schema';
import { HttpError } from './http';
import type { UiSupervisor } from './types';

export interface ProfileSummary {
  needsSetup?: boolean;
  avatarId?: string;
  displayName?: string;
  name: string;
  agentKind: AgentKind;
  active: boolean;
  /** Whether the supervisor currently hosts this profile's channel. */
  running: boolean;
}

export interface BotSummary {
  id: string;
  profileName: string;
  agentKind: AgentKind;
  botName?: string;
  appId?: string;
  pid: number;
  version: string;
  startedAt?: string;
  uptimeMs: number;
}

/** Online channels the supervisor currently hosts (all under one pid). */
export function listBots(supervisor: UiSupervisor, version: string, now: number): BotSummary[] {
  return supervisor.list().map((s) => ({
    id: s.profile,
    profileName: s.profile,
    agentKind: s.agentKind,
    botName: s.botName,
    appId: s.appId,
    pid: s.pid,
    version,
    startedAt: s.startedAt,
    uptimeMs: s.startedAt ? Math.max(0, now - Date.parse(s.startedAt)) : 0,
  }));
}

/** All profiles with agent kind, active flag, and whether the supervisor hosts them. */
export async function listProfiles(
  supervisor: UiSupervisor,
  rootDir?: string,
): Promise<ProfileSummary[]> {
  const profiles = await listAllProfiles(rootDir).catch(() => []);
  const root = await loadRootConfig(resolveAppPaths({rootDir}).configFile);
  return profiles.map((p) => ({
    needsSetup: !!root?.profiles[p.name]?.workbench && !Object.keys(root?.profiles[p.name]?.workbench?.groups ?? {}).length,
    name: p.name,
    avatarId: p.avatarId ?? defaultAvatarId(p.name),
    ...(p.displayName ? { displayName: p.displayName } : {}),
    agentKind: p.agentKind,
    active: p.active,
    running: supervisor.isOnline(p.name),
  }));
}

/** Switch the active profile (disk metadata only; does not stop/start channels). */
export async function activateProfile(
  name: string,
  rootDir?: string,
): Promise<{ ok: true; active: string }> {
  const appPaths = resolveAppPaths({ rootDir });
  await withConfigFileLock(appPaths.configFile, async () => {
    const root = await loadRootConfig(appPaths.configFile);
    if (!root?.profiles[name]) throw new HttpError(404, `profile not found: ${name}`);
    root.activeProfile = name;
    await saveRootConfig(root, appPaths.configFile);
  });
  await writeActiveProfile(appPaths.rootDir, name);
  return { ok: true, active: name };
}

/** Change the UI name without changing the stable profile ID or restarting tasks. */
export async function renameProfile(profile: string, name: unknown, rootDir?: string) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 80 || /[\x00-\x1f\x7f]/.test(name)) {
    throw new HttpError(400, '名称需为 1–80 个字符，且不能包含控制字符');
  }
  const displayName = name.trim();
  const { configFile } = resolveAppPaths({ rootDir });
  await withConfigFileLock(configFile, async () => {
    const root = await loadRootConfig(configFile);
    if (!root?.profiles[profile]) throw new HttpError(404, 'Agent 不存在');
    root.profiles[profile].displayName = displayName;
    await saveRootConfig(root, configFile);
  });
  return { ok: true, displayName };
}


export async function setProfileAvatar(profile: string, avatarId: unknown, rootDir?: string) {
  if (!isAvatarId(avatarId)) throw new HttpError(400, '请选择列表中的头像');
  const { configFile } = resolveAppPaths({ rootDir });
  await withConfigFileLock(configFile, async () => {
    const root = await loadRootConfig(configFile);
    if (!root?.profiles[profile]) throw new HttpError(404, 'Agent 不存在');
    root.profiles[profile].avatarId = avatarId;
    await saveRootConfig(root, configFile);
  });
  return { ok: true, avatarId };
}

/** Remove only the local binding, preserving archived state and external resources. */
export async function deleteProfile(supervisor: UiSupervisor, profile: unknown, rootDir?: string) {
  if (typeof profile !== 'string' || !profile) throw new HttpError(400, '请选择 Agent');
  const root = await loadRootConfig(resolveAppPaths({ rootDir }).configFile);
  if (!root?.profiles[profile]) throw new HttpError(404, 'Agent 不存在');
  await supervisor.stopProfile(profile);
  try {
    await runProfileRemove(profile, { rootDir });
  } catch (err) {
    throw new HttpError(409, err instanceof Error ? err.message : String(err));
  }
  return { ok: true };
}
