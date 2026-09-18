import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultProfileConfig } from '../../../src/config/profile-schema';
import { createRootConfig, loadRootConfig, saveRootConfig } from '../../../src/config/profile-store';
import { updateWorkbench, agentInventory } from '../../../src/ui/workbench';
import type { UiSupervisor } from '../../../src/ui/types';
vi.mock('../../../src/cli/agent-detection', () => ({
  detectInstalledAgents: async () => ['claude', 'codex', 'hermes', 'openclaw'].map(kind => ({ kind, binaryPath: process.execPath })),
  resolveExecutablePath: async () => process.execPath,
}));
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'workbench-test-')); roots.push(root);
  const cfg = createDefaultProfileConfig({ agentKind: 'claude', accounts: { app: { id: 'cli_same', secret: 'ref:not-a-real-secret', tenant: 'feishu' } } });
  await saveRootConfig(createRootConfig('assistant', cfg), join(root, 'config.json'));
  const sup: UiSupervisor = { isOnline: () => false, controlsFor: () => undefined, channelFor: () => undefined,
    list: () => [], startProfile: vi.fn(), stopProfile: vi.fn(), restartProfile: vi.fn() };
  const body = { agentKind: 'hermes', accessMode: 'full', workbench: { revision: 0, protectDocuments: true,
    groups: { oc_team: { enabled: true, name: '研发', workspace: root, persona: '简洁', documents: [] } } } };
  return { root, sup, body };
}
describe('workbench engine switch', () => {
  it('detects four backends without claiming authentication', async () => {
    const agents = await agentInventory(); expect(agents).toHaveLength(4);
    expect(agents.every(a => a.installed && a.authorization === 'not-checked')).toBe(true);
  });
  it.each(['codex', 'hermes', 'openclaw'])('switches to %s preserving bot identity and enabling protection', async kind => {
    const { root, sup, body } = await setup();
    await updateWorkbench(sup, 'assistant', { ...body, agentKind: kind }, root);
    const saved = (await loadRootConfig(join(root, 'config.json')))!.profiles.assistant!;
    expect(saved.agentKind).toBe(kind); expect(saved.accounts.app).toEqual({ id: 'cli_same', secret: 'ref:not-a-real-secret', tenant: 'feishu' });
    expect(saved.workbench?.revision).toBe(1); expect(saved.access.allowedChats).toEqual(['oc_team']);
    expect(saved.larkCli.identityPreset).toBe('bot-only'); expect(saved.preferences.model).toBe('default');
  });
  it('preserves explicitly enabled meeting and invite settings on group save', async () => {
    const { root, sup, body } = await setup();
    const file = join(root, 'config.json');
    const config = (await loadRootConfig(file))!;
    config.profiles.assistant!.meeting.enabled = true;
    config.profiles.assistant!.meeting.autoJoinOnInvite = true;
    await saveRootConfig(config, file);
    await updateWorkbench(sup, 'assistant', body, root);
    expect((await loadRootConfig(file))!.profiles.assistant!.meeting).toMatchObject({ enabled: true, autoJoinOnInvite: true });
  });
  it('rejects stale writes before stopping the bot', async () => {
    const { root, sup, body } = await setup();
    await updateWorkbench(sup, 'assistant', body, root);
    await expect(updateWorkbench(sup, 'assistant', body, root)).rejects.toMatchObject({ status: 409 });
    expect(sup.stopProfile).not.toHaveBeenCalled();
  });
  it('restarts a running bot after persistence, reporting startup failure honestly', async () => {
    const { root, sup, body } = await setup();
    sup.isOnline = () => true;
    sup.startProfile = vi.fn(async () => { throw new Error('offline'); });
    const result = await updateWorkbench(sup, 'assistant', body, root);
    expect(sup.stopProfile).toHaveBeenCalledWith('assistant');
    expect(result.applied).toBe(false); expect(result.agentKind).toBe('hermes');
  });
});
