import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { writeFileAtomic } from '../platform/atomic-write';
import { resolveAppPaths } from '../config/app-paths';
import { buildLarkChannelEnv } from '../agent/lark-channel-env';
import { mergeProcessEnv, spawnProcess } from '../platform/spawn';
import { log } from '../core/logger';

/**
 * User-identity IM helpers that drive the bridge's managed `lark-cli` under a
 * profile's config dir. This is the one path to act as the *owner* (list the
 * user's groups, add the bot to a group the user is in) — the bot/app token
 * can't do either (bots can't self-join, and the app token only sees the bot's
 * own chats). Auth is lark-cli's OAuth device flow, scoped per profile via
 * `LARKSUITE_CLI_CONFIG_DIR`.
 */
export interface UserImContext {
  profile: string;
  /** LARK_CHANNEL_HOME root; undefined = default. */
  rootDir?: string;
}

export interface UserAuthStatus {
  /** User identity is authorized and its token is currently valid. */
  loggedIn: boolean;
  userName?: string;
  openId?: string;
  /** Granted scope names (space-split from lark-cli). */
  scopes: string[];
}

export interface DeviceLogin {
  /** URL the user opens to authorize (prefer the *_complete variant). */
  verificationUrl: string;
  /** Short code shown to the user (device flow user_code), if provided. */
  userCode?: string;
  /** Opaque code passed back to complete the flow. */
  deviceCode: string;
  expiresIn?: number;
}

export interface UserChat {
  id: string;
  name: string;
}

export interface AddBotResult {
  ok: boolean;
  /** True when the group requires owner/admin approval and it's now pending. */
  pending: boolean;
  /** True when the user hasn't granted the add-member scope yet (re-auth). */
  needAuth?: boolean;
  message?: string;
}

/**
 * Minimal scopes, verified grantable via `lark-cli auth check`. We request
 * ONLY these (never `--domain im`, which drags in `im:message.send_as_user`
 * and other un-grantable message scopes that fail the whole authorization).
 * Note `im:chat` / `im:chat:readonly` are NOT grantable here — the granular
 * `im:chat:read` / `im:chat.members:write_only` are the operative ones.
 */
export const LIST_CHAT_SCOPES = ['im:chat:read'];
export const ADD_BOT_SCOPES = ['im:chat.members:write_only'];

interface ExecResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/** Runs `lark-cli` and captures stdout/stderr separately. Injectable for tests. */
export type LarkCliExec = (
  args: string[],
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
) => Promise<ExecResult>;

