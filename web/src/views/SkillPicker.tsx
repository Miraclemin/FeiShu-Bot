import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
export function SkillPicker({ cwd, selected, onChange }: { cwd: string; selected: string[]; onChange: (ids: string[]) => void }) {
  const [skills, setSkills] = useState<{ id: string; name: string; description: string }[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let cancelled = false; setLoading(true); setError('');
    const timer = setTimeout(() => apiGet<{ skills: typeof skills }>(`/api/skills?cwd=${encodeURIComponent(cwd)}`)
      .then(r => { if (!cancelled) setSkills(r.skills); }).catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); }), 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [cwd, revision]);
  const known = new Set(skills.map(s => s.id));
  return <div className="space-y-2 rounded-md border p-3">
    <div className="flex justify-between items-center"><span className="text-sm font-medium">本群启用的 Skill · 已选 {selected.length} 个</span><Button size="sm" variant="ghost" onClick={() => setRevision(n => n + 1)}>重新扫描</Button></div>
    <p className="text-xs text-muted-foreground">只向本群任务提供勾选的技能；不选则不加载技能。保存后从下一次任务生效。技能描述不代表文件权限，完整电脑权限仍能访问本机文件。</p>
    <Input aria-label="搜索技能" placeholder="按技能名称或用途搜索" value={query} onChange={e => setQuery(e.target.value)} />
    {loading && <p className="text-xs">扫描本机技能…</p>}{error && <p role="alert" className="text-destructive text-sm">{error}</p>}
    <div className="max-h-64 overflow-auto divide-y">{skills.filter(s => `${s.name} ${s.description}`.toLowerCase().includes(query.toLowerCase())).map(s => <label key={s.id} className="flex gap-3 p-2 cursor-pointer"><input type="checkbox" checked={selected.includes(s.id)} onChange={e => onChange(e.target.checked ? [...selected, s.id] : selected.filter(id => id !== s.id))} /><span><span className="text-sm">{s.name}</span><span className="block text-xs text-muted-foreground">{s.description}</span></span></label>)}</div>
    {!loading && selected.some(id => !known.has(id)) && <p className="text-destructive text-xs">有已选技能被移动或删除，执行会被阻止。<button onClick={() => onChange(selected.filter(id => known.has(id)))}>移除失效选择</button></p>}
    <Button size="sm" variant="ghost" disabled={!selected.length} onClick={() => onChange([])}>清空本群技能</Button>
  </div>;
}
