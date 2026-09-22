import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { CheckCircle2 } from "lucide-react";
import { api, apiGet, apiPost } from "@/lib/api";
import type { AgentKind, OnboardState } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";

// New-profile wizard: scan a Feishu QR to create a fresh app (same flow as the
// CLI `registerApp` wizard). The QR renders immediately; once scanned, the user
// names the new profile and confirms — so there's no rush and it never
// overwrites an existing profile.
type Phase = "loading" | "waiting" | "confirm" | "creating" | "saving" | "error";

function uniqueName(base: string, existing: string[]): string {
  if (!existing.includes(base)) return base;
  let i = 2;
  while (existing.includes(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

function QrWizard({ onCreated, mode = 'new' }: { onCreated: (profile: string) => void; mode?: 'existing'|'new' }) {
  const [agentKind, setAgentKind] = useState<AgentKind>("claude");
  const [profileName, setProfileName] = useState("");
  const [botName, setBotName] = useState("");
  const [detected, setDetected] = useState<AgentKind[]>([]);
  const [existing, setExisting] = useState<string[]>([]);
  const [qr, setQr] = useState<{ sessionId: string; qrUrl: string; expireIn: number } | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");

  const onCreatedRef = useRef(onCreated);
  useEffect(() => { onCreatedRef.current = onCreated; }, [onCreated]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanned = useRef(false);
  const generation = useRef(0);
  const activeSession = useRef<string | null>(null);
  const pollingSession = useRef<string | null>(null);
  const [pollError, setPollError] = useState('');

  useEffect(() => {
    apiGet<OnboardState>("/api/onboard/state")
      .then((s) => {
        setDetected(s.detectedAgents);
        setExisting(s.profiles);
        if (s.detectedAgents.length && !s.detectedAgents.includes("claude"))
          setAgentKind(s.detectedAgents[0]!);
      })
      .catch(() => {});
  }, []);

  const stopPolling = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  async function generate() {
    stopPolling();
    const current = ++generation.current;
    activeSession.current = null;
    setPollError('');
    scanned.current = false;
    setQr(null);
    setPhase("loading");
    try {
      const r = await apiPost<{ sessionId: string; qrUrl: string; expireIn: number }>(
        "/api/profiles/qr/start",
        {mode},
      );
      if (generation.current !== current) return;
      activeSession.current = r.sessionId;
      setQr(r);
      setPhase("waiting");
      timer.current = setInterval(() => void poll(r.sessionId), 2000);
      void poll(r.sessionId);
    } catch (e) {
      if (generation.current !== current) return;
      setPhase("error");
      toast.error(String((e as Error).message ?? e));
    }
  }

  async function poll(sessionId: string) {
    if (activeSession.current !== sessionId || pollingSession.current === sessionId || scanned.current) return;
    pollingSession.current = sessionId;
    let s: { status: string; profile?: string; error?: string; botName?: string; suggestedProfile?: string };
    try {
      s = await api(`/api/profiles/qr/status?sessionId=${encodeURIComponent(sessionId)}`, { signal: AbortSignal.timeout(10000) });
    } catch {
      if (activeSession.current === sessionId) setPollError('暂时无法获取绑定结果，正在重试…');
      return;
    } finally {
      if (pollingSession.current === sessionId) pollingSession.current = null;
    }
    if (activeSession.current !== sessionId) return;
    setPollError('');
    if (s.status === 'saving') { setPhase('saving'); return; }
    if (s.status === "done" && s.profile && !scanned.current) {
      scanned.current = true;
      stopPolling();
      toast.success(`机器人「${s.profile}」已保存，请继续配置`);
      onCreatedRef.current(s.profile);
      return;
    }
    if (s.status === "scanned" && !scanned.current) {
      scanned.current = true;
      stopPolling();
      // App created — prefill the profile name from the scanned app's name.
      setBotName(s.botName ?? "");
      setProfileName(s.suggestedProfile || uniqueName(agentKind, existing));
      setPhase("confirm");
    } else if (s.status === "error") {
      stopPolling();
      setPhase("error");
      toast.error(s.error ?? "扫码创建失败");
    }
  }

  async function confirmCreate() {
    if (!qr) return;
    setPhase("creating");
    try {
      const r = await apiPost<{ profile: string }>("/api/profiles/qr/finish", {
        sessionId: qr.sessionId,
        agentKind,
        profile: profileName.trim(),
      });
      toast.success(`profile「${r.profile}」已创建`);
      onCreatedRef.current(r.profile);
    } catch (e) {
      setPhase("confirm"); // let the user fix the name / retry
      toast.error(String((e as Error).message ?? e));
    }
  }

  // Auto-render the QR on open.
  useEffect(() => {
    void generate();
    const refresh = () => { if (activeSession.current) void poll(activeSession.current); };
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => {
      ++generation.current;
      activeSession.current = null;
      stopPolling();
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', visible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === 'saving') return <div role="status" className="space-y-3 py-10 text-center">
    <CheckCircle2 className="mx-auto size-10 text-emerald-600" />
    <p className="font-medium">已授权，正在保存 Bot…</p>
    <p className="text-sm text-muted-foreground">完成后自动关闭并进入配置</p>
    {pollError && <p className="text-sm text-destructive">{pollError}</p>}
  </div>;

  if (phase === "confirm" || phase === "creating") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-success">
          <CheckCircle2 className="size-4" /> 应用已创建{botName ? `：${botName}` : ""}，确认后完成
        </div>
        <div className="space-y-1.5">
          <Label>AI 引擎</Label>
          <Select value={agentKind} onValueChange={(v) => setAgentKind(v as AgentKind)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {([ ["claude", "Claude Code"], ["codex", "Codex"], ["hermes", "Hermes"], ["openclaw", "OpenClaw"] ] as const).map(([kind, label]) => <SelectItem key={kind} value={kind} disabled={!detected.includes(kind)}>{label}{!detected.includes(kind) ? "（未安装）" : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Bot 名称</Label>
          <Input
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            placeholder={agentKind}
          />
          {existing.includes(profileName.trim()) && (
            <p className="text-xs text-destructive">已存在同名 profile，请换个名字（不会覆盖现有的）。</p>
          )}
        </div>
        <div className="flex justify-end">
          <Button
            onClick={confirmCreate}
            disabled={phase === "creating" || !detected.includes(agentKind) || !profileName.trim() || existing.includes(profileName.trim())}
          >
            {phase === "creating" ? "创建中…" : "确定创建"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-3 py-2">
        <div className="flex size-[232px] items-center justify-center rounded-lg border bg-white p-4">
          {qr ? (
            <QRCodeSVG value={qr.qrUrl} size={200} />
          ) : (
            <span className="text-sm text-muted-foreground">
              {phase === "error" ? "二维码生成失败" : "生成二维码中…"}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {phase === "error" ? "请重试" : (mode === "existing" ? "扫码或打开飞书授权页，选择已有应用并确认；完成后自动绑定到工作台" : "用飞书扫码或在浏览器创建；成功后自动保存到工作台，再设置名称和引擎")}
        </p>
        {qr && (
          <p className="text-xs text-muted-foreground">
            有效期约 {Math.max(1, Math.round(qr.expireIn / 60))} 分钟 ·{" "}
            <a href={qr.qrUrl} target="_blank" rel="noreferrer" className="text-primary underline">{mode === "existing" ? "打开飞书，选择已有应用" : "在浏览器打开"}</a>
          </p>
        )}
        {(phase === "error" || phase === "waiting") && (
          <Button variant="outline" size="sm" onClick={generate}>重新生成</Button>
        )}
      </div>
      {pollError && <p role="status" className="text-center text-sm text-destructive">{pollError}</p>}
      {detected.length === 0 && (
        <p className="text-center text-xs text-muted-foreground">未检测到已安装的 agent，请先安装 Codex、Claude Code、Hermes 或 OpenClaw。</p>
      )}
      <p className="text-center text-xs text-muted-foreground">扫码创建者管理配置；所有成员均可使用已启用的群，新群默认不启用。</p>
    </div>
  );
}


export function OnboardWizard({onCreated,defaultMode='existing'}:{onCreated:(profile:string)=>void;defaultMode?:'existing'|'new'}) {
 const [mode,setMode]=useState<'existing'|'new'|'manual'>(defaultMode);
 return <div className="space-y-4"><div className="flex gap-2" role="tablist" aria-label="添加方式">
 <Button role="tab" aria-selected={mode==='existing'} variant={mode==='existing'?'default':'outline'} onClick={()=>setMode('existing')}>绑定已有应用</Button>
 <Button role="tab" aria-selected={mode==='new'} variant={mode==='new'?'default':'outline'} onClick={()=>setMode('new')}>扫码新建应用</Button></div>
 {mode==='manual'?<ExistingApp onCreated={onCreated}/>:<QrWizard key={mode} mode={mode} onCreated={onCreated}/>}
 <Button variant="ghost" size="sm" onClick={()=>setMode(mode==='manual'?'existing':'manual')}>{mode==='manual'?'返回扫码选择应用':'备用：手动填写应用凭据'}</Button></div>;
}
function ExistingApp({onCreated}:{onCreated:(profile:string)=>void}) {
 const [appId,setAppId]=useState(''),[secret,setSecret]=useState(''),[name,setName]=useState('');
 const [tenant,setTenant]=useState('feishu'),[engine,setEngine]=useState<AgentKind>('codex');
 const [agents,setAgents]=useState<AgentKind[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [verified,setVerified]=useState<string|null>(null);
 useEffect(()=>{apiGet<OnboardState>('/api/onboard/state').then(s=>{setAgents(s.detectedAgents);setEngine(s.detectedAgents.includes('codex')?'codex':s.detectedAgents[0]??'codex');}).catch(()=>setError('无法读取本机引擎，请重新打开'));},[]);
 async function validate(){setBusy(true);setError('');setVerified(null);try{const r=await apiPost<{botName?:string}>('/api/profiles/validate',{appId:appId.trim(),appSecret:secret.trim(),tenant});setVerified(r.botName||appId.trim());if(!name.trim())setName(r.botName||appId.trim());}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function bind(){setBusy(true);setError('');try{const r=await apiPost<{profile:string}>('/api/profiles',{profile:name.trim(),agentKind:engine,appId:appId.trim(),appSecret:secret.trim(),tenant});setSecret('');toast.success('已有应用已绑定，继续配置群与工作空间');onCreated(r.profile);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <div className="space-y-3">
 <p className="text-sm text-muted-foreground">打开已创建应用的「凭证与基础信息」，填入 App ID 和 App Secret。验证后绑定到本工作台。</p>
 <a className="text-sm text-primary underline" href={tenant==='lark'?'https://open.larksuite.com/app':'https://open.feishu.cn/app'} target="_blank" rel="noreferrer">打开应用后台，选择已有应用</a>
 <div><Label htmlFor="bind-tenant">平台</Label><select id="bind-tenant" className="w-full border rounded p-2" value={tenant} disabled={busy} onChange={e=>{setTenant(e.target.value);setVerified(null);}}><option value="feishu">飞书</option><option value="lark">Lark</option></select></div>
 <div><Label htmlFor="bind-app-id">App ID</Label><Input id="bind-app-id" value={appId} placeholder="cli_…" disabled={busy} onChange={e=>{setAppId(e.target.value);setVerified(null);}}/></div>
 <div><Label htmlFor="bind-app-secret">App Secret</Label><Input id="bind-app-secret" type="password" autoComplete="off" value={secret} disabled={busy} onChange={e=>{setSecret(e.target.value);setVerified(null);}}/></div>
 <Button variant="outline" disabled={busy||!appId.trim()||!secret.trim()} onClick={()=>void validate()}>验证应用</Button>
 {verified&&<p role="status" className="text-sm text-emerald-600">验证成功：{verified}</p>}
 <div><Label htmlFor="bind-name">工作台中的名称</Label><Input id="bind-name" value={name} disabled={busy} onChange={e=>setName(e.target.value)}/></div>
 <div><Label htmlFor="bind-engine">本机引擎</Label><select id="bind-engine" className="w-full border rounded p-2" disabled={busy} value={engine} onChange={e=>setEngine(e.target.value as AgentKind)}>{agents.map(a=><option key={a} value={a}>{a}</option>)}</select></div>
 {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 <p className="text-xs text-muted-foreground">凭据加密保存在本机。绑定后先配置工作群，再启动机器人。</p>
 <Button disabled={busy||!verified||!name.trim()||!agents.includes(engine)} onClick={()=>void bind()}>{busy?'处理中…':'绑定此应用'}</Button>
 </div>;
}
