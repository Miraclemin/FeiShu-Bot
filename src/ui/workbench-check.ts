import { existsSync, statSync } from 'node:fs';
import { spawnProcess, mergeProcessEnv } from '../platform/spawn';
import { resolveAppPaths } from '../config/app-paths';
import { buildLarkChannelEnv } from '../agent/lark-channel-env';
import { normalizeWorkbench } from '../config/workbench';
import { discoverSkills, selectedSkills } from '../agent/workbench-skills';
import { getWorkbench } from './workbench';
export function tableTarget(link: string) {
 const u = new URL(link);
 if (u.protocol !== 'https:' || u.username || u.password || !/(^|\.)(feishu\.cn|larksuite\.com)$/.test(u.hostname)) throw new Error('请粘贴飞书表格链接');
 const token = /^\/base\/([a-zA-Z0-9]+)(?:\/|$)/.exec(u.pathname)?.[1]; const table=u.searchParams.get('table');
 if (!token || !table || !/^tbl[a-zA-Z0-9]+$/.test(table)) throw new Error('请打开具体数据表，再复制带 table 参数的链接；暂不支持知识库中转链接');
 return {token,table};
}
export async function checkWorkbench(profile: string, body: any, rootDir?: string) {
 await getWorkbench(profile,rootDir); // validate profile before touching local paths
 const cfg=normalizeWorkbench(body?.workbench), group=cfg?.groups[body?.chatId];
 if (!group) throw new Error('请先选择群');
 const checks: {label:string;ok:boolean;message:string}[]=[];
 const add=(label:string,ok:boolean,message:string)=>checks.push({label,ok,message});
 add('工作角色',!!group.role,group.role ? '已选择' : '请选择或填写工作角色');
 add('项目名称',!!group.project?.name,group.project?.name || '请填写项目名称');
 add('工作目录',!!group.workspace && existsSync(group.workspace) && statSync(group.workspace).isDirectory(),'目录需要存在于运行机器人的这台电脑');
 try { const skills=selectedSkills({ids:group.skills ?? []},discoverSkills(group.workspace));add('技能文件',skills.length>0,skills.length ? `${skills.length} 个已选技能可读取` : '未启用技能'); } catch(e) {add('技能文件',false,(e as Error).message);}
 const paths=resolveAppPaths({rootDir,profile});
 const env=buildLarkChannelEnv({profile,rootDir:paths.rootDir,larkCliConfigDir:paths.larkCliConfigDir,larkCliSourceConfigFile:paths.larkCliSourceConfigFile});
 for (const [index,link] of (group.resources ?? [group.project?.requirements,group.project?.bugs].filter(Boolean) as string[]).entries()) {
  const label=`资料 ${index+1}`;
  try {
   const u=new URL(link);
   let args: string[];
   if(u.pathname.startsWith('/base/')) { const {token,table}=tableTarget(link);args=['base','+record-list','--base-token',token,'--table-id',table,'--limit','1','--as','bot','--json']; }
   else if(/^\/(docx|docs|wiki)\/[a-zA-Z0-9]+/.test(u.pathname)) args=['docs','+fetch','--doc',link,'--as','bot','--json'];
   else throw new Error('此资料类型暂未接入检查；目前支持文档、知识库文档和多维表格');
   if (!existsSync(paths.larkCliSourceConfigFile)) throw new Error('请先启动机器人完成飞书连接，再检查表格');
   const result=await new Promise<{ok:boolean;message:string}>(resolve=>{
    const child=spawnProcess('lark-cli',args,{env:mergeProcessEnv(process.env,env),stdio:['ignore','pipe','pipe'],windowsHide:true});
    let out='',errout='',finished=false;const finish=(ok:boolean,message:string)=>{if(finished)return;finished=true;clearTimeout(timer);resolve({ok,message});};
    const timer=setTimeout(()=>{child.kill();finish(false,'读取超时，请检查网络');},20000);
    child.stderr?.on('data',b=>{errout=(errout+b).slice(-1024*1024);});child.stdout?.on('data',b=>{out+=b;if(out.length>1024*1024){child.kill();finish(false,'响应过大，检查已停止');}});
    child.once('error',()=>finish(false,'无法运行 lark-cli，请确认已安装'));
    child.once('close',code=>{try{const j=JSON.parse(out.trim() || errout.trim());finish(code===0 && j.ok===true,j.ok===true?'机器人身份可读取；没有修改记录':String(j.error?.message || '读取失败，请检查应用权限和表格分享设置'));}catch{finish(false,'返回格式异常，请检查飞书连接');}});
   });add(label,result.ok,result.message);
  } catch(e) {add(label,false,(e as Error).message);}
 }
 if(group.skillIsolation==='strict')add('严格隔离',false,'当前为实验功能，完整模型连接尚未通过验收；请勿视为可用的飞书工作模式');
 return {checks,ok:checks.every(c=>c.ok),note:'本次仅检查配置和资料读取，不验证写入权限，也不发送群消息。'};
}
