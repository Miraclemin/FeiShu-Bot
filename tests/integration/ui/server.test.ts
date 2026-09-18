import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDefaultProfileConfig } from '../../../src/config/profile-schema';
import {
  createRootConfig,
  loadRootConfig,
  runtimeProfileConfig,
  saveRootConfig,
  writeActiveProfile,
} from '../../../src/config/profile-store';
import { startUiServer } from '../../../src/ui/server';
import type { UiServerHandle, UiSupervisor } from '../../../src/ui/types';

const app = { id: 'cli_test', secret: '${APP_SECRET}', tenant: 'feishu' as const };

const roots: string[] = [];
let handle: UiServerHandle;
let rootDir: string;
let configPath: string;
let base: string;
// profile -> controls (a MutableProfileState/Controls-ish object)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let online: Map<string, any>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function makeControls(profile: string): Promise<any> {
  const root = (await loadRootConfig(configPath))!;
  return {
    configPath,
    profile,
    cfg: runtimeProfileConfig(root, profile),
    profileConfig: root.profiles[profile]!,
    ownerRefreshState: 'unknown',
    processId: 'test',
    refreshOwner: async () => {},
    restart: async () => {},
  };
}

function stubSupervisor(): UiSupervisor {
  return {
    isOnline: (p) => online.has(p),
    controlsFor: (p) => online.get(p),
    channelFor: () => undefined,
    list: () =>
      [...online.keys()].map((p) => ({
        profile: p,
        agentKind: 'claude' as const,
        online: true,
        pid: process.pid,
        startedAt: new Date().toISOString(),
        botName: `bot-${p}`,
      })),
    startProfile: async (p) => {
      online.set(p, await makeControls(p));
    },
    stopProfile: async (p) => {
      online.delete(p);
    },
    restartProfile: async () => {},
  };
}

function get(path: string, token?: string, headers: Record<string, string> = {}) {
  return fetch(`${base}${path}`, { headers: { ...(token ? { 'x-ui-token': token } : {}), ...headers } });
}
function post(path: string, token: string, body: unknown) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'x-ui-token': token, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function json(res: Response): Promise<any> {
  return res.json();
}

beforeEach(async () => {
  rootDir = await mkdtemp(join(tmpdir(), 'bridge-ui-'));
  roots.push(rootDir);
  configPath = join(rootDir, 'config.json');
  await mkdir(join(rootDir, 'profiles', 'claude'), { recursive: true });
  await saveRootConfig(
    createRootConfig('claude', createDefaultProfileConfig({ agentKind: 'claude', accounts: { app } })),
    configPath,
  );
  // second profile 'work' on disk (offline)
  const rc = (await loadRootConfig(configPath))!;
  await mkdir(join(rootDir, 'profiles', 'work'), { recursive: true });
  rc.profiles.work = createDefaultProfileConfig({ agentKind: 'claude', accounts: { app: { ...app, id: 'cli_work' } } });
  await saveRootConfig(rc, configPath);
  await writeActiveProfile(rootDir, 'claude');

  online = new Map();
  online.set('claude', await makeControls('claude')); // claude online, work offline

  handle = await startUiServer({ supervisor: stubSupervisor(), version: 'test', rootDir });
  base = `http://127.0.0.1:${handle.port}`;
});

afterEach(async () => {
  await handle.close();
  await Promise.all(roots.splice(0).map((r) => rm(r, { recursive: true, force: true })));
});

