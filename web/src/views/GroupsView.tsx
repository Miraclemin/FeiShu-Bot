import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AgentAvatar } from '@/components/AgentAvatar';
import { WorkbenchView } from './WorkbenchView';
import type { listWorkbenchGroups } from '../../../src/ui/groups';
type Group = Awaited<ReturnType<typeof listWorkbenchGroups>>['groups'][number];
const roles: Record<string,string> = {coordinator:'组织者', product:'产品', developer:'研发', inspector:'巡检', tester:'测试'};
export function GroupsView({ onOpenAgent, onDirtyChange }: { onOpenAgent: (profile:string)=>void; onDirtyChange: (dirty:boolean)=>void }) {
  const [groups,setGroups]=useState<Group[]>([]),[loaded,setLoaded]=useState(false),[error,setError]=useState(''),[query,setQuery]=useState('');
  const [selected,setSelected]=useState<string>(),[editing,setEditing]=useState<string>(),[dirty,setDirty]=useState(false);
  const load=useCallback(async()=>{try{const data=await apiGet<{groups:Group[]}>('/api/groups');setGroups(data.groups);setLoaded(true);setError('');}catch(e){setError((e as Error).message);}},[]);
  useEffect(()=>{void load();const t=setInterval(()=>void load(),5000);return()=>clearInterval(t);},[load]);
  const changed=useCallback((value:boolean)=>{setDirty(value);onDirtyChange(value);},[onDirtyChange]);
  const canLeave=()=>!dirty||window.confirm('设置尚未保存，放弃这些修改？');
  const back=()=>{if(!canLeave())return;if(editing)setEditing(undefined);else setSelected(undefined);changed(false);void load();};
  const group=groups.find(g=>g.id===selected), agent=group?.agents.find(a=>a.profile===editing);
  const filtered=groups.filter(g=>(g.name+' '+g.id+' '+g.agents.map(a=>a.name).join(' ')).toLowerCase().includes(query.toLowerCase()));
  return <section className="space-y-5">
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    {selected?<>
      <Button variant="ghost" onClick={back}>← {editing?'返回本群 Bot':'返回群组列表'}</Button>
      {!group?<p>这个群的绑定已移除，请返回列表。</p>:<>
        <header><h1 className="text-2xl font-semibold">{group.name}</h1><p className="mt-2 text-sm text-muted-foreground">{group.agents.length} 个关联 Bot · {group.agents.filter(a=>a.enabled).length} 个已启用</p><details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer">群信息</summary><p className="mt-2 break-all select-text">群 ID：{group.id}</p></details></header>
        {agent?<>
          <div className="flex items-center gap-3 rounded-xl border p-4"><AgentAvatar profile={agent.profile} avatarId={agent.avatarId}/><div><h2 className="font-semibold">{agent.name} · 本群设置</h2><p className="text-xs text-muted-foreground">工作目录、职责、资料和 Skill 按 Bot 分别配置；保存后在 Bot 视角同步显示。</p></div></div>
          <WorkbenchView key={agent.profile+group.id} profile={agent.profile} groupId={group.id} onDirtyChange={changed} onApplied={()=>{void load();}}/>
        </>:<div className="space-y-3">{group.agents.map(a=><article key={a.profile} className="rounded-xl border p-4 flex flex-wrap items-center gap-4"><AgentAvatar profile={a.profile} avatarId={a.avatarId}/><div className="flex-1 min-w-0"><h2 className="font-semibold">{a.name}</h2><p className="text-sm text-muted-foreground">{a.running?'在线':'未运行'} · 本群{a.enabled?'已启用':'已暂停'}{a.role?' · '+(roles[a.role]||a.role):''}</p><p className="text-xs text-muted-foreground truncate" title={a.workspace}>{a.workspace||'尚未设置工作目录'}</p></div><Button variant="outline" onClick={()=>onOpenAgent(a.profile)}>Bot 设置</Button><Button onClick={()=>setEditing(a.profile)}>本群设置</Button></article>)}</div>}
      </>}
    </>:<>
      <header><h1 className="text-2xl font-semibold">我的群组 <span className="text-muted-foreground text-lg">{groups.length}</span></h1><p className="mt-2 text-sm text-muted-foreground">按群查看本机已关联的 Bot。这里只统计软件中的群配置。</p></header>
      <Input aria-label="搜索群或 Bot" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索群名称或 Bot"/>
      {!loaded&&!error?<p>加载群组…</p>:!groups.length?<div className="rounded-xl border p-8 text-center text-muted-foreground">还没有配置群。先在 Bot 视角选择机器人并绑定群，之后会自动显示在这里。</div>:!filtered.length?<p className="text-muted-foreground">没有匹配的群组。</p>:filtered.map(g=><button key={g.id} className="w-full text-left rounded-xl border p-5 hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-primary" onClick={()=>setSelected(g.id)} aria-label={`打开群 ${g.name}`}><div className="flex items-center justify-between gap-4"><h2 className="font-semibold text-lg">{g.name}</h2><span className="text-sm text-muted-foreground shrink-0">{g.agents.length} 个 Bot · {g.agents.filter(a=>a.enabled).length} 个已启用 →</span></div><div className="mt-4 flex flex-wrap gap-4">{g.agents.map(a=><div key={a.profile} className="flex items-center gap-2"><AgentAvatar profile={a.profile} avatarId={a.avatarId} className="size-8"/><span className="text-sm">{a.name}</span><span className={`text-xs ${a.running?'text-green-600':'text-muted-foreground'}`}>{a.running?'在线':'未运行'}</span></div>)}</div></button>)}
    </>}
  </section>;
}
