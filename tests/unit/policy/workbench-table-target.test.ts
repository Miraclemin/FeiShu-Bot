import { it, expect } from 'vitest';
import { tableTarget } from '../../../src/ui/workbench-check';
it('parses a concrete Feishu table without requesting arbitrary URLs',()=>{
 expect(tableTarget('https://example.feishu.cn/base/abc123?table=tbl123')).toEqual({token:'abc123',table:'tbl123'});
});
it.each(['https://feishu.cn.evil.test/base/a?table=tbl1','https://user:pass@example.feishu.cn/base/a?table=tbl1','file:///etc/passwd','https://example.feishu.cn/wiki/a','https://example.feishu.cn/base/a'])('rejects invalid table link %s',link=>expect(()=>tableTarget(link)).toThrow());
