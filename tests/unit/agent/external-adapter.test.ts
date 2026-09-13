import { describe, expect, it } from 'vitest';
import { ExternalAdapter, openClawText } from '../../../src/agent/external-adapter';
describe('external CLI boundary', () => {
  it('parses both supported OpenClaw result envelopes', () => {
    expect(openClawText(JSON.stringify({ result: { payloads: [{ text: 'hello' }] } }))).toBe('hello');
    expect(openClawText(JSON.stringify({ ok: true, final: 'done' }))).toBe('done');
  });
  it.each([{ ok: false }, { status: 'timeout' }, { status: 'in_flight' }, { result: { meta: { error: 'failed' } } }])('does not report a failed/pending run as success', envelope => {
    expect(() => openClawText(JSON.stringify(envelope))).toThrow();
  });
  it.each(['hermes', 'openclaw'] as const)('rejects false sandbox promises for %s before execution', async id => {
    await expect(new ExternalAdapter(id).prepareRun({ runId: 'test', cwd: '/tmp', prompt: 'hi', sandbox: 'read-only' })).rejects.toThrow(/不支持/);
  });
});
