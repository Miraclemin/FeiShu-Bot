import type { LarkChannel } from '@larksuite/channel';
import presets from '../../resources/permission-presets.json';
import { MEETING_REQUIRED_EVENTS } from '../meeting/preflight';
export function summarizePermissions(scopes: {scope:string;token_types?:string[]}[], events: string[]) {
  const required = ['tenant','user'].flatMap(type => [...new Set(presets.flatMap(p => p[type as 'tenant'|'user']))].map(scope=>({scope,type})));
  const missing = required.filter(r=>!scopes.some(s=>s.scope===r.scope&&s.token_types?.includes(r.type)));
  return { total: required.length, granted: required.length-missing.length, missing,
    permissions: missing.length ? 'missing' : 'ready',
    meeting: MEETING_REQUIRED_EVENTS.every(e=>events.includes(e))?'ready':'missing' };
}
export async function permissionStatus(channel: LarkChannel | undefined, appId: string) {
  if(!channel)return {status:'unknown',message:'请先启动机器人'};
  try {
    const app = await channel.rawClient.application.application.get({params:{lang:'zh_cn'},path:{app_id:appId}});
    if(app.code || !app.data?.app?.online_version_id)return {status:'unknown',message:'暂未查到已发布版本'};
    const version = await channel.rawClient.application.applicationAppVersion.get({params:{lang:'zh_cn'},path:{app_id:appId,version_id:app.data.app.online_version_id}});
    const data=version.data?.app_version;
    if(version.code || !Array.isArray(data?.scopes) || !Array.isArray(data?.events))return {status:'unknown',message:'暂时无法核验，请重试'};
    return {status:'checked',...summarizePermissions(data.scopes,data.events),checkedAt:new Date().toISOString()};
  } catch {return {status:'unknown',message:'权限检查失败，请重试'};}
}
