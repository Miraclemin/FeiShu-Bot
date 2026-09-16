import { expect, it, vi } from 'vitest';
import { MeetingSession } from '../../../src/meeting/session';
import { MEETING_DEFAULTS } from '../../../src/config/profile-schema';

it('delivers a chat only once across push and polling envelopes', () => {
  const session = new MeetingSession({ client: { request: vi.fn() }, meetingId: 'meeting', meetingNo: '123456789', config: MEETING_DEFAULTS });
  const receive = vi.fn();
  session.on('chat', receive);
  const payload = { activity_event_type: 'chat_received', chat_received_items: [{ message_id: 'message1', content: '@bot 说了啥', operator: { id: 'ou_user', user_name: 'User' } }] };
  session.ingest(payload);
  session.ingest({ event_id: 'poll-envelope:0', event_type: 'chat_received', payload });
  expect(receive).toHaveBeenCalledTimes(1);
});
