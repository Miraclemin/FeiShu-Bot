import { mkdir, readFile, rename, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import presets from '../../resources/permission-presets.json';
import { resolveAppPaths } from '../config/app-paths';
import { getWorkbench } from './workbench';
import { HttpError } from './http';

function selection(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > presets.length || value.some(id => typeof id !== 'string' || !presets.some(p => p.id === id))) throw new HttpError(400, '权限选择无效');
  return [...new Set(value)] as string[];
}
export async function permissionDraft(profile: string, rootDir?: string, body?: unknown) {
  const { appId, tenant } = await getWorkbench(profile, rootDir);
  const directory = resolveAppPaths({ profile, rootDir }).profileDir;
  const file = join(directory, 'permission-draft.json');
  if (body !== undefined) {
    const input = body as { appId?: string; selected?: unknown };
    if (!input || input.appId !== appId) throw new HttpError(409, '应用已变更，请重新打开页面');
    const selected = selection(input.selected);
    await mkdir(directory, { recursive: true });
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, JSON.stringify({ appId, tenant, selected }), { mode: 0o600 });
      await rename(temp, file);
    } finally { await rm(temp, { force: true }); }
    return { appId, tenant, selected, saved: true, authorization: 'not-checked' };
  }
  try {
    const saved = JSON.parse(await readFile(file, 'utf8'));
    if (saved.appId === appId && saved.tenant === tenant) return { appId, tenant, selected: selection(saved.selected), saved: true, authorization: 'not-checked' };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw new HttpError(500, '无法读取已保存的权限选择，请检查本机权限配置文件');
  }
  return { appId, tenant, selected: presets.filter(p => p.default).map(p => p.id), saved: false, authorization: 'not-checked' };
}
