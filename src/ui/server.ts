import { permissionStatus } from './permission-status';
import { permissionDraft } from './permission-draft';
import { listBaseTables } from './base-picker';
import { resourceNames } from './resource-names';
import { checkWorkbench } from './workbench-check';
import { discoverSkills } from '../agent/workbench-skills';
import { searchDirectoryUsers, startDirectoryLogin } from '../lark-cli/user-im';
import { agentInventory, getWorkbench, updateWorkbench } from './workbench';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { log } from '../core/logger';
import { readActiveProfile } from '../config/profile-store';
import type { MutableProfileState } from '../config/config-ops';
import consoleHtml from './generated/index.html';
import {
  addBotToChatView,
  meetingJoin,
  meetingPreflight,
  meetingLeave,
  meetingsView,
  applyConfig,
  applyConfigToDisk,
  buildConfigView,
  listChats,
  loadProfileState,
  mutateAccess,
  userAuthStatus,
  userChatsView,
  userLoginComplete,
  userLoginStart,
} from './api';
import { deleteProfile, activateProfile, listBots, listProfiles, renameProfile, setProfileAvatar } from './fleet';
import { onboardCreate, onboardState, onboardValidate } from './onboard';
import { finishQrRegistration, qrStatus, startQrRegistration } from './qr-register';
import {
  checkToken,
  HttpError,
  isLocalRequest,
  readJsonBody,
  sendHtml,
  sendJson,
} from './http';
import type { Controls } from '../commands';
import type { UiServerDeps, UiServerHandle } from './types';

const DEFAULT_HOST = '127.0.0.1';

/**
 * Start the supervisor's single management console. Binds 127.0.0.1, mints a
 * random per-process token gating every `/api/*` call, rejects non-localhost /
 * cross-origin. Backed by the supervisor: it can list/start/stop/configure any
 * profile in-process (online → live; offline → written to disk).
 */
