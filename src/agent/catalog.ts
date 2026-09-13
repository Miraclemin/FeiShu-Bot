export const AGENT_KINDS = ['claude', 'codex', 'hermes', 'openclaw'] as const;
export type AgentKind = typeof AGENT_KINDS[number];
export const AGENT_LABELS: Record<AgentKind, string> = {
  claude: 'Claude Code', codex: 'Codex', hermes: 'Hermes', openclaw: 'OpenClaw',
};
export function isAgentKind(value: unknown): value is AgentKind {
  return typeof value === 'string' && (AGENT_KINDS as readonly string[]).includes(value);
}
