import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiGet, apiPost } from '@/lib/api';
import { OnboardWizard } from './OnboardWizard';

type Draft={name:string;goal:string;workspace:string;profile:string};
const key='create-collaboration-team';
const scenarios = [
 {name:'内容创作',goal:'围绕一个选题，由策划提出提纲、写作者完成草稿、审校核对依据，组织者汇总待确认稿；发布由负责人确认。'},
 {name:'研发交付',goal:'围绕已确认需求，由实现者提供可验证成果、验收者检查结果，组织者汇总证据与卡点；上线由负责人确认。'},
 {name:'业务调研',goal:'围绕一个业务问题，由研究者整理证据、分析者比较方案、复核者检查结论，组织者汇总建议；最终决策由负责人确认。'},
];
function initial():Draft {try{return JSON.parse(sessionStorage.getItem(key)||'null')||{name:'',goal:'',workspace:'',profile:''};}catch{return {name:'',goal:'',workspace:'',profile:''};}}
export function CreateTeam({onBack,onOpen}:{onBack:()=>void;onOpen:(profile:string)=>void}) {
 const [draft,setDraft]=useState<Draft>(initial),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [existing,setExisting]=useState<string[]>([]);
 useEffect(()=>{apiGet<{profiles:string[]}>('/api/onboard/state').then(x=>setExisting(x.profiles)).catch(()=>{});},[]);
 const [result,setResult]=useState<{chatUrl:string;handbook:string}|null>(null);
 // QR polling may invoke a callback captured before the user filled the form.
 // Always merge into the latest state, never the callback's render snapshot.
 function change(p:Partial<Draft>){setDraft(current=>({...current,...p}));}
 useEffect(()=>{if(!result) sessionStorage.setItem(key,JSON.stringify(draft));},[draft,result]);
 async function create(){setBusy(true);setError('');try{setResult(await apiPost('/api/workbench/create-team?profile='+encodeURIComponent(draft.profile),draft));sessionStorage.removeItem(key);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <div className="space-y-5">
 <Button variant="ghost" disabled={busy} onClick={onBack}>返回工作台</Button>
 <h1 className="text-2xl font-semibold">创建协作团队</h1>
 <p className="text-muted-foreground">独立组织者 + 新飞书群 + 本群共享协作手册。创建人是负责人，普通 Bot 加入后承担各自职责。</p>
 {!result&&<>
 <fieldset disabled={busy} className="space-y-3">
 <label className="block">团队名称<Input value={draft.name} maxLength={60} onChange={e=>change({name:e.target.value})} placeholder="例如：OctoLead 协作团队"/></label>
 <div className="flex flex-wrap gap-2" aria-label="协作场景模板">{scenarios.map(s=><Button key={s.name} type="button" variant="outline" onClick={()=>change({goal:s.goal})}>{s.name}</Button>)}</div>
 <label className="block">工作目标<textarea className="w-full rounded border p-2" value={draft.goal} maxLength={2000} onChange={e=>change({goal:e.target.value})} placeholder="描述目标、成员分工、交付物及需要人确认的环节；可从上方模板开始修改"/></label>
 <label className="block">组织者工作目录<Input value={draft.workspace} readOnly={'workbenchDesktop' in window} onChange={e=>change({workspace:e.target.value})} placeholder={'workbenchDesktop' in window ? '点击下方按钮选择文件夹' : '本机已存在的绝对路径'}/>
 {'workbenchDesktop' in window && <Button className="mt-2" type="button" variant="outline" onClick={async()=>{try {const path=await (window as unknown as {workbenchDesktop:{chooseDirectory():Promise<string|null>}}).workbenchDesktop.chooseDirectory();if(path)change({workspace:path});}catch(e){setError('无法打开文件夹选择窗口：'+(e as Error).message);}}}>{draft.workspace?'更换文件夹':'选择文件夹'}</Button>}</label>
 <p className="text-xs text-muted-foreground">这是组织者执行任务的本机目录；其他 Bot 保留自己的工作目录。</p>
 </fieldset>
 {!draft.profile ? <section className="border rounded p-4 space-y-3"><h2 className="font-semibold">创建独立的组织者机器人</h2><p className="text-sm">新建一个组织者应用，或绑定尚未配置其他群的应用。请勿选择已经承担其他群职责的机器人。</p><label className="block text-sm">已经创建过？选择本机机器人继续<select className="block w-full rounded border p-2" value="" onChange={e=>{if(e.target.value)change({profile:e.target.value});}}><option value="">请选择尚未绑定其他群的组织者</option>{existing.map(p=><option key={p} value={p}>{p}</option>)}</select></label><OnboardWizard onCreated={profile=>change({profile})} defaultMode="new"/></section>:
 <section className="border rounded p-4 space-y-3"><p>组织者：{draft.profile}</p><p className="text-sm text-muted-foreground">将自动启动组织者、验证创建人、创建私有群和手册，并将手册设为全群可读、创建人可编辑。遇到权限缺项可补齐后继续。</p><Button variant="outline" onClick={()=>onOpen(draft.profile)}>组织者配置与统一权限入口</Button></section>}
 {error&&<p role="alert" className="text-destructive whitespace-pre-wrap">{error}</p>}
 <Button disabled={busy||!draft.profile||!draft.name.trim()||!draft.goal.trim()||!draft.workspace.trim()} onClick={()=>void create()}>{busy?'正在创建，请稍候…':error?'继续完成创建':'创建群和共享手册'}</Button>
 <p className="text-xs text-muted-foreground">失败时保留已创建的资源，重试复用原群和手册。</p>
 </>}
 {result&&<section className="space-y-4 border rounded p-4"><h2 className="font-semibold">组织者、群和手册已配置</h2><div className="flex gap-4"><a className="text-primary underline" href={result.chatUrl} target="_blank" rel="noreferrer">打开飞书群</a><a className="text-primary underline" href={result.handbook} target="_blank" rel="noreferrer">编辑协作手册</a></div><ol className="list-decimal pl-5 space-y-2"><li>邀请参与者和各自的机器人进入新群，角色可以是策划、写作、审校或任何业务分工。</li><li>每位 Bot 的拥有者绑定并启用本群，填写职责，选择资料、技能与工作目录。</li><li>先 @组织者：检查本群协作准备情况，列出缺少的角色和资料，先不要开发或上线。</li><li>准备完成后，@组织者 发送「组织协作：目标、分工、验收标准与限制」。用 /team status 查看进度。</li></ol><p className="text-sm text-muted-foreground">跨电脑 Bot 的交接需要双方版本和配置支持；不能仅凭入群判定可用。</p><Button onClick={()=>onOpen(draft.profile)}>查看组织者配置</Button></section>}
 </div>;
}
