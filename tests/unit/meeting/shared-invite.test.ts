import { describe, expect, it } from 'vitest';
import { sharedMeetingInvite, RecentMeetingInvites, isMeetingJoinRequest } from '../../../src/meeting/shared-invite';

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

describe('recent meeting context', () => {
  it('associates a later join request only with a fresh card in the same scope', () => {
    let now = 1000000;
    const cache = new RecentMeetingInvites(() => now);
    cache.observe('group:topic', { content: '<meeting>🔢 199957728</meeting>', raw: {}, rawContentType: 'video_chat', senderIsBot: false, createTime: now });
    expect(cache.resolve('group:topic')).toEqual({meetingNo:'199957728'});
    expect(cache.resolve('other')).toBeUndefined();
    expect(cache.resolve('group:other-topic')).toBeUndefined();
    expect(isMeetingJoinRequest('加入上面的会议')).toBe(true);
    expect(isMeetingJoinRequest('加入上面的回忆')).toBe(true);
    expect(isMeetingJoinRequest('不要加入上面的会议')).toBe(false);
    now += 600001;
    expect(cache.resolve('group:topic')).toBeUndefined();
  });
  it('does not reuse an older number when the latest shared link is opaque', () => {
    const cache = new RecentMeetingInvites(() => 1000);
    cache.observe('group', {content:'会议号：123456789',raw:{},rawContentType:'text',senderIsBot:false,createTime:999});
    cache.observe('group', {content:'https://vc.feishu.cn/j/opaque',raw:{},rawContentType:'text',senderIsBot:false,createTime:1000});
    expect(cache.resolve('group')).toEqual({});
  });
});
