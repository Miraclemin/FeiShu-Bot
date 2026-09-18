import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ startRunFlow: vi.fn() }));

vi.mock('../../../src/bot/run-flow', () => ({ startRunFlow: mocks.startRunFlow }));

const { summarizeEndedMeeting, resolveSummaryTarget, attachMeetingAgent, answerInMeeting } = await import(
  '../../../src/meeting/orchestrator'
);
const { MeetingSession } = await import('../../../src/meeting/session');
const { MEETING_DEFAULTS, createDefaultProfileConfig } = await import(
  '../../../src/config/profile-schema'
);

/** A real ProfileConfig — capability resolution reads more than `agentKind`. */
function profileConfig(meeting: MeetingConfig) {
  const pc = createDefaultProfileConfig({
    agentKind: 'claude',
    accounts: { app: { id: 'cli_test', secret: '${APP_SECRET}', tenant: 'feishu' } },
  });
  pc.meeting = meeting;
  return pc;
}

import type { MeetingConfig } from '../../../src/config/profile-schema';
import type { VcRequestClient } from '../../../src/meeting/api';

const noopClient: VcRequestClient = { request: vi.fn(async () => ({ code: 0, data: {} }) as never) };

/** A run that emits one text chunk then completes. */
function fakeRun(text: string) {
  return {
    ok: true as const,
    execution: {
      subscribe: () => ({
        async *[Symbol.asyncIterator]() {
          yield { type: 'text', delta: text };
          yield { type: 'done' };
        },
      }),
    },
    policy: {},
    cwdRealpath: '/repo',
  };
}

function makeSession(config: MeetingConfig, originChatId?: string) {
  const s = new MeetingSession({
    client: noopClient,
    meetingId: '70001',
    meetingNo: '123456789',
    topic: '周会',
    config,
    ...(originChatId ? { originChatId } : {}),
  });
  s.ingest({
    event_id: 'e1',
    activity_event_type: 'transcript_received',
    transcript_received_items: [{ sentence_id: 1, text: '讨论了发布计划', speaker: { name: '甲' } }],
  });
  return s;
}

function deps(config: MeetingConfig, originChatId?: string, botOwnerId?: string) {
  const sent: { to: string; input: unknown }[] = [];
  const session = makeSession(config, originChatId);
  return {
    sent,
    session,
    args: {
      session,
      channel: {
        send: vi.fn(async (to: string, input: unknown) => {
          sent.push({ to, input });
          return {} as never;
        }),
      },
      controls: {
        profile: 'claude',
        profileConfig: profileConfig(config),
        ...(botOwnerId ? { botOwnerId } : {}),
      },
      executor: {},
      activeRuns: { interrupt: vi.fn() },
      sessions: {},
      workspaces: {},
    } as never,
  };
}

function cfg(over: Partial<MeetingConfig> = {}): MeetingConfig {
  return { ...MEETING_DEFAULTS, enabled: true, ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.startRunFlow.mockResolvedValue(fakeRun('讨论了发布计划；结论：周五上线。'));
});

