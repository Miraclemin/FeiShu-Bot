import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
type Task = { storageKey:string; threadId?:string; id:string; goal:string; state:string; updatedAt:string; note?:string; summary?:string; document?:{url?:string;error?:string}; steps:{id:string;name:string;state:string;result?:string}[] };
const labels:Record<string,string> = {planning:'整理分工',waiting:'等待回执',ready:'待汇总',blocked:'需要处理',completed:'已完成',cancelled:'已取消',sending:'正在派发',done:'已返回',uncertain:'发送待核对',question:'需要补充',rejected:'验收未通过',superseded:'已交后续任务继续'};
export function TeamTasks({profile,chatId}:{profile:string;chatId:string}) {
  const [tasks,setTasks]=useState<Task[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const url=`/api/workbench/tasks?profile=${encodeURIComponent(profile)}&chatId=${encodeURIComponent(chatId)}`;
  const refresh=async()=>{setBusy(true);try{setTasks((await apiGet<{tasks:Task[]}>(url)).tasks);setError('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  useEffect(()=>{void refresh();},[url]);
  const isActive=(t:Task)=>!['completed','cancelled'].includes(t.state);
  return <div className="space-y-3 border-t pt-3">
    <div className="flex items-center justify-between"><span className="text-sm font-medium">协作任务</span><Button size="sm" variant="ghost" disabled={busy} onClick={refresh}>刷新状态</Button></div>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    {!tasks.length&&<p className="text-xs text-muted-foreground">暂无任务。只有明确发起协作才登记；关闭模式会暂停协调，历史记录保留。</p>}
    {tasks.map(t=><details key={t.id} open={isActive(t)} className="rounded-lg border bg-background p-3">
      <summary className="cursor-pointer text-sm"><span className={t.state==='blocked'?'text-amber-700':'font-medium'}>{labels[t.state]??t.state}</span> · {t.id} · {t.goal.slice(0,70)}</summary>
      <div className="mt-3 space-y-2 text-sm"><p className="whitespace-pre-wrap">{t.goal}</p>{t.steps.map(s=><details key={s.id} className="border-t pt-2"><summary>{s.id} · {s.name} · {labels[s.state]??s.state}</summary><p className="whitespace-pre-wrap text-xs text-muted-foreground mt-2">{s.result||'尚未收到最终结果'}</p></details>)}
      {t.note&&<p className="whitespace-pre-wrap text-muted-foreground">{t.note}</p>}{t.summary&&<p className="whitespace-pre-wrap">{t.summary}</p>}
      {t.document?.url&&/^https:\/\/feishu\.cn\/docx\/[a-zA-Z0-9]+$/.test(t.document.url)&&<a className="text-primary underline" href={t.document.url} target="_blank" rel="noreferrer">打开任务文档</a>}
      {t.document?.error&&<p role="alert" className="text-sm text-destructive">文档同步待处理：{t.document.error}。修复后在群里 /team resume。</p>}
      <p className="text-xs text-muted-foreground">更新于 {new Date(t.updatedAt).toLocaleString()}</p>
      {isActive(t)&&<><p className="text-xs text-muted-foreground">继续：在群里 @组织者 /team resume。取消只停止协调，不会强停已派出的 Agent。</p><Button size="sm" variant="outline" disabled={busy} onClick={async()=>{setBusy(true);try{await apiPost(url,{action:'cancel',id:t.id,storageKey:t.storageKey});await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>取消此任务并保留记录</Button></>}
      </div>
    </details>)}
  </div>;
}