const defaultExec: LarkCliExec = async (args, env, timeoutMs) => {
  env = await managementEnv(env);
  return new Promise<ExecResult>((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const child = spawnProcess('lark-cli', args, {
      env: mergeProcessEnv(process.env, env),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (b: Buffer) => (stdout += b.toString('utf8')));
    child.stderr?.on('data', (b: Buffer) => (stderr += b.toString('utf8')));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    child.once('error', (err) => {
      clearTimeout(timer);
      resolve({ code: null, stdout, stderr: stderr || String(err), timedOut });
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
};

function larkCliEnv(ctx: UserImContext): NodeJS.ProcessEnv {
  const appPaths = resolveAppPaths({ rootDir: ctx.rootDir, profile: ctx.profile });
  return buildLarkChannelEnv({
    profile: appPaths.profile,
    rootDir: appPaths.rootDir,
    configPath: appPaths.configFile,
    larkCliConfigDir: appPaths.larkCliConfigDir,
    larkCliSourceConfigFile: appPaths.larkCliSourceConfigFile,
  });
}

/** First JSON value found in `text` (lark-cli prints JSON on stdout). */
function parseJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    // Fall back to the first {...} / [...] block if extra lines slipped in.
    const start = trimmed.search(/[[{]/);
    if (start >= 0) {
      try {
        return JSON.parse(trimmed.slice(start));
      } catch {
        /* give up */
      }
    }
    return undefined;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

/** Recursively find a string value under one of `keys` (checked in order). */
function pickString(obj: unknown, keys: string[], depth = 0): string | undefined {
  if (depth > 4 || !isRecord(obj)) return undefined;
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim()) return v;
  }
  for (const v of Object.values(obj)) {
    const nested = pickString(v, keys, depth + 1);
    if (nested) return nested;
  }
  return undefined;
}

/** Recursively find the first string field whose key matches `re`. */
function findString(obj: unknown, re: RegExp, depth = 0): string | undefined {
  if (depth > 4 || !isRecord(obj)) return undefined;
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && re.test(k) && v.trim()) return v;
  }
  for (const v of Object.values(obj)) {
    const nested = findString(v, re, depth + 1);
    if (nested) return nested;
  }
  return undefined;
}

export async function getUserAuthStatus(
  ctx: UserImContext,
  exec: LarkCliExec = defaultExec,
): Promise<UserAuthStatus> {
  const r = await exec(['auth', 'status', '--json'], larkCliEnv(ctx), 15_000);
  const json = parseJson(r.stdout);
  const user = isRecord(json) && isRecord(json.identities) ? json.identities.user : undefined;
  if (!isRecord(user)) return { loggedIn: false, scopes: [] };
  const loggedIn =
    user.available === true && (user.tokenStatus === 'valid' || user.status === 'ready');
  const scopes = typeof user.scope === 'string' ? user.scope.split(/\s+/).filter(Boolean) : [];
  return {
    loggedIn,
    userName: typeof user.userName === 'string' ? user.userName : undefined,
    openId: typeof user.openId === 'string' ? user.openId : undefined,
    scopes,
  };
}

export function hasScope(status: UserAuthStatus, anyOf: string[]): boolean {
  return anyOf.some((s) => status.scopes.includes(s));
}

/**
 * Start the OAuth device flow. Returns immediately with a verification URL +
 * device code; the caller shows the URL/QR, the user authorizes in a browser,
 * then {@link completeDeviceLogin} finishes it.
 */
export async function startDeviceLogin(
  ctx: UserImContext,
  scopes: string[] = LIST_CHAT_SCOPES,
  exec: LarkCliExec = defaultExec,
): Promise<DeviceLogin> {
  // Request exactly the scopes we need (not `--domain im`) so authorization
  // isn't rejected for unrelated un-grantable scopes like im:message.send_as_user.
  const r = await exec(
    ['auth', 'login', '--no-wait', '--json', '--scope', scopes.join(' ')],
    larkCliEnv(ctx),
    30_000,
  );
  const json = parseJson(r.stdout);
  // Prefer the known device-flow field names (both snake_case and camelCase),
  // then fall back to a fuzzy match so a minor lark-cli rename won't break it.
  const verificationUrl =
    pickString(json, [
      'verification_uri_complete',
      'verificationUriComplete',
      'verification_url',
      'verificationUrl',
      'verification_uri',
      'verificationUri',
      'url',
      'uri',
    ]) ??
    findString(json, /verification.*(uri|url)|url|uri/i) ??
    '';
  const deviceCode = pickString(json, ['device_code', 'deviceCode']) ?? findString(json, /device.?code/i) ?? '';
  const userCode = pickString(json, ['user_code', 'userCode']) ?? findString(json, /user.?code/i);
  if (!verificationUrl || !deviceCode) {
    throw new Error(
      `无法开始授权：${r.stderr.trim() || r.stdout.trim() || 'lark-cli auth login 未返回验证链接'}`,
    );
  }
  const expiresIn =
    isRecord(json) && typeof json.expiresIn === 'number'
      ? json.expiresIn
      : isRecord(json) && typeof json.expires_in === 'number'
        ? json.expires_in
        : undefined;
  return { verificationUrl, deviceCode, ...(userCode ? { userCode } : {}), ...(expiresIn ? { expiresIn } : {}) };
}

/** Complete the device flow after the user authorized in the browser. */
export async function completeDeviceLogin(
  ctx: UserImContext,
  deviceCode: string,
  exec: LarkCliExec = defaultExec,
): Promise<{ ok: boolean; message?: string }> {
  const r = await exec(
    ['auth', 'login', '--device-code', deviceCode, '--json'],
    larkCliEnv(ctx),
    30_000,
  );
  if (r.code === 0) return { ok: true };
  const json = parseJson(r.stdout);
  const message =
    findString(json, /message|error|reason/i) ??
    r.stderr.trim() ??
    '授权尚未完成，请先在浏览器里确认授权后重试';
  return { ok: false, message };
}

export interface UserChatsPage {
  chats: UserChat[];
  /** Present when there are more results; pass back as `pageToken`. */
  nextPageToken?: string;
}

const DEFAULT_PAGE_SIZE = 8;

function toChats(items: unknown[]): UserChat[] {
  const chats: UserChat[] = [];
  for (const it of items) {
    if (!isRecord(it)) continue;
    const id = typeof it.chat_id === 'string' ? it.chat_id : typeof it.id === 'string' ? it.id : '';
    if (!id) continue;
    const name = typeof it.name === 'string' && it.name.trim() ? it.name : '(无名群)';
    chats.push({ id, name });
  }
  return chats;
}

/** Parse a `+chat-list` / `+chat-search` page: `{ data: { chats, has_more, page_token } }`. */
function parseChatsPage(r: ExecResult, prefix: string): UserChatsPage {
  if (r.code !== 0) throw new Error(cliError(r, prefix));
  const json = parseJson(r.stdout);
  const data: Record<string, unknown> =
    isRecord(json) && isRecord(json.data) ? json.data : isRecord(json) ? json : {};
  const hasMore = data.has_more === true;
  const pageToken = typeof data.page_token === 'string' ? data.page_token : undefined;
  return {
    chats: toChats(extractArray(json)),
    ...(hasMore && pageToken ? { nextPageToken: pageToken } : {}),
  };
}

/** One page of the user's groups (defaults to {@link DEFAULT_PAGE_SIZE}). */
export async function listUserChats(
  ctx: UserImContext,
  opts: { pageSize?: number; pageToken?: string } = {},
  exec: LarkCliExec = defaultExec,
): Promise<UserChatsPage> {
  // active_time (descending) → most recently active groups first, which is far
  // more useful in a picker than the default create_time (oldest first).
  const args = [
    'im',
    '+chat-list',
    '--as',
    'user',
    '--json',
    '--sort',
    'active_time',
    '--page-size',
    String(opts.pageSize ?? DEFAULT_PAGE_SIZE),
  ];
  if (opts.pageToken) args.push('--page-token', opts.pageToken);
  return parseChatsPage(await exec(args, larkCliEnv(ctx), 30_000), '列出群失败');
}

/** Search the user's visible groups by name (one page). */
export async function searchUserChats(
  ctx: UserImContext,
  opts: { query: string; pageSize?: number; pageToken?: string },
  exec: LarkCliExec = defaultExec,
): Promise<UserChatsPage> {
  const args = [
    'im',
    '+chat-search',
    '--as',
    'user',
    '--json',
    '--query',
    opts.query,
    '--page-size',
    String(opts.pageSize ?? DEFAULT_PAGE_SIZE),
  ];
  if (opts.pageToken) args.push('--page-token', opts.pageToken);
  return parseChatsPage(await exec(args, larkCliEnv(ctx), 30_000), '搜索群失败');
}

export async function addBotToChat(
  ctx: UserImContext,
  chatId: string,
  botAppId: string,
  exec: LarkCliExec = defaultExec,
): Promise<AddBotResult> {
  const r = await exec(
    [
      'im',
      'chat.members',
      'create',
      '--chat-id',
      chatId,
      '--member-id-type',
      'app_id',
      '--data',
      JSON.stringify({ id_list: [botAppId] }),
      '--as',
      'user',
      '--json',
    ],
    larkCliEnv(ctx),
    30_000,
  );
  const json = parseJson(r.stdout);
  const data = isRecord(json) && isRecord(json.data) ? json.data : isRecord(json) ? json : {};
  const invalid = extractArray(isRecord(data) ? data.invalid_id_list : undefined);
  const notExisted = extractArray(isRecord(data) ? data.not_existed_id_list : undefined);
  const pendingList = extractArray(isRecord(data) ? data.pending_approval_id_list : undefined);
  const inList = (arr: unknown[]) =>
    arr.some((x) => (typeof x === 'string' ? x === botAppId : isRecord(x) && x.id === botAppId));

  if (r.code === 0 && (inList(invalid) || inList(notExisted))) {
    // The API succeeded but rejected the bot id — usually the app isn't
    // available to this tenant/group, or lacks the add-member scope.
    return {
      ok: false,
      pending: false,
      message: '把 bot 拉进群失败：应用对该群不可用，或缺少 im:chat 权限（去开发者后台确认应用可见范围与权限）',
    };
  }
  if (r.code !== 0) {
    return { ok: false, pending: false, message: cliError(r, '把 bot 拉进群失败') };
  }
  if (inList(pendingList) || pendingList.length > 0) {
    return { ok: true, pending: true, message: '已发送，等待群主/管理员通过' };
  }
  return { ok: true, pending: false };
}

/**
 * Pull the result array out of lark-cli's envelope. The real shape is
 * `{ ok, data: { chats: [...] } }` (or `data.items` / a top-level array); we
 * check the top level and one level under `data` for common list keys.
 */
function extractArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (!isRecord(v)) return [];
  const keys = ['items', 'chats', 'list', 'invalid_id_list', 'not_existed_id_list', 'pending_approval_id_list'];
  for (const container of [v, v.data]) {
    if (Array.isArray(container)) return container;
    if (isRecord(container)) {
      for (const key of keys) {
        if (Array.isArray(container[key])) return container[key] as unknown[];
      }
    }
  }
  return [];
}

function cliError(r: ExecResult, prefix: string): string {
  if (r.timedOut) return `${prefix}：命令超时`;
  // lark-cli's error JSON can land on stdout OR stderr; parse whichever has it
  // and pull the nested error message rather than dumping the raw blob.
  const json = parseJson(r.stdout) ?? parseJson(r.stderr);
  const firstLine = (s: string): string | undefined => s.trim().split('\n')[0]?.trim() || undefined;
  const detail =
    findString(json, /message|reason/i) ?? firstLine(r.stderr) ?? firstLine(r.stdout) ?? `退出码 ${r.code}`;
  log.warn('user-im', 'lark-cli-error', { detail });
  return `${prefix}：${detail}`;
}

export interface DirectoryUser { id: string; name: string; department: string; external: boolean; }
export async function searchDirectoryUsers(ctx: UserImContext, opts: { query?: string; ids?: string[] }, exec: LarkCliExec = defaultExec): Promise<{ users: DirectoryUser[]; hasMore: boolean }> {
  const args = ['contact', '+search-user', '--as', 'user', '--format', 'json', '--page-size', '30'];
  if (opts.ids?.length) {
    if (opts.ids.length > 100 || opts.ids.some(id => !/^ou_[a-zA-Z0-9]+$/.test(id))) throw new Error('用户选择无效');
    args.push('--user-ids', opts.ids.join(','));
  } else if (opts.query?.trim()) {
    if ([...opts.query].length > 50) throw new Error('搜索词最多 50 个字');
    args.push('--query', opts.query.trim());
  } else args.push('--has-chatted');
  const r = await exec(args, larkCliEnv(ctx), 30_000);
  if (r.code !== 0) throw new Error(cliError(r, '搜索人员失败，请检查飞书账号授权与通讯录可见范围'));
  const json = parseJson(r.stdout);
  if (!isRecord(json) || json.ok === false || !isRecord(json.data) || !Array.isArray(json.data.users)) throw new Error('人员查询返回格式不正确');
  return { users: json.data.users.filter(isRecord).filter(u => typeof u.open_id === 'string').map(u => ({
    id: String(u.open_id), name: String(u.localized_name || u.name || '未命名用户'),
    department: typeof u.department === 'string' ? u.department : '', external: u.is_cross_tenant === true,
  })), hasMore: json.data.has_more === true };
}

const managementSetup = new Map<string, Promise<void>>();
/** Management OAuth must never relax the agent runner's bot-only config. */
export async function managementEnv(env: NodeJS.ProcessEnv): Promise<NodeJS.ProcessEnv> {
  const sourceDir = env.LARKSUITE_CLI_CONFIG_DIR;
  if (!sourceDir) throw new Error('缺少飞书配置目录');
  const destination = sourceDir + '-management';
  let pending = managementSetup.get(destination);
  if (!pending) {
    pending = (async () => {
      const sourceFile = join(sourceDir, 'lark-channel', 'config.json');
      let raw: Record<string, any>;
      try { raw = JSON.parse(await readFile(sourceFile, 'utf8')); }
      catch { throw new Error('请先启动一次机器人以初始化飞书连接，然后连接配置账号'); }
      const target = join(destination, 'lark-channel', 'config.json');
      try {
        const existing = JSON.parse(await readFile(target, 'utf8'));
        if (existing.apps?.[0]?.appId === raw.apps?.[0]?.appId) return;
      } catch { /* first management connection */ }
      raw.apps = (raw.apps ?? []).map((app: Record<string, unknown>) => ({ ...app, defaultAs: 'user', strictMode: 'off' }));
      await mkdir(join(destination, 'lark-channel'), { recursive: true, mode: 0o700 });
      await writeFileAtomic(target, JSON.stringify(raw), { mode: 0o600 });
    })();
    managementSetup.set(destination, pending);
  }
  try { await pending; } finally { managementSetup.delete(destination); }
  return { ...env, LARKSUITE_CLI_CONFIG_DIR: destination, LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1', LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1' };
}

export async function startDirectoryLogin(ctx: UserImContext, exec: LarkCliExec = defaultExec) {
  const r = await exec(['auth', 'scopes', '--json'], larkCliEnv(ctx), 30_000);
  if (r.code !== 0) throw new Error(cliError(r, '无法检查应用查询权限'));
  const json = parseJson(r.stdout);
  const data = isRecord(json) && isRecord(json.data) ? json.data : json;
  if (!isRecord(data) || !Array.isArray(data.userScopes)) throw new Error('无法确认应用的用户权限，请在飞书开放平台检查');
  if (!data.userScopes.includes('contact:user:search')) throw new Error('该机器人应用尚未开通「搜索用户」权限。请在飞书开放平台为此应用开通用户身份的 contact:user:search 并发布生效，然后回来扫码。扫码登录本身不会自动增加应用权限。');
  return startDeviceLogin(ctx, ['contact:user:search'], exec);
}
