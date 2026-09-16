import { existsSync } from 'node:fs';
import { resolveAppPaths } from '../config/app-paths';
import { buildLarkChannelEnv } from '../agent/lark-channel-env';
import { spawnProcess, mergeProcessEnv } from '../platform/spawn';
import { getWorkbench } from './workbench';
export function baseTarget(link: string) {
 const u=new URL(link);
 if(u.protocol!=='https:' || u.username || u.password || !/(^|\.)(feishu\.cn|larksuite\.com)$/.test(u.hostname)) throw new Error('请粘贴飞书多维表格链接');
 const token=/^\/base\/([a-zA-Z0-9]+)\/?$/.exec(u.pathname)?.[1];
 if(!token) throw new Error('请打开多维表格并复制 /base/ 链接；知识库中转链接暂不支持');
 return {token,baseUrl:`${u.origin}/base/${token}`};
}
export function parseTablePage(value: any, baseUrl: string) {
 if(value?.ok!==true) {
  const scopes=value?.error?.missing_scopes;
  if(Array.isArray(scopes) && scopes.length) throw new Error(`当前机器人缺少飞书权限：${scopes.filter((x:unknown)=>typeof x==='string').join('、')}。请在应用权限管理中开通并完成所需发布/审核，再回来重试。`);
  throw new Error(String(value?.error?.message || '无法读取数据表，请检查应用权限和多维表格分享设置'));
 }
 const data=value.data; const items=Array.isArray(data)?data:data?.tables ?? data?.items;
 if(!Array.isArray(items)) throw new Error('数据表列表格式异常，未把它当成空库');
 const tables=items.map((x:any)=>{
  const id=x.table_id ?? x.id;
  if(typeof id!=='string' || !/^tbl[a-zA-Z0-9]+$/.test(id)) throw new Error('返回的数据表标识无效');
  return {id,name:String(x.name ?? x.table_name ?? id),url:`${baseUrl}?table=${id}`};
 });
 return {tables,hasMore:data?.has_more===true || tables.length===100};
}
export async function listBaseTables(profile:string,link:string,offset:number,rootDir?:string) {
 await getWorkbench(profile,rootDir);
 if(!Number.isSafeInteger(offset) || offset<0 || offset>10000) throw new Error('分页位置无效');
 const {token,baseUrl}=baseTarget(link);const paths=resolveAppPaths({rootDir,profile});
 if(!existsSync(paths.larkCliSourceConfigFile)) throw new Error('请先启动机器人完成飞书连接，再读取库中的表');
 const env=buildLarkChannelEnv({profile,rootDir:paths.rootDir,larkCliConfigDir:paths.larkCliConfigDir,larkCliSourceConfigFile:paths.larkCliSourceConfigFile});
 const result=await new Promise<any>((resolve,reject)=>{
  const child=spawnProcess('lark-cli',['base','+table-list','--base-token',token,'--limit','100','--offset',String(offset),'--as','bot','--json'],{env:mergeProcessEnv(process.env,env),stdio:['ignore','pipe','pipe'],windowsHide:true});
  let out='',errout='',finished=false;
  const done=(err?:Error,value?:unknown)=>{if(finished)return;finished=true;clearTimeout(timer);err?reject(err):resolve(value);};
  const timer=setTimeout(()=>{child.kill();done(new Error('读取数据表超时，请检查网络后重试'));},20000);
  child.stderr?.on('data',b=>{errout=(errout+b).slice(-1024*1024);});child.stdout?.on('data',b=>{out+=b;if(out.length>1024*1024){child.kill();done(new Error('列表过大，已停止读取'));}});
  child.once('error',()=>done(new Error('无法启动 lark-cli，请确认已安装')));
  child.once('close',code=>{try{const j=JSON.parse(out.trim() || errout.trim());if(code!==0 && j.ok===true)throw new Error('查询进程异常退出');done(undefined,j);}catch(e){done(e instanceof Error?e:new Error('查询格式异常'));}});
 });
 return {...parseTablePage(result,baseUrl),offset,nextOffset:offset+100};
}
