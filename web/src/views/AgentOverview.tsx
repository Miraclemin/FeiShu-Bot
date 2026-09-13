import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';
import { Button } from '@/components/ui/button';
export function AgentOverview() {
  const [items, setItems] = useState<{ label: string; kind: string; installed: boolean }[]>([]);
  const [error, setError] = useState('');
  const load = () => apiGet<{ agents: typeof items }>('/api/agents').then(x => { setItems(x.agents); setError(''); }).catch(e => setError(e.message));
  useEffect(() => { void load(); }, []);
  return <section className="mb-8 rounded-xl border p-5 space-y-3">
    <div className="flex justify-between items-center"><h2 className="font-semibold">本机 Agent</h2><Button variant="ghost" size="sm" onClick={load}>重新检测</Button></div>
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{items.map(a => <div key={a.kind} className={`rounded-lg bg-accent/50 p-3 ${a.installed ? '' : 'opacity-40'}`}><div className="font-medium text-sm">{a.label}</div><div className="mt-1 text-xs text-muted-foreground">{a.installed ? '● 已安装' : '未安装'}</div></div>)}</div>
    <p className="text-xs text-muted-foreground">安装检测不代表已经登录。新建 Agent 后扫码连接飞书，再为群选择工作目录。</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
