import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveAppPaths } from '../config/app-paths';
import { withConfigFileLock } from '../config/profile-store';
import { resolveWorkingDirectory } from '../policy/workspace';
import { discoverSkills } from '../agent/workbench-skills';
import { getWorkbench, updateWorkbench } from './workbench';
import { ensureCoordinatorHandbook } from './coordinator-handbook';
import { HttpError } from './http';
import type { UiSupervisor } from './types';
import type { VcRequestClient } from '../meeting/api';

type Receipt = { name:string; goal:string; workspace:string; uuid:string; chatId?:string; creating?:boolean; handbook?:string; announced?:boolean; ready?:boolean };
/** One independently onboarded organizer gets one durable team creation receipt. */
export async function createTeam(sup:UiSupervisor, profile:string, body:unknown, rootDir?:string) {
  const input=body as Record<string,unknown>;
  const name=String(input?.name ?? '').trim(), goal=String(input?.goal ?? '').trim();
  if(!name || name.length>60 || !goal || goal.length>2000) throw new HttpError(400,'请填写团队名称（60字内）和工作目标（2000字内）');
  const cwd=await resolveWorkingDirectory(String(input.workspace ?? ''));
  if(!cwd.ok || !input.workspace) throw new HttpError(400,'请选择有效的本机工作目录');
  const dir=join(resolveAppPaths({rootDir}).rootDir,'collaboration-teams'); await mkdir(dir,{recursive:true});
  const file=join(dir,createHash('sha256').update(profile).digest('hex')+'.json');
  return withConfigFileLock(file,async()=>{
    let r:Receipt;
    try {r=JSON.parse(await readFile(file,'utf8'));} catch(e) {if((e as NodeJS.ErrnoException).code!=='ENOENT') throw e;r={name,goal,workspace:cwd.cwdRealpath,uuid:randomUUID()};}
    if(r.name!==name || r.goal!==goal || r.workspace!==cwd.cwdRealpath) throw new HttpError(409,'此组织者已有团队创建记录，请使用原设置继续；另一个团队请创建独立组织者');
    const save=async()=>{await writeFile(file+'.tmp',JSON.stringify(r),{mode:0o600});await rename(file+'.tmp',file);};
    let settings=await getWorkbench(profile,rootDir);
    if(Object.keys(settings.workbench.groups).some(id=>id!==r.chatId)) throw new HttpError(400,'请选择独立的新组织者，不能使用已经绑定其他群的研发或测试机器人');
    await save();
    if(!sup.isOnline(profile)) await sup.startProfile(profile);
    const owner=sup.controlsFor(profile);
    if(owner && owner.ownerRefreshState!=='ok') await owner.refreshOwner(sup.channelFor(profile));
    if(owner?.ownerRefreshState!=='ok' || !owner.botOwnerId) throw new HttpError(400,'组织者已启动，请等待拥有者身份验证后重试');
    const client=sup.channelFor(profile)?.rawClient as unknown as VcRequestClient;
    if(!client) throw new HttpError(400,'组织者尚未连接飞书');
    if(!r.chatId) {
      if(r.creating) throw new HttpError(409,'上次建群结果不确定，请先核对飞书群；为避免重复建群已暂停');
      r.creating=true;await save();
      const result=await client.request<{code?:number;data?:{chat_id?:string}}>({method:'POST',url:'/open-apis/im/v1/chats',params:{user_id_type:'open_id',set_bot_manager:true,uuid:r.uuid},data:{name,description:goal.slice(0,100),chat_type:'private',chat_mode:'group',owner_id:owner.botOwnerId,user_id_list:[owner.botOwnerId]}});
      if(result.code || !result.data?.chat_id) {r.creating=false;await save();throw new HttpError(400,`建群失败（${result.code ?? '无群ID'}），请从统一权限入口开通 im:chat:create 后重试`);}
      r.chatId=result.data.chat_id;r.creating=false;await save();
    }
    if(!settings.workbench.groups[r.chatId]) {
      const catalog=discoverSkills(cwd.cwdRealpath);
      const skills=['lark-shared','lark-im','lark-base','lark-doc'].map(name=>catalog.find(s=>s.name===name)?.id);
      if(skills.some(s=>!s)) throw new HttpError(400,'缺少飞书基础技能，请安装 lark-shared、lark-im、lark-base、lark-doc 后继续；已创建群会保留');
      settings.workbench.groups[r.chatId]={enabled:false,name,workspace:cwd.cwdRealpath,role:'coordinator',rolePrompt:`本群组织者。团队目标：${goal}\n按本群协作手册协调；成员或授权不齐时先报告缺项。`,persona:'',documents:[],resources:[],skills:skills as string[]};
      await updateWorkbench(sup,profile,settings,rootDir);
    }
    const handbook=await ensureCoordinatorHandbook(sup,profile,r.chatId,rootDir);
    r.handbook=handbook.url;await save();
    settings=await getWorkbench(profile,rootDir);
    const group=settings.workbench.groups[r.chatId]!;
    if(!group.enabled || group.coordinatorDoc!==r.handbook) {
      group.coordinatorDoc=r.handbook;group.resources=[...new Set([...(group.resources ?? []),r.handbook])];group.enabled=true;
      await updateWorkbench(sup,profile,settings,rootDir);
    }
    if(!sup.isOnline(profile)) await sup.startProfile(profile);
    if(!r.announced) {
      const live=sup.channelFor(profile)?.rawClient as unknown as VcRequestClient;
      if(!live) throw new HttpError(400,'群与手册已配置，组织者连接尚未恢复，请重试');
      const sent=await live.request<{code?:number}>({method:'POST',url:'/open-apis/im/v1/messages',params:{receive_id_type:'chat_id'},data:{receive_id:r.chatId,msg_type:'text',uuid:r.uuid,content:JSON.stringify({text:`协作团队已创建：${name}\n目标：${goal}\n协作手册：${r.handbook}\n群成员可查看，创建人可编辑。\n下一步：邀请成员和 Agent；每位 Agent 的拥有者在工作台绑定本群、填写职责和资源，并开启交接。\n可以先 @我：检查本群协作准备情况，列出缺少的角色和资料，先不要执行开发或上线。\n目前仅完成组织者和群的配置，其他成员的执行能力需要逐个验证。`})}});
      if(sent.code) throw new HttpError(400,`团队已创建，欢迎消息失败（${sent.code}），重试会复用原群和手册`);
      r.announced=true;await save();
    }
    r.ready=true;await save();
    return {profile,chatId:r.chatId,handbook:r.handbook,chatUrl:`https://applink.feishu.cn/client/chat/open?openChatId=${r.chatId}`,ready:true};
  });
}

/** Both UI entrances resume the same pending team. Completed teams may be
 * deliberately paused, so looking up their handbook must not re-enable them. */
export async function prepareTeamHandbook(sup:UiSupervisor, profile:string, chatId:string, rootDir?:string) {
  const file=join(resolveAppPaths({rootDir}).rootDir,'collaboration-teams',createHash('sha256').update(profile).digest('hex')+'.json');
  let receipt:Receipt|undefined;
  try {receipt=JSON.parse(await readFile(file,'utf8'));} catch(e) {if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  if(receipt?.chatId===chatId && !receipt.ready) {
    const result=await createTeam(sup,profile,{name:receipt.name,goal:receipt.goal,workspace:receipt.workspace},rootDir);
    return {url:result.handbook!,teamCompleted:true};
  }
  return {...await ensureCoordinatorHandbook(sup,profile,chatId,rootDir),teamCompleted:false};
}
