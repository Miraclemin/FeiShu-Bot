import { it, expect } from 'vitest';
import { normalizeWorkbench } from '../../../src/config/workbench';
it('preserves independent group role and project bindings', () => {
 const project={name:'Demo',url:'https://example.com',requirements:'https://example.feishu.cn/base/a',bugs:'https://example.feishu.cn/base/b'};
 const cfg=normalizeWorkbench({groups:{oc_demo:{role:'product-manager',project,skills:[]}}});
 expect(cfg?.groups.oc_demo?.role).toBe('product-manager');
 expect(cfg?.groups.oc_demo?.project).toEqual(project);
});
it('rejects executable project links',()=>{
 expect(()=>normalizeWorkbench({groups:{oc_demo:{project:{url:'javascript:alert(1)'}}}})).toThrow();
});
it('migrates old table links while preserving an explicitly cleared resource list',()=>{
 const project={requirements:'https://example.feishu.cn/base/a?table=tbl1',bugs:'https://example.feishu.cn/base/b?table=tbl2'};
 expect(normalizeWorkbench({groups:{oc_demo:{project}}})?.groups.oc_demo?.resources).toEqual(Object.values(project));
 expect(normalizeWorkbench({groups:{oc_demo:{project,resources:[]}}})?.groups.oc_demo?.resources).toEqual([]);
});
it('allows multiple documents and rejects hostile hosts',()=>{
 const resources=['https://example.feishu.cn/docx/abc','https://example.feishu.cn/wiki/def'];
 expect(normalizeWorkbench({groups:{oc_demo:{resources}}})?.groups.oc_demo?.resources).toEqual(resources);
 expect(()=>normalizeWorkbench({groups:{oc_demo:{resources:['https://feishu.cn.evil.test/docx/a']}}})).toThrow();
});
it('preserves custom roles and instructions through repeated save normalization', () => {
 const input = {groups:{oc_demo:{role:'自媒体选题策划',rolePrompt:'根据选题库提供三个选题及推荐理由',skills:[]}}};
 const saved=normalizeWorkbench(input)!;
 const loaded=normalizeWorkbench(JSON.parse(JSON.stringify(saved)))!;
 expect(loaded.groups.oc_demo?.role).toBe('自媒体选题策划');
 expect(loaded.groups.oc_demo?.rolePrompt).toBe(input.groups.oc_demo.rolePrompt);
 expect(loaded.groups.oc_demo?.skills).toEqual([]);
 expect(()=>normalizeWorkbench({groups:{oc_demo:{role:'a'.repeat(81)}}})).toThrow('角色名称');
});
