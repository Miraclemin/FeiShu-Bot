import { discoverSkills, selectedSkills } from '../agent/workbench-skills';
import { AGENT_KINDS, AGENT_LABELS, isAgentKind } from '../agent/catalog';
import { detectInstalledAgents } from '../cli/agent-detection';
import { createBootstrapCodexConfig } from '../cli/profile-bootstrap';
import { resolveAppPaths } from '../config/app-paths';
import { loadRootConfig, saveRootConfig, withConfigFileLock } from '../config/profile-store';
import { normalizeWorkbench } from '../config/workbench';
import { permissionsToLegacySandbox, type AccessMode } from '../config/permissions';
import { resolveWorkingDirectory } from '../policy/workspace';
import { HttpError } from './http';
import type { UiSupervisor } from './types';

export async function agentInventory() {
  const detected = await detectInstalledAgents();
  return AGENT_KINDS.map(kind => ({ kind, label: AGENT_LABELS[kind],
    installed: detected.some(d => d.kind === kind),
    binaryPath: detected.find(d => d.kind === kind)?.binaryPath ?? null,
    authorization: 'not-checked',
    permissions: kind === 'hermes' || kind === 'openclaw' ? 'native' : 'bridge',
  }));
}
export async function getWorkbench(profile: string, rootDir?: string) {
  const root = await loadRootConfig(resolveAppPaths({ rootDir }).configFile);
  const cfg = root?.profiles[profile];
  if (!cfg) throw new HttpError(404, 'Agent 不存在');
  return { appId: cfg.accounts.app.id, tenant: cfg.accounts.app.tenant, agentKind: cfg.agentKind, accessMode: cfg.permissions.defaultAccess,
    workbench: cfg.workbench ?? { revision: 0, protectDocuments: true, groups: {} },
    protected: !!cfg.workbench, documentEnforcement: 'native-cli-unverified' };
}
const changing = new Set<string>();
/** Serialises stop/write/start, rejects busy runs, preserves bot credentials. */
export async function updateWorkbench(sup: UiSupervisor, profile: string, body: unknown, rootDir?: string) {
  const paths = resolveAppPaths({ rootDir, profile });
  const key = paths.configFile + ':' + profile;
  if (changing.has(key)) throw new HttpError(409, '配置正在应用，请稍后');
  changing.add(key);
  const controls = sup.controlsFor(profile);
  let release: (() => void) | undefined;
  let wasOnline = false, stopped = false;
  try {
    release = controls?.activeRuns?.pauseNewRuns('workbench-update');
    if (controls?.activeRuns?.scopes().length) throw new HttpError(409, '请等待当前任务完成或先停止 Agent，再切换配置');
    const raw = body as Record<string, unknown>;
    if (!raw || !isAgentKind(raw.agentKind)) throw new HttpError(400, '请选择有效的 Agent');
    const available = await detectInstalledAgents();
    if (!available.some(d => d.kind === raw.agentKind)) throw new HttpError(400, '本机未检测到这个 Agent，请安装后重新检测');
    const workbench = normalizeWorkbench(raw.workbench);
    if (!workbench) throw new HttpError(400, '工作台配置缺失');
    for (const g of Object.values(workbench.groups)) {
      selectedSkills({ ids: g.skills ?? [] }, discoverSkills(g.workspace || undefined));
      if (g.enabled && !g.workspace) throw new HttpError(400, '启用群前请选择工作目录');
      if (g.workspace) { const cwd = await resolveWorkingDirectory(g.workspace); if (!cwd.ok) throw new HttpError(400, cwd.userVisible); g.workspace = cwd.cwdRealpath; }
    }
    if (!['read-only', 'workspace', 'full'].includes(String(raw.accessMode))) throw new HttpError(400, '执行权限无效');
    const codex = raw.agentKind === 'codex' ? await createBootstrapCodexConfig(undefined) : undefined;
    wasOnline = sup.isOnline(profile);
    // Check revision before disrupting a live channel.
    const snapshot = await loadRootConfig(paths.configFile);
    if (!snapshot?.profiles[profile]) throw new HttpError(404, 'Agent 不存在');
    if ((snapshot.profiles[profile].workbench?.revision ?? 0) !== workbench.revision) throw new HttpError(409, '配置已被修改，请刷新后重试');
    if (wasOnline) { await sup.stopProfile(profile); stopped = true; }
    await withConfigFileLock(paths.configFile, async () => {
      const root = await loadRootConfig(paths.configFile);
      const cfg = root?.profiles[profile];
      if (!cfg || !root) throw new HttpError(404, 'Agent 不存在');
      if ((cfg.workbench?.revision ?? 0) !== workbench.revision) throw new HttpError(409, '配置已被修改，请刷新');
      const changed = cfg.agentKind !== raw.agentKind;
      cfg.agentKind = raw.agentKind as typeof cfg.agentKind;
      if (codex) cfg.codex = { ...cfg.codex, ...codex };
      if (changed) cfg.preferences.model = 'default';
      cfg.workbench = { ...workbench, revision: workbench.revision + 1 };
      cfg.permissions = { defaultAccess: raw.accessMode as AccessMode, maxAccess: raw.accessMode as AccessMode };
      cfg.sandbox = permissionsToLegacySandbox(cfg.permissions);
      cfg.access.allowedChats = Object.entries(workbench.groups).filter(([, g]) => g.enabled).map(([id]) => id);
      cfg.mode = 'personal';
      cfg.larkCli.identityPreset = 'bot-only';
      cfg.meeting.enabled = false; // no unauthenticated meeting dispatch in protected native mode
      await saveRootConfig(root, paths.configFile);
    });
    if (wasOnline) {
      try { await sup.startProfile(profile); }
      catch { return { ...await getWorkbench(profile, rootDir), applied: false, message: '配置已保存，但 Agent 启动失败；请检查本机登录和连接状态后重新启动。' }; }
    }
    return { ...await getWorkbench(profile, rootDir), applied: wasOnline, message: wasOnline ? '已应用，飞书机器人身份不变；下次任务使用新配置。' : '已保存，启动 Agent 后生效。' };
  } catch (err) {
    if (stopped && wasOnline && !sup.isOnline(profile)) await sup.startProfile(profile).catch(() => {});
    throw err;
  } finally { release?.(); changing.delete(key); }
}
