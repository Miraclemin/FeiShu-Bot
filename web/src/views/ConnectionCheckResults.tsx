import { Check, X, ShieldCheck } from 'lucide-react';

type CheckItem = { label: string; ok: boolean; message: string };
export function ConnectionCheckResults({ checks, note }: { checks: CheckItem[]; note: string }) {
  const failed = checks.filter(item => !item.ok).length;
  const sections = [
    { title: '基础配置', items: checks.filter(item => !/^资料/.test(item.label)) },
    { title: '资料访问', items: checks.filter(item => /^资料/.test(item.label)) },
  ];
  return <section aria-label="检查结果" className="overflow-hidden rounded-xl border bg-background">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-4">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${failed ? 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'}`}>
          {failed ? <X className="h-5 w-5" aria-hidden="true" /> : <ShieldCheck className="h-5 w-5" aria-hidden="true" />}
        </div>
        <div role="status"><h4 className="text-sm font-semibold">{failed ? `${failed} 项需要处理` : checks.length ? '全部检查通过' : '暂无检查结果'}</h4><p className="mt-0.5 text-xs text-muted-foreground">{checks.length - failed} / {checks.length} 项通过</p></div>
      </div>
      <span className="rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground">只读检查</span>
    </div>
    <div className="space-y-5 p-4">
      {sections.filter(section => section.items.length).map(section => <div key={section.title}>
        <h5 className="mb-2 text-xs font-medium text-muted-foreground">{section.title}</h5>
        <ul className="space-y-1">{section.items.map(item => <li key={item.label} className={`flex items-start gap-3 rounded-lg px-3 py-3 ${item.ok ? '' : 'bg-red-50/70 dark:bg-red-950/20'}`}>
          <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${item.ok ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' : 'bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400'}`}>
            {item.ok ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <X className="h-3.5 w-3.5" aria-hidden="true" />}
          </span>
          <div className="min-w-0 flex-1"><p className="text-sm font-medium">{item.label}</p><p className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">{item.message}</p></div>
          <span className={`shrink-0 text-xs leading-5 ${item.ok ? 'text-emerald-700 dark:text-emerald-400' : 'font-medium text-red-600 dark:text-red-400'}`}>{item.ok ? '通过' : '未通过'}</span>
        </li>)}</ul>
      </div>)}
    </div>
    {note && <p className="border-t bg-muted/20 px-4 py-3 text-xs leading-relaxed text-muted-foreground">{note}</p>}
  </section>;
}
