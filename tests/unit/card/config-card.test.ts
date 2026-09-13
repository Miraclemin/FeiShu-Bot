import { describe, expect, it } from 'vitest';
import { configFormCard, type ConfigFormOpts } from '../../../src/card/config-card';

const base: ConfigFormOpts = {
  agentKind: 'claude',
  mode: 'personal',
  model: 'default',
  messageReply: 'markdown',
  showToolCalls: false,
  cotMessages: 'off',
  maxConcurrentRuns: 1,
  runIdleTimeoutMinutes: 0,
  requireMentionInGroup: false,
  larkCliIdentity: 'bot-only',
  allowedUsers: [],
  allowedChats: [],
  admins: [],
  knownChats: [],
};

describe('configFormCard console URL', () => {
  it('shows the web console URL when one is running', () => {
    const url = 'http://127.0.0.1:53219/?token=abc123';
    const card = configFormCard({ ...base, consoleUrl: url });
    expect(JSON.stringify(card)).toContain(url);
    expect(JSON.stringify(card)).toContain('Web 控制台');
  });

  it('omits the console section when no console is running', () => {
    const card = configFormCard(base);
    expect(JSON.stringify(card)).not.toContain('Web 控制台');
  });
});

describe('runtime permission picker', () => {
 it.each(['read-only', 'workspace', 'full'] as const)('shows current %s permission with all three choices', runtimeAccess => {
  const card = configFormCard({...base, runtimeAccess}) as {body:{elements:Array<{tag:string;elements?:Array<{name?:string;initial_option?:string;options?:unknown[]}>}>}};
  const picker=card.body.elements.find(x=>x.tag==='form')?.elements?.find(x=>x.name==='runtime_access');
  expect(picker?.initial_option).toBe(runtimeAccess);expect(picker?.options).toHaveLength(3);
 });
});
