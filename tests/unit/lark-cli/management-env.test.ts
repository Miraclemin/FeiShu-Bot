import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { managementEnv } from '../../../src/lark-cli/user-im';
it('uses a separate user config without loosening the bot runner or overwriting a login', async () => {
  const root = await mkdtemp(join(tmpdir(), 'management-env-'));
  try {
    const dir = join(root, 'lark-cli'); await mkdir(join(dir, 'lark-channel'), { recursive: true });
    const source = join(dir, 'lark-channel/config.json');
    const original = JSON.stringify({ apps: [{ appId: 'cli_test', defaultAs: 'bot', strictMode: 'bot', users: [] }] });
    await writeFile(source, original);
    const env = await managementEnv({ LARKSUITE_CLI_CONFIG_DIR: dir });
    expect(env.LARKSUITE_CLI_CONFIG_DIR).not.toBe(dir);
    const target = join(env.LARKSUITE_CLI_CONFIG_DIR!, 'lark-channel/config.json');
    const config = JSON.parse(await readFile(target, 'utf8'));
    expect(config.apps[0].strictMode).toBe('off');
    config.apps[0].users = [{ openId: 'ou_loggedin' }]; await writeFile(target, JSON.stringify(config));
    await managementEnv({ LARKSUITE_CLI_CONFIG_DIR: dir });
    expect(JSON.parse(await readFile(target, 'utf8')).apps[0].users[0].openId).toBe('ou_loggedin');
    expect(await readFile(source, 'utf8')).toBe(original);
  } finally { await rm(root, { recursive: true, force: true }); }
});
