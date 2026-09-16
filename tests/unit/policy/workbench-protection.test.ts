import { describe, expect, it } from 'vitest';
import { canUseDm, canUseGroup } from '../../../src/policy/access';
import { createDefaultProfileConfig } from '../../../src/config/profile-schema';
import { normalizeWorkbench } from '../../../src/config/workbench';
import { evaluateRunPolicy } from '../../../src/policy/run-policy';
import { capabilityFor } from '../../../src/agent/capability';
const owner = { botOwnerId: 'ou_owner', ownerRefreshState: 'ok' as const };
function profile() {
  const cfg = createDefaultProfileConfig({ agentKind: 'claude', accounts: { app: { id: 'cli_test', secret: 'test', tenant: 'feishu' } } });
  cfg.mode = 'team'; cfg.access.allowedChats = ['oc_team']; cfg.access.admins = ['ou_admin']; cfg.access.allowedUsers = ['ou_user'];
  cfg.workbench = { revision: 1, protectDocuments: true, groups: { oc_team: { enabled: true, name: 'team', workspace: '', persona: '', documents: [] } } };
  return cfg;
}
describe('native CLI document protection', () => {
  it.each(['ou_external', 'ou_user', 'ou_admin'])('does not let %s inherit bot document access, even in team mode', actor => {
    expect(canUseGroup(profile(), owner, 'oc_team', actor).ok).toBe(false);
    expect(canUseDm(profile(), owner, actor).ok).toBe(false);
  });
  it('requires current verified ownership and an explicitly enabled group', () => {
    expect(canUseGroup(profile(), owner, 'oc_team', 'ou_owner').ok).toBe(true);
    expect(canUseGroup(profile(), owner, 'oc_other', 'ou_owner').ok).toBe(false);
    expect(canUseGroup(profile(), { ...owner, ownerRefreshState: 'failed' }, 'oc_team', 'ou_owner').ok).toBe(false);
  });
  it('fails closed for strict document bindings rather than relying on prompts', () => {
    const cfg = profile(); cfg.workbench!.groups.oc_team!.documents = ['https://example.feishu.cn/docx/abc'];
    const result = evaluateRunPolicy({ scope: { source: 'im', actorId: 'ou_owner', chatId: 'oc_team' }, attachments: [], prompt: 'read doc',
      requestedCwd: '/workspace', cwdRealpath: '/workspace', access: { ok: true, reason: 'owner' }, capability: capabilityFor(cfg), profileConfig: cfg, now: 0 });
    expect(result).toMatchObject({ ok: false, rejectReason: { code: 'document-permission-unverified' } });
  });
  it('rejects deceptive document hosts', () => {
    expect(() => normalizeWorkbench({ groups: { oc_team: { documents: ['https://feishu.cn.evil.test/docx/id'] } } })).toThrow();
  });
});

describe('strict skill isolation', () => {
  it.each(['codex', 'claude', 'hermes', 'openclaw'] as const)('blocks %s before native execution without an isolation runner', agentKind => {
    const cfg = profile(); cfg.agentKind = agentKind;
    cfg.workbench!.groups.oc_team!.skillIsolation = 'strict';
    const result = evaluateRunPolicy({ scope: { source: 'im', actorId: 'ou_owner', chatId: 'oc_team' }, attachments: [], prompt: 'read any unselected skill', requestedCwd: '/workspace', cwdRealpath: '/workspace', access: { ok: true, reason: 'owner' }, capability: capabilityFor(cfg), profileConfig: cfg, now: 0 });
    expect(result).toMatchObject({ ok: false, rejectReason: { code: 'skill-isolation-unavailable' } });
  });
  it('preserves strict isolation when saving group configuration', () => {
    expect(normalizeWorkbench({ groups: { oc_team: { skillIsolation: 'strict' } } })?.groups.oc_team?.skillIsolation).toBe('strict');
    expect(() => normalizeWorkbench({ groups: { oc_team: { skillIsolation: 'invalid' } } })).toThrow();
  });
});
