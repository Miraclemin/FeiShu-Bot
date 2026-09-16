import { AgentAvatar, mascotOptions } from '@/components/AgentAvatar';
import { defaultAvatarId } from '../../../src/config/avatar';
import { WorkbenchView } from './WorkbenchView';
import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Pencil } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import type { BotInfo, ProfileInfo } from "@/lib/types";
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
import { ConfigView } from "./ConfigView";

export function ProfileDetail({ profile, onBack }: { profile: string; onBack: () => void }) {
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [info, setInfo] = useState<ProfileInfo | null>(null);
  const [bots, setBots] = useState<BotInfo[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');

  const loadRuntime = useCallback(async () => {
    const [pr, bt] = await Promise.all([
      apiGet<{ profiles: ProfileInfo[] }>("/api/profiles").catch(() => ({ profiles: [] })),
      apiGet<{ bots: BotInfo[] }>("/api/bots").catch(() => ({ bots: [] })),
    ]);
    setInfo(pr.profiles.find((p) => p.name === profile) ?? null);
    setBots(bt.bots.filter((b) => b.profileName === profile));
  }, [profile]);

  useEffect(() => {
    void loadRuntime();
    const t = setInterval(loadRuntime, 5000);
    return () => clearInterval(t);
  }, [loadRuntime]);

  async function confirmStop() {
    setStopping(true);
    try {
      await apiPost("/api/profiles/stop", { profile });
      toast.success(`已停止 ${profile}`);
      setConfirm(false);
      setTimeout(loadRuntime, 500);
    } catch (e) {
      toast.error(String((e as Error).message ?? e));
    } finally {
      setStopping(false);
    }
  }

  async function start() {
    setStarting(true); setStartError('');
    try {
      await apiPost("/api/profiles/start", { profile });
      toast.success(`已启动 ${profile}`);
      setTimeout(loadRuntime, 500);
    } catch (e) {
      setStartError(String((e as Error).message ?? e));
      toast.error(String((e as Error).message ?? e));
    } finally {
      setStarting(false);
    }
  }

  async function saveName() {
    setRenaming(true);
    try {
      await apiPost('/api/profiles/rename', { profile, displayName: draftName });
      await loadRuntime(); setEditing(false); toast.success('名称已保存');
    } catch (e) { toast.error((e as Error).message); }
    finally { setRenaming(false); }
  }
  async function saveAvatar(avatarId: string) {
    setAvatarSaving(true);
    try {
      await apiPost('/api/profiles/avatar', { profile, avatarId });
      setInfo(current => current ? { ...current, avatarId } : current);
      setAvatarOpen(false); toast.success('头像已更新');
    } catch (e) { toast.error((e as Error).message); }
    finally { setAvatarSaving(false); }
  }
  const displayName = info?.displayName || profile;
  const running = info?.running ?? bots.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="返回">
          <ArrowLeft />
        </Button>
        <button aria-label="更换 Agent 头像" title="更换头像" className="shrink-0 rounded-2xl transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-primary" onClick={() => setAvatarOpen(true)}><AgentAvatar profile={profile} avatarId={info?.avatarId} className="size-14" /></button>
        <div className="flex min-w-0 items-center gap-2">
          {editing ? <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); void saveName(); }}>
            <Input aria-label="Agent 名称" autoFocus maxLength={80} value={draftName} disabled={renaming} onChange={e => setDraftName(e.target.value)} />
            <Button size="sm" disabled={renaming || !draftName.trim()}>{renaming ? '保存中…' : '保存'}</Button>
            <Button type="button" size="sm" variant="ghost" disabled={renaming} onClick={() => setEditing(false)}>取消</Button>
          </form> : <><h1 className="text-2xl font-semibold break-all">{displayName}</h1><Button variant="ghost" size="icon" aria-label="编辑 Agent 名称" onClick={() => { setDraftName(displayName); setEditing(true); }}><Pencil /></Button></>}
        </div>
        {info && <Badge variant="secondary">{info.agentKind}</Badge>}
        {running ? <Badge variant="success">在线</Badge> : <Badge variant="outline">未运行</Badge>}
        {running && <Button className="ml-auto" variant="destructive" size="sm" onClick={() => setConfirm(true)}>停止</Button>}
        {!running && (
          <Button className="ml-auto" size="sm" disabled={starting} onClick={start}>
            {starting ? "启动中…" : "启动"}
          </Button>
        )}
      </div>

      {startError && <p role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive">启动失败：{startError}</p>}
      <WorkbenchView profile={profile} onApplied={() => void loadRuntime()} advanced={<details className="rounded-lg border p-4"><summary className="cursor-pointer">飞书连接与高级设置</summary><div className="mt-4"><ConfigView profile={profile} /></div></details>} />

      <Dialog open={avatarOpen} onOpenChange={open => { if (!avatarSaving) setAvatarOpen(open); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>给 Agent 换个头像</DialogTitle>
            <DialogDescription>选一个你喜欢的小搭档，仅更改本软件中的头像。</DialogDescription></DialogHeader>
          <div className="grid grid-cols-3 gap-3">
            {mascotOptions.map(item => <button key={item.id} disabled={avatarSaving}
              aria-label={item.label} aria-pressed={(info?.avatarId ?? defaultAvatarId(profile)) === item.id}
              className="rounded-2xl border-2 border-transparent p-2 text-center transition-colors hover:bg-accent aria-pressed:border-primary disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary"
              onClick={() => void saveAvatar(item.id)}>
              <AgentAvatar profile={profile} avatarId={item.id} className="aspect-square w-full" />
              <span className="mt-2 block text-xs">{item.label}</span>
            </button>)}
          </div>
          {avatarSaving && <p role="status" className="text-sm text-muted-foreground">正在保存…</p>}
        </DialogContent>
      </Dialog>

      <Dialog open={confirm} onOpenChange={(o) => !o && setConfirm(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>停止 {displayName}？</DialogTitle>
            <DialogDescription>
              停止后将不再处理新消息。之后可点击右上角“启动”恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)} disabled={stopping}>取消</Button>
            <Button variant="destructive" onClick={confirmStop} disabled={stopping}>
              {stopping ? "停止中…" : "确认停止"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
