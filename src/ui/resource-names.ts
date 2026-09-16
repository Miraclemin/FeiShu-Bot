import type { LarkChannel } from '@larksuite/channel';
import { listBaseTables } from './base-picker';

export async function resourceNames(profile: string, links: string[], channel: LarkChannel | undefined, rootDir?: string) {
  const bases = new Map<string, Promise<Awaited<ReturnType<typeof listBaseTables>>>>();
  const items = [];
  for (const link of links) {
    let type = '资料', name = '', error = '';
    try {
      const u = new URL(link);
      if (u.protocol !== 'https:' || u.username || u.password || !/(^|\.)(feishu\.cn|larksuite\.com)$/.test(u.hostname)) throw new Error('不支持的资料链接');
      const [, kind, token] = u.pathname.split('/');
      const types = { docx: 'docx', doc: 'doc', sheets: 'sheet', base: 'bitable', wiki: 'wiki' } as const;
      const docType = types[kind as keyof typeof types];
      if (!docType || !token || !/^[a-zA-Z0-9]+$/.test(token)) throw new Error('无法识别资料链接');
      type = kind === 'base' ? '多维表格' : kind === 'sheets' ? '电子表格' : kind === 'wiki' ? '知识库文档' : '文档';
      if (kind === 'base' && u.searchParams.get('table')) {
        const base = `${u.origin}${u.pathname}`;
        if (!bases.has(base)) bases.set(base, listBaseTables(profile, base, 0, rootDir));
        const page = await bases.get(base)!;
        name = page.tables.find(t => t.id === u.searchParams.get('table'))?.name ?? '';
        if (!name) throw new Error('未找到表名');
      } else {
        if (!channel) throw new Error('启动机器人后可读取名称');
        const r = await channel.rawClient.drive.meta.batchQuery({ data: { request_docs: [{ doc_token: token, doc_type: docType }] } });
        name = r.data?.metas?.[0]?.title ?? '';
        if (r.code || !name) throw new Error('名称读取失败，请检查资料权限');
      }
    } catch (e) { error = e instanceof Error ? e.message : '名称读取失败'; }
    items.push({ url: link, name, type, error });
  }
  return { items };
}