export async function startUiServer(deps: UiServerDeps): Promise<UiServerHandle> {
  const host = deps.host ?? DEFAULT_HOST;
  const token = randomBytes(32).toString('hex');

  const server = createServer((req, res) => {
    handle(req, res, deps, token).catch((err) => {
      log.warn('ui', 'request-failed', { err: String(err) });
      if (!res.headersSent) sendJson(res, 500, { error: 'internal error' });
      else res.end();
    });
  });

  const port = await new Promise<number>((resolve, reject) => {
    server.once('error', reject);
    server.listen(deps.port ?? 0, host, () => resolve((server.address() as AddressInfo).port));
  });

  const url = `http://${host}:${port}/?token=${token}`;
  log.info('ui', 'listening', { url: `http://${host}:${port}` });

  return {
    url,
    token,
    port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  deps: UiServerDeps,
  token: string,
): Promise<void> {
  if (!isLocalRequest(req)) {
    sendJson(res, 403, { error: 'forbidden' });
    return;
  }
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname;

  if (!path.startsWith('/api/')) {
    if (path === '/' || path === '/index.html') sendHtml(res, consoleHtml);
    else sendJson(res, 404, { error: 'not found' });
    return;
  }

  if (!checkToken(req, url, token)) {
    sendJson(res, 401, { error: 'unauthorized' });
    return;
  }

  try {
    await route(req, res, deps, url);
  } catch (err) {
    if (err instanceof HttpError) {
      sendJson(res, err.status, { error: err.message });
      return;
    }
    throw err;
  }
}

/** Resolve the target profile's state + whether edits apply live (online). */
async function resolveTargetState(
  deps: UiServerDeps,
  url: URL,
): Promise<{ state: MutableProfileState; live: boolean; controls?: Controls }> {
  const profile = url.searchParams.get('profile') ?? (await readActiveProfile(deps.rootDir));
  if (!profile) throw new HttpError(400, 'no profile');
  const controls = deps.supervisor.controlsFor(profile);
  if (controls) return { state: controls, live: true, controls };
  return { state: await loadProfileState(profile, deps.rootDir), live: false };
}

async function route(
  req: IncomingMessage,
  res: ServerResponse,
  deps: UiServerDeps,
  url: URL,
): Promise<void> {
  const path = url.pathname;
  const method = req.method ?? 'GET';
  const g = method === 'GET';
  const p = method === 'POST';
  const sup = deps.supervisor;

  if (path === '/api/status' && g) {
    sendJson(res, 200, {
      hosted: true,
      version: deps.version,
      activeProfile: await readActiveProfile(deps.rootDir),
      online: sup.list().length,
    });
    return;
  }

  if (path === '/api/agents' && g) { sendJson(res, 200, { agents: await agentInventory() }); return; }
  if (path === '/api/workbench/resource-names' && p) {
    const profile = url.searchParams.get('profile');
    if (!profile) throw new HttpError(400, '缺少 Agent');
    await getWorkbench(profile, deps.rootDir);
    const body = await readJsonBody(req) as { links?: unknown };
    if (!Array.isArray(body.links) || body.links.length > 100 || body.links.some(x => typeof x !== 'string' || x.length > 2048)) throw new HttpError(400, '资料列表无效');
    sendJson(res, 200, await resourceNames(profile, body.links, sup.channelFor(profile), deps.rootDir)); return;
  }
  if (path === '/api/workbench/base-tables' && p) {
    const profile=url.searchParams.get('profile'); if(!profile) throw new HttpError(400,'Missing profile');
    const body=await readJsonBody(req) as {link:string;offset?:number};
    try { sendJson(res,200,await listBaseTables(profile,body.link,body.offset ?? 0,deps.rootDir)); }
    catch(e) { if(e instanceof HttpError) throw e; throw new HttpError(400,e instanceof Error ? e.message : '读取数据表失败，请稍后重试'); }
    return;
  }
  if (path === '/api/workbench/check' && p) {
    const profile = url.searchParams.get('profile');
    if (!profile) throw new HttpError(400, 'Missing profile');
    sendJson(res, 200, await checkWorkbench(profile, await readJsonBody(req), deps.rootDir)); return;
  }
  if (path === '/api/workbench/permission-status' && g) {
    const profile = url.searchParams.get('profile'); if (!profile) throw new HttpError(400, '缺少 Agent');
    const app = await getWorkbench(profile, deps.rootDir);
    sendJson(res, 200, await permissionStatus(sup.channelFor(profile), app.appId)); return;
  }
  if (path === '/api/workbench/permission-draft' && (g || p)) {
    const profile = url.searchParams.get('profile');
    if (!profile) throw new HttpError(400, '缺少 Agent');
    sendJson(res, 200, await permissionDraft(profile, deps.rootDir, p ? await readJsonBody(req) : undefined)); return;
  }
  if (path === '/api/workbench') {
    const profile = url.searchParams.get('profile');
    if (!profile) throw new HttpError(400, '缺少 Agent');
    if (g) { sendJson(res, 200, await getWorkbench(profile, deps.rootDir)); return; }
    if (p) { sendJson(res, 200, await updateWorkbench(sup, profile, await readJsonBody(req), deps.rootDir)); return; }
  }
  // --- online channels ---
  if (path === '/api/bots' && g) {
    sendJson(res, 200, { bots: listBots(sup, deps.version, Date.now()) });
    return;
  }

  // --- profiles ---
  if (path === '/api/profiles' && g) {
    sendJson(res, 200, { profiles: await listProfiles(sup, deps.rootDir) });
    return;
  }
  if (path === '/api/profiles/avatar' && p) {
    const body = await readJsonBody(req) as { profile?: string; avatarId?: unknown };
    if (!body.profile) throw new HttpError(400, 'profile is required');
    sendJson(res, 200, await setProfileAvatar(body.profile, body.avatarId, deps.rootDir));
    return;
  }
  if (path === '/api/profiles/rename' && p) {
    const body = await readJsonBody(req) as { profile?: string; displayName?: unknown };
    if (!body.profile) throw new HttpError(400, 'profile is required');
    sendJson(res, 200, await renameProfile(body.profile, body.displayName, deps.rootDir));
    return;
  }
  if (path === '/api/profiles/delete' && p) {
    const body = await readJsonBody(req) as { profile?: unknown };
    sendJson(res, 200, await deleteProfile(sup, body.profile, deps.rootDir));
    return;
  }
  if (path === '/api/profiles/start' && p) {
    const body = (await readJsonBody(req)) as { profile?: string };
    if (!body.profile) throw new HttpError(400, 'profile is required');
    try {
      await sup.startProfile(body.profile);
    } catch (err) {
      throw new HttpError(400, err instanceof Error ? err.message : String(err));
    }
    sendJson(res, 200, { ok: true, profile: body.profile });
    return;
  }
  if (path === '/api/profiles/stop' && p) {
    const body = (await readJsonBody(req)) as { profile?: string };
    if (!body.profile) throw new HttpError(400, 'profile is required');
    await sup.stopProfile(body.profile);
    sendJson(res, 200, { ok: true, profile: body.profile });
    return;
  }
  if (path === '/api/profiles/activate' && p) {
    const body = (await readJsonBody(req)) as { profile?: string };
    if (!body.profile) throw new HttpError(400, 'profile is required');
    sendJson(res, 200, await activateProfile(body.profile, deps.rootDir));
    return;
  }
  if (path === '/api/profiles/validate' && p) {
    sendJson(res, 200, await onboardValidate(await readJsonBody(req)));
    return;
  }
  if (path === '/api/profiles/qr/start' && p) {
    const body = await readJsonBody(req) as { mode?: unknown };
    if (body.mode !== undefined && body.mode !== 'existing' && body.mode !== 'new') throw new HttpError(400, 'Invalid registration mode');
    sendJson(res, 200, await startQrRegistration(deps.rootDir, body.mode === 'existing' ? 'existing' : 'new'));
    return;
  }
  if (path === '/api/profiles/qr/status' && g) {
    const sessionId = url.searchParams.get('sessionId');
    if (!sessionId) throw new HttpError(400, 'sessionId is required');
    sendJson(res, 200, qrStatus(sessionId));
    return;
  }
  if (path === '/api/profiles/qr/finish' && p) {
    sendJson(res, 200, await finishQrRegistration(await readJsonBody(req), deps.rootDir));
    return;
  }
  if (path === '/api/profiles' && p) {
    sendJson(res, 200, await onboardCreate(await readJsonBody(req), deps.rootDir));
    return;
  }
  if (path === '/api/onboard/state' && g) {
    sendJson(res, 200, await onboardState(deps.rootDir));
    return;
  }

  // --- per-profile config ---
  if (path === '/api/config' && g) {
    const { state, live } = await resolveTargetState(deps, url);
    sendJson(res, 200, buildConfigView(state, live));
    return;
  }
  if (path === '/api/config' && p) {
    const { state, live, controls } = await resolveTargetState(deps, url);
    const body = await readJsonBody(req);
    sendJson(res, 200, live && controls ? await applyConfig(controls, body) : await applyConfigToDisk(state, body));
    return;
  }
  if (path === '/api/access' && p) {
    const { state } = await resolveTargetState(deps, url);
    sendJson(res, 200, await mutateAccess(state, await readJsonBody(req)));
    return;
  }
  if (path === '/api/chats' && g) {
    const profile = url.searchParams.get('profile') ?? (await readActiveProfile(deps.rootDir));
    sendJson(res, 200, await listChats(profile ? sup.channelFor(profile) : undefined));
    return;
  }

  // --- "我的群": owner's groups via user identity (lark-cli device-flow auth) ---
  if (path === '/api/auth/status' && g) {
    const profile = url.searchParams.get('profile') ?? (await readActiveProfile(deps.rootDir));
    if (!profile) throw new HttpError(400, 'no profile');
    sendJson(res, 200, await userAuthStatus(profile, deps.rootDir));
    return;
  }
  if (path === '/api/auth/login/start' && p) {
    const body = (await readJsonBody(req)) as { profile?: string; scopes?: unknown };
    const profile = body.profile ?? (await readActiveProfile(deps.rootDir));
    if (!profile) throw new HttpError(400, 'profile is required');
    const scopes = Array.isArray(body.scopes)
      ? body.scopes.filter((s): s is string => typeof s === 'string')
      : undefined;
    sendJson(res, 200, await userLoginStart(profile, deps.rootDir, scopes));
    return;
  }
  if (path === '/api/auth/login/complete' && p) {
    const body = (await readJsonBody(req)) as { profile?: string; deviceCode?: string };
    const profile = body.profile ?? (await readActiveProfile(deps.rootDir));
    if (!profile) throw new HttpError(400, 'profile is required');
    sendJson(res, 200, await userLoginComplete(profile, deps.rootDir, body));
    return;
  }
  if (path === '/api/skills' && g) {
    try { sendJson(res, 200, { skills: discoverSkills(url.searchParams.get('cwd') || undefined) }); }
    catch (e) { throw new HttpError(400, (e as Error).message); }
    return;
  }
  if (path === '/api/directory/login/start' && p) {
    const body = await readJsonBody(req) as { profile?: string };
    if (!body.profile) throw new HttpError(400, '请选择机器人');
    try { sendJson(res, 200, await startDirectoryLogin({ profile: body.profile, rootDir: deps.rootDir })); }
    catch(e) { throw new HttpError(400, (e as Error).message); }
    return;
  }
  if (path === '/api/directory/users' && g) {
    const profile = url.searchParams.get('profile');
    if (!profile) throw new HttpError(400, '请选择机器人');
    try {
      sendJson(res, 200, await searchDirectoryUsers({ profile, rootDir: deps.rootDir }, {
        query: url.searchParams.get('query') ?? undefined,
        ids: url.searchParams.get('ids')?.split(',').filter(Boolean),
      }));
    } catch (e) { throw new HttpError(400, (e as Error).message); }
    return;
  }
  if (path === '/api/user-chats' && g) {
    const profile = url.searchParams.get('profile') ?? (await readActiveProfile(deps.rootDir));
    if (!profile) throw new HttpError(400, 'no profile');
    const query = url.searchParams.get('query') ?? undefined;
    const pageToken = url.searchParams.get('pageToken') ?? undefined;
    sendJson(res, 200, await userChatsView(profile, deps.rootDir, sup.channelFor(profile), { query, pageToken }));
    return;
  }
  if (path === '/api/chats/add-bot' && p) {
    const body = (await readJsonBody(req)) as { profile?: string; chatId?: string };
    const profile = body.profile ?? (await readActiveProfile(deps.rootDir));
    if (!profile) throw new HttpError(400, 'profile is required');
    sendJson(res, 200, await addBotToChatView(profile, deps.rootDir, body));
    return;
  }

  // --- in-meeting agent (智能体入会) ---
  if (path === '/api/meetings' && g) {
    const profile = url.searchParams.get('profile') ?? (await readActiveProfile(deps.rootDir));
    if (!profile) throw new HttpError(400, 'no profile');
    const controls = sup.controlsFor(profile);
    // Falls back to disk config so a stopped profile still reports why it's
    // unavailable rather than looking broken.
    const enabled = controls
      ? controls.profileConfig.meeting.enabled
      : (await loadProfileState(profile, deps.rootDir)).profileConfig.meeting.enabled;
    sendJson(res, 200, meetingsView(controls?.meeting, enabled));
    return;
  }
  if (path === '/api/meetings/preflight' && g) {
    const profile = url.searchParams.get('profile') ?? (await readActiveProfile(deps.rootDir));
    if (!profile) throw new HttpError(400, 'no profile');
    // The probe needs some user open_id; the bot owner is the natural choice.
    const probeUserId = sup.controlsFor(profile)?.botOwnerId;
    sendJson(res, 200, await meetingPreflight(profile, deps.rootDir, probeUserId));
    return;
  }
  if (path === '/api/meetings/join' && p) {
    const body = (await readJsonBody(req)) as { profile?: string; meetingNo?: string };
    const profile = body.profile ?? (await readActiveProfile(deps.rootDir));
    if (!profile) throw new HttpError(400, 'profile is required');
    sendJson(res, 200, await meetingJoin(sup.controlsFor(profile)?.meeting, body));
    return;
  }
  if (path === '/api/meetings/leave' && p) {
    const body = (await readJsonBody(req)) as { profile?: string; meetingId?: string };
    const profile = body.profile ?? (await readActiveProfile(deps.rootDir));
    if (!profile) throw new HttpError(400, 'profile is required');
    sendJson(res, 200, await meetingLeave(sup.controlsFor(profile)?.meeting, body));
    return;
  }

  sendJson(res, 404, { error: 'not found' });
}
