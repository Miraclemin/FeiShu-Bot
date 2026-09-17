import { useEffect, useRef, useState } from 'react';
import { apiGet } from '@/lib/api';
import type { UserAuthStatus } from '@/lib/types';
import { Button } from '@/components/ui/button';
export function DirectoryAuthorization({ profile, onConnected }: { profile: string; onConnected: (ready: boolean) => void }) {
  const [ready, setReady] = useState<boolean | null>(null);
  const [error, setError] = useState(false);
  const callback = useRef(onConnected); callback.current = onConnected;
  useEffect(() => {
    let cancelled = false;
    setReady(null); setError(false);
    async function check() {
      try {
        const status = await apiGet<UserAuthStatus>(`/api/auth/status?profile=${encodeURIComponent(profile)}`);
        if (cancelled) return;
        const ok = status.loggedIn && status.scopes.includes('contact:user:search');
        setReady(ok); setError(false);
        callback.current(ok);
      } catch { if (!cancelled) { setReady(null); setError(true); } }
    }
    const changed = (event: Event) => { if ((event as CustomEvent).detail === profile) void check(); };
    void check(); window.addEventListener('focus',check); window.addEventListener('workbench-auth-changed',changed);
    return () => { cancelled = true; window.removeEventListener('focus',check); window.removeEventListener('workbench-auth-changed',changed); };
  }, [profile]);
  if (ready) return null;
  if (ready === null && !error) return <p className="text-xs text-muted-foreground">正在检查人员搜索授权…</p>;
  return <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
    <span>{error ? '暂时无法检查授权，请到顶部重新检查。' : '尚未授权人员搜索，请到顶部补充个人授权。'}</span>
    <Button size="sm" variant="link" onClick={() => { document.getElementById('user-permissions')?.scrollIntoView({behavior:'smooth',block:'center'}); document.getElementById('authorize-my-groups')?.focus({preventScroll:true}); }}>前往授权设置</Button>
  </div>;
}
