import { mkdir, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectInstalledAgents } from '../src/cli/agent-detection';
import { createDefaultProfileConfig } from '../src/config/profile-schema';
import { createRuntimeAgent } from '../src/runtime/agent-runtime';
const root = await mkdtemp(join(tmpdir(), 'workbench-agent-smoke-'));
const detected = await detectInstalledAgents();
for (const item of detected) {
  const only = process.argv.find(a => a.startsWith('--only='))?.slice(7); if (only && only !== item.kind) continue;
  const profileDir = join(root, item.kind); await mkdir(profileDir);
  const cfg = createDefaultProfileConfig({ agentKind: item.kind,
    accounts: { app: { id: 'unused', secret: 'unused', tenant: 'feishu' } },
    ...(item.kind === 'codex' ? { codex: { binaryPath: item.binaryPath, inheritCodexHome: true } } : {}) });
  const agent = createRuntimeAgent(cfg, { profileDir });
  const available = await agent.checkAvailability?.();
  console.log(JSON.stringify({ agent: item.kind, available: available?.ok ?? false }));
  if (!process.argv.includes('--run') || !available?.ok) continue;
  const opts = { ...(process.argv.includes('--skills-empty') ? { skills: { ids: [] } } : {}), runId: `smoke-${item.kind}`, cwd: profileDir,
    prompt: '这是连接测试。不要读取任何文件，不要调用任何工具，不要发送消息，不要执行命令。只回复 WORKBENCH_OK。',
    sandbox: 'danger-full-access' as const, permissionMode: 'bypassPermissions' as const };
  let timeout = false;
  try {
    await agent.prepareRun?.(opts);
    const run = agent.run(opts);
    const timer = setTimeout(() => { timeout = true; void run.stop(); }, 45000);
    let reply = '', result = 'unknown';
    try { for await (const e of run.events) {
      if (e.type === 'text') reply += e.delta;
      if (e.type === 'final_text') reply = e.content;
      if (e.type === 'error') { result = 'error'; console.log(JSON.stringify({ agent: item.kind, diagnostic: e.message.slice(0, 600).replace(/(?:sk-|Bearer )[A-Za-z0-9_-]+/g, '[redacted]') })); }
      if (e.type === 'done') result = e.terminationReason;
    } } finally { clearTimeout(timer); if (!await run.waitForExit(2000)) await run.stop(); }
    console.log(JSON.stringify({ agent: item.kind, result, timeout, acknowledged: reply.includes('WORKBENCH_OK') }));
  } catch (e) { console.log(JSON.stringify({ agent: item.kind, result: 'preflight-failed', error: (e as Error).name })); }
}
