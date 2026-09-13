import { discoverSkills, selectedSkills, skillPrompt, externalSkillRuntime } from './workbench-skills';
import { randomUUID } from 'node:crypto';
import { spawnProcess, mergeProcessEnv } from '../platform/spawn';
import { resolveExecutablePath } from '../cli/agent-detection';
import { checkAgentAvailability } from './preflight';
import { buildLarkChannelEnv, type LarkChannelEnvContext } from './lark-channel-env';
import { buildBridgeSystemPrompt } from './bridge-system-prompt';
import type { AgentAdapter, AgentBotIdentity, AgentEvent, AgentRun, AgentRunOptions } from './types';

/** Native CLIs: fresh sessions, no cross-engine resume, never implicit delivery. */
export class ExternalAdapter implements AgentAdapter {
  readonly displayName: string;
  private binary: string;
  private modern = false;
  private identity?: AgentBotIdentity;
  constructor(readonly id: 'hermes' | 'openclaw', private channel?: LarkChannelEnvContext) {
    this.displayName = id === 'hermes' ? 'Hermes' : 'OpenClaw';
    this.binary = process.env[`LARK_CHANNEL_${id.toUpperCase()}_BIN`] ?? id;
  }
  setBotIdentity(identity: AgentBotIdentity) { this.identity = identity; }
  async isAvailable() { return (await this.checkAvailability()).ok; }
  async checkAvailability() {
    return checkAgentAvailability({ agentId: this.id, agentName: this.displayName,
      command: this.binary, binaryPath: this.binary,
      ...(this.id === 'hermes' ? { args: ['chat', '--help'] } : {}) });
  }
  async prepareRun(opts: AgentRunOptions) {
    // These native runtimes inherit their own tool policies. Never pretend a
    // Codex/Claude permission flag restricts either of them.
    if (opts.sandbox !== 'danger-full-access') {
      throw new Error(`${this.displayName} 的本机工具权限由其自身管理；当前适配器不支持只读/目录沙箱。请在工作台明确选择本机完整权限，或使用 Codex。`);
    }
    this.binary = await resolveExecutablePath(this.binary);
    const help = await readHelp(this.binary, this.id === 'hermes' ? ['chat', '--help'] : ['agent', 'exec', '--help']);
    this.modern = this.id === 'hermes' ? help.includes('--query-file') : help.includes('--message-file') && help.includes('--cwd');
    if (!this.modern && process.platform === 'win32' && /\.(cmd|bat)$/i.test(this.binary)) {
      throw new Error(`${this.displayName} 当前版本不能安全地通过 Windows 命令包装器传递正文；请升级到支持 stdin 的版本。`);
    }
  }
  run(opts: AgentRunOptions): AgentRun {
    if (!opts.cwd) throw new Error('cwd is required');
    const selected = opts.skills ? selectedSkills(opts.skills, discoverSkills(opts.cwd)) : [];
    const skillRuntime = opts.skills ? externalSkillRuntime(this.id, opts.cwd) : undefined;
    const prompt = `${opts.skills ? skillPrompt(selected) : ''}${buildBridgeSystemPrompt(this.identity)}\n\n${opts.prompt}`;
    const args = this.id === 'hermes'
      ? ['chat', '--quiet', ...(this.modern ? ['--query-file', '-'] : ['--query', prompt])]
      : this.modern
        ? ['agent', 'exec', '--message-file', '-', '--cwd', opts.cwd, '--json']
        : ['agent', '--local', '--session-id', randomUUID(), '--message', prompt, '--json'];
    if (opts.model) args.push('--model', opts.model);
    const child = spawnProcess(this.binary, args, {
      cwd: opts.cwd, windowsHide: true, detached: process.platform !== 'win32',
      env: mergeProcessEnv(process.env, { ...buildLarkChannelEnv(this.channel), ...skillRuntime?.env, NO_COLOR: '1' }),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.once('close', () => skillRuntime?.cleanup());
    child.once('error', () => skillRuntime?.cleanup());
    let stdout = '', stderr = '', failure: Error | undefined, stopped = false, closed = false;
    const limit = 4 * 1024 * 1024;
    const completion = new Promise<number | null>(resolve => {
      child.stdout?.on('data', (b: Buffer) => {
        stdout += b.toString('utf8');
        if (stdout.length > limit) { failure = new Error('Agent output exceeded 4 MiB'); child.kill(); }
      });
      child.stderr?.on('data', (b: Buffer) => { stderr = (stderr + b.toString('utf8')).slice(-8000); });
      child.once('error', e => { failure = e; closed = true; resolve(null); });
      child.once('close', code => { closed = true; resolve(code); });
    });
    child.stdin?.on('error', () => {});
    child.stdin?.end(this.modern ? prompt : undefined);
    const id = this.id;
    return {
      runId: opts.runId,
      events: (async function* (): AsyncGenerator<AgentEvent> {
        yield { type: 'system', cwd: opts.cwd, model: opts.model };
        const code = await completion;
        if (stopped) { yield { type: 'done', terminationReason: 'interrupted' }; return; }
        if (failure || code !== 0) {
          yield { type: 'error', message: failure?.message ?? `${id} exited ${code}: ${stderr.slice(-2000)}`, terminationReason: 'failed' };
          return;
        }
        try {
          const content = id === 'openclaw' ? openClawText(stdout) : stdout.replace(/\x1b\[[0-9;]*m/g, '').trim();
          if (!content) throw new Error('Agent returned no final text');
          yield { type: 'final_text', content };
          yield { type: 'done', terminationReason: 'normal' };
        } catch (err) {
          yield { type: 'error', message: (err as Error).message, terminationReason: 'failed' };
        }
      })(),
      async waitForExit(timeoutMs) {
        if (closed) return true;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const result = await Promise.race([completion.then(() => true), new Promise<boolean>(r => { timer = setTimeout(() => r(false), timeoutMs); })]);
        if (timer) clearTimeout(timer);
        return result;
      },
      async stop() {
        if (closed) return;
        stopped = true;
        if (process.platform === 'win32' && child.pid) {
          await new Promise<void>(resolve => {
            const killer = spawnProcess('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
            killer.once('error', () => { child.kill(); resolve(); });
            killer.once('close', () => resolve());
          });
        } else {
          const kill = (signal: NodeJS.Signals) => { try { if (child.pid) process.kill(-child.pid, signal); } catch { child.kill(signal); } };
          kill('SIGTERM');
          if (!await this.waitForExit(opts.stopGraceMs ?? 3000)) kill('SIGKILL');
        }
        await this.waitForExit(3000);
      },
    };
  }
}
export function openClawText(output: string): string {
  const envelope = JSON.parse(output.trim());
  const result = envelope.result ?? envelope;
  if (envelope.ok === false || ['error', 'timeout', 'in_flight'].includes(envelope.status) || result.meta?.error) {
    throw new Error('OpenClaw 未完成任务，请检查本机运行状态');
  }
  return typeof result.final === 'string' ? result.final :
    (result.payloads ?? []).filter((p: { text?: unknown }) => typeof p.text === 'string').map((p: { text: string }) => p.text).join('\n');
}
async function readHelp(binary: string, args: string[]): Promise<string> {
  return new Promise(resolve => {
    const child = spawnProcess(binary, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let text = '';
    const timer = setTimeout(() => { child.kill(); resolve(''); }, 5000);
    child.stdout?.on('data', b => { text = (text + b.toString()).slice(-40000); });
    child.once('error', () => { clearTimeout(timer); resolve(''); });
    child.once('close', code => { clearTimeout(timer); resolve(code === 0 ? text : ''); });
  });
}
