const { BrowserWindow, clipboard, ClipboardItem } = require('electron');
const presets = require('../resources/permission-presets.json');
let active;
function permissionPageStep(target) {
  const expected = new URL(target);
  if(location.origin!==expected.origin || location.pathname!==expected.pathname)return 'login';
  const visible=e=>e.getClientRects().length>0;
  const text=e=>(e.textContent||'').replace(/\s/g,'');
  const buttons=[...document.querySelectorAll('button')].filter(visible);
  const next=buttons.find(b=>text(b)==='下一步，确认新增权限');
  if(next){
    const editors=[...document.querySelectorAll('textarea.inputarea')].filter(visible);
    if(editors.length===1){editors[0].focus();return 'editor';}
    return 'loading';
  }
  const item=[...document.querySelectorAll('[role="menuitem"]')].find(e=>visible(e)&&text(e)==='批量导入/导出权限');
  if(item){item.click();return 'loading';}
  const bulk=buttons.find(b=>text(b)==='批量处理');
  if(bulk){bulk.click();return 'loading';}
  return 'loading';
}
// Only the exact generated contract may reach Feishu's confirmation screen.
function validatePermissionImport(actual, expected) {
  try {
    const a = JSON.parse(actual), e = JSON.parse(expected);
    if (!a || Object.keys(a).join() !== 'scopes' || !a.scopes ||
        Object.keys(a.scopes).sort().join() !== 'tenant,user') return false;
    return ['tenant', 'user'].every(kind => {
      const values = a.scopes[kind];
      return Array.isArray(values) && values.every(v => typeof v === 'string') &&
        new Set(values).size === values.length &&
        JSON.stringify([...values].sort()) === JSON.stringify([...e.scopes[kind]].sort());
    });
  } catch { return false; }
}
async function replacePermissionImport(contents, config) {
  if (!validatePermissionImport(config, config)) throw new Error('Invalid permission contract');
  const previous = await Promise.all((await clipboard.read()).filter(item => item.types.length > 0).map(async item =>
    new ClipboardItem(Object.fromEntries(await Promise.all(item.types.map(async type =>
      [type, await item.getType(type)]))))));
  let ownedText;
  const selectAll = () => contents.selectAll();
  const settle = () => new Promise(resolve => setTimeout(resolve, 150));
  try {
    // Paste is a single editor operation; insertText may trigger bracket completion.
    await clipboard.writeText(config); ownedText = config;
    selectAll();
    await settle();
    contents.paste();
    await settle();
    selectAll();
    await settle();
    // Clear the clipboard first so failed copy cannot masquerade as successful readback.
    ownedText = `permission-readback-${Date.now()}`;
    await clipboard.writeText(ownedText);
    contents.copy();
    await settle();
    const actual = await clipboard.readText();
    ownedText = actual;
    return validatePermissionImport(actual, config);
  } finally {
    // Do not overwrite a new clipboard value supplied by the user while we were working.
    if (await clipboard.readText() === ownedText) {
      clipboard.clear();
      if (previous.length) await clipboard.write(previous);
    }
  }
}
async function openPermissionSetup(parent, appId, tenant) {
  if(!/^cli_[a-zA-Z0-9]+$/.test(appId))throw new Error('Invalid app');
  if(active&&!active.isDestroyed()){active.focus();return {message:'请在飞书窗口继续'};}
  const url=`https://${tenant==='lark'?'open.larksuite.com':'open.feishu.cn'}/app/${appId}/auth`;
  const win=active=new BrowserWindow({parent,width:1100,height:820,title:'开通功能权限',webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,partition:'meeting-setup'}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.session.setPermissionRequestHandler((_w,_p,cb)=>cb(false));
  const config=JSON.stringify({scopes:{tenant:[...new Set(presets.flatMap(p=>p.tenant))],user:[...new Set(presets.flatMap(p=>p.user))]}},null,2);
  return new Promise(resolve=>{
    let busy=false,ticks=0,done=false;
    const finish=message=>{if(done)return;done=true;clearInterval(timer);resolve({message});};
    const timer=setInterval(async()=>{
      if(busy||done||win.isDestroyed())return;busy=true;
      try {
        if(++ticks>600){finish('等待超时，请重试');return;}
        const step=await win.webContents.executeJavaScript(`(${permissionPageStep.toString()})(${JSON.stringify(url)})`);
        if(step==='editor'){
          const verified = await replacePermissionImport(win.webContents, config);
          if (!verified) {
            finish('导入内容校验失败，已停止。请重试一键配置');
            return;
          }
          // Recheck page and editor after the asynchronous native edit/readback.
          if (await win.webContents.executeJavaScript(`(${permissionPageStep.toString()})(${JSON.stringify(url)})`) !== 'editor') {
            finish('页面已变化，请重新配置');
            return;
          }
          const advanced=await win.webContents.executeJavaScript(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.getClientRects().length && (b.textContent||'').replace(/\\s/g,'')==='下一步，确认新增权限');if(!b||b.disabled)return false;b.click();return true;})()`);
          finish(advanced?'已准备全部功能权限，请在飞书确认并发布后重新检查':'格式和权限清单已校验，请在飞书点击下一步');
        }
      }catch{finish('自动填写未完成，请在飞书窗口继续');}finally{busy=false;}
    },700);
    win.on('closed',()=>{finish('配置窗口已关闭');if(active===win)active=undefined;});
    win.loadURL(url).catch(e=>{if(e.code!=='ERR_ABORTED'&&e.errno!==-3)finish('无法打开飞书后台，请重试');});
  });
}
module.exports={openPermissionSetup,permissionPageStep,validatePermissionImport,replacePermissionImport};