describe('summarizeEndedMeeting', () => {
  it('returns execution failure rather than an empty answer', async () => {
    const d = deps(cfg(), 'oc_team');
    mocks.startRunFlow.mockResolvedValue({ ...fakeRun(''), execution: { subscribe: () => ({ async *[Symbol.asyncIterator]() {
      yield { type: 'error', message: '模型连接失败', terminationReason: 'failed' };
    } }) } });
    expect(await answerInMeeting(d.args, '总结', { deliver: 'caller' })).toBe('执行失败：模型连接失败');
  });
  it('delivers Codex final_text even without streaming text', async () => {
    const d = deps(cfg({ summaryOnEnd: true }), 'oc_team');
    mocks.startRunFlow.mockResolvedValue({ ...fakeRun(''), execution: { subscribe: () => ({ async *[Symbol.asyncIterator]() {
      yield { type: 'final_text', content: '最终答案' };
      yield { type: 'done' };
    } }) } });
    await summarizeEndedMeeting(d.args);
    expect(d.sent).toHaveLength(1);
    expect(JSON.stringify(d.sent[0])).toContain('最终答案');
  });
  it('does nothing when summaryOnEnd is off', async () => {
    const d = deps(cfg({ summaryOnEnd: false }), 'oc_team');
    await summarizeEndedMeeting(d.args);
    expect(mocks.startRunFlow).not.toHaveBeenCalled();
    expect(d.sent).toHaveLength(0);
  });

  it('summarizes to the chat the meeting was joined from', async () => {
    const d = deps(cfg({ summaryOnEnd: true }), 'oc_team');
    await summarizeEndedMeeting(d.args);

    expect(mocks.startRunFlow).toHaveBeenCalledTimes(2);
    expect(d.sent).toHaveLength(1);
    expect(d.sent[0]?.to).toBe('oc_team');
    expect(String((d.sent[0]?.input as { markdown: string }).markdown)).toContain('会议纪要 · 周会');
    expect(String((d.sent[0]?.input as { markdown: string }).markdown)).toContain('周五上线');
  });

  it('falls back to the bot owner DM when there is no origin chat (console join)', async () => {
    const d = deps(cfg({ summaryOnEnd: true }), undefined, 'ou_owner');
    await summarizeEndedMeeting(d.args);
    expect(d.sent[0]?.to).toBe('ou_owner');
  });

  it('honours summaryTarget=owner even when an origin chat exists', async () => {
    const d = deps(cfg({ summaryOnEnd: true, summaryTarget: 'owner' }), 'oc_team', 'ou_owner');
    await summarizeEndedMeeting(d.args);
    expect(d.sent[0]?.to).toBe('ou_owner');
  });

  it('falls back from owner to the origin chat when the owner is unknown', async () => {
    const d = deps(cfg({ summaryOnEnd: true, summaryTarget: 'owner' }), 'oc_team');
    await summarizeEndedMeeting(d.args);
    expect(d.sent[0]?.to).toBe('oc_team');
  });

  it('skips when there is nowhere to send it', async () => {
    const d = deps(cfg({ summaryOnEnd: true }));
    await summarizeEndedMeeting(d.args);
    expect(mocks.startRunFlow).not.toHaveBeenCalled();
    expect(d.sent).toHaveLength(0);
  });

  it('skips an empty meeting instead of summarizing nothing', async () => {
    const config = cfg({ summaryOnEnd: true });
    const session = new MeetingSession({
      client: noopClient,
      meetingId: '70001',
      meetingNo: '123456789',
      config,
      originChatId: 'oc_team',
    });
    const sent: unknown[] = [];
    await summarizeEndedMeeting({
      session,
      channel: { send: vi.fn(async () => { sent.push(1); return {} as never; }) },
      controls: { profile: 'claude', profileConfig: profileConfig(config) },
      executor: {},
      activeRuns: { interrupt: vi.fn() },
      sessions: {},
      workspaces: {},
    } as never);

    expect(mocks.startRunFlow).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
  });

  it('still works after the meeting ended (transcript survives markEnded)', async () => {
    const d = deps(cfg({ summaryOnEnd: true }), 'oc_team');
    d.session.markEnded(); // what the manager does before invoking onEnded
    await summarizeEndedMeeting(d.args);
    expect(d.sent).toHaveLength(1);
  });
});

describe('resolveSummaryTarget', () => {
  it('prefers the configured target and reports no fallback', () => {
    expect(resolveSummaryTarget('origin', 'oc_a', 'ou_b')).toEqual({
      to: 'oc_a',
      kind: 'origin',
      fellBack: false,
    });
    expect(resolveSummaryTarget('owner', 'oc_a', 'ou_b')).toEqual({
      to: 'ou_b',
      kind: 'owner',
      fellBack: false,
    });
  });

  it('falls back both directions and flags it', () => {
    expect(resolveSummaryTarget('origin', undefined, 'ou_b')).toEqual({
      to: 'ou_b',
      kind: 'owner',
      fellBack: true,
    });
    expect(resolveSummaryTarget('owner', 'oc_a', undefined)).toEqual({
      to: 'oc_a',
      kind: 'origin',
      fellBack: true,
    });
  });

  it('returns undefined when neither lane exists', () => {
    expect(resolveSummaryTarget('origin', undefined, undefined)).toBeUndefined();
    expect(resolveSummaryTarget('owner', undefined, undefined)).toBeUndefined();
  });
});


describe('continuous listening while answering', () => {
  it('does not run the agent for speech and still collects subtitles during a text question', async () => {
    const d = deps(cfg(), 'oc_team');
    let finish!: (value: ReturnType<typeof fakeRun>) => void;
    mocks.startRunFlow.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    attachMeetingAgent(d.args);
    d.session.ingest({ event_id: 'speech2', activity_event_type: 'transcript_received',
      transcript_received_items: [{ sentence_id: 2, text: '叫机器人也只是记录' }] });
    expect(mocks.startRunFlow).not.toHaveBeenCalled();
    d.session.ingest({ event_id: 'chat1', activity_event_type: 'chat_received',
      chat_received_items: [{ content: '@bot 总结一下', message_type: 1 }] });
    await vi.waitFor(() => expect(mocks.startRunFlow).toHaveBeenCalledTimes(1));
    d.session.ingest({ event_id: 'speech3', activity_event_type: 'transcript_received',
      transcript_received_items: [{ sentence_id: 3, text: '思考期间的新发言' }] });
    expect(d.session.recentTranscript()).toContain('?: 思考期间的新发言');
    finish(fakeRun('已总结'));
    await vi.waitFor(() => expect(noopClient.request).toHaveBeenCalled());
    d.session.dispose();
  });
});


