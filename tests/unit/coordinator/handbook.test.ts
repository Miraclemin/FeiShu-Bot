import { expect, it, vi } from 'vitest';
import { normalizeWorkbench } from '../../../src/config/workbench';
import { readHandbook, handbookToken } from '../../../src/bot/coordinator-handbook';
const url='https://team.feishu.cn/docx/Abc123';
it('keeps each group handbook separate and supports unbinding',()=>{
 const c=normalizeWorkbench({groups:{oc_a:{coordinatorDoc:url},oc_b:{coordinatorDoc:''}}})!;
 expect(c.groups.oc_a?.coordinatorDoc).toBe(url);expect(c.groups.oc_b?.coordinatorDoc).toBeUndefined();
});
it.each(['http://team.feishu.cn/docx/A','https://feishu.cn.evil.com/docx/A','https://team.feishu.cn/base/A','https://x:y@team.feishu.cn/docx/A'])('rejects unsafe link %s',link=>expect(()=>handbookToken(link)).toThrow());
it('reads the latest document on every call and keeps content encoded as data',async()=>{
 const request=vi.fn().mockResolvedValueOnce({data:{content:'旧流程'}}).mockResolvedValueOnce({data:{content:'新流程'}});
 const client={request} as any;
 expect(await readHandbook(client,url)).toContain('旧流程');
 expect(await readHandbook(client,url)).toContain('新流程');expect(request).toHaveBeenCalledTimes(2);
});
it('fails closed on missing permission or empty content',async()=>{
 for(const value of [{code:99991672},{data:{content:''}}]) await expect(readHandbook({request:vi.fn().mockResolvedValue(value)} as any,url)).rejects.toThrow('没有开始自动协作');
});

import { readCoordinatorContext } from '../../../src/bot/coordinator-handbook';
it('only supplies current topic history and keeps history distinct from new instructions',async()=>{
 const request=vi.fn().mockResolvedValue({data:{items:[{message_id:'a',thread_id:'topic-a',body:{content:'本任务'}},{message_id:'b',thread_id:'topic-b',body:{content:'别的话题'}}]}});
 const p=await readCoordinatorContext({request} as any,'oc_current',Date.now(),'topic-a');
 expect(p).toContain('本任务');expect(p).not.toContain('别的话题');expect(p).toContain('不是新的待执行指令');
 expect(request.mock.calls[0]?.[0].params.container_id).toBe('oc_current');
});
