import { afterEach, describe, expect, it } from 'vitest';
import { realpathSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverSkills, bundledSkillId, selectedSkills, skillPrompt, codexSkillRuntime } from '../../../src/agent/workbench-skills';
import { normalizeWorkbench } from '../../../src/config/workbench';
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixtures() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'group-skills-test-'))); roots.push(root);
  for (const name of ['alpha', 'beta']) { mkdirSync(join(root, name)); writeFileSync(join(root, name, 'SKILL.md'), `---\nname: ${name}\ndescription: fixture ${name}\n---\nDo ${name}`); }
  return { root, all: discoverSkills(undefined, [root]).filter(s => s.path.startsWith(root)) };
}
describe('group skill policy', () => {
  it('uses installation-independent IDs for bundled skills and accepts current legacy bindings', () => {
    const all = discoverSkills();
    const skill = all.find(s => s.path.endsWith('/resources/skills/lark-base/SKILL.md'))!;
    expect(skill).toBeDefined();
    expect(skill.id).toBe(bundledSkillId('lark-base'));
    expect(selectedSkills({ids:[skill.legacyId!]},all)[0]).toBe(skill);
  });
  it('has separate catalogs for separate groups and defaults to none', () => {
    const { all } = fixtures();
    const a = skillPrompt(selectedSkills({ ids: [all[0]!.id] }, all));
    const b = skillPrompt(selectedSkills({ ids: [all[1]!.id] }, all));
    expect(a).toContain('alpha'); expect(a).not.toContain('beta');
    expect(b).toContain('beta'); expect(b).not.toContain('alpha');
    expect(skillPrompt(selectedSkills({ ids: [] }, all))).toContain('未启用');
  });
  it('rejects removed skills and arbitrary file paths', () => {
    expect(() => selectedSkills({ ids: ['missing'] }, [])).toThrow('移动或删除');
    expect(() => normalizeWorkbench({ groups: { oc_a: { skills: ['/etc/passwd'] } } })).toThrow('技能选择无效');
  });
  it('writes isolated Codex configuration without changing the native account config', () => {
    const { root, all } = fixtures();
    writeFileSync(join(root, 'config.toml'), 'model="test-model"\n');
    const run = codexSkillRuntime(all, root, false);
    try {
      const cfg = readFileSync(join(run.env.CODEX_HOME!, 'config.toml'), 'utf8');
      expect(cfg).toContain('enabled = false'); expect(cfg).toContain('test-model');
      expect(readFileSync(join(root, 'config.toml'), 'utf8')).toBe('model="test-model"\n');
    } finally { run.cleanup(); }
  });
});
