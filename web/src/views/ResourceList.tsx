import { useEffect, useState } from 'react';
import { FileText, Table2, ExternalLink, X } from 'lucide-react';
import { apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';

type Resource = { url: string; name: string; type: string; error?: string };
export function ResourceList({ profile, links, onChange }: { profile: string; links: string[]; onChange: (links: string[]) => void }) {
  const [items, setItems] = useState<Resource[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const key = JSON.stringify(links);
  useEffect(() => {
    let cancelled = false;
    setItems([]); setError('');
    if (!links.length) { setLoading(false); return; }
    setLoading(true);
    apiPost<{ items: Resource[] }>(`/api/workbench/resource-names?profile=${encodeURIComponent(profile)}`, { links })
      .then(r => { if (!cancelled) setItems(r.items); })
      .catch(() => { if (!cancelled) setError('名称暂时读取失败，资料链接仍保留'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [profile, key]);
  function add() {
    const added = draft.split(/\s+/).filter(Boolean);
    if (added.some(link => { try { const u = new URL(link); return u.protocol !== 'https:' || !/(^|\.)(feishu\.cn|larksuite\.com)$/.test(u.hostname); } catch { return true; } })) { setError('请填写有效的飞书资料链接'); return; }
    onChange([...new Set([...links, ...added])]); setDraft(''); setError('');
  }
  return <div className="space-y-3">
    <div className="flex items-center justify-between"><h4 className="text-sm font-medium">已添加的资料 <span className="text-muted-foreground">{links.length}</span></h4>{loading && <span className="text-xs text-muted-foreground">正在读取名称…</span>}</div>
    <div className="divide-y rounded-lg border">
      {!links.length && <p className="p-4 text-sm text-muted-foreground">还没有添加资料</p>}
      {links.map((url, i) => { const item = items.find(x => x.url === url); const Icon = item?.type.includes('表格') ? Table2 : FileText; let safe = false; try { const u = new URL(url); safe = u.protocol === 'https:' && /(^|\.)(feishu\.cn|larksuite\.com)$/.test(u.hostname); } catch {}
        return <div key={url} className="flex items-center gap-3 p-3">
          <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium" title={item?.name || url}>{item?.name || `资料 ${i + 1}`}</p><p className="text-xs text-muted-foreground">{item?.type || '资料'}{item?.error ? ` · ${item.error}` : ''}</p>{!item?.name && !loading && <p className="truncate text-xs text-muted-foreground" title={url}>{url}</p>}</div>
          {safe && <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary">打开<ExternalLink className="h-3 w-3" /></a>}
          <Button variant="ghost" size="sm" aria-label={`移除${item?.name || `资料 ${i + 1}`}`} onClick={() => onChange(links.filter(x => x !== url))}><X className="h-4 w-4" /></Button>
        </div>;
      })}
    </div>
    <details><summary className="cursor-pointer text-sm text-primary">通过链接添加资料</summary><div className="mt-2 space-y-2"><textarea aria-label="资料链接" className="min-h-20 w-full rounded-md border bg-background p-3 text-sm" placeholder="粘贴文档或表格链接，每行一个" value={draft} onChange={e => setDraft(e.target.value)} /><Button size="sm" variant="outline" disabled={!draft.trim()} onClick={add}>添加资料</Button></div></details>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>;
}
