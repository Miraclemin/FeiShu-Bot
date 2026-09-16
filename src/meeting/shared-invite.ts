import type { NormalizedMessage } from '@larksuite/channel';

/** Recognize only the current message, never quotes or conversation history. */
export function sharedMeetingInvite(msg: Pick<NormalizedMessage, 'content' | 'raw' | 'rawContentType'>): { meetingNo?: string } | undefined {
  if (msg.rawContentType === 'merge_forward' || msg.content.trim().startsWith('/')) return;
  const numbers = new Set<string>();
  let recognized = false;
  const scan = (text: string) => {
    for (const match of text.matchAll(/(?:会议号|Meeting\s*ID)\s*[:：#]?\s*(\d{3}[ -]?\d{3}[ -]?\d{3})(?!\d)/gi)) {
      recognized = true;
      numbers.add(match[1]!.replace(/[ -]/g, ''));
    }
    for (const match of text.matchAll(/https:\/\/[^\s<>"\\]+/g)) {
      try {
        const url = new URL(match[0]);
        if (!['vc.feishu.cn', 'vc.larksuite.com'].includes(url.hostname) || !/^\/(?:j|join)\//.test(url.pathname)) continue;
        recognized = true;
        const id = url.pathname.split('/')[2];
        if (id && /^\d{9}$/.test(id)) numbers.add(id);
      } catch { /* Not a URL. */ }
    }
  };
  scan(msg.content);
  if (msg.rawContentType === 'video_chat') {
    recognized = true;
    const number = msg.content.match(/🔢\s*(\d{3}[ -]?\d{3}[ -]?\d{3})(?!\d)/)?.[1];
    if (number) numbers.add(number.replace(/[ -]/g, ''));
  }
  // Native meeting cards may carry the number only in the raw message body.
  const raw = msg.raw as { message?: { content?: unknown } } | undefined;
  if (['interactive', 'share_calendar_event', 'video_chat'].includes(msg.rawContentType)) {
    let body = raw?.message?.content;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = undefined; } }
    const visit = (value: unknown, depth: number) => {
      if (depth > 12) return;
      if (typeof value === 'string') { scan(value); return; }
      if (!value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) {
        if (['meeting_no', 'meet_number'].includes(key) && /^\d{9}$/.test(String(child))) {
          recognized = true;
          numbers.add(String(child));
        } else visit(child, depth + 1);
      }
    };
    visit(body, 0);
  }
  if (!recognized) return;
  return numbers.size === 1 ? { meetingNo: [...numbers][0] } : {};
}
