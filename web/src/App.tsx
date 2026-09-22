import { GroupsView } from './views/GroupsView';
import { ScheduledTasks } from './views/ScheduledTasks';
import { CreateTeam } from './views/CreateTeam';
import { TeamResources } from './views/TeamResources';
import { Button } from '@/components/ui/button';
import { appMascot } from './components/AgentAvatar';
import { AgentOverview } from './views/AgentOverview';
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { apiGet } from "@/lib/api";
import type { OnboardState, Status } from "@/lib/types";
import { Toaster } from "@/components/ui/sonner";
import { ProfilesView } from "@/views/ProfilesView";
import { ProfileDetail } from "@/views/ProfileDetail";

export function App() {
  return <WorkbenchApp />;
}

function WorkbenchApp() {
  const [perspective, setPerspective] = useState<'agent'|'group'>('agent');
  const [groupDirty, setGroupDirty] = useState(false);
  const [scheduleOpen,setScheduleOpen]=useState(false);
  const [creatingTeam,setCreatingTeam]=useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const leaveGroup = () => !groupDirty || window.confirm('设置尚未保存，放弃这些修改？');
  const [onboard, setOnboard] = useState<OnboardState | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const os = await apiGet<OnboardState>("/api/onboard/state");
      setOnboard(os);
      if (os.hasConfig) {
        setStatus(await apiGet<Status>("/api/status").catch(() => null));
      }
      setError(null);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  }, []);

  useEffect(() => { void refresh(); const timer=setInterval(()=>{void apiGet<Status>('/api/status').then(setStatus).catch(()=>{});},5000); return ()=>clearInterval(timer); }, [refresh]);
  useEffect(() => {
    const icon = document.createElement('link');
    icon.rel = 'icon'; icon.type = 'image/png'; icon.href = appMascot;
    document.head.appendChild(icon);
    return () => icon.remove();
  }, []);

  if (error) return <Shell><p className="text-destructive text-sm">加载失败：{error}</p></Shell>;
  if (!onboard) return <Shell><p className="text-muted-foreground text-sm">加载中…</p></Shell>;


  return (
    <Shell>
      {scheduleOpen ? <ScheduledTasks onBack={()=>setScheduleOpen(false)} /> : creatingTeam ? <CreateTeam onBack={()=>setCreatingTeam(false)} onOpen={profile=>{setCreatingTeam(false);setSelected(profile);}} /> : teamOpen ? <TeamResources onBack={() => setTeamOpen(false)} /> : selected ? (
        <ProfileDetail profile={selected} onBack={() => { setSelected(null); void refresh(); }} />
      ) : (
        <>
          <div className="flex justify-end gap-2 mb-4"><Button variant="outline" onClick={()=>{if(leaveGroup()){setGroupDirty(false);setScheduleOpen(true);}}}>定时任务</Button><Button onClick={()=>{if(leaveGroup()){setGroupDirty(false);setCreatingTeam(true);}}}>创建协作团队</Button><Button variant="outline" onClick={() => {if(leaveGroup()){setGroupDirty(false);setTeamOpen(true);}}}>团队资源 · 资料与 Skill</Button></div>
          <AgentOverview />
          <div className="flex gap-2 mb-5" role="group" aria-label="管理视角">
            <Button variant={perspective==='agent'?'default':'outline'} aria-pressed={perspective==='agent'} onClick={()=>{if(groupDirty&&!window.confirm('设置尚未保存，放弃这些修改？'))return;setGroupDirty(false);setPerspective('agent');}}>Bot 视角</Button>
            <Button variant={perspective==='group'?'default':'outline'} aria-pressed={perspective==='group'} onClick={()=>setPerspective('group')}>群组视角</Button>
          </div>
          {perspective==='agent'?<ProfilesView onOpen={setSelected}/>:<GroupsView onOpenAgent={setSelected} onDirtyChange={setGroupDirty}/>}

          {status && (
            <p className="mt-6 text-xs text-muted-foreground">
              FeiShu Bot · v{status.version} · {status.online} 个在线 · 按机器人管理连接与工作空间
            </p>
          )}
        </>
      )}
      <Toaster />
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-4xl p-6">{children}</div>;
}
