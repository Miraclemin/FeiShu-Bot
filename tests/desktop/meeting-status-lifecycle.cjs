const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
let tick, win, releaseDialog, persisted = 0;
class Window {
 constructor(){win=this;this.listeners={};this.webContents={setWindowOpenHandler(){},session:{setPermissionRequestHandler(){}},getURL:()=> 'https://open.feishu.cn/app/cli_test/event?tab=event',executeJavaScript:async()=>({state:'configured',published:true,missingScope:false})};}
 isDestroyed(){return false;} on(name,cb){this.listeners[name]=cb;} loadURL(){return Promise.resolve();} setTitle(){} focus(){} close(){this.listeners.closed();}
}
const moduleMock={exports:{}};
vm.runInNewContext(fs.readFileSync('desktop/meeting-setup.cjs','utf8'),{module:moduleMock,URL,require:()=>({BrowserWindow:Window,dialog:{showMessageBox:()=>new Promise(r=>{releaseDialog=r;})}}),setInterval:cb=>{tick=cb;return 1;},clearInterval(){}});
(async()=>{
 const pending=moduleMock.exports.openMeetingSetup(null,'cli_test','feishu','test',async()=>{persisted++;});
 const running=tick();await new Promise(r=>setImmediate(r));
 assert.equal(persisted,1,'persist verified status before confirmation dialog is dismissed');
 releaseDialog({response:0});await running;assert.equal((await pending).state,'configured');
 win.close();assert.equal(persisted,1,'closing completed window must not overwrite verified status');
 console.log('PASS verified meeting result persisted before dialog and retained after close');
})().catch(e=>{console.error(e);process.exitCode=1;});
