import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDefaultProfileConfig } from '../src/config/profile-schema';
import { createRootConfig, saveRootConfig } from '../src/config/profile-store';
import { startUiServer } from '../src/ui/server';
const root = await mkdtemp(join(tmpdir(), 'workbench-ui-check-'));
const cfg = createDefaultProfileConfig({ agentKind: 'codex', codex: { binaryPath: 'codex', inheritCodexHome: true }, accounts: { app: { id: 'fixture', secret: 'fixture', tenant: 'feishu' } } });
cfg.workbench = { revision: 0, protectDocuments: true, groups: {
  oc_alpha: { enabled: false, name: '研发群（界面测试）', workspace: root, persona: '', documents: [], skills: [] },
  oc_beta: { enabled: false, name: '运营群（界面测试）', workspace: root, persona: '', documents: [], skills: [] },
} };
await mkdir(join(root, '.agents/skills/test-skill'), { recursive: true });
await writeFile(join(root, '.agents/skills/test-skill/SKILL.md'), '---\nname: 界面验证技能\ndescription: 只用于检查勾选与按群保存，不运行工具。\n---\n无需执行。');
await mkdir(join(root, 'profiles/界面测试'), { recursive: true });
await saveRootConfig(createRootConfig('界面测试', cfg), join(root, 'config.json'));
const sup = { isOnline: () => false, controlsFor: () => undefined, channelFor: () => undefined, list: () => [], startProfile: async () => { throw new Error('测试配置禁止连接飞书'); }, stopProfile: async () => {}, restartProfile: async () => {} };
const server = await startUiServer({ rootDir: root, supervisor: sup, version: 'UI-check' });
console.log(server.url);console.log('fixture root:', root);
