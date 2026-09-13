import { PermissionGuide } from './PermissionGuide';
import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
export function DirectoryAuthorization({ profile, onConnected }: { profile: string; onConnected: () => void }) {
  const [login, setLogin] = useState<{ verificationUrl: string; deviceCode: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function start() {
    setBusy(true); setError('');
    try { setLogin(await apiPost('/api/directory/login/start', { profile })); }
    catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function finish() {
    if (!login) return; setBusy(true); setError('');
    try { await apiPost('/api/auth/login/complete', { profile, deviceCode: login.deviceCode }); setLogin(null); onConnected(); }
    catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <div className="space-y-2 text-xs">
    <p className="text-muted-foreground">人员搜索需要你的飞书账号授权，仅用于此配置页面，不开放给群内 Agent。</p>
    <PermissionGuide profile={profile} />
    <Button size="sm" variant="outline" disabled={busy} onClick={start}>连接／补充人员查询授权</Button>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {login && <div className="space-y-2"><div className="inline-block bg-white p-3"><QRCodeSVG value={login.verificationUrl} size={160} /></div><p><a className="underline" href={login.verificationUrl} target="_blank" rel="noreferrer">或在浏览器打开授权页面</a></p><Button size="sm" disabled={busy} onClick={finish}>我已完成授权，重新查询</Button></div>}
  </div>;
}
