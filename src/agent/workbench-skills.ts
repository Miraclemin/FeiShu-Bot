import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, realpathSync, statSync, mkdtempSync, writeFileSync, rmSync, mkdirSync, copyFileSync, chmodSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { parse as parseYaml, stringify as yaml } from 'yaml';
import JSON5 from 'json5';
import { parse as tomlParse, stringify as tomlStringify } from 'smol-toml';
export interface WorkbenchSkill { legacyId?: string; id: string; name: string; description: string; path: string; }
export interface SkillSelection { ids: string[]; }
/** Read metadata only; never execute skill scripts while discovering. */
export function discoverSkills(cwd?: string, extraRoots: string[] = []): WorkbenchSkill[] {
  const home = homedir();
  const bundledRoots = [resolve(dirname(fileURLToPath(import.meta.url)), '../resources/skills'), resolve(dirname(fileURLToPath(import.meta.url)), '../../resources/skills')].filter(existsSync).map(p => realpathSync(p));
  const roots = [join(home, '.feishu-collaborator/team-skills/installed'), resolve(dirname(fileURLToPath(import.meta.url)), '../resources/skills'), resolve(dirname(fileURLToPath(import.meta.url)), '../../resources/skills'),join(home, '.agents/skills'), join(process.env.CODEX_HOME || join(home, '.codex'), 'skills'),
    join(home, '.claude/skills'), join(home, '.hermes/skills'), join(home, '.openclaw/skills'),
    join(home, '.codex/plugins/cache'), join(home, '.claude/plugins/cache'), '/etc/codex/skills', ...extraRoots];
  if (cwd) { let dir = resolve(cwd); while (true) { roots.push(join(dir, '.agents/skills'), join(dir, '.claude/skills'), join(dir, 'skills')); const parent = dirname(dir); if (parent === dir) break; dir = parent; } }
  const seen = new Set<string>(), result: WorkbenchSkill[] = [];
  let visits = 0;
  function scan(path: string, depth: number) {
    if (!existsSync(path)) return;
    const real = realpathSync(path);
    if (seen.has(real)) return;
    if (++visits > 25000) throw new Error('技能目录过大，请缩小技能目录后重试');
    seen.add(real);
    if (!statSync(real).isDirectory()) return;
    const file = join(real, 'SKILL.md');
    if (existsSync(file)) {
      if (statSync(file).size > 1024 * 1024) throw new Error('SKILL.md 超过 1 MiB');
      const text = readFileSync(file, 'utf8');
      let meta: Record<string, unknown> = {};
      try { const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text); if (m) meta = parseYaml(m[1]!) || {}; } catch { /* malformed metadata is displayed using folder name */ }
      let version = '';
      const installRecord = join(dirname(real), 'installation.json');
      if (real.startsWith(join(home, '.feishu-collaborator/team-skills/installed') + '/') && existsSync(installRecord)) {
        try { version = ' · ' + String(JSON.parse(readFileSync(installRecord, 'utf8')).commit).slice(0, 12); } catch { /* retain the skill metadata */ }
      }
      const legacyId = createHash('sha256').update(file).digest('hex').slice(0, 24);
      const bundledRoot = bundledRoots.find(root => dirname(real) === root);
      result.push({ legacyId, id: bundledRoot ? bundledSkillId(basename(real)) : legacyId, name: String(meta.name || basename(real)) + version, description: String(meta.description || '').slice(0, 500), path: file });
      return;
    }
    if (depth >= 12) throw new Error('技能目录层级过深，无法完整检查');
    for (const ent of readdirSync(real, { withFileTypes: true })) {
      if (['node_modules', '.git', '.venv', '__pycache__'].includes(ent.name)) continue;
      if (ent.isDirectory() || ent.isSymbolicLink()) scan(join(real, ent.name), depth + 1);
    }
  }
  for (const root of roots) scan(root, 0);
  return result.sort((a, b) => a.name.localeCompare(b.name));
}
export function bundledSkillId(name: string): string {
  return createHash('sha256').update(`feishu-collaborator:bundled-skill:${name}`).digest('hex').slice(0, 24);
}
export function selectedSkills(selection: SkillSelection, all: WorkbenchSkill[]) {
  const byId = new Map(all.flatMap(s => [[s.id, s] as const, ...(s.legacyId ? [[s.legacyId, s] as const] : [])]));
  return selection.ids.map(id => { const skill = byId.get(id); if (!skill) throw new Error('本群选中的技能已移动或删除，请在工作台重新选择'); return skill; });
}
export function skillPrompt(skills: WorkbenchSkill[]): string {
  return '\n<group_skills>\n本次任务只加载以下群技能；没有列出的技能不要自动加载。技能不授予额外工具或文件权限。需要时先读取对应 SKILL.md，再按其相对路径读取附件。\n' +
    (skills.length ? skills.map(s => JSON.stringify({ name: s.name, description: s.description, path: s.path })).join('\n') : '本群未启用任何技能。') + '\n</group_skills>\n';
}
/** Native discovery is disabled; the bridge supplies only the selected catalog. This is not an OS sandbox. */
export function codexSkillArgs(all: WorkbenchSkill[]): string[] {
  return ['-c', `skills.config=[${all.map(s => `{path=${JSON.stringify(s.path)},enabled=false}`).join(',')}]`, '-c', 'features.plugins=false'];
}
export interface ExternalSkillRuntime { env: NodeJS.ProcessEnv; cleanup(): void; }
/** Per-run configs, never edits an installed agent's settings. */
export function externalSkillRuntime(kind: 'hermes' | 'openclaw', cwd: string): ExternalSkillRuntime {
  const dir = mkdtempSync(join(tmpdir(), 'lark-group-skills-'));
  chmodSync(dir, 0o700);
  const cleanup = () => rmSync(dir, { recursive: true, force: true });
  try {
    if (kind === 'hermes') {
      const source = process.env.HERMES_HOME || join(homedir(), '.hermes');
      const cfg = existsSync(join(source, 'config.yaml')) ? parseYaml(readFileSync(join(source, 'config.yaml'), 'utf8')) : {};
      cfg.skills = { ...cfg.skills, external_dirs: [], disabled: [], creation_enabled: false };
      cfg.memory = { ...cfg.memory, memory_enabled: false, user_profile_enabled: false };
      cfg.mcp_servers = {};
      writeFileSync(join(dir, 'config.yaml'), yaml(cfg), { mode: 0o600 });
      writeFileSync(join(dir, '.no-bundled-skills'), '', { mode: 0o600 });
      mkdirSync(join(dir, 'skills'));
      // Preserve native provider authentication; temporary copies stay private and are removed at exit.
      for (const file of ['auth.json', '.env']) if (existsSync(join(source, file))) { copyFileSync(join(source, file), join(dir, file)); chmodSync(join(dir, file), 0o600); }
      return { env: { HERMES_HOME: dir, HERMES_PROFILE: '', HERMES_SKIP_BUNDLED_SKILLS: '1' }, cleanup };
    }
    const source = process.env.OPENCLAW_CONFIG_PATH || join(process.env.OPENCLAW_STATE_DIR || join(homedir(), '.openclaw'), 'openclaw.json');
    const cfg = existsSync(source) ? JSON5.parse(readFileSync(source, 'utf8')) : {};
    cfg.agents ??= {};
    // Both released schema generations: list (June) and entries (newer).
    if (cfg.agents.entries) for (const entry of Object.values(cfg.agents.entries) as Record<string, unknown>[]) { entry.skills = []; entry.workspace = cwd; }
    else {
      cfg.agents.list = (cfg.agents.list?.length ? cfg.agents.list : [{ id: 'main', default: true }]).map((entry: Record<string, unknown>) => ({ ...entry, skills: [], workspace: cwd }));
    }
    cfg.skills = { ...cfg.skills, load: { ...cfg.skills?.load, extraDirs: [] } };
    const path = join(dir, 'openclaw.json');
    writeFileSync(path, JSON.stringify(cfg), { mode: 0o600 });
    return { env: { OPENCLAW_CONFIG_PATH: path }, cleanup };
  } catch (e) { cleanup(); throw e; }
}

