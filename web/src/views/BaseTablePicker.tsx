import { useState } from 'react';
import { apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
interface Table {id:string;name:string;url:string}
export function BaseTablePicker({profile,appId,tenant,onAdd}:{profile:string;appId?:string;tenant?:string;onAdd:(urls:string[])=>void}) {
 const [link,setLink]=useState(''),[query,setQuery]=useState(''),[error,setError]=useState('');
 const [tables,setTables]=useState<Table[]>([]),[selected,setSelected]=useState<string[]>([]);
 const [busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[offset,setOffset]=useState(0),[more,setMore]=useState(false);
 async function load(next=false) {
  setBusy(true);setError('');
  try {const r=await apiPost<{tables:Table[];hasMore:boolean;nextOffset:number}>(`/api/workbench/base-tables?profile=${encodeURIComponent(profile)}`,{link,offset:next?offset:0});
   setTables(old=>next?[...new Map([...old,...r.tables].map(t=>[t.id,t])).values()]:r.tables);setMore(r.hasMore);setOffset(r.nextOffset);setLoaded(true);
   if(!next)setSelected([]);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 const visible=tables.filter(t=>t.name.toLowerCase().includes(query.toLowerCase()));
 return <div className="rounded-md border p-3 space-y-3">
  <p className="font-medium text-sm">从整个多维表格库选择</p>
  <p className="text-xs text-muted-foreground">粘贴库里任意一张表的链接，即可读取这个库的表清单。不会自动获得授权。</p>
  <Input aria-label="多维表格库链接" disabled={busy} value={link} placeholder="https://你的企业.feishu.cn/base/…" onChange={e=>{setLink(e.target.value);setTables([]);setSelected([]);setLoaded(false);setMore(false);setError('');}} />
  <Button variant="outline" disabled={busy||!link.trim()} onClick={()=>load()}>{busy?'正在读取…':'读取库中的数据表'}</Button>
  {error && <div role="alert" className="space-y-2"><p className="text-sm text-destructive">{error}</p>{appId && /^cli_[a-zA-Z0-9]+$/.test(appId) && <a className="text-sm underline" target="_blank" rel="noreferrer" href={`https://${tenant==='lark'?'open.larksuite.com':'open.feishu.cn'}/app/${appId}/auth`}>打开当前机器人的权限管理</a>}<p className="text-xs text-muted-foreground">列出库中表需要 base:table:read；逐表读取还需要相应记录读取权限及资料授权。</p></div>}
  {loaded && <><Input aria-label="搜索库中数据表" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索表名" />
   <div className="flex gap-2"><Button size="sm" variant="outline" onClick={()=>setSelected(tables.map(t=>t.id))}>{more?'全选已加载的表':'全选'}</Button><Button size="sm" variant="ghost" onClick={()=>setSelected([])}>清空选择</Button></div>
   <div className="max-h-64 overflow-auto">{visible.map(t=><label key={t.id} className="flex gap-2 p-2 text-sm"><input type="checkbox" checked={selected.includes(t.id)} onChange={e=>setSelected(old=>e.target.checked?[...old,t.id]:old.filter(id=>id!==t.id))} />{t.name}</label>)}</div>
   {!tables.length && <p className="text-sm">没有返回可见的数据表；请检查机器人对整个库的授权和高级权限。</p>}
   {more && <Button disabled={busy} variant="outline" onClick={()=>load(true)}>加载更多数据表</Button>}
   <Button disabled={busy||!selected.length} onClick={()=>{onAdd(tables.filter(t=>selected.includes(t.id)).map(t=>t.url));setSelected([]);}}>添加选中的 {selected.length} 张表</Button>
   <p className="text-xs text-muted-foreground">添加的是当前选中的表，之后新建的表不会自动加入。添加后仍需保存并应用。</p>
  </>}
 </div>;
}
