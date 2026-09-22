import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function SkillPicker({ cwd, selected, onChange }: { cwd: string; selected: string[]; onChange: (ids: string[]) => void }) {
  const [skills, setSkills] = useState<{ id: string; name: string; description: string }[]>([]);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'selected' | 'all'>(() => selected.length ? 'selected' : 'all');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false; setLoading(true); setError('');
    const timer = setTimeout(() => apiGet<{ skills: typeof skills }>(`/api/skills?cwd=${encodeURIComponent(cwd)}`)
      .then(r => { if (!cancelled) setSkills(r.skills); }).catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); }), 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [cwd, revision]);
  useEffect(() => { if (list.current) list.current.scrollTop = 0; }, [query, scope]);
  const byId = new Map(skills.map(s => [s.id, s]));
  const selectedIds = [...new Set(selected)];
  const selectedSet = new Set(selectedIds);
  const missing = selectedIds.filter(id => !byId.has(id));
  const needle = query.trim().toLocaleLowerCase();
  const visible = skills.filter(s => (scope === 'all' || selectedSet.has(s.id)) &&
    `${s.name} ${s.description}`.toLocaleLowerCase().includes(needle));
  const remove = (id: string) => onChange(selectedIds.filter(value => value !== id));
  return <section className="space-y-4 rounded-xl border p-4" aria-label="本群技能">
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">本群技能 <span className="ml-2 text-muted-foreground font-normal">已选 {selectedIds.length} 个</span></h3>
      <Button size="sm" variant="ghost" disabled={loading} onClick={() => setRevision(n => n + 1)}>重新扫描</Button>
    </div>
    <div className="rounded-lg bg-muted/50 p-3 space-y-2">
      <p className="text-xs font-medium">已选技能</p>
      <div className="flex flex-wrap gap-2">
        {selectedIds.map(id => <span key={id} className={`inline-flex max-w-full items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs ${!loading && !error && !byId.has(id) ? 'border-destructive/40 text-destructive' : ''}`}>
          <span className="truncate" title={byId.get(id)?.name ?? id}>{byId.get(id)?.name ?? (loading ? '加载名称…' : `未找到 · ${id.slice(0, 12)}`)}</span>
          <button type="button" className="rounded p-1 hover:bg-muted focus-visible:outline focus-visible:outline-2" aria-label={`移除 ${byId.get(id)?.name ?? id}`} onClick={() => remove(id)}><X className="size-3" /></button>
        </span>)}
        {!selectedIds.length && <p className="text-xs text-muted-foreground">尚未选择技能，从下方全部技能中添加。</p>}
      </div>
      <p className="text-xs text-muted-foreground">保存群设置后，从下一次任务生效。</p>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex shrink-0 gap-1 rounded-lg bg-muted p-1" role="group" aria-label="技能筛选">
        <Button size="sm" variant={scope === 'selected' ? 'secondary' : 'ghost'} aria-pressed={scope === 'selected'} onClick={() => setScope('selected')}>已选 {selectedIds.length}</Button>
        <Button size="sm" variant={scope === 'all' ? 'secondary' : 'ghost'} aria-pressed={scope === 'all'} onClick={() => setScope('all')}>全部 {skills.length}</Button>
      </div>
      <div className="relative min-w-48 flex-1">
        <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9 pr-9" aria-label="搜索技能" placeholder={scope === 'selected' ? '搜索已选技能名称或用途' : '搜索全部技能名称或用途'} value={query} onChange={e => setQuery(e.target.value)} />
        {query && <button type="button" aria-label="清空技能搜索" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1" onClick={() => setQuery('')}><X className="size-4" /></button>}
      </div>
    </div>
    {loading && <p role="status" className="text-xs text-muted-foreground">扫描本机技能…</p>}
    {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
    <div ref={list} className="max-h-80 overflow-auto rounded-lg border divide-y">
      {visible.map(s => <div key={s.id} className={`p-3 ${selectedSet.has(s.id) ? 'bg-accent/30' : ''}`}>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" className="size-4 shrink-0" checked={selectedSet.has(s.id)} onChange={e => e.target.checked ? onChange([...new Set([...selectedIds, s.id])]) : remove(s.id)} />
          <span className="break-all text-sm font-medium">{s.name}</span>
          {selectedSet.has(s.id) && <span className="ml-auto shrink-0 text-xs text-muted-foreground">已选</span>}
        </label>
        {s.description && <details className="ml-7 mt-1 text-xs text-muted-foreground"><summary className="cursor-pointer">查看用途</summary><p className="mt-2 leading-relaxed">{s.description}</p></details>}
      </div>)}
      {!loading && !error && !visible.length && <div className="p-6 text-center text-sm text-muted-foreground">
        {query ? '没有匹配的技能' : scope === 'selected' ? '当前没有可用的已选技能' : '未发现本机技能'}
        {scope === 'selected' && <Button className="ml-2" size="sm" variant="ghost" onClick={() => setScope('all')}>去全部技能查找</Button>}
      </div>}
    </div>
    {!loading && !error && missing.length > 0 && <p className="text-destructive text-xs">有 {missing.length} 个已选技能未找到，请重新扫描或移除对应选择。</p>}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">显示 {visible.length} 个技能</span>
      <Button size="sm" variant="ghost" disabled={!selectedIds.length} onClick={() => onChange([])}>清空本群技能</Button>
    </div>
    <p className="text-xs text-muted-foreground">技能选择决定任务加载的技能，不限制 Bot 的本机文件访问权限。</p>
  </section>;
}
