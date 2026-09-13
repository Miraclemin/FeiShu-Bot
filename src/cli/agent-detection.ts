import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { delimiter, extname, isAbsolute, join } from 'node:path';

import { AGENT_KINDS, type AgentKind } from '../agent/catalog';
export type { AgentKind } from '../agent/catalog';

export interface DetectedAgent {
  kind: AgentKind;
  binaryPath: string;
}

export async function resolveExecutablePath(command: string): Promise<string> {
  if (isAbsolute(command)) {
    await access(command, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
    if (!(await stat(command)).isFile()) throw new Error('not a file');
    return command;
  }
  for (const dir of (process.env.PATH ?? process.env.Path ?? '').split(delimiter)) {
    if (!dir) continue;
    for (const candidate of executableCandidates(dir, command)) {
      try {
        await access(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
        if (!(await stat(candidate)).isFile()) continue;
        return candidate;
      } catch {
        // Continue searching PATH.
      }
    }
  }
  throw new Error(`executable not found: ${command}`);
}

function executableCandidates(dir: string, command: string): string[] {
  const candidates = [join(dir, command)];
  if (extname(command)) return candidates;
  for (const ext of pathExts()) {
    candidates.push(join(dir, `${command}${ext}`));
  }
  return candidates;
}

function pathExts(): string[] {
  return (process.env.PATHEXT ?? '')
    .split(';')
    .map((ext) => ext.trim())
    .filter(Boolean);
}

export async function detectInstalledAgents(): Promise<DetectedAgent[]> {
  const candidates = AGENT_KINDS.map(kind => ({ kind,
    command: process.env[`LARK_CHANNEL_${kind.toUpperCase()}_BIN`] ?? kind,
  }));
  const detected: DetectedAgent[] = [];
  for (const candidate of candidates) {
    try {
      detected.push({
        kind: candidate.kind,
        binaryPath: await resolveExecutablePath(candidate.command),
      });
    } catch {
      // Missing agents are reported by the caller based on the final count.
    }
  }
  return detected;
}
