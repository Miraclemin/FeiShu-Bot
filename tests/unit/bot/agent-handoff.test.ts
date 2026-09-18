import { describe, expect, it } from 'vitest';
import { acceptsAgentMention } from '../../../src/bot/agent-handoff';
import { normalizeWorkbench } from '../../../src/config/workbench';

describe('real-time bot mention admission', () => {
  it('accepts a real mention in an enabled group without extra opt-in', () => {
    expect(acceptsAgentMention(true, { enabled: true })).toBe(true);
  });
  it('ignores unmentioned bot chatter', () => {
    expect(acceptsAgentMention(false, { enabled: true })).toBe(false);
  });
  it('does not admit bot tasks into absent or disabled groups', () => {
    for (const group of [undefined, {}, { enabled: false }]) {
      expect(acceptsAgentMention(true, group)).toBe(false);
    }
  });
  it('discards legacy handoff opt-out and follows group enablement', () => {
    const wb = normalizeWorkbench({ groups: { oc_test: { enabled: true, agentHandoff: false } } })!;
    expect(wb.groups.oc_test).not.toHaveProperty('agentHandoff');
    expect(acceptsAgentMention(true, wb.groups.oc_test)).toBe(true);
  });
});
