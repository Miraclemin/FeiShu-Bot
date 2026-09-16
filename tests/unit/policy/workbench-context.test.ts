import { expect, it } from 'vitest';
import { workbenchPrompt } from '../../../src/bot/workbench-context';
it('uses desktop resources for read tasks without requiring legacy project fields', () => {
 const result=workbenchPrompt({enabled:true,name:'team',workspace:'',persona:'简洁回复',documents:[],resources:['https://example.feishu.cn/base/abc?table=tbl1']},'查看未修复 Bug');
 expect(result).toContain('https://example.feishu.cn/base/abc?table=tbl1');
 expect(result).toContain('只读资料查询不要求源码目录');
 expect(result).toContain('不要要求用户重复绑定');
 expect(result).toContain('简洁回复\n查看未修复 Bug');
});
it('leaves non-workbench prompts unchanged',()=>expect(workbenchPrompt(undefined,'hello')).toBe('hello'));
