import { describe, expect, it } from 'vitest';
import { sharedMeetingInvite } from '../../../src/meeting/shared-invite';

const parse = (content: string, rawContentType = 'text', body?: unknown) => sharedMeetingInvite({ content, rawContentType, raw: { message: { content: JSON.stringify(body) } } });
describe('shared meeting invitations', () => {
  it('reads labeled formatted numbers and official numeric links', () => {
    expect(parse('邀请你加入会议，会议号：123 456 789')).toEqual({ meetingNo: '123456789' });
    expect(parse('https://vc.feishu.cn/j/123456789')).toEqual({ meetingNo: '123456789' });
  });
  it('reads card fields without using meeting IDs as meeting numbers', () => {
    expect(parse('<meeting>\n🔢 123456789\n</meeting>', 'video_chat')).toEqual({ meetingNo: '123456789' });
    expect(parse('[卡片]', 'video_chat', { meet_number: '123456789' })).toEqual({ meetingNo: '123456789' });
    expect(parse('[卡片]', 'interactive', { meeting_no: '123456789' })).toEqual({ meetingNo: '123456789' });
    expect(parse('[卡片]', 'interactive', { meeting_id: '123456789' })).toBeUndefined();
  });
  it('requests the number for opaque links or ambiguous invitations', () => {
    expect(parse('https://vc.feishu.cn/j/abc123')).toEqual({});
    expect(parse('会议号：123456789 会议号：987654321')).toEqual({});
  });
  it('ignores ordinary IDs, lookalike domains, commands and forwarded history', () => {
    expect(parse('订单号123456789')).toBeUndefined();
    expect(parse('https://vc.feishu.cn.evil.test/j/123456789')).toBeUndefined();
    expect(parse('/meeting join 123456789')).toBeUndefined();
    expect(parse('会议号：123456789', 'merge_forward')).toBeUndefined();
  });
});
