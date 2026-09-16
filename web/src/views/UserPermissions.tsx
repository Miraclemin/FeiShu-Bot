import { useEffect, useState } from 'react';
import { CheckCircle2, CircleDashed } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { apiGet, apiPost } from '@/lib/api';
import type { DeviceLogin, UserAuthStatus } from '@/lib/types';
import { Button } from '@/components/ui/button';

export function UserPermissions({ profile, refreshKey }: { profile: string; refreshKey: number }) {
  const [status, setStatus] = useState<UserAuthStatus | null>(null);
  const [login, setLogin] = useState<DeviceLogin | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const granted = (scope: string) => !!status?.loggedIn && status.scopes.includes(scope);
  const ready = granted('im:chat:read') && granted('im:chat.members:write_only');
  async function refresh() { setStatus(await apiGet<UserAuthStatus>(`/api/auth/status?profile=${encodeURIComponent(profile)}`)); }
  useEffect(() => {
    let cancelled = false;
    const check = () => apiGet<UserAuthStatus>(`/api/auth/status?profile=${encodeURIComponent(profile)}`).then(s => { if (!cancelled) { setStatus(s); setError(''); } }).catch(() => { if (!cancelled) { setStatus(null); setError('暂时无法检查个人授权'); } });
    void check(); window.addEventListener('focus', check);
    return () => { cancelled = true; window.removeEventListener('focus', check); };
  }, [profile, refreshKey]);
  async function authorize() {
    setBusy(true); setError('');
    try { setLogin(await apiPost<DeviceLogin>('/api/auth/login/start', { profile, scopes: ['im:chat:read', 'im:chat.members:write_only'] })); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function complete() {
    if (!login) return;
    setBusy(true); setError('');
    try {
      await apiPost('/api/auth/login/complete', { profile, deviceCode: login.deviceCode });
      await refresh(); setLogin(null);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <div id="user-permissions" className="space-y-3 border-t pt-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-medium">个人授权</h4>{status?.loggedIn && status.userName && <span className="text-xs text-muted-foreground">{status.userName}</span>}</div>
    <div className="divide-y">{[['查看我的群', 'im:chat:read'], ['添加群成员（拉机器人进群）', 'im:chat.members:write_only']].map(([label, scope]) => {
      const ok = granted(scope!);
      return <div key={scope} className="flex items-center justify-between gap-4 py-2.5 text-sm"><span className="text-muted-foreground">{label}</span><span className={`inline-flex shrink-0 items-center gap-1.5 ${ok ? 'text-emerald-600' : 'text-muted-foreground'}`}>{ok ? <CheckCircle2 className="h-4 w-4" /> : <CircleDashed className="h-4 w-4" />}{status ? ok ? '已授权' : '未授权' : '未核验'}</span></div>;
    })}</div>
    {!login && <Button id="authorize-my-groups" variant="outline" disabled={busy || ready} onClick={authorize}>{busy ? '准备授权…' : ready ? '个人权限已授权' : '授权我的群与添加成员'}</Button>}
    {login && <div className="space-y-3 rounded-lg border bg-muted/20 p-4 text-center">
      <p className="text-sm">授权查看我的群与添加群成员</p>
      <div className="mx-auto w-fit rounded-lg bg-white p-3"><QRCodeSVG value={login.verificationUrl} size={160} /></div>
      <a className="block text-sm text-primary underline" href={login.verificationUrl} target="_blank" rel="noreferrer">在浏览器打开授权</a>
      {login.userCode && <p className="text-xs text-muted-foreground">验证码：{login.userCode}</p>}
      <div className="flex justify-center gap-2"><Button onClick={complete} disabled={busy}>{busy ? '确认中…' : '我已完成授权'}</Button><Button variant="ghost" disabled={busy} onClick={() => setLogin(null)}>取消</Button></div>
    </div>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>;
}
