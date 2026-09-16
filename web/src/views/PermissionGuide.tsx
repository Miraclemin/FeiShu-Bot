import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';
import { Button } from '@/components/ui/button';
import presets from '../../../resources/permission-presets.json';
export function PermissionGuide({ profile }: { profile: string }) {
 const [app,setApp]=useState<{appId:string;tenant:string}|null>(null);
 const [selected,setSelected]=useState(presets.filter(p=>p.default).map(p=>p.id));
 const [copied,setCopied]=useState(false),[error,setError]=useState('');
 useEffect(()=>{setApp(null);setError('');setCopied(false);let active=true;apiGet<{appId:string;tenant:string}>(`/api/workbench?profile=${encodeURIComponent(profile)}`).then(r=>{if(active)setApp(r);}).catch(()=>{if(active)setError('无法读取机器人信息，请重新打开此页面');});return()=>{active=false};},[profile]);
 const active=presets.filter(p=>selected.includes(p.id));
 const scopes={tenant:[...new Set(active.flatMap(p=>p.tenant))],user:[...new Set(active.flatMap(p=>p.user))]};
 const config=JSON.stringify({scopes},null,2);
 const host=app?.tenant==='lark'?'open.larksuite.com':'open.feishu.cn';
 const valid=app && /^cli_[a-zA-Z0-9]+$/.test(app.appId);
 const url=valid?`https://${host}/app/${app.appId}/auth`:'';
 async function copy(){setError('');try{const desktop=(window as unknown as {workbenchDesktop?:{copyPermissionPreset?:(ids:string[])=>Promise<boolean>}}).workbenchDesktop;if(desktop?.copyPermissionPreset)await desktop.copyPermissionPreset(selected);else await navigator.clipboard.writeText(config);setCopied(true);return true;}catch{setError('无法自动复制，请展开下方权限配置手动复制。');return false;}}
 return <section className="rounded-lg border bg-muted/30 p-4 space-y-3 text-sm">
  <p className="font-medium">首次权限准备 · 常用功能一次配置</p>
  <p className="text-muted-foreground">勾选功能，一次复制到飞书权限管理中批量导入。</p>
  <div className="grid gap-2">{presets.map(p=><label className="flex gap-2" key={p.id}><input type="checkbox" checked={selected.includes(p.id)} onChange={e=>{setSelected(old=>e.target.checked?[...old,p.id]:old.filter(x=>x!==p.id));setCopied(false);}} />{p.label}</label>)}</div>
  <Button disabled={!valid||!active.length} onClick={async()=>{if(await copy())window.open(url,'_blank','noopener,noreferrer');}}>{copied?'已复制 · 前往开通':'复制勾选配置并去开通'}</Button>
  {error&&<p role="alert" className="text-destructive">{error}</p>}
  <details open={error?true:undefined}><summary className="cursor-pointer text-xs">查看或手动复制权限配置（机器人 {scopes.tenant.length} 项，用户 {scopes.user.length} 项）</summary><textarea readOnly aria-label="可导入的权限配置" className="mt-2 w-full h-44 border rounded p-2 font-mono text-xs" value={config} onFocus={e=>e.target.select()} /></details>
 </section>;
}
