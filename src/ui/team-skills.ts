import { discoverSkills } from '../agent/workbench-skills';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join, relative, basename, dirname } from 'node:path';
import { homedir } from 'node:os';
import { parse } from 'yaml';
const exec = promisify(execFile);
export const teamSkillHome = () => join(homedir(), '.feishu-collaborator', 'team-skills');
const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0,24);
interface Entry { key: string; name: string; description: string; content: string; files: string[]; }
interface Snapshot { source: string; commit: string; skills: Entry[]; }
// Compare every file, not only SKILL.md: scripts and references are part of a skill.
export async function skillFingerprint(dir: string): Promise<string> {
  dir = await fs.realpath(dir);
  const digest = createHash('sha256'); let count = 0, bytes = 0;
  async function walk(path: string) {
    for (const entry of (await fs.readdir(path, { withFileTypes: true })).sort((a,b)=>a.name.localeCompare(b.name))) {
      if (['.git', '__pycache__', '.DS_Store'].includes(entry.name)) continue;
      const file = join(path, entry.name);
      if (entry.isSymbolicLink()) throw new Error('技能附件含符号链接，无法确认内容一致');
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile()) {
        const data = await fs.readFile(file); bytes += data.length;
        if (++count > 5000 || bytes > 30 * 1024 * 1024) throw new Error('技能过大，无法比较');
        digest.update(JSON.stringify(relative(dir,file))); digest.update(String(data.length)); digest.update(data);
      }
    }
  }
  await walk(await fs.realpath(dir)); return digest.digest('hex');
}
export async function findLocalSkill(item: Entry, sourceDir: string, candidates = discoverSkills()) {
  const expected = await skillFingerprint(sourceDir);
  for (const candidate of candidates) {
    const content = await fs.readFile(candidate.path, 'utf8');
    const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
    let name = basename(dirname(candidate.path));
    try { if (match) name = String(parse(match[1]!)?.name || name); } catch { continue; }
    if (name !== item.name) continue;
    if (await skillFingerprint(dirname(candidate.path)) === expected) return { id: candidate.id, path: candidate.path };
  }
  return null;
}
let installQueue: Promise<unknown> = Promise.resolve();
export function repositoryUrl(value: unknown) {
  if (typeof value !== 'string') throw new Error('请输入 Git HTTPS 仓库地址');
  const url = new URL(value.trim());
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !url.pathname.replace(/\//g,'')) throw new Error('请使用不含密码的 Git HTTPS 仓库地址');
  return url.toString().replace(/\/$/,'');
}
async function git(args: string[], cwd?: string) {
  return (await exec('git', ['-c','core.hooksPath=/dev/null','-c','protocol.file.allow=never', ...args], {cwd, timeout:90000,maxBuffer:1024*1024, env:{...process.env,GIT_TERMINAL_PROMPT:'0',GIT_LFS_SKIP_SMUDGE:'1'}})).stdout.trim();
}
export async function scanSkillRepo(repo: string): Promise<Entry[]> {
  const found: Entry[] = []; let files = 0, bytes = 0;
  async function walk(dir: string, depth: number): Promise<string[]> {
    if (depth > 12) throw new Error('技能目录层级过深');
    const entries = await fs.readdir(dir,{withFileTypes:true}); const paths: string[] = [];
    for (const entry of entries) {
      if (entry.name === '.git') continue;
      if (entry.isSymbolicLink()) throw new Error('技能仓库不能包含符号链接');
      const path = join(dir,entry.name);
      if (entry.isDirectory()) paths.push(...await walk(path,depth+1));
      else if(entry.isFile()) { files++; bytes+=(await fs.stat(path)).size; if(files>5000 || bytes>30*1024*1024) throw new Error('技能仓库超过 5000 文件或 30 MiB'); paths.push(path); }
    }
    const file = join(dir,'SKILL.md');
    if(paths.includes(file)) {
      const content = await fs.readFile(file,'utf8'); if(content.length>128000) throw new Error('SKILL.md 内容过长');
      let meta: Record<string,unknown> = {}; const match=/^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
      if(match) meta=parse(match[1]!) || {};
      found.push({key:relative(repo,dir)||'.', name:String(meta.name||basename(dir)),description:String(meta.description||'').slice(0,500),content,files:paths.map(p=>relative(dir,p))});
    }
    return paths;
  }
  await walk(repo,0); return found;
}
export async function previewRepository(value: unknown, home=teamSkillHome()) {
  const source=repositoryUrl(value); const token=randomUUID(); const folder=join(home,'previews',token); await fs.mkdir(folder,{recursive:true});
  try {
    await git(['clone','--depth','1','--',source,join(folder,'repo')]);
    const commit=await git(['rev-parse','HEAD'],join(folder,'repo'));
    const skills=await scanSkillRepo(join(folder,'repo'));
    if(!skills.length) throw new Error('此仓库没有 SKILL.md');
    const snapshot={source,commit,skills}; await fs.writeFile(join(folder,'snapshot.json'),JSON.stringify(snapshot));
    return {token,...snapshot,skills:await Promise.all(skills.map(async item=>({...item,existing:await findLocalSkill(item,join(folder,'repo',item.key))})))};
  } catch(e) {await fs.rm(folder,{recursive:true,force:true}); throw new Error(`读取技能库失败：${(e as Error).message.slice(0,700)}`);}
}
export function installTeamSkill(token: unknown, key: unknown, home=teamSkillHome(), candidates?: ReturnType<typeof discoverSkills>) {
  const pending = installQueue.then(() => installOnce(token,key,home,candidates));
  installQueue = pending.catch(() => {}); return pending;
}
async function installOnce(token: unknown, key: unknown, home: string, candidates?: ReturnType<typeof discoverSkills>) {
  if(typeof token!=='string'|| !/^[a-f0-9-]{36}$/.test(token) || typeof key!=='string') throw new Error('请重新读取技能库');
  const folder=join(home,'previews',token);
  const snapshot: Snapshot=JSON.parse(await fs.readFile(join(folder,'snapshot.json'),'utf8'));
  const item=snapshot.skills.find(s=>s.key===key); if(!item) throw new Error('未找到选中的技能');
  // Revalidate the complete checkout before copying; previewed code is never executed.
  await scanSkillRepo(join(folder,'repo'));
  const logicalId=hash(snapshot.source+'#'+key), versionId=hash(logicalId+snapshot.commit);
  const installed=join(home,'installed',versionId);
  const record={...item,source:snapshot.source,commit:snapshot.commit,logicalId,versionId,installedAt:new Date().toISOString()};
  await fs.mkdir(join(home,'installed'),{recursive:true});
  try { await fs.access(installed); return record; } catch { /* new immutable version */ }
  const existing = await findLocalSkill(item, join(folder,'repo',key), candidates ?? discoverSkills(undefined,[join(home,'installed')]));
  if (existing) return { ...record, reused: true, existing };
  const staging=join(home,'staging',randomUUID()); await fs.mkdir(staging,{recursive:true});
  try {
    const sourceDir=join(folder,'repo',key);
    for(const file of item.files) {const target=join(staging,'skill',file); await fs.mkdir(join(target,'..'),{recursive:true}); await fs.copyFile(join(sourceDir,file),target);}
    await fs.writeFile(join(staging,'installation.json'),JSON.stringify(record));
    await fs.rename(staging,installed);
  } finally {await fs.rm(staging,{recursive:true,force:true});}
  return record;
}
export async function installedTeamSkills(home=teamSkillHome()) {
  const root=join(home,'installed'); const dirs=await fs.readdir(root).catch(()=>[]);
  return Promise.all(dirs.map(async dir=>JSON.parse(await fs.readFile(join(root,dir,'installation.json'),'utf8'))));
}
