import { SkillPicker } from './SkillPicker';
import { GroupPicker } from './ConfigView';
import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '@/lib/api';
import type { AgentKind } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
interface Inventory { kind: AgentKind; label: string; installed: boolean; binaryPath: string | null; }
interface Group { skillIsolation?: 'strict' | 'catalog'; enabled: boolean; name: string; workspace: string; persona: string; documents: string[]; skills?: string[]; }
interface Settings { agentKind: AgentKind; accessMode: string; protected: boolean; workbench: { revision: number; protectDocuments: true; groups: Record<string, Group> }; }
const area = 'w-full rounded-md border bg-background p-3 text-sm min-h-24';
export function WorkbenchView({ profile, onApplied }: { profile: string; onApplied: () => void }) {
  const [agents, setAgents] = useState<Inventory[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState('');
  const [known, setKnown] = useState<{ id: string; name: string }[]>([]);
  const [message, setMessage] = useState('');
  const endpoint = `/api/workbench?profile=${encodeURIComponent(profile)}`;
  const detect = () => apiGet<{ agents: Inventory[] }>('/api/agents').then(x => setAgents(x.agents)).catch(e => setError(e.message));
  useEffect(() => {
    void detect();
    apiGet<Settings>(endpoint).then(setSettings).catch(e => setError(e.message));
    apiGet<{ chats: { id: string; name: string }[] }>(`/api/chats?profile=${encodeURIComponent(profile)}`).then(x => setKnown(x.chats)).catch(() => {});
  }, [profile]);
  if (!settings) return <p>{error || '读取工作台配置…'}</p>;
  const group = settings.workbench.groups[selected];
  const patchGroup = (patch: Partial<Group>) => setSettings({ ...settings, workbench: { ...settings.workbench,
    groups: { ...settings.workbench.groups, [selected]: { ...group!, ...patch } } } });
  function addGroup(id: string, name = '') {
    if (!/^oc_[a-zA-Z0-9]+$/.test(id)) { toast.error('请选择群或填写 oc_ 开头的群 ID'); return; }
    setSettings(s => s && ({ ...s, workbench: { ...s.workbench, groups: { ...s.workbench.groups,
      [id]: s.workbench.groups[id] ?? { enabled: false, name, workspace: '', persona: '', documents: [], skills: [] } } } }));
    setSelected(id);
  }
  async function save() {
    setBusy(true); setError('');
    try {
      const result = await apiPost<Settings & { message: string }>(endpoint, settings);
      setSettings(result); setMessage(result.message); toast.success(result.message); onApplied();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="space-y-5">
    <Card><CardHeader className="flex-row justify-between"><CardTitle>运行这个机器人的 Agent</CardTitle><Button size="sm" variant="outline" onClick={detect}>重新检测</Button></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">飞书里的机器人保持不变。选择本机引擎，保存后自动切换；切换时开始新对话。</p>
        <div className="grid grid-cols-2 gap-3">{agents.map(a => <button key={a.kind} disabled={!a.installed || busy} onClick={() => setSettings({ ...settings, agentKind: a.kind })}
          className={`rounded-xl border p-4 text-left disabled:opacity-40 ${settings.agentKind === a.kind ? 'border-primary bg-accent ring-1 ring-primary' : ''}`}>
          <div className="font-medium">{a.label} {settings.agentKind === a.kind && '✓'}</div>
          <div className="text-xs text-muted-foreground mt-2">{a.installed ? '已检测到 · 登录状态待运行验证' : '未安装'}</div>
        </button>)}</div>
        <div className="space-y-2"><Label htmlFor="execution">电脑执行权限</Label><select id="execution" className="w-full border rounded-md p-2 bg-background" value={settings.accessMode} onChange={e => setSettings({ ...settings, accessMode: e.target.value })}>
          <option value="read-only">只读（由支持的 CLI 执行）</option><option value="workspace">限制写入工作目录</option><option value="full">本机完整权限（使用本机 Agent 的工具与凭据）</option>
        </select><p className="text-xs text-muted-foreground">Hermes / OpenClaw 当前只支持明确选择“本机完整权限”。工作目录不是文件读取隔离；未完成强制隔离前不向其他人开放执行。</p></div>
      </CardContent></Card>
    <Card><CardHeader><CardTitle>群与工作空间</CardTitle></CardHeader><CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">每个群单独选择目录与人格。拉进群后还需启用；没有配置的群不会执行任务。</p>
      {known.length > 0 && <select aria-label="选择已加入的群" className="w-full border rounded-md p-2 bg-background" value="" onChange={e => addGroup(e.target.value, known.find(k => k.id === e.target.value)?.name)}>
        <option value="">选择机器人已加入的群…</option>{known.map(k => <option key={k.id} value={k.id}>{k.name || k.id}</option>)}</select>}
      <Button variant="outline" onClick={() => setPickerOpen(true)}>搜索并选择群</Button><GroupPicker profile={profile} open={pickerOpen} onOpenChange={setPickerOpen} added={Object.keys(settings.workbench.groups)} onPick={addGroup} />
      <div className="flex flex-wrap gap-2">{Object.entries(settings.workbench.groups).map(([id, g]) => <Button key={id} variant={id === selected ? 'default' : 'outline'} size="sm" onClick={() => setSelected(id)}>{g.name || id.slice(0, 16)} · {g.enabled ? '启用' : '暂停'}</Button>)}</div>
      {group ? <div className="space-y-4 rounded-xl border p-4">
        <div className="flex items-center justify-between"><span className="text-sm">在这个群启用</span><Switch checked={group.enabled} onCheckedChange={enabled => patchGroup({ enabled })} /></div>
        <div><Label htmlFor="group-name">群显示名称</Label><Input id="group-name" value={group.name} onChange={e => patchGroup({ name: e.target.value })} /></div>
        <div><Label htmlFor="workspace">工作目录</Label><div className="flex gap-2"><Input id="workspace" value={group.workspace} placeholder="选择本机项目目录" onChange={e => patchGroup({ workspace: e.target.value })} />
          {'workbenchDesktop' in window && <Button variant="outline" onClick={async () => { const path = await (window as unknown as { workbenchDesktop: { chooseDirectory(): Promise<string | null> } }).workbenchDesktop.chooseDirectory(); if (path) patchGroup({ workspace: path }); }}>选择目录</Button>}</div></div>
        <div><Label htmlFor="persona">本群人格与回复要求</Label><textarea id="persona" className={area} value={group.persona} placeholder="例如：你是产品经理，先给结论，再给一个具体例子。" onChange={e => patchGroup({ persona: e.target.value })} /></div>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={group.skillIsolation === 'strict'} onChange={e => patchGroup({ skillIsolation: e.target.checked ? 'strict' : 'catalog' })} />严格技能隔离（Codex，需要 Docker）</label>
        {group.skillIsolation === 'strict' && <p className="text-xs text-muted-foreground">仅挂载勾选技能与项目快照，不访问本机主目录。文件修改暂不回写；不提供飞书凭据，其他引擎会被阻止。</p>}
        <SkillPicker cwd={group.workspace} selected={group.skills ?? []} onChange={skills => patchGroup({ skills })} />
        <details className="space-y-2"><summary className="cursor-pointer text-sm">严格文档边界（设置后会阻止本机任务）</summary><p className="text-xs text-muted-foreground">原生 CLI 可通过自己的工具访问资料，当前不能证明逐文档白名单有效。填入链接后进入安全阻断状态，不会把资料交给模型；这不是已完成的文档授权功能。</p><textarea aria-label="严格文档边界" className={area} value={group.documents.join('\n')} placeholder="每行一条飞书文档链接" onChange={e => patchGroup({ documents: e.target.value.split('\n').filter(Boolean) })} /></details>
        {group.documents.length > 0 && <Badge variant="outline">严格资料边界 · 执行已阻断</Badge>}
      </div> : <p className="text-sm text-muted-foreground">选择一个群开始配置。也可在下方飞书连接设置中授权查看群或拉机器人进群。</p>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>调用者与文档权限</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
      <Badge variant={settings.protected ? 'success' : 'outline'}>{settings.protected ? '保护已开启' : '保存后开启保护'}</Badge>
      <p>当前本机执行仅允许经过飞书验证的机器人创建者。普通群成员、外部人员和配置管理员都不能借用机器人的文档权限发起任务。</p>
      <p className="text-muted-foreground">群名单只决定机器人在哪工作，不代表群内所有人都获得使用权。用户的文档权限尚未验证时，拒绝委托执行。创建者在群内发起任务，结果会发到该群。</p>
      <p className="text-xs text-muted-foreground">技能按群独立加载。技能选择不授予额外工具权限，也不替代文件沙箱。飞书资源权限由飞书决定，本页不会自动扩大授权。</p>
    </CardContent></Card>
    {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
    <div className="sticky bottom-0 rounded-xl border bg-background/95 p-4 flex items-center justify-between gap-4"><span className="text-xs text-muted-foreground">配置版本 {settings.workbench.revision} · 保存时检查运行状态</span><Button disabled={busy} onClick={save}>{busy ? '应用中…' : '保存并应用'}</Button></div>
  </div>;
}
