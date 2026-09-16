import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { CommandContext } from '../commands/index';

export const projectRunContext = new AsyncLocalStorage<NodeJS.ProcessEnv>();
// Both source execution and the bundled dist/cli.js locate packaged resources.
export function registryScript(moduleUrl = import.meta.url): string {
  const path = fileURLToPath(new URL(moduleUrl.includes('/src/team/') ? '../../resources/project_registry.py' : '../resources/project_registry.py', moduleUrl));
  // Python is an external process: Electron's virtual ASAR filesystem is not
  // available to it. electron-builder unpacks resources beside app.asar.
  return path.replace(/([/\\])app\.asar([/\\])/, '$1app.asar.unpacked$2');
}
const shellQuote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;
export function projectBindingHint(profile: string, chatId: string, topicId?: string): string {
  const command = `python3 ${shellQuote(registryScript())} show --profile ${shellQuote(profile)} --chat ${shellQuote(chatId)}${topicId ? ' --topic ' + shellQuote(topicId) : ''}`;
  return `仅在需要读取或修改项目源码、产品、需求表、Bug表等项目资源时，先执行 ${command}。使用返回的源码、网址、表格，不用Skill旧项目常量；未绑定或检查失败只停止项目资源读写。新项目先验证表字段和权限。\n` +
    `读取、搜索或总结当前群聊天不依赖项目绑定，不执行项目绑定脚本，也不加载无关的项目巡检流程；即使之前项目检查失败也可继续群消息任务。需要群历史时使用本群启用的飞书IM技能，按当前群ID ${chatId} 主动读取消息，不把本次@消息当作完整历史。保持当前机器人配置和身份权限，不能切换其他账号绕过权限；读取失败时说明真实错误和已读取范围，不编造总结。`;
}
export interface ProjectBinding {
  role: string; chat_id: string; topic_id?: string | null; missing: string[];
  configured: boolean; workspace?: string | null;
  [key: string]: unknown;
}
export function readProject(ctx: CommandContext, action = 'show', field?: string, value?: string): ProjectBinding {
  const args = [registryScript(), action, '--profile', ctx.controls.profile, '--chat', ctx.msg.chatId,
    '--cwd', ctx.workspaces.cwdFor(ctx.scope) ?? ctx.controls.profileConfig.workspaces.default ?? ''];
  if (ctx.chatMode === 'topic' && ctx.msg.threadId) args.push('--topic', ctx.msg.threadId);
  if (field) args.push('--field', field, '--value', value ?? '');
  try {
    return JSON.parse(execFileSync(process.platform === 'win32' ? 'python' : 'python3', args, { encoding: 'utf8', timeout: 5000, env: {
      ...process.env, LARK_CHANNEL_HOME: dirname(ctx.controls.configPath),
    } }));
  } catch (e) {
    let message = '配置工具执行失败';
    try { message = JSON.parse(String((e as { stdout?: unknown }).stdout)).error ?? message; } catch { /* no credential output */ }
    throw new Error(message);
  }
}
const plain = (v: unknown) => String(v || '未设置').replace(/[\\`*_\[\]<>]/g, '\\$&');
const link = (url: unknown, label: string) => url ? `[${label}](${encodeURI(String(url)).replace(/\(/g, '%28').replace(/\)/g, '%29')})` : '未设置';
export function projectCardText(b: ProjectBinding): string {
  const lines = [`**项目绑定｜${plain(b.role)}**`, `**产品：** ${plain(b.product_name)}`,
    `**网址：** ${link(b.product_url, '打开产品')}`, `**源码目录：** ${plain(b.project_workspace)}`,
    `**项目工作目录：** ${plain(b.workspace)}`];
  for (const [label, key] of [['需求表', 'requirements_url'], ['Bug表', 'bugs_url'], ['巡检记录', 'records_url'], ['巡检方向', 'directions_url'], ['探索日志', 'logs_url']] as const)
    lines.push(`**${label}：** ${link(b[key], `打开${label}`)}`);
  lines.push(`**回执：** 仅当前${b.topic_id ? 'Topic' : '群'}`, b.missing.length ? '**待配置：** ' + plain(b.missing.join('、')) : '必填配置已齐；表权限和业务流程需单独验证。', '设置命令：`/project help`');
  return lines.join('\n');
}
export const PROJECT_HELP = `/project show
/project set name 产品名称
/project set url https://产品入口
/project set repo /绝对源码目录
/project set requirements 飞书需求表链接
/project set bugs 飞书Bug表链接
/project set records 飞书巡检记录链接
/project set directions 飞书方向表链接
/project set logs 飞书探索日志链接
配置仅影响当前机器人和当前群/Topic。/cd 切换项目工作目录；repo指定源码，不改执行权限。定时任务不会自动新增。`;
export async function handleProject(args: string, ctx: CommandContext, reply: (ctx: CommandContext, text: string) => Promise<void>, admin: boolean): Promise<void> {
  const s = args.trim();
  try {
    if (!s || s === 'show') { await reply(ctx, projectCardText(readProject(ctx))); return; }
    if (s === 'help') { await reply(ctx, PROJECT_HELP); return; }
    if (!admin) { await reply(ctx, '只有机器人创建者/管理员可以修改项目绑定。'); return; }
    if (ctx.activeRuns.get(ctx.scope)) { await reply(ctx, '当前还有任务运行，请等任务结束或先 /stop，再修改项目绑定。'); return; }
    const m = s.match(/^set\s+(\S+)\s+(.+)$/s);
    if (!m) { await reply(ctx, PROJECT_HELP); return; }
    const b = readProject(ctx, 'set', m[1], m[2]); ctx.sessions.clear(ctx.scope);
    await reply(ctx, '已保存，仅影响当前机器人和当前群/Topic；对话已重置。\n' + projectCardText(b));
  } catch (e) { await reply(ctx, '项目配置操作失败：' + (e as Error).message); }
}
