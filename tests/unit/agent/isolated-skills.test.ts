import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copySkillTree } from '../../../src/agent/isolated-skills';
describe('isolated skill snapshots', () => {
  it('excludes native discovery directories and secrets', () => {
    const p = mkdtempSync(join(tmpdir(), 'skill-test-'));
    try { const src = join(p, 'src'); mkdirSync(src); mkdirSync(join(src, '.agents')); writeFileSync(join(src, '.env'), 'secret'); writeFileSync(join(src, 'file.txt'), 'ok');
      copySkillTree(src, join(p, 'out'), true);
      expect(existsSync(join(p, 'out/file.txt'))).toBe(true);
      expect(existsSync(join(p, 'out/.env'))).toBe(false);
      expect(existsSync(join(p, 'out/.agents'))).toBe(false);
    } finally { rmSync(p, { recursive: true, force: true }); }
  });
  it('rejects symlink escapes including selected skill references', () => {
    const p = mkdtempSync(join(tmpdir(), 'skill-test-'));
    try { mkdirSync(join(p, 'src')); writeFileSync(join(p, 'secret'), 'secret'); symlinkSync(join(p, 'secret'), join(p, 'src/ref'));
      expect(() => copySkillTree(join(p, 'src'), join(p, 'out'))).toThrow();
    } finally { rmSync(p, { recursive: true, force: true }); }
  });
  it('rejects extra skill files hidden in the workspace', () => {
    const p = mkdtempSync(join(tmpdir(), 'skill-test-'));
    try { mkdirSync(join(p, 'src')); writeFileSync(join(p, 'src/SKILL.md'), 'unselected');
      expect(() => copySkillTree(join(p, 'src'), join(p, 'out'), true)).toThrow();
    } finally { rmSync(p, { recursive: true, force: true }); }
  });
});
