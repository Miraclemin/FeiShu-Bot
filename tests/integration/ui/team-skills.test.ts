import { afterEach, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { installTeamSkill, installedTeamSkills, repositoryUrl, scanSkillRepo, findLocalSkill } from '../../../src/ui/team-skills';
import { sharedResourceLinks, resourceShareText } from '../../../web/src/lib/shared-resources';
const roots:string[]=[];
afterEach(async()=>{for(const root of roots.splice(0))await fs.rm(root,{recursive:true,force:true});});
async function fixture(commit='a'.repeat(40),home?:string) {
 const root=home??await fs.mkdtemp(join(tmpdir(),'team-skills-'));if(!home)roots.push(root);
 const token=randomUUID(),repo=join(root,'previews',token,'repo');
 await fs.mkdir(join(repo,'skills','review'),{recursive:true});
 await fs.writeFile(join(repo,'skills','review','SKILL.md'),'---\nname: Review\ndescription: Review documents\n---\nRead the linked document.');
 await fs.writeFile(join(repo,'skills','review','script.sh'),'touch should-not-exist');
 const skills=await scanSkillRepo(repo);
 await fs.writeFile(join(root,'previews',token,'snapshot.json'),JSON.stringify({source:'https://github.com/example/team',commit,skills}));
 return {root,token,repo};
}
it('installs complete skill without running scripts, deduplicates retry and preserves old versions',async()=>{
 const {root,token}=await fixture();
 const installed=await installTeamSkill(token,'skills/review',root);
 expect(await fs.readFile(join(root,'installed',installed.versionId,'skill','script.sh'),'utf8')).toContain('touch');
 await installTeamSkill(token,'skills/review',root);
 expect(await installedTeamSkills(root)).toHaveLength(1);
 const next=await fixture('b'.repeat(40),root);await fs.writeFile(join(next.repo,'skills/review/script.sh'),'updated script');const newer=await installTeamSkill(next.token,'skills/review',root);
 expect(newer.logicalId).toBe(installed.logicalId);expect(newer.versionId).not.toBe(installed.versionId);
 expect(await installedTeamSkills(root)).toHaveLength(2);
 await expect(fs.access(join(root,'should-not-exist'))).rejects.toThrow();
 await expect(installTeamSkill(token,'../../outside',root)).rejects.toThrow('未找到');
});
it.skipIf(process.platform === 'win32')('rejects symlinked files, including files added after preview',async()=>{
 const {root,token,repo}=await fixture();
 await fs.symlink('/etc/passwd',join(repo,'skills/review/leak'));
 await expect(installTeamSkill(token,'skills/review',root)).rejects.toThrow('符号链接');
 expect(await installedTeamSkills(root)).toEqual([]);
});
it('only accepts credential-free HTTPS repository addresses',()=>{
 for(const input of ['file:///tmp/repo','ssh://host/repo','https://user:secret@github.com/team/repo','https://github.com/repo?token=secret'])expect(()=>repositoryUrl(input)).toThrow();
 expect(repositoryUrl('https://github.com/team/repo/')).toBe('https://github.com/team/repo');
});
it('round-trips a Feishu share message, deduplicates and rejects lookalike domains',()=>{
 const link='https://team.feishu.cn/base/abc?table=tbl123';
 expect(sharedResourceLinks(resourceShareText('研发',[link,link]))).toEqual([link]);
 expect(()=>sharedResourceLinks('https://feishu.cn.evil.test/docx/abc')).toThrow();
 expect(()=>sharedResourceLinks('https://user:secret@team.feishu.cn/docx/abc')).toThrow();
});

it('reuses an identical local skill including symlink roots and rejects false matches with changed scripts',async()=>{
 const {root,token,repo}=await fixture();
 const local=join(root,'local');await fs.cp(join(repo,'skills/review'),local,{recursive:true});
 const alias=join(root,'alias');await fs.symlink(local,alias,process.platform === 'win32' ? 'junction' : 'dir');
 const candidates=[{id:'local-id',name:'Review',description:'',path:join(alias,'SKILL.md')}];
 const result=await installTeamSkill(token,'skills/review',root,candidates);
 expect(result).toMatchObject({reused:true,existing:{id:'local-id'}});
 expect(await installedTeamSkills(root)).toHaveLength(0);
 await fs.writeFile(join(local,'script.sh'),'different script');
 const item=(await scanSkillRepo(repo))[0]!;
 expect(await findLocalSkill(item,join(repo,'skills/review'),candidates)).toBeNull();
});
it('deduplicates simultaneous installs from different repos with identical content',async()=>{
 const a=await fixture();const b=await fixture('b'.repeat(40),a.root);
 const results=await Promise.all([installTeamSkill(a.token,'skills/review',a.root),installTeamSkill(b.token,'skills/review',a.root)]);
 expect(await installedTeamSkills(a.root)).toHaveLength(1);
 expect(results[1]).toMatchObject({reused:true});
});
