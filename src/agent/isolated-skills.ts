import { mkdtempSync, mkdirSync, readdirSync, lstatSync, copyFileSync, writeFileSync, rmSync, realpathSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { discoverSkills, selectedSkills } from './workbench-skills';
import type { AgentRun, AgentRunOptions, AgentEvent } from './types';
export const SKILL_IMAGE = 'lark-skill-sandbox:codex-v1';
/** Copies ordinary files only; links, devices and sockets never cross the boundary. */
export function copySkillTree(source: string, target: string, workspace = false) {
  let bytes = 0, files = 0;
  const visit = (src: string, dst: string) => {
    const st = lstatSync(src);
    if (st.isSymbolicLink() || (!st.isFile() && !st.isDirectory())) throw new Error('隔离快照不接受符号链接或特殊文件');
    if (st.isDirectory()) {
      mkdirSync(dst, { recursive: true });
      for (const name of readdirSync(src)) {
        if (workspace && ['.git', '.agents', '.codex', '.claude', '.hermes', '.openclaw', 'skills', 'node_modules', '.env'].includes(name)) continue;
        if (workspace && name === 'SKILL.md') throw new Error('工作目录包含额外技能，请移至专用技能目录后再运行');
        visit(join(src, name), join(dst, name));
      }
    } else {
      bytes += st.size;
      if (++files > 10000 || bytes > 100 * 1024 * 1024) throw new Error('隔离快照超过 100 MiB 或 10000 个文件');
      copyFileSync(src, dst); chmodSync(dst, st.mode & 0o777);
    }
  };
  visit(source, target);
}
export function isolatedCodexRun(opts: AgentRunOptions): AgentRun {
  if (!opts.cwd || !opts.skills) throw new Error('严格模式需要工作目录和技能清单');
  if (opts.images?.length) throw new Error('严格模式暂不支持本机图片附件');
  const ready = spawnSync('docker', ['image', 'inspect', SKILL_IMAGE], { timeout: 10000, windowsHide: true, stdio: 'ignore' });
  if (ready.status !== 0) throw new Error('请启动 Docker 并构建严格技能隔离镜像；不会回退到本机运行');
  const dir = mkdtempSync(join(tmpdir(), 'lark-isolated-')); chmodSync(dir, 0o700);
  const name = `lark-skills-${randomUUID()}`;
  try {
    const cwd = realpathSync(opts.cwd);
    if (cwd === homedir() || cwd === dirname(cwd)) throw new Error('请选择专用项目目录，不能使用主目录或磁盘根目录');
    copySkillTree(cwd, join(dir, 'workspace'), true);
    rmSync(join(dir, 'workspace/.agent-result'), { force: true });
    mkdirSync(join(dir, 'skills'));
    const list = selectedSkills(opts.skills, discoverSkills(cwd));
    for (const skill of list) copySkillTree(dirname(skill.path), join(dir, 'skills', skill.id));
    mkdirSync(join(dir, 'auth'));
    // Provider credential only: never mount the host Codex configuration or plugins.
    copyFileSync(join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'auth.json'), join(dir, 'auth/auth.json'));
    chmodSync(join(dir, 'auth/auth.json'), 0o600);
    writeFileSync(join(dir, 'auth/config.toml'), '[features]\nplugins=false\napps=false\n');
    const args = ['run', '--rm', '-i', '--name', name, '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--pids-limit=128', '--memory=2g', '--cpus=2', '--tmpfs', '/tmp:rw,nosuid,nodev,size=256m',
      '--mount', `type=bind,src=${join(dir, 'workspace')},dst=/workspace`,
      '--mount', `type=bind,src=${join(dir, 'skills')},dst=/skills,readonly`,
      '--mount', `type=bind,src=${join(dir, 'auth')},dst=/auth`,
      '--env', 'CODEX_HOME=/auth', SKILL_IMAGE, 'exec', '--skip-git-repo-check', '--sandbox', 'danger-full-access', '-c', 'approval_policy="never"', '-C', '/workspace', '-o', '/workspace/.agent-result', ...(opts.model ? ['--model', opts.model] : []), '-'];
    const child = spawn('docker', args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '', failure: Error | undefined, stopped = false;
    child.stdout.resume(); child.stderr.on('data', b => { stderr = (stderr + b).slice(-4000); });
    const exit = new Promise<number | null>(resolve => { child.once('error', e => { failure = e; resolve(null); }); child.once('close', resolve); });
    child.stdin.on('error', () => {});
    child.stdin.end(`Only these skills are available:\n${list.map(s => `${s.name}: /skills/${s.id}/SKILL.md`).join('\n')}\nWork in /workspace. Changes are an isolated snapshot, not written back to the host.\n${opts.prompt}`);
    let closed = false;
    void exit.then(() => { closed = true; });
    return { runId: opts.runId,
      events: (async function* (): AsyncGenerator<AgentEvent> {
        try {
          const code = await exit;
          if (stopped) { yield { type: 'done', terminationReason: 'interrupted' }; return; }
          if (code !== 0 || failure) throw failure || new Error(`隔离执行失败 (${code}): ${stderr}`);
          const { readFileSync } = await import('node:fs');
          const result = readFileSync(join(dir, 'workspace/.agent-result'), 'utf8');
          yield { type: 'final_text', content: result };
          yield { type: 'done', terminationReason: 'normal' };
        } catch (e) { yield { type: 'error', message: (e as Error).message, terminationReason: 'failed' }; }
        finally { rmSync(dir, { recursive: true, force: true }); }
      })(),
      async waitForExit(ms) { if (closed) return true; return new Promise(resolve => { const t = setTimeout(() => resolve(false), ms); void exit.then(() => { clearTimeout(t); resolve(true); }); }); },
      async stop() { stopped = true; spawnSync('docker', ['rm', '-f', name], { timeout: 10000, stdio: 'ignore', windowsHide: true }); child.kill(); await exit; rmSync(dir, { recursive: true, force: true }); },
    };
  } catch (e) { rmSync(dir, { recursive: true, force: true }); throw e; }
}
