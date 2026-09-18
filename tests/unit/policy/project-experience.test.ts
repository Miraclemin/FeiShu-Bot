import { expect, it } from 'vitest';
import { normalizeWorkbench } from '../../../src/config/workbench';
import { workbenchPrompt } from '../../../src/bot/workbench-context';
const doc = 'https://team.feishu.cn/docx/Example123';
it('persists experience per group and does not leak it to another group', () => {
  const saved = normalizeWorkbench({groups:{oc_a:{role:'coordinator',experienceDoc:doc},oc_b:{}}})!;
  const loaded = normalizeWorkbench(JSON.parse(JSON.stringify(saved)))!;
  expect(loaded.groups.oc_a!.experienceDoc).toBe(doc);
  expect(workbenchPrompt(loaded.groups.oc_a,'工作')).toContain('确认后再次读取文档查重');
  expect(workbenchPrompt(loaded.groups.oc_b,'工作')).not.toContain(doc);
});
it.each(['http://team.feishu.cn/docx/A','https://feishu.cn.evil.test/docx/A','https://team.feishu.cn/base/A','https://user:pass@team.feishu.cn/docx/A'])(
  'rejects invalid experience links: %s', experienceDoc => {
    expect(()=>normalizeWorkbench({groups:{oc_a:{experienceDoc}}})).toThrow();
  });
it('allows clearing the binding and retains legacy groups without new requirements',()=>{
  expect(normalizeWorkbench({groups:{oc_a:{experienceDoc:''}}})!.groups.oc_a!.experienceDoc).toBeUndefined();
  expect(workbenchPrompt(undefined,'hello')).toBe('hello');
});

it('workers ignore legacy handbook and experience bindings and return suggestions instead',()=>{
  const saved=normalizeWorkbench({groups:{oc_a:{role:'developer',experienceDoc:doc,coordinatorDoc:doc}}})!;
  const prompt=workbenchPrompt(saved.groups.oc_a,'修复问题');
  expect(prompt).not.toContain(doc);
  expect(prompt).not.toContain('确认后再次读取文档查重');
  expect(prompt).toContain('不直接写入项目经验文档');
  expect(prompt).toContain('人直接交办的任务也可执行');
});
