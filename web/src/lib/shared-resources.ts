export function sharedResourceLinks(text: string): string[] {
  const candidates = text.match(/https:\/\/[^\s<>"'`，。；）)]+/g) ?? [];
  const links = [...new Set(candidates.filter(value => {
    try { const u = new URL(value); return !u.username && !u.password && /(^|\.)(feishu\.cn|larksuite\.com)$/.test(u.hostname) && /^\/(docx|docs|wiki|base|sheets)\//.test(u.pathname); } catch { return false; }
  }))];
  if (!links.length) throw new Error('没有识别到飞书文档、知识库、表格链接，请粘贴完整的 HTTPS 链接');
  if (links.length > 300) throw new Error('最多导入 300 份资料');
  return links;
}
export function resourceShareText(name: string, links: string[]) {
  return `【${name || '团队'} · 共享资料】\n${links.join('\n')}\n\n在 FeiShu Bot 中打开对应 Bot → 选择群 → 从飞书导入资料清单，粘贴以上内容。检查访问权限并保存后，Bot 可按需读取原文。新增链接需要再次导入；飞书授权独立配置。`;
}
