import { createHash, randomUUID } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { writeFileAtomic } from '../platform/atomic-write';
export interface Review { id:string; title:string; owner:string; state:'pending'|'approved'|'rejected'; createdAt:string; decidedAt?:string }
export function reviewPath(root:string, profile:string, scope:string):string {
 return join(root,'reviews',createHash('sha256').update(JSON.stringify([profile,scope])).digest('hex')+'.json');
}
export async function readReview(path:string):Promise<Review|undefined> {
 try { return JSON.parse(await readFile(path,'utf8')) as Review; }
 catch(e) { if((e as NodeJS.ErrnoException).code==='ENOENT') return; throw e; }
}
const queues=new Map<string,Promise<unknown>>();
export async function updateReview(path:string, action:(previous:Review|undefined)=>Review):Promise<Review> {
 const before=queues.get(path)??Promise.resolve();
 const next=before.catch(()=>{}).then(async()=>{
  const record=action(await readReview(path));
  await mkdir(dirname(path),{recursive:true});
  await writeFileAtomic(path,JSON.stringify(record,null,2),{mode:0o600}); return record;
 });
 queues.set(path,next);
 try{return await next;}finally{if(queues.get(path)===next)queues.delete(path);}
}
export function newReview(previous:Review|undefined,title:string,owner:string):Review {
 if(previous?.state==='pending')throw new Error('已有待确认事项，请先处理，避免覆盖。');
 if(!title.trim()||title.length>2000)throw new Error('请写明本次要确认的具体事项，最多 2000 字。');
 return {id:randomUUID().slice(0,8),title,owner,state:'pending',createdAt:new Date().toISOString()};
}
export function decideReview(previous:Review|undefined,id:string,actor:string,decision:'approved'|'rejected'):Review {
 if(!previous||previous.id!==id)throw new Error('确认编号不匹配，请查看当前状态。');
 if(previous.owner!==actor)throw new Error('只有这次指定的负责人可以确认。');
 if(previous.state!=='pending')throw new Error('该事项已经处理，不能重复确认。');
 return {...previous,state:decision,decidedAt:new Date().toISOString()};
}
