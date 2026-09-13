import { isAbsolute } from 'node:path';
export interface GroupWorkspace {
  skillIsolation?: 'strict' | 'catalog';
  enabled: boolean;
  name: string;
  workspace: string;
  persona: string;
  documents: string[];
  skills?: string[];
}
export interface WorkbenchConfig {
  revision: number;
  /** Native CLI cannot enforce a per-document user ACL. No delegation by default. */
  protectDocuments: true;
  groups: Record<string, GroupWorkspace>;
}
export function normalizeWorkbench(value: unknown): WorkbenchConfig | undefined {
  if (value === undefined) return undefined; // existing CLI users migrate explicitly
  if (!value || typeof value !== 'object') throw new Error('工作台配置无效');
  const raw = value as Record<string, unknown>;
  const groups: Record<string, GroupWorkspace> = {};
  for (const [id, value] of Object.entries((raw.groups ?? {}) as object)) {
    if (!/^oc_[a-zA-Z0-9]+$/.test(id) || !value || typeof value !== 'object') throw new Error('群 ID 无效');
    const g = value as Record<string, unknown>;
    const workspace = String(g.workspace ?? '').trim();
    if (workspace && !isAbsolute(workspace)) throw new Error('工作目录必须是绝对路径');
    const documents = Array.isArray(g.documents) ? g.documents.map(String) : [];
    if (documents.length > 100) throw new Error('最多绑定 100 份资料');
    for (const link of documents) {
      const u = new URL(link);
      if (u.protocol !== 'https:' || !/(^|\.)(feishu\.cn|larksuite\.com)$/.test(u.hostname) || u.username || u.password) throw new Error('请填写飞书资料 HTTPS 链接');
    }
    const skills = Array.isArray(g.skills) ? g.skills.map(String) : [];
    if (skills.length > 100 || skills.some(id => !/^[a-f0-9]{24}$/.test(id))) throw new Error('技能选择无效，最多选择 100 个技能');
    if (g.skillIsolation !== undefined && !['strict', 'catalog'].includes(String(g.skillIsolation))) throw new Error('技能隔离模式无效');
    groups[id] = { skillIsolation: g.skillIsolation === 'strict' ? 'strict' : 'catalog', enabled: g.enabled === true, name: String(g.name ?? '').slice(0, 150),
      workspace, persona: String(g.persona ?? '').slice(0, 8000), documents: [...new Set(documents)], skills: [...new Set(skills)] };
  }
  return { revision: Number.isSafeInteger(raw.revision) ? Number(raw.revision) : 0, protectDocuments: true, groups };
}
