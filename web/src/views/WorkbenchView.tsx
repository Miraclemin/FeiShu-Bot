import { TeamTasks } from './TeamTasks';
import { ResourceSharing } from './ResourceSharing';
import { RolePicker } from './RolePicker';
import { ConnectionCheckResults } from './ConnectionCheckResults';
import { ResourceList } from './ResourceList';
import { PermissionGuide } from './PermissionGuide';
import { BaseTablePicker } from './BaseTablePicker';
import { SkillPicker } from './SkillPicker';
import { GroupPicker } from './ConfigView';
import { useEffect, useState, type ReactNode } from 'react';
import { apiGet, apiPost } from '@/lib/api';
import type { AgentKind } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
interface Inventory { kind: AgentKind; label: string; installed: boolean; binaryPath: string | null; }
interface Group { coordinationEnabled?: boolean; coordinatorDoc?: string; experienceDoc?: string; resources?: string[]; role?: string; rolePrompt?: string; project?: { name: string; url: string; requirements: string; bugs: string }; skillIsolation?: 'strict' | 'catalog'; enabled: boolean; name: string; workspace: string; persona: string; documents: string[]; skills?: string[]; }
interface Settings { appId?: string; tenant?: string; agentKind: AgentKind; accessMode: string; protected: boolean; workbench: { revision: number; protectDocuments: true; groups: Record<string, Group> }; }
const area = 'w-full rounded-md border bg-background p-3 text-sm min-h-24';
export function WorkbenchView({ profile, onApplied, advanced, groupId, onDirtyChange }: { profile: string; onApplied: () => void; advanced?: ReactNode; groupId?: string; onDirtyChange?: (dirty: boolean) => void }) {
  const [saved, setSaved] = useState('');
  const [agents, setAgents] = useState<Inventory[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState(groupId ?? '');
  const [known, setKnown] = useState<{ id: string; name: string }[]>([]);
  const [catalog, setCatalog] = useState<{id:string;name:string}[]>([]);
  const [connection, setConnection] = useState<{checks:{label:string;ok:boolean;message:string}[];note:string}|null>(null);
  const [checking,setChecking]=useState(false);
  const [message, setMessage] = useState('');
  const endpoint = `/api/workbench?profile=${encodeURIComponent(profile)}`;
  const detect = () => apiGet<{ agents: Inventory[] }>('/api/agents').then(x => setAgents(x.agents)).catch(e => setError(e.message));
  useEffect(() => {
    void detect();
    apiGet<{skills:{id:string;name:string}[]}>('/api/skills').then(x => setCatalog(x.skills)).catch(() => {});
    apiGet<Settings>(endpoint).then(value => { setSettings(value); setSaved(JSON.stringify(value)); }).catch(e => setError(e.message));
    apiGet<{ chats: { id: string; name: string }[] }>(`/api/chats?profile=${encodeURIComponent(profile)}`).then(x => setKnown(x.chats)).catch(() => {});
  }, [profile]);
  useEffect(() => { onDirtyChange?.(!!settings && !!saved && JSON.stringify(settings) !== saved); }, [settings, saved, onDirtyChange]);
  if (!settings) return <p>{error || '读取工作台配置…'}</p>;
  const group = settings.workbench.groups[selected];
  const patchGroup = (patch: Partial<Group>) => setSettings({ ...settings, workbench: { ...settings.workbench,
    groups: { ...settings.workbench.groups, [selected]: { ...group!, ...patch } } } });
  function addGroup(id: string, name = '') {
    if (!/^oc_[a-zA-Z0-9]+$/.test(id)) { toast.error('请选择群或填写 oc_ 开头的群 ID'); return; }
    setSettings(s => s && ({ ...s, workbench: { ...s.workbench, groups: { ...s.workbench.groups,
      [id]: s.workbench.groups[id] ?? { enabled: false, name, workspace: '', persona: '', documents: [], skills: catalog.filter(x => ['lark-base','lark-im','lark-shared'].includes(x.name)).map(x => x.id) } } } }));
    setSelected(id);
  }
  async function save() {
    setBusy(true); setError('');
    try {
      let result = await apiPost<Settings & { message: string }>(endpoint, settings);
      setSettings(result); setSaved(JSON.stringify(result)); setMessage(result.message); toast.success(result.message); onApplied();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const project = group?.project ?? { name: '', url: '', requirements: '', bugs: '' };
  return <div className="space-y-5">
    {!groupId && <><PermissionGuide key={profile} profile={profile} />

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
        </select><p className="text-xs text-muted-foreground">Hermes / OpenClaw 当前只支持明确选择“本机完整权限”。所有成员共享此处配置的执行能力。工作目录不是文件读取隔离，资料链接也不是严格访问白名单。</p></div>
      </CardContent></Card></>}
    <Card><CardHeader><CardTitle>群与工作空间</CardTitle></CardHeader><CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">每个群单独选择目录与人格。拉进群后还需启用；没有配置的群不会执行任务。</p>
      {!groupId && <>{known.length > 0 && <select aria-label="选择已加入的群" className="w-full border rounded-md p-2 bg-background" value="" onChange={e => addGroup(e.target.value, known.find(k => k.id === e.target.value)?.name)}>
        <option value="">选择机器人已加入的群…</option>{known.map(k => <option key={k.id} value={k.id}>{k.name || k.id}</option>)}</select>}
      <Button variant="outline" onClick={() => setPickerOpen(true)}>搜索并选择群</Button><GroupPicker onAuthorize={() => { setPickerOpen(false); requestAnimationFrame(() => { document.getElementById('user-permissions')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); document.getElementById('authorize-my-groups')?.focus({ preventScroll: true }); }); }} profile={profile} open={pickerOpen} onOpenChange={setPickerOpen} added={Object.keys(settings.workbench.groups)} onPick={addGroup} />
      <div className="flex flex-wrap gap-2">{Object.entries(settings.workbench.groups).map(([id, g]) => <Button key={id} variant={id === selected ? 'default' : 'outline'} size="sm" onClick={() => setSelected(id)}>{g.name || id.slice(0, 16)} · {g.enabled ? '启用' : '暂停'}</Button>)}</div>
      </>}
      {group ? <div key={JSON.stringify([profile, selected])} className="space-y-4 rounded-xl border p-4">
        <div className={`flex items-center justify-between gap-4 rounded-xl border-2 p-4 ${group.enabled ? 'border-primary/40 bg-primary/5' : 'border-amber-400/50 bg-amber-50 dark:bg-amber-950/20'}`}>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="group-enabled" className="text-base font-semibold cursor-pointer">在这个群启用</Label>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${group.enabled ? 'bg-primary/10 text-primary' : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'}`}>{group.enabled ? '开关已开启' : '开关已关闭'}</span>
            </div>
            <p id="group-enabled-hint" className="text-xs text-muted-foreground">{group.enabled ? '允许 Agent 响应本群任务。' : '关闭时，Agent 不响应本群任务。'}修改后点击下方“保存群与 Agent 设置”生效。</p>
          </div>
          <Switch id="group-enabled" aria-describedby="group-enabled-hint" className="shrink-0 scale-110" checked={group.enabled} onCheckedChange={enabled => patchGroup({ enabled })} />
        </div>
        <div><Label htmlFor="group-name">群显示名称</Label><Input id="group-name" value={group.name} onChange={e => patchGroup({ name: e.target.value })} /></div>
        <div><Label htmlFor="workspace">工作目录</Label><div className="flex gap-2"><Input id="workspace" value={group.workspace} placeholder="选择本机项目目录" onChange={e => patchGroup({ workspace: e.target.value })} />
          {'workbenchDesktop' in window && <Button variant="outline" onClick={async () => { const path = await (window as unknown as { workbenchDesktop: { chooseDirectory(): Promise<string | null> } }).workbenchDesktop.chooseDirectory(); if (path) patchGroup({ workspace: path }); }}>选择目录</Button>}</div></div>
        <div><Label htmlFor="persona">本群人格与回复要求</Label><textarea id="persona" className={area} value={group.persona} placeholder="例如：你是产品经理，先给结论，再给一个具体例子。" onChange={e => patchGroup({ persona: e.target.value })} /></div>
        <p className="text-sm text-muted-foreground">本机工作目录模式：任务直接在上方目录执行，不使用 Docker。Skill 勾选控制加载清单，不是文件访问权限。</p>
        <div className="border-t" />
        <h3 className="font-medium">1. 它在这个群负责什么？</h3>
        <RolePicker role={group.role} rolePrompt={group.rolePrompt} templates={Object.values(settings.workbench.groups)} onChange={(value, skillName) => {
          const basic = skillName ? catalog.filter(x => ['lark-base','lark-im','lark-shared',skillName].includes(x.name)).map(x => x.id) : [];
          patchGroup({ ...value, skills: [...new Set([...(group.skills ?? []), ...basic])] }); setConnection(null);
        }} />
        {group.role === 'coordinator' && <div className="rounded-xl border bg-primary/5 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3"><div><Label htmlFor="coordination-enabled" className="font-semibold">组织者模式</Label><p className="text-xs text-muted-foreground mt-1">开启：登记分工、收集结果、汇总归档。关闭：直接对话，各 Agent 仍可独立使用。</p></div><Switch id="coordination-enabled" checked={group.coordinationEnabled !== false} onCheckedChange={coordinationEnabled=>patchGroup({coordinationEnabled})}/></div>
          <p className="text-sm">群里直接 @组织者说目标即可，自动拆分、澄清、交接和验收；简单问题直接回答。修改开关后保存生效。</p>
          <TeamTasks key={profile+selected} profile={profile} chatId={selected}/>
        </div>}
        <h3 className="font-medium">2. 它服务哪个项目？</h3>
        {([['name','项目名称','例如：我的产品'],['url','产品网址（选填）','https://']] as const).map(([key,label,placeholder]) => <div key={key}><Label htmlFor={'project-'+key}>{label}</Label><Input id={'project-'+key} placeholder={placeholder} value={project[key]} onChange={e=>patchGroup({project:{...project,[key]:e.target.value}})} /></div>)}
        {group.role === 'coordinator' && group.coordinationEnabled !== false && <><div className="space-y-2"><Label htmlFor="experience-doc">项目经验文档（选填）</Label>
          <Input id="experience-doc" value={group.experienceDoc ?? ''} placeholder="https://你的企业.feishu.cn/docx/…" onChange={e => patchGroup({experienceDoc:e.target.value})} />
          <p className="text-xs text-muted-foreground">由组织者统一读取和维护，派发时只附相关经验。普通 Agent 返回经验建议；经负责人明确确认再归档。需要可用的 lark-doc 技能和文档权限；此规则不是程序强制审批。</p>
          <Button size="sm" variant="outline" onClick={()=>{const ids=catalog.filter(x=>['lark-doc','lark-im','lark-shared'].includes(x.name)).map(x=>x.id);patchGroup({skills:[...new Set([...(group.skills??[]),...ids])]});toast.info(ids.length===3?'已勾选文档与群聊技能，请保存设置':'已勾选找到的技能，缺失的技能需先安装');}}>勾选经验协作所需技能</Button>
        </div>
        <div className="space-y-2"><Label htmlFor="coordinator-doc">本群协作手册（组织者使用）</Label>
          <Input id="coordinator-doc" value={group.coordinatorDoc ?? ''} placeholder="https://你的企业.feishu.cn/docx/…" onChange={e => patchGroup({coordinatorDoc:e.target.value})} />
          <p className="text-xs text-muted-foreground">选填。未绑定时使用内置协作流程；绑定后读取本群约定。任务进度由软件单独保存，手册不替代执行权限。</p>
          <Button size="sm" variant="outline" disabled={busy} onClick={async()=>{setBusy(true);try{const saved=await apiPost<Settings>(endpoint,settings);setSettings(saved);const r=await apiPost<{url:string;teamCompleted?:boolean}>(`/api/workbench/coordinator-handbook?profile=${encodeURIComponent(profile)}`,{chatId:selected});if(r.teamCompleted){setSettings(await apiGet<Settings>(endpoint));toast.success('协作团队已完成绑定、启用和群内通知');onApplied();}else{saved.workbench.groups[selected]!.coordinatorDoc=r.url;setSettings(await apiPost<Settings>(endpoint,saved));toast.success('手册已绑定并保存');onApplied();}}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}}}>创建或找回本群协作手册</Button>
        </div>
        </>}
        {group.role !== 'coordinator' && <p className="text-sm text-muted-foreground">团队规则与项目经验由组织者管理，派发任务时附上所需上下文。本 Agent 负责执行并反馈结果与经验建议，无需绑定手册。</p>}
        <BaseTablePicker profile={profile} appId={settings.appId} tenant={settings.tenant} onAdd={urls=>{patchGroup({resources:[...new Set([...(group.resources ?? [project.requirements,project.bugs].filter(Boolean)),...urls])]});setConnection(null);}} />
        <ResourceSharing name={group.name || project.name} links={group.resources ?? [project.requirements,project.bugs].filter(Boolean)} onAdd={resources=>{patchGroup({resources});setConnection(null);}} />
        <ResourceList profile={profile} links={group.resources ?? [project.requirements,project.bugs].filter(Boolean)} onChange={resources=>{patchGroup({resources});setConnection(null);}} />
        <Button disabled={checking} variant="outline" onClick={async()=>{setChecking(true);setConnection(null);try{setConnection(await apiPost(`/api/workbench/check?profile=${encodeURIComponent(profile)}`,{workbench:settings.workbench,chatId:selected}));}catch(e){setError((e as Error).message);}finally{setChecking(false);}}}>{checking ? '正在逐份检查资料…' : '3. 检查资料访问权限'}</Button>
        {connection && <ConnectionCheckResults checks={connection.checks} note={connection.note} />}

        {(group.skillIsolation === 'strict' || group.documents.length > 0) && <div className="rounded-md border p-3 text-sm"><p>此群保留着旧的实验隔离配置。切换后，资料链接会保留，但不再作为严格权限边界。</p><Button variant="outline" onClick={()=>patchGroup({skillIsolation:'catalog',resources:[...new Set([...(group.resources ?? []),...group.documents])],documents:[]})}>切换为本机工作目录模式</Button></div>}
        <p className="text-xs text-muted-foreground">在飞书对话中输入 /help 或 /usage，可查看本群配置的 Skills。此清单是加载提示，不是严格隔离或权限白名单。</p>
        <SkillPicker cwd={group.workspace} selected={group.skills ?? []} onChange={skills => patchGroup({ skills })} />
      </div> : <p className="text-sm text-muted-foreground">选择一个群开始配置。也可在下方飞书连接设置中授权查看群或拉机器人进群。</p>}
    </CardContent></Card>
    {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
    {advanced}
    <div className="sticky bottom-0 rounded-xl border bg-background/95 p-4 flex items-center justify-between gap-4"><span className="text-xs text-muted-foreground">配置版本 {settings.workbench.revision} · 保存时检查运行状态</span><Button disabled={busy} onClick={save}>{busy ? '应用中…' : groupId ? '保存本群设置' : '保存群与 Agent 设置'}</Button></div>
  </div>;
}
