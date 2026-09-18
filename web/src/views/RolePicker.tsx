import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
const presets = [
  { id: 'coordinator', name: '组织者 · 按共享手册协调任务', skill: 'lark-doc' },
  { id: 'product-manager', name: '产品经理 · 整理需求', skill: 'collaborator-product-manager' },
  { id: 'developer', name: '研发 · 修复与实现', skill: 'collaborator-developer' },
  { id: 'inspector', name: '巡检 · 检查问题', skill: 'collaborator-inspector' },
];
export function RolePicker({ role = '', rolePrompt = '', templates, onChange }: {
  role?: string; rolePrompt?: string; templates: { role?: string; rolePrompt?: string }[];
  onChange: (value: { role: string; rolePrompt: string }, skill?: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const preset = presets.find(p => p.id === role);
  const custom = adding || (!!role && !preset);
  const saved = [...new Map(templates.filter(t => t.role && !presets.some(p => p.id === t.role)).map(t => [t.role!, t])).values()];
  return <div className="space-y-3">
    <select aria-label="工作角色" className="w-full rounded-md border bg-background p-2" value={adding ? '__new__' : role} onChange={e => {
      const value = e.target.value;
      setAdding(value === '__new__');
      if (value === '__new__') { onChange({ role: '', rolePrompt: '' }); return; }
      const template = saved.find(t => t.role === value);
      onChange({ role: value, rolePrompt: template?.rolePrompt ?? '' }, presets.find(p => p.id === value)?.skill);
    }}>
      <option value="">请选择角色</option>
      <optgroup label="预设角色">{presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
      {saved.length > 0 && <optgroup label="自定义角色">{saved.map(t => <option key={t.role} value={t.role}>{t.role}</option>)}</optgroup>}
      <option value="__new__">＋ 新增自定义角色</option>
    </select>
    {custom && <div className="space-y-1.5"><Label htmlFor="custom-role">角色名称</Label><Input id="custom-role" maxLength={80} value={role} placeholder="例如：自媒体选题策划" onChange={e => onChange({ role: e.target.value, rolePrompt })} /></div>}
    <div className="space-y-1.5"><Label htmlFor="role-prompt">{custom ? '角色职责' : '职责与能力边界（参与协作必填）'}</Label><textarea id="role-prompt" maxLength={8000} className="min-h-24 w-full rounded-md border bg-background p-3 text-sm" value={rolePrompt} placeholder="我负责：……；能交付：……；可使用的资料与工具：……；不负责/需人确认：……；缺信息时向谁询问：……" onChange={e => onChange({ role, rolePrompt: e.target.value })} /><p className="text-xs text-muted-foreground">请每位拥有者写清职责、交付物和能力边界。组织者按本群描述派活；描述不授予权限，技能仍在下方选择。</p></div>
  </div>;
}