describe('workbench meeting participation', () => {
  it.each(['ou_owner', 'ou_member', undefined])('allows a meeting question from %s without impersonating the owner', async actorId => {
    const d = deps(cfg(), 'oc_team', 'ou_owner');
    const args = d.args as unknown as import('../../../src/meeting/orchestrator').MeetingAgentDeps;
    args.controls.profileConfig.workbench = { groups: {} } as typeof args.controls.profileConfig.workbench;
    await answerInMeeting(args, '总结', { deliver: 'caller', actorId });
    expect(mocks.startRunFlow).toHaveBeenCalledWith(expect.objectContaining({
      scope: expect.objectContaining({ actorId: actorId ?? 'meeting' }),
      access: { ok: true, reason: 'allowed-chat' },
    }));
  });
});


describe('whole meeting coverage', () => {
  it('uses the opening after 300 later sentences in both answers and summaries', async () => {
    const d = deps(cfg({ summaryOnEnd: true }), 'oc_team');
    for (let i = 2; i <= 301; i++) d.session.ingest({
      event_id: `long-${i}`, activity_event_type: 'transcript_received',
      transcript_received_items: [{ sentence_id: i, text: `后续内容${i}`, speaker: { name: '乙' } }],
    });
    expect(d.session.recentTranscript()).toHaveLength(200);
    await answerInMeeting(d.args, '开头说了什么', { deliver: 'caller' });
    expect(mocks.startRunFlow.mock.calls[0]?.[0].prompt).toContain('讨论了发布计划');
    mocks.startRunFlow.mockClear();
    await summarizeEndedMeeting(d.args);
    const prompt = mocks.startRunFlow.mock.calls[0]?.[0].prompt;
    expect(prompt).toContain('讨论了发布计划');
    expect(prompt).toContain('后续内容301');
  });
  it('does not send execution errors as a successful summary', async () => {
    const d = deps(cfg({ summaryOnEnd: true }), 'oc_team');
    mocks.startRunFlow.mockResolvedValue({ ok: false, rejectReason: { code: 'run-already-active', userVisible: 'busy' } });
    await summarizeEndedMeeting(d.args);
    expect(JSON.stringify(d.sent)).not.toContain('会议纪要 ·');
    expect(JSON.stringify(d.sent)).toContain('失败');
  });
});


it('summarizes every segment of a long meeting before combining them', async () => {
  const d = deps(cfg({ summaryOnEnd: true }), 'oc_team');
  d.session.ingest({ event_id: 'huge', activity_event_type: 'transcript_received',
    transcript_received_items: [{ sentence_id: 'huge', text: '开场标记' + '会议内容'.repeat(14000) + '结束标记' }] });
  await summarizeEndedMeeting(d.args);
  const prompts = mocks.startRunFlow.mock.calls.map(c => c[0].prompt as string);
  expect(prompts.length).toBeGreaterThan(3);
  expect(prompts.slice(0, -1).join('')).toContain('开场标记');
  expect(prompts.slice(0, -1).join('')).toContain('结束标记');
  expect(prompts.every(p => p.length < 25000)).toBe(true);
  expect(d.sent).toHaveLength(1);
});


it('honours the saved auto-summary switch when running controls are stale', async () => {
  const store = await import('../../../src/config/profile-store');
  const d = deps(cfg({ summaryOnEnd: false }), 'oc_team');
  const args = d.args as unknown as import('../../../src/meeting/orchestrator').MeetingAgentDeps;
  args.controls.configPath = '/test/config.json';
  const spy = vi.spyOn(store, 'loadRootConfig').mockResolvedValue({
    profiles: { claude: profileConfig(cfg({ summaryOnEnd: true })) },
  } as never);
  try {
    await summarizeEndedMeeting(args);
    expect(d.sent).toHaveLength(1);
    expect(JSON.stringify(d.sent)).toContain('会议纪要 ·');
    spy.mockResolvedValue({ profiles: { claude: profileConfig(cfg({ summaryOnEnd: false })) } } as never);
    d.sent.length = 0;
    args.controls.profileConfig.meeting.summaryOnEnd = true;
    await summarizeEndedMeeting(args);
    expect(d.sent).toHaveLength(0);
  } finally { spy.mockRestore(); }
});
