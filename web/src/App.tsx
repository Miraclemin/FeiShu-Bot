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
  const [teamOpen, setTeamOpen] = useState(false);
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

  useEffect(() => { void refresh(); }, [refresh]);
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
      {teamOpen ? <TeamResources onBack={() => setTeamOpen(false)} /> : selected ? (
        <ProfileDetail profile={selected} onBack={() => { setSelected(null); void refresh(); }} />
      ) : (
        <>
          <div className="flex justify-end mb-4"><Button variant="outline" onClick={() => setTeamOpen(true)}>团队资源 · 资料与 Skill</Button></div>
          <AgentOverview />
          <ProfilesView onOpen={setSelected} />
          {status && (
            <p className="mt-6 text-xs text-muted-foreground">
              feishu-collaborator · v{status.version} · {status.online} 个在线 · 按机器人管理连接与工作空间
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
