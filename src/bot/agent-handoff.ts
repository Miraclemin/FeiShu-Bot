/** Bot handoffs enter through the same real-time message event as human mentions. */
export function acceptsAgentMention(
  mentionedBot: boolean,
  group?: { enabled?: boolean },
): boolean {
  return mentionedBot && group?.enabled === true;
}
