import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { LarkChannel } from '@larksuite/channel';
import type { VcRequestClient } from '../meeting/api';
import { mutateTasks, readTasks, taskStatus, watchTasks, type TeamTask } from './task-store';

const queues = new Map<string, Promise<unknown>>();
export function documentSnapshot(t: TeamTask): string {
  return `${taskStatus(t)}\n\n任务发起人：${t.requester}\n创建时间：${t.createdAt}\n更新时间：${t.updatedAt}\n\n分工与执行结果\n${t.steps.map(s=>`${s.id} · ${s.name}\n要求：${s.instruction}\n结果：${s.result || '等待执行者回执'}${s.resumes ? `\n续接：${s.resumes}` : ''}`).join('\n\n')}\n\n人的反馈\n${(t.updates??[]).map(u=>`${u.sender}：${u.text}`).join('\n') || '暂无'}\n\n过程时间线\n${(t.history??[]).map(h=>`${h.at}\n${h.text}`).join('\n\n')}\n\n说明：本地文件路径仅在执行机器可访问；此文档记录派单、回执与反馈，不代表完整工具日志。`;
}
/** Serialized per ledger. A lost create response never causes a second document. */
export async function syncTaskDocument(file: string, id: string, client: VcRequestClient): Promise<string> {
  const run = (queues.get(file) ?? Promise.resolve()).catch(()=>{}).then(async()=>{
    const ledger=await readTasks(file); const task=ledger.tasks.find(t=>t.id===id);
    if(!task || !ledger.context) throw new Error('任务或群信息缺失');
    const save=async(change:(t:TeamTask)=>void)=>mutateTasks(file,l=>change(l.tasks.find(t=>t.id===id)!));
    try {
      let doc=task.document;
      if(!doc?.token) {
        if(doc?.creating) throw new Error('文档创建结果待核对，请勿重复创建');
        await save(t=>{t.document={creating:true};});
        const r=await client.request<{code?:number;data?:{document?:{document_id?:string}}}>({method:'POST',url:'/open-apis/docx/v1/documents',data:{title:`${id} · ${task.goal.slice(0,70)}`}});
        if(r.code) {await save(t=>{t.document={error:`创建失败 ${r.code}`};});throw new Error(`文档创建失败 ${r.code}`);}
        const token=r.data?.document?.document_id;
        if(!token) throw new Error('文档创建未返回 ID，需要核对');
        doc={token,url:`https://feishu.cn/docx/${token}`};
        await save(t=>{t.document=doc;});
      }
      const token=doc.token!;
      if(!doc.shared) {
        for(const [member_type,member_id,perm] of [['openid',task.requester,'edit'],['openchat',ledger.context.chatId,'view']]) {
          const r=await client.request<{code?:number}>({method:'POST',url:`/open-apis/drive/v1/permissions/${token}/members`,params:{type:'docx',need_notification:false},data:{member_type,member_id,perm}});
          if(r.code) throw new Error(`文档分享失败 ${r.code}`);
        }
        await save(t=>{t.document!.shared=true;});
      }
      const latest=(await readTasks(file)).tasks.find(t=>t.id===id)!;
      const content=documentSnapshot({...latest,document:undefined});
      const hash=createHash('sha256').update(content).digest('hex');
      if(latest.document?.hash!==hash) {
        // A marker makes retry safe after an append succeeds but its response is lost.
        const marker=`记录版本 ${hash}`;
        const existing=await client.request<{code?:number;data?:{content?:string}}>({method:'GET',url:`/open-apis/docx/v1/documents/${token}/raw_content`});
        if(existing.code) throw new Error(`文档回读失败 ${existing.code}`);
        if(!existing.data?.content?.includes(`${marker} 分段 0`)) {
          const text=content;
          const children=[];
          for(let i=0;i<text.length;i+=1500) children.push({block_type:2,text:{elements:[{text_run:{content:text.slice(i,i+1500)}}]}});
          // Each revision is prepended: latest progress first, older records retained.
          for(let end=children.length;end>0;end-=40) {
            const start=Math.max(0,end-40), partMarker=`${marker} 分段 ${start}`;
            if(existing.data?.content?.includes(partMarker)) continue;
            const part=children.slice(start,end);
            part.unshift({block_type:2,text:{elements:[{text_run:{content:partMarker}}]}});
            const r=await client.request<{code?:number}>({method:'POST',url:`/open-apis/docx/v1/documents/${token}/blocks/${token}/children`,data:{children:part,index:0}});
            if(r.code) throw new Error(`文档同步失败 ${r.code}`);
          }
        }
        await save(t=>{t.document!.hash=hash;t.document!.error=undefined;});
      }
      return doc.url!;
    } catch(e) {
      await save(t=>{
        t.document ??={};
        const status=(e as {response?:{status?:number}}).response?.status;
        if(!t.document.token && status && status>=400 && status<500 && status!==408) t.document.creating=false;
        t.document.error=(e as Error).message;
      });
      throw e;
    }
  });
  queues.set(file,run);try{return await run;}finally{if(queues.get(file)===run)queues.delete(file);}
}

export async function startTaskDocuments(root:string,profile:string,channel:LarkChannel,enabled:(chat:string)=>boolean):Promise<()=>void> {
  let stopped=false; const seen=new Map<string,string>();
  const update=(file:string,ledger:Awaited<ReturnType<typeof readTasks>>)=>{
    if(stopped || dirname(file)!==join(root,'team-tasks') || ledger.context?.profile!==profile || !enabled(ledger.context.chatId))return;
    for(const task of ledger.tasks) {
      if(!task.document?.token)continue; // Creation is synchronous before the first run.
      const key=file+task.id, fingerprint=documentSnapshot({...task,document:undefined});
      if(seen.get(key)===fingerprint)continue;seen.set(key,fingerprint);
      void syncTaskDocument(file,task.id,channel.rawClient as unknown as VcRequestClient).catch(()=>{});
    }
  };
  const unwatch=watchTasks(update);
  try{for(const name of await readdir(join(root,'team-tasks'))){if(/^[a-f0-9]{64}\.json$/.test(name)){const file=join(root,'team-tasks',name);update(file,await readTasks(file));}}}catch{}
  return ()=>{stopped=true;unwatch();};
}