export function codexSkillRuntime(all: WorkbenchSkill[], source: string, ignoreConfig: boolean): ExternalSkillRuntime {
  const dir = mkdtempSync(join(tmpdir(), 'lark-codex-skills-'));
  chmodSync(dir, 0o700);
  const cleanup = () => rmSync(dir, { recursive: true, force: true });
  try {
    const cfg: Record<string, any> = !ignoreConfig && existsSync(join(source, 'config.toml')) ? tomlParse(readFileSync(join(source, 'config.toml'), 'utf8')) : {};
    cfg.skills = { config: all.flatMap(s => [{ path: s.path, enabled: false }, ...(s.path.includes('/skills/.system/') ? [{ path: join(dir, 'skills', '.system', s.path.split('/skills/.system/')[1]!), enabled: false }] : [])]) };
    cfg.features = { ...cfg.features, plugins: false, apps: false };
    cfg.mcp_servers = {};
    delete cfg.plugins;
    writeFileSync(join(dir, 'config.toml'), tomlStringify(cfg), { mode: 0o600 });
    if (existsSync(join(source, 'auth.json'))) { copyFileSync(join(source, 'auth.json'), join(dir, 'auth.json')); chmodSync(join(dir, 'auth.json'), 0o600); }
    return { env: { CODEX_HOME: dir }, cleanup };
  } catch (e) { cleanup(); throw e; }
}
