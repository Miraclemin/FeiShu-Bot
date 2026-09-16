import { UserPermissions } from './UserPermissions';
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CircleDashed, KeyRound, RefreshCw } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { Button } from '@/components/ui/button';

type Status = {status:string;message?:string;permissions?:string;meeting?:string;granted?:number;total?:number};
type Desktop = {meetingSetupStatus?:(profile:string)=>Promise<{state:string;published?:boolean;missingScope?:boolean}|null>;setupPermissions?:(profile:string)=>Promise<{message:string}>;setupMeetingEvents?:(profile:string)=>Promise<{message:string}>};
export function PermissionGuide({profile}:{profile:string}) {
 const [authRefresh,setAuthRefresh]=useState(0);
 const [cachedMeeting,setCachedMeeting]=useState(false);
 const [status,setStatus]=useState<Status|null>(null),[checking,setChecking]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const refresh=useCallback(async()=>{setChecking(true);try{const desktop=(window as unknown as {workbenchDesktop?:Desktop}).workbenchDesktop;const previous=await desktop?.meetingSetupStatus?.(profile);if(previous?.state==='configured')setCachedMeeting(previous.published===true&&!previous.missingScope);setStatus(await apiGet<Status>(`/api/workbench/permission-status?profile=${encodeURIComponent(profile)}`));}catch{setStatus({status:'unknown',message:'暂时无法检查'});}finally{setChecking(false);}},[profile]);
 useEffect(()=>{setStatus(null);setCachedMeeting(false);setMessage('');void refresh();const onFocus=()=>void refresh();window.addEventListener('focus',onFocus);return()=>window.removeEventListener('focus',onFocus);},[refresh]);
 const granted=status?.permissions==='ready',meeting=status?.meeting==='ready'||cachedMeeting,ready=granted&&meeting;
 async function setup(){
  const desktop=(window as unknown as {workbenchDesktop?:Desktop}).workbenchDesktop;
  setBusy(true);setMessage('');
  try {
   const action=granted&&!meeting?desktop?.setupMeetingEvents:desktop?.setupPermissions;
   if(!action){setMessage('请使用桌面客户端开通');return;}
   const result=await action(profile);setMessage(result.message);await refresh();
  }catch{setMessage('配置未完成，请重试');}finally{setBusy(false);}
 }
 const row=(label:string,ok:boolean,detail:string)=><div className="flex items-center justify-between gap-4 py-2.5"><span className="text-sm text-muted-foreground">{label}</span><span className={`inline-flex items-center gap-1.5 text-sm ${ok?'text-emerald-600':'text-muted-foreground'}`}>{ok?<CheckCircle2 className="h-4 w-4"/>:<CircleDashed className="h-4 w-4"/>}{detail}</span></div>;
 return <section className="rounded-xl border bg-card px-5 py-4 space-y-3">
  <div className="flex items-center justify-between"><h3 className="flex items-center gap-2 font-medium"><KeyRound className="h-4 w-4 text-muted-foreground"/>飞书连接</h3><span className={`rounded-full px-2.5 py-1 text-xs ${ready?'bg-emerald-50 text-emerald-700':'bg-muted text-muted-foreground'}`}>{checking?'检查中':ready?'应用已就绪':status?.status==='checked'?'待完善':'待检查'}</span></div>
  <div className="divide-y">
   {row('功能权限',granted,granted?'已开通':status?.status==='checked'?`${status.granted} / ${status.total} 项已开通`:'未核验')}
   {row('会议事件',meeting,meeting?'已配置':'待核验')}
  </div>
  <div className="flex items-center gap-2 border-t pt-3">
   <Button disabled={busy||checking||ready} onClick={setup}>{busy?'请在飞书窗口继续…':ready?'应用权限已开通':granted?'一键配置会议':'一键开通全部功能权限'}</Button>
   <Button variant="ghost" size="sm" disabled={checking||busy} onClick={()=>{setMessage('');setAuthRefresh(x=>x+1);void refresh();}}><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${checking?'animate-spin':''}`}/>重新检查</Button>
  </div>
  {(message||status?.message)&&<p role="status" className="text-xs text-muted-foreground">{message||status?.message}</p>}
  <UserPermissions key={profile} profile={profile} refreshKey={authRefresh}/>
 </section>;
}
