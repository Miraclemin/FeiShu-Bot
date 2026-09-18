import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveAppPaths } from '../config/app-paths';
import { withConfigFileLock } from '../config/profile-store';
import { handbookSections } from '../bot/coordinator-handbook';
import { getWorkbench } from './workbench';
import { HttpError } from './http';
import type { UiSupervisor } from './types';
import type { VcRequestClient } from '../meeting/api';

/** Durable receipt avoids duplicate documents on retry, even if filling/sharing failed. */
export async function ensureCoordinatorHandbook(sup: UiSupervisor, profile: string, chatId: string, rootDir?: string) {
  const settings = await getWorkbench(profile, rootDir);
  const group = settings.workbench.groups[chatId];
  if (!group || !/^oc_[a-zA-Z0-9]+$/.test(chatId)) throw new HttpError(400,'请先保存当前群配置');
  if (group.coordinatorDoc) return {url:group.coordinatorDoc};
  const channel = sup.channelFor(profile);
  if (!channel) throw new HttpError(400,'请先启动机器人');
  const controls = sup.controlsFor(profile);
  if (controls?.ownerRefreshState !== 'ok' || !controls.botOwnerId) throw new HttpError(400,'请先确认机器人拥有者，才能为其开放手册编辑权限');
  const client = channel.rawClient as unknown as VcRequestClient;
  const dir = join(resolveAppPaths({rootDir}).rootDir,'coordinator-handbooks');
  await mkdir(dir,{recursive:true});
  const key = createHash('sha256').update(`${profile}:${chatId}`).digest('hex');
  const file = join(dir,`${key}.json`);
  return withConfigFileLock(join(dir,'registry.json'),async()=>{
    let receipt: {token?:string;url?:string;filled?:boolean;shared?:boolean;groupShared?:boolean;creating?:boolean;lastError?:string} = {};
    try { receipt = JSON.parse(await readFile(file,'utf8')); } catch(e) { if((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    const save = async()=>{await writeFile(file+'.tmp',JSON.stringify(receipt),{mode:0o600});await rename(file+'.tmp',file);};
    if (!receipt.token) {
      if (receipt.creating) throw new HttpError(409,'上次创建结果待确认，请检查飞书中已有手册后绑定链接，避免重复创建');
      receipt.creating=true;await save();
      let r: {code?:number;msg?:string;data?:{document?:{document_id?:string}}};
      try {
        r=await client.request<typeof r>({method:'POST',url:'/open-apis/docx/v1/documents',data:{title:`${group.project?.name || group.name || '本群'} · 协作手册`}});
      } catch (error) {
        const failure=error as {response?:{status?:number;data?:{code?:number;msg?:string}}};
        const status=failure.response?.status, code=failure.response?.data?.code;
        // Explicit rejection is retryable. Network errors, 408 and server errors
        // remain uncertain: never risk a second create after a lost success reply.
        const rejected=typeof status==='number' && status>=400 && status<500 && status!==408;
        receipt.creating=!rejected;
        receipt.lastError=`HTTP ${status ?? '无响应'}${code ? ` / 飞书 ${code}` : ''}`;
        await save();
        const hint=code===99991672?'请在统一权限入口开通文档创建权限并发布生效。':rejected?'请检查应用权限和文档创建参数。':'请先核对飞书是否已创建手册，避免重复。';
        throw new HttpError(400,`协作手册创建${rejected?'被飞书拒绝':'结果不确定'}（${receipt.lastError}）。${hint}${rejected?'修复后可点继续完成创建，已建群会复用。':''}`);
      }
      if(r.code || !r.data?.document?.document_id) {receipt.creating=false;await save();throw new HttpError(400,`手册创建失败（${r.code ?? '无文档ID'}），请检查文档创建权限`);}
      receipt={token:r.data.document.document_id,url:`https://feishu.cn/docx/${r.data.document.document_id}`};await save();
    }
    if(!receipt.filled) {
      const existing=await client.request<{code?:number;data?:{content?:string}}>({method:'GET',url:`/open-apis/docx/v1/documents/${receipt.token}/raw_content`});
      if(existing.code) throw new HttpError(400,`手册已创建：${receipt.url}；检查内容失败，请勿重复创建`);
      if(!existing.data?.content?.includes(handbookSections[0][1])) {
        const children=handbookSections.flatMap(([heading,text])=>[
          {block_type:3,heading1:{elements:[{text_run:{content:heading}}]}},
          {block_type:2,text:{elements:[{text_run:{content:text}}]}},
        ]);
        const r=await client.request<{code?:number}>({method:'POST',url:`/open-apis/docx/v1/documents/${receipt.token}/blocks/${receipt.token}/children`,data:{children,index:-1}});
        if(r.code) throw new HttpError(400,`手册已创建：${receipt.url}；模板写入失败（${r.code}），重试会复用此文档`);
      }
      receipt.filled=true;await save();
    }
    if(!receipt.shared) {
      const r=await client.request<{code?:number}>({method:'POST',url:`/open-apis/drive/v1/permissions/${receipt.token}/members`,params:{type:'docx',need_notification:false},data:{member_type:'openid',member_id:controls.botOwnerId,perm:'edit'}});
      if(r.code) throw new HttpError(400,`手册已创建：${receipt.url}；授予拥有者编辑权限失败（${r.code}），重试会复用此文档`);
      receipt.shared=true;await save();
    }
    if(!receipt.groupShared) {
      const r=await client.request<{code?:number}>({method:'POST',url:`/open-apis/drive/v1/permissions/${receipt.token}/members`,params:{type:'docx',need_notification:false},data:{member_type:'openchat',member_id:chatId,perm:'view'}});
      if(r.code) throw new HttpError(400,`手册已创建：${receipt.url}；本群查看权限未完成（${r.code}），请开通 docs:permission.member:create 后重试`);
      receipt.groupShared=true;await save();
    }
    return {url:receipt.url!};
  });
}
