import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readProject, handleProject, projectCardText, projectRunContext, registryScript, projectBindingHint } from '../../../src/team/project-bindings';
import { buildLarkChannelEnv } from '../../../src/agent/lark-channel-env';
import { buildCodexArgs } from '../../../src/agent/codex/argv';
import type { CommandContext } from '../../../src/commands';
function ctx(dir: string, profile = 'codex', chat = 'oc_a', topic?: string): CommandContext {
 return { controls: {profile, configPath: join(dir,'config.json'),profileConfig:{workspaces:{default:dir}}},
   msg: {chatId:chat,threadId:topic},scope:topic?`${chat}:${topic}`:chat,chatMode:topic?'topic':'group',
   workspaces:{cwdFor:()=>dir},activeRuns:{get:()=>false},sessions:{clear:()=>{}} } as unknown as CommandContext;
}
describe('team project routing',()=>{
 it.skipIf(process.platform === 'win32')('executes the unpacked Python resource when app.asar is a file',()=>{
  const dir=mkdtempSync(join(tmpdir(),'team desktop 中文 '));
  try {
   writeFileSync(join(dir,'app.asar'),'archive placeholder');
   const resources=join(dir,'app.asar.unpacked','resources');
   mkdirSync(resources,{recursive:true});
   copyFileSync(registryScript(),join(resources,'project_registry.py'));
   const script=registryScript(pathToFileURL(join(dir,'app.asar','dist','desktop-host.js')).href);
   const output=execFileSync('python3',[script,'show','--profile','Agent-测试1','--chat','oc_a'],{
    encoding:'utf8',env:{...process.env,LARK_PROJECT_BINDINGS_FILE:join(dir,'bindings.json')},
   });
   expect(JSON.parse(output)).toMatchObject({profile:'Agent-测试1',chat_id:'oc_a',configured:false});
  } finally {rmSync(dir,{recursive:true,force:true});}
 });
 it('keeps source and unpackaged CLI resource locations intact',()=>{
  const source=registryScript(pathToFileURL('/tmp/project/src/team/project-bindings.ts').href);
  expect(registryScript(pathToFileURL('/tmp/project/dist/cli.js').href)).toBe(source);
 });
 it('lets chat history proceed independently while keeping project and identity checks',()=>{
  const hint=projectBindingHint('Agent-测试1','oc_a','omt_1');
  expect(hint).toContain('读取、搜索或总结当前群聊天不依赖项目绑定');
  expect(hint).toContain('检查失败只停止项目资源读写');
  expect(hint).toContain('不能切换其他账号绕过权限');
  expect(hint).toContain("--topic 'omt_1'");
  expect(hint).not.toContain('项目配置必须先执行');
 });
 it.skipIf(process.platform === 'win32')('isolates profiles, chats and topics; preserves real table link labels',()=>{
  const dir=mkdtempSync(join(tmpdir(),'team-project-'));
  try {
   for(const [p,c,t,name] of [['codex','oc_a',undefined,'A'],['codex','oc_b',undefined,'B'],['inspector','oc_a',undefined,'Test'],['codex','oc_a','omt_1','Topic']] as const)readProject(ctx(dir,p,c,t),'set','name',name);
   expect(readProject(ctx(dir)).product_name).toBe('A');
   expect(readProject(ctx(dir,'codex','oc_b')).product_name).toBe('B');
   expect(readProject(ctx(dir,'codex','oc_unknown')).configured).toBe(false);
   expect(readProject(ctx(dir,'codex','oc_a','omt_1')).product_name).toBe('Topic');
   const b=readProject(ctx(dir),'set','requirements','https://example.feishu.cn/base/baseExample?table=tblExample');
   expect(projectCardText(b)).toContain('[打开需求表]');
  } finally {rmSync(dir,{recursive:true,force:true});}
 });
 it.skipIf(process.platform === 'win32')('does not let a non-admin mutate bindings',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'team-project-'));const messages:string[]=[];
  try {await handleProject('set name forbidden',ctx(dir),async(_,s)=>{messages.push(s);},false);expect(readProject(ctx(dir)).configured).toBe(false);expect(messages[0]).toContain('管理员');}
  finally {rmSync(dir,{recursive:true,force:true});}
 });
 it('keeps concurrent run environment isolated',async()=>{
  const results=await Promise.all(['oc_a','oc_b'].map(chat=>projectRunContext.run({LARK_PROJECT_CHAT_ID:chat},async()=>{await new Promise(r=>setTimeout(r,1));return buildLarkChannelEnv().LARK_PROJECT_CHAT_ID;})));
  expect(results).toEqual(['oc_a','oc_b']);expect(buildLarkChannelEnv().LARK_PROJECT_CHAT_ID).toBeUndefined();
 });
 it('uses reviewed workspace execution without conflicting flags',()=>{
  for(const threadId of [undefined,'thread-example']){
   const args=buildCodexArgs({cwd:'/tmp/project',sandbox:'workspace-write',reviewCommands:true,threadId,ignoreRules:false});
   expect(args).toContain('--approve-for-me');expect(args).not.toContain('--sandbox');expect(args).not.toContain('approval_policy="never"');expect(args).not.toContain('--ignore-rules');
  }
 });
});
