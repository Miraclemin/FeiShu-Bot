import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';
import { Button } from '@/components/ui/button';
const permissions = JSON.stringify({ scopes: { tenant: [], user: ['contact:user:search', 'im:chat:read'] } }, null, 2);
export function PermissionGuide({ profile }: { profile: string }) {
  const [url, setUrl] = useState('https://open.feishu.cn/app');
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  useEffect(() => {
    let active = true;
    apiGet<{ appId: string; tenant: string }>(`/api/workbench?profile=${encodeURIComponent(profile)}`).then(r => {
      if (active && /^cli_[a-zA-Z0-9]+$/.test(r.appId)) setUrl(`https://${r.tenant === 'lark' ? 'open.larksuite.com' : 'open.feishu.cn'}/app/${r.appId}/auth`);
    }).catch(() => {});
    return () => { active = false; };
  }, [profile]);
  return <div className="rounded-lg border bg-muted/30 p-3 space-y-3 text-sm">
    <p className="font-medium">首次配置：开通应用权限 → 发布 → 扫码</p>
    <ol className="list-decimal pl-5 space-y-2">
      <li>点击下方“复制权限配置”，打开本应用的权限管理，选择“批量导入／导出权限”，粘贴后确认开通。</li>
      <li>到“版本管理与发布”创建并发布版本；如企业要求管理员审批，等审批生效。</li>
      <li>回到这里点击授权按钮，用你想查询群和联系人的飞书账号扫码，再点击“我已完成授权”。</li>
    </ol>
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={async () => { try { const desktop = (window as unknown as { workbenchDesktop?: { copyQueryPermissions?: () => Promise<boolean> } }).workbenchDesktop; if (desktop?.copyQueryPermissions) await desktop.copyQueryPermissions(); else await navigator.clipboard.writeText(permissions); setCopied(true); setCopyError(false); } catch { setCopyError(true); } }}>{copied ? '已复制权限配置' : '复制权限配置'}</Button>
      <Button size="sm" variant="outline" asChild><a href={url} target="_blank" rel="noreferrer">打开本应用权限管理</a></Button>
    </div>
    <p className="text-xs text-muted-foreground">这份配置只申请“搜索人员”和“查看群”两个用户权限，不包含文档、邮箱或代发消息权限。已有机器人权限无需删除。导入不等于已生效，仍需你确认开通、发布和扫码。</p>
    <details open={copyError || undefined}><summary className="cursor-pointer text-xs">查看／手动复制权限 JSON</summary><textarea aria-label="可导入的权限配置" readOnly className="mt-2 w-full h-44 border rounded p-2 font-mono text-xs" value={permissions} onFocus={e => e.target.select()} /></details>
  </div>;
}
