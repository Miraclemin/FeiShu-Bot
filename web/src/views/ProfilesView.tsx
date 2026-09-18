import { AgentAvatar } from '@/components/AgentAvatar';
import { useEffect, useState } from "react";
import { ChevronRight, Trash2 } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import type { ProfileInfo } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { OnboardWizard } from "./OnboardWizard";

export function ProfilesView({ onOpen }: { onOpen: (profile: string) => void }) {
  const [profiles, setProfiles] = useState<ProfileInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [stopTarget, setStopTarget] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProfileInfo | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [shuffling, setShuffling] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () =>
    apiGet<{ profiles: ProfileInfo[] }>("/api/profiles")
      .then((d) => { setProfiles(d.profiles); setError(null); })
      .catch((e) => setError(String(e.message ?? e)));

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  async function shuffleAvatars() {
    setShuffling(true);
    try {
      await apiPost('/api/profiles/avatars/shuffle', {});
      await load();
      toast.success('已换成一批不同的新头像');
    } catch (e) { toast.error((e as Error).message); }
    finally { setShuffling(false); }
  }

  async function start(name: string, e: React.MouseEvent) {
    e.stopPropagation();
    setBusy(name);
    try {
      await apiPost("/api/profiles/start", { profile: name });
      toast.success(`已启动 ${name}`);
      load();
    } catch (err) {
      toast.error(String((err as Error).message ?? err));
    } finally {
      setBusy(null);
    }
  }

  async function confirmStop() {
    if (!stopTarget) return;
    setStopping(true);
    try {
      await apiPost("/api/profiles/stop", { profile: stopTarget });
      toast.success(`已停止 ${stopTarget}`);
      setStopTarget(null);
      setTimeout(load, 500);
    } catch (e) {
      toast.error(String((e as Error).message ?? e));
    } finally {
      setStopping(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await apiPost('/api/profiles/delete', { profile: deleteTarget.name });
      toast.success(`已删除 ${deleteTarget.displayName || deleteTarget.name}`);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast.error(String((e as Error).message ?? e));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">我的 Agent</h1>
          <p className="text-sm text-muted-foreground">让你的本机 AI 在飞书群里工作</p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={shuffling || !profiles?.length} onClick={() => void shuffleAvatars()}>{shuffling ? '更换中…' : '头像换一批'}</Button>
          <Button onClick={() => setCreating(true)}>新建 Agent</Button>
        </div>
      </div>
      {error && <p className="text-destructive text-sm">加载失败：{error}</p>}

      <div className="space-y-2">
        {profiles?.length === 0 && (
          <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
            暂无 Agent，点「新建 Agent」开始。
          </p>
        )}
        {profiles?.map((p) => (
          <div key={p.name} className="flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors hover:bg-accent/40">
            <button className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-primary" onClick={() => onOpen(p.name)} aria-label={`打开 ${p.displayName || p.name}`}>
            <AgentAvatar profile={p.name} avatarId={p.avatarId} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium break-all">{p.displayName || p.name}</span>
                <Badge variant="secondary">{p.agentKind}</Badge>
                {p.running ? <Badge variant="success">在线</Badge> : <Badge variant="outline">{p.needsSetup ? "待配置" : "未运行"}</Badge>}
              </div>
            </div>
            </button>
            {p.running ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={(e) => { e.stopPropagation(); setStopTarget(p.name); }}
              >
                停止
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled={busy === p.name} onClick={(e) => start(p.name, e)}>
                {busy === p.name ? "启动中…" : "启动"}
              </Button>
            )}
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" disabled={busy === p.name || deleting}
              aria-label={`删除 ${p.displayName || p.name}`} onClick={() => setDeleteTarget(p)}>
              <Trash2 className="h-4 w-4" />删除
            </Button>
            <ChevronRight className="text-muted-foreground" />
          </div>
        ))}
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除 {deleteTarget?.displayName || deleteTarget?.name}？</DialogTitle>
            <DialogDescription>
              将停止这个 Agent 并移除本机绑定。飞书应用、群聊和项目文件会保留，之后可重新绑定。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={deleting} onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button variant="destructive" disabled={deleting} onClick={confirmDelete}>{deleting ? '删除中…' : '确认删除'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建 Agent</DialogTitle>
          </DialogHeader>
          <OnboardWizard
            onCreated={(name) => {
              setCreating(false);
              load();
              onOpen(name);
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!stopTarget} onOpenChange={(o) => !o && setStopTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>停止 {stopTarget}？</DialogTitle>
            <DialogDescription>
              将停止该 profile 正在运行的 bot。若它是后台服务，会一并禁用自动重启（不会被 KeepAlive 拉起）；
              下次可用 <code>lark-channel-bridge start</code> 重新启动。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStopTarget(null)} disabled={stopping}>取消</Button>
            <Button variant="destructive" onClick={confirmStop} disabled={stopping}>
              {stopping ? "停止中…" : "确认停止"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
