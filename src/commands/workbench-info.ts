import { discoverSkills, type WorkbenchSkill } from '../agent/workbench-skills';
import type { ProfileConfig } from '../config/profile-schema';

const PAGE_SIZE = 8;
const text = (value: string) => value.replace(/[\\`*_\[\]<>]/g, c => ({ '<': '&lt;', '>': '&gt;' }[c] ?? `\\${c}`));
const roles: Record<string, string> = { 'product-manager': '产品经理', developer: '研发', inspector: '巡检' };

/** Local configuration only: listing a resource never proves current read/write access. */
export function workbenchInfo(
  profile: ProfileConfig,
  chatId: string,
  args = '',
  discover: (cwd?: string) => WorkbenchSkill[] = discoverSkills,
): string | undefined {
  if (!profile.workbench) return undefined;
  const group = profile.workbench.groups[chatId];
  if (!group) return '当前对话没有绑定群角色、Skills 或资料。请到已配置的群内发送 /status 查看本群清单。';
  const resources = [...new Set([
    ...(group.resources ?? []),
    group.project?.requirements,
    group.project?.bugs,
  ].filter((v): v is string => Boolean(v)))];
  const ids = group.skills ?? [];
  const totalPages = Math.max(1, Math.ceil(Math.max(resources.length, ids.length) / PAGE_SIZE));
  const requested = /^\d+$/.test(args.trim()) ? Number(args.trim()) : 1;
  const page = Math.max(1, Math.min(totalPages, requested));
  const offset = (page - 1) * PAGE_SIZE;
  const lines = [
    '**本群机器人配置**',
    `群：${text(group.name || chatId)} · ${group.enabled ? '已启用' : '未启用'}`,
    `角色：${text(roles[group.role ?? ''] ?? group.role ?? '未设置')}`,
    ...(group.rolePrompt ? [`职责：${text(group.rolePrompt.slice(0, 600))}`] : []),
    `项目：${text(group.project?.name || '未设置')}`,
    '使用：群成员均可使用；配置由创建者管理。',
    '飞书资料身份：机器人身份，不代表提问者本人的权限。',
    '',
    '**个性化要求**',
    group.persona ? text(group.persona.slice(0, 600)) + (group.persona.length > 600 ? '\n（仅显示前 600 字，完整设置由创建者在工作台查看）' : '') : '未设置。',
    '',
    `**已绑定 Skills（${ids.length} 个）**`,
  ];
  if (!ids.length) lines.push('未选择。');
  else {
    try {
      const catalog = new Map(discover(group.workspace || undefined).map(s => [s.id, s]));
      for (const id of ids.slice(offset, offset + PAGE_SIZE)) {
        const skill = catalog.get(id);
        lines.push(skill ? `- ${text(skill.name)}${skill.description ? `：${text(skill.description.slice(0, 120))}` : ''}` : '- 技能文件已移动或删除，请创建者重新选择。');
      }
    } catch { lines.push('技能目录暂时无法读取；绑定数量不代表文件可用。'); }
  }
  lines.push('', `**已配置资料（${resources.length} 份；本次未验证访问权限）**`);
  if (!resources.length) lines.push('未配置资料链接。');
  for (const [i, link] of resources.slice(offset, offset + PAGE_SIZE).entries()) {
    // Config can be edited on disk; never render arbitrary schemes or @ markup.
    try {
      const u = new URL(link);
      if (u.protocol !== 'https:' || u.username || u.password || !/(^|\.)(feishu\.cn|larksuite\.com)$/.test(u.hostname)) throw new Error('invalid');
      const label = link === group.project?.requirements ? '需求表' : link === group.project?.bugs ? '缺陷表' : `资料 ${offset + i + 1}`;
      const safeUrl = u.href.replace(/[()<>]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
      lines.push(`- [${label}](${safeUrl})`);
    } catch { lines.push(`- 资料 ${offset + i + 1}：链接格式无效，请创建者检查。`); }
  }
  if (group.documents.length) lines.push(`旧严格文档白名单 ${group.documents.length} 份仍会阻止执行，请创建者检查配置。`);
  lines.push('', '资料是否可读以实际访问结果为准，可由创建者在工作台执行“检查资料访问权限”。资料清单不是严格访问白名单；Skills 清单不代表本次任务已经使用。');
  if (totalPages > 1) lines.push(`清单第 ${page}/${totalPages} 页；发送 /status ${page < totalPages ? page + 1 : 1} 翻页。`);
  return lines.join('\n');
}