describe('ui server (supervisor-backed)', () => {
  it('persists a display name without changing identity or interrupting an online profile', async () => {
    const before = (await loadRootConfig(configPath))!;
    const controls = online.get('claude');
    const res = await post('/api/profiles/rename', handle.token, { profile: 'claude', displayName: '  我的研发助手  ' });
    expect(res.status).toBe(200);
    const after = (await loadRootConfig(configPath))!;
    expect(after.profiles.claude).toEqual({ ...before.profiles.claude, displayName: '我的研发助手' });
    expect(after.activeProfile).toBe(before.activeProfile);
    expect(online.get('claude')).toBe(controls);
    const listed = await json(await get('/api/profiles', handle.token));
    expect(listed.profiles.find((p: {name: string}) => p.name === 'claude')).toMatchObject({ displayName: '我的研发助手', running: true });
    for (const displayName of ['', '  ', 'x'.repeat(81), 'bad\nname']) {
      expect((await post('/api/profiles/rename', handle.token, { profile: 'claude', displayName })).status).toBe(400);
    }
    expect((await post('/api/profiles/rename', handle.token, { profile: 'missing', displayName: 'name' })).status).toBe(404);
    expect((await post('/api/profiles/rename', 'bad-token', { profile: 'claude', displayName: 'name' })).status).toBe(401);
  });

  it('assigns a stable default avatar and persists a user selection without restarting', async () => {
    const initial = await json(await get('/api/profiles', handle.token));
    const original = initial.profiles.find((p: {name: string}) => p.name === 'claude').avatarId;
    expect(original).toMatch(/^friend-/);
    const controls = online.get('claude');
    await post('/api/profiles/rename', handle.token, { profile: 'claude', displayName: '新名字' });
    const renamed = await json(await get('/api/profiles', handle.token));
    expect(renamed.profiles.find((p: {name: string}) => p.name === 'claude').avatarId).toBe(original);
    expect((await post('/api/profiles/avatar', handle.token, { profile: 'claude', avatarId: 'owl-c2' })).status).toBe(200);
    expect((await loadRootConfig(configPath))!.profiles.claude!.avatarId).toBe('owl-c2');
    const updated = await json(await get('/api/profiles', handle.token));
    expect(updated.profiles.find((p: {name: string}) => p.name === 'claude').avatarId).toBe('owl-c2');
    expect(online.get('claude')).toBe(controls);
    for (const avatarId of ['../secret', 'https://example.com/image.png', '', null]) {
      expect((await post('/api/profiles/avatar', handle.token, { profile: 'claude', avatarId })).status).toBe(400);
    }
    expect((await post('/api/profiles/avatar', 'bad-token', { profile: 'claude', avatarId: 'dog-a1' })).status).toBe(401);
    expect((await post('/api/profiles/avatar', handle.token, { profile: 'missing', avatarId: 'dog-a1' })).status).toBe(404);
  });

  it('shuffles distinct avatars, persists them and leaves running agents intact', async () => {
    const initial = await json(await get('/api/profiles', handle.token));
    const controls = online.get('claude');
    const result = await json(await post('/api/profiles/avatars/shuffle', handle.token, {}));
    const ids = Object.values(result.avatars);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of initial.profiles) expect(result.avatars[p.name]).not.toBe(p.avatarId);
    const after = await json(await get('/api/profiles', handle.token));
    for (const p of after.profiles) expect(p.avatarId).toBe(result.avatars[p.name]);
    const one = await json(await post('/api/profiles/avatars/shuffle', handle.token, { profile: 'claude' }));
    expect(one.avatars.claude).not.toBe(result.avatars.claude);
    const saved = await loadRootConfig(configPath);
    expect(saved!.profiles.claude!.avatarId).toBe(one.avatars.claude);
    expect(online.get('claude')).toBe(controls);
    expect((await post('/api/profiles/avatars/shuffle', 'bad-token', {})).status).toBe(401);
    expect((await post('/api/profiles/avatars/shuffle', handle.token, { profile: 'missing' })).status).toBe(404);
    expect((await post('/api/profiles/avatars/shuffle', handle.token, { profile: 12 })).status).toBe(400);
  });

  it('preserves a coordinator chosen human avatar across reloads and shuffles', async () => {
    const root = (await loadRootConfig(configPath))!;
    root.profiles.claude!.workbench = { revision: 0, groups: { oc_team: { role: 'coordinator' } } } as any;
    root.profiles.work!.workbench = { revision: 0, groups: { oc_team: { role: 'coordinator' } } } as any;
    await saveRootConfig(root, configPath);
    const listed = await json(await get('/api/profiles', handle.token));
    const coordinator = listed.profiles.find((p: {name: string}) => p.name === 'claude');
    expect(coordinator.avatarId).toMatch(/^farm-/);
    expect(coordinator.avatarLocked).toBe(true);
    const other = listed.profiles.find((p: {name: string}) => p.name === 'work');
    expect(other.avatarId).toMatch(/^farm-/);
    expect(other.avatarId).not.toBe(coordinator.avatarId);
    expect((await post('/api/profiles/avatar', handle.token, { profile: 'claude', avatarId: 'farm-grandma' })).status).toBe(200);
    const reloaded = await json(await get('/api/profiles', handle.token));
    expect(reloaded.profiles.find((p: {name: string}) => p.name === 'claude').avatarId).toBe('farm-grandma');
    const shuffled = await json(await post('/api/profiles/avatars/shuffle', handle.token, {}));
    expect(shuffled.avatars.claude).toBe('farm-grandma');
    expect((await post('/api/profiles/avatar', handle.token, { profile: 'claude', avatarId: 'owl-c1' })).status).toBe(400);
    expect((await loadRootConfig(configPath))!.profiles.claude!.avatarId).toBe('farm-grandma');
  });

  it('rejects API calls without the token', async () => {
    expect((await get('/api/status')).status).toBe(401);
    expect((await get('/api/config', 'wrong-token-value')).status).toBe(401);
  });

  it('rejects cross-origin requests', async () => {
    const res = await get('/api/status', handle.token, { origin: 'http://evil.example.com' });
    expect(res.status).toBe(403);
  });

  it('serves the console shell without a token', async () => {
    const res = await get('/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('控制台');
  });

  it('returns status and config for the active (online) profile', async () => {
    const status = await json(await get('/api/status', handle.token));
    expect(status).toMatchObject({ hosted: true, version: 'test', activeProfile: 'claude', online: 1 });

    const config = await json(await get('/api/config', handle.token));
    expect(config.mode).toBe('personal');
    expect(config.live).toBe(true);
  });

  it('applies a config change live to an online profile and persists it', async () => {
    const view = await json(
      await post('/api/config', handle.token, { mode: 'team', maxConcurrentRuns: 7, requireMentionInGroup: false }),
    );
    expect(view.mode).toBe('team');
    expect(view.live).toBe(true);
    expect(online.get('claude').profileConfig.mode).toBe('team'); // in-memory controls updated

    const saved = JSON.parse(await readFile(configPath, 'utf8'));
    expect(saved.profiles.claude.mode).toBe('team');
  });

  it('reads and writes an offline profile on disk (deferred, live=false)', async () => {
    const view = await json(await get('/api/config?profile=work', handle.token));
    expect(view.live).toBe(false);

    const saved = await json(
      await post('/api/config?profile=work', handle.token, { mode: 'team' }),
    );
    expect(saved.live).toBe(false);
    const disk = JSON.parse(await readFile(configPath, 'utf8'));
    expect(disk.profiles.work.mode).toBe('team');
    expect(disk.profiles.claude.mode).toBe('personal');
  });

  it('adds and removes access entries', async () => {
    const added = await json(await post('/api/access', handle.token, { action: 'add', kind: 'user', id: 'ou_alice' }));
    expect(added.allowedUsers).toContain('ou_alice');
    const removed = await json(await post('/api/access', handle.token, { action: 'remove', kind: 'user', id: 'ou_alice' }));
    expect(removed.allowedUsers).not.toContain('ou_alice');
  });

  it('sets and clears a per-chat @-mention override, and drops it when the chat is removed', async () => {
    await json(await post('/api/access', handle.token, { action: 'add', kind: 'chat', id: 'oc_grp' }));

    // Set an override (respond to all — no @ needed).
    const set = await json(
      await post('/api/access', handle.token, { action: 'set-mention', kind: 'chat', id: 'oc_grp', requireMention: false }),
    );
    expect(set.chatRequireMention).toEqual({ oc_grp: false });
    expect(online.get('claude').profileConfig.access.chatRequireMention).toEqual({ oc_grp: false });

    // Clear it (follow global) with null.
    const cleared = await json(
      await post('/api/access', handle.token, { action: 'set-mention', kind: 'chat', id: 'oc_grp', requireMention: null }),
    );
    expect(cleared.chatRequireMention).toEqual({});

    // Re-set then remove the chat → override is dropped too.
    await json(await post('/api/access', handle.token, { action: 'set-mention', kind: 'chat', id: 'oc_grp', requireMention: true }));
    const afterRemove = await json(
      await post('/api/access', handle.token, { action: 'remove', kind: 'chat', id: 'oc_grp' }),
    );
    expect(afterRemove.allowedChats).not.toContain('oc_grp');
    expect(afterRemove.chatRequireMention).toEqual({});
  });

  it('lists profiles with online flag from the supervisor', async () => {
    const { profiles } = await json(await get('/api/profiles', handle.token));
    const byName = Object.fromEntries(profiles.map((p: { name: string }) => [p.name, p]));
    expect(byName.claude.running).toBe(true);
    expect(byName.work.running).toBe(false);
  });

  it('lists online channels from the supervisor', async () => {
    const { bots } = await json(await get('/api/bots', handle.token));
    expect(bots.map((b: { profileName: string }) => b.profileName)).toEqual(['claude']);
  });

  it('starts and stops a profile via the supervisor', async () => {
    expect((await post('/api/profiles/start', handle.token, { profile: 'work' })).status).toBe(200);
    expect(online.has('work')).toBe(true);
    expect((await post('/api/profiles/stop', handle.token, { profile: 'claude' })).status).toBe(200);
    expect(online.has('claude')).toBe(false);
  });

  it('returns 404 for an unknown QR registration session', async () => {
    const res = await get('/api/profiles/qr/status?sessionId=nope', handle.token);
    expect(res.status).toBe(404);
  });
});
