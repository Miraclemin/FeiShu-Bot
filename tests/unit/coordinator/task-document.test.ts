import {it,expect,vi} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createTask,mutateTasks,readTasks} from '../../../src/team/task-store';
import {syncTaskDocument} from '../../../src/team/task-document';
it('creates one shared document, syncs human feedback and cancellation, and gives a new task its own document',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'task-doc-'));const file=join(dir,'task.json');
 let count=0;const contents=new Map<string,string>();
 const request=vi.fn(async(p:any)=>{
  if(p.url==='/open-apis/docx/v1/documents'){const id='doc'+ ++count;contents.set(id,'');return {data:{document:{document_id:id}}};}
  const token=p.url.split('/')[5];
  if(p.url.endsWith('/raw_content'))return {data:{content:contents.get(token)??''}};
  if(p.url.endsWith('/children'))contents.set(token,p.data.children.map((b:any)=>b.text.elements[0].text_run.content).join('')+(contents.get(token)??''));
  return {code:0};
 });
 try{
  const t=await mutateTasks(file,l=>{l.context={profile:'org',chatId:'oc_group'};return createTask(l,'验收产品','ou_owner','om_origin');});
  const client={request} as any;
  expect(await syncTaskDocument(file,t.id,client)).toContain('doc1');
  await syncTaskDocument(file,t.id,client);expect(count).toBe(1);
  const writes=()=>request.mock.calls.filter(([p])=>p.url.endsWith('/children')).length;
  expect(writes()).toBe(1);
  await mutateTasks(file,l=>{l.tasks[0]!.updates=[{sender:'ou_owner',messageId:'m2',text:'手机通过'}];l.tasks[0]!.state='cancelled';});
  await syncTaskDocument(file,t.id,client);expect(writes()).toBe(2);
  expect(contents.get('doc1')).toContain('手机通过');expect(contents.get('doc1')).toContain('已取消');
  const next=await mutateTasks(file,l=>createTask(l,'新项目','ou_owner','m3'));
  await syncTaskDocument(file,next.id,client);expect(count).toBe(2);
  expect((await readTasks(file)).tasks[1]!.document?.url).toContain('doc1');
 }finally{await rm(dir,{recursive:true,force:true});}
});
it('does not duplicate a document after an uncertain creation response',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'task-doc-'));const file=join(dir,'task.json');
 try{
  const t=await mutateTasks(file,l=>{l.context={profile:'org',chatId:'oc_group'};return createTask(l,'目标','ou_owner','m');});
  const request=vi.fn().mockRejectedValue(new Error('network disconnected'));
  await expect(syncTaskDocument(file,t.id,{request})).rejects.toThrow('network');
  await expect(syncTaskDocument(file,t.id,{request})).rejects.toThrow('待核对');expect(request).toHaveBeenCalledTimes(1);
 }finally{await rm(dir,{recursive:true,force:true});}
});
