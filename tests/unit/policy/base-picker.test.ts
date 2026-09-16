import {it,expect} from 'vitest';
import {baseTarget,parseTablePage} from '../../../src/ui/base-picker';
it('accepts base links and links to individual tables',()=>{
 expect(baseTarget('https://example.feishu.cn/base/abc?table=tbl1&view=vew1')).toEqual({token:'abc',baseUrl:'https://example.feishu.cn/base/abc'});
 expect(baseTarget('https://example.feishu.cn/base/abc').token).toBe('abc');
});
it.each(['https://feishu.cn.evil.test/base/abc','file:///base/abc','https://u:p@example.feishu.cn/base/abc','https://example.feishu.cn/wiki/abc'])('rejects unsafe or unsupported link %s',link=>expect(()=>baseTarget(link)).toThrow());
it('returns table names and canonical per-table links',()=>{
 expect(parseTablePage({ok:true,data:{items:[{table_id:'tbl1',name:'Test'}],has_more:false}},'https://example.feishu.cn/base/abc')).toEqual({tables:[{id:'tbl1',name:'Test',url:'https://example.feishu.cn/base/abc?table=tbl1'}],hasMore:false});
});
it('does not convert permission errors or invalid responses into empty success',()=>{
 expect(()=>parseTablePage({ok:false,error:{message:'denied'}},'')).toThrow('denied');
 expect(()=>parseTablePage({ok:true,data:{}},'')).toThrow();
});
it('shows pagination for a full page',()=>expect(parseTablePage({ok:true,data:Array.from({length:100},(_,i)=>({table_id:'tbl'+i,name:''}))},'https://example.feishu.cn/base/a').hasMore).toBe(true));
it('explains missing Feishu scopes instead of returning an internal error',()=>{
 expect(()=>parseTablePage({ok:false,error:{missing_scopes:['base:table:read']}},'')).toThrow('base:table:read');
});
