const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = readFileSync(path.join(__dirname, 'main.cjs'), 'utf8').replace(/await import\(pathToFileURL\(join\(__dirname, '\.\.', 'dist', 'desktop-host.js'\)\)\.href\)/, '({ startDesktopHost: async () => testHost })');
async function boot(platform = 'darwin') {
  let window, tray, closes = 0, releaseClose;
  const hostClosed = new Promise(resolve => { releaseClose = resolve; });
  const host = { url: 'http://localhost:1234', close: () => { closes++; return hostClosed; } };
  const app = new EventEmitter();
  let exited = false;
  Object.assign(app, { getPath: () => '/test/appData', setPath: (key, value) => { app.savedPath = { key, value }; }, requestSingleInstanceLock: () => true, whenReady: async () => {}, dock: { setIcon() {} }, quit() { const event = { prevented: false, preventDefault() { this.prevented = true; } }; app.emit('before-quit', event); if (!event.prevented) exited = true; } });
  class Window extends EventEmitter {
    constructor() { super(); window = this; this.visible = true; this.minimized = false; this.webContents = new EventEmitter(); Object.assign(this.webContents, { setWindowOpenHandler() {}, session: { setPermissionRequestHandler() {} } }); }
    hide() { this.visible = false; }
    show() { this.visible = true; }
    focus() { this.focused = true; }
    isDestroyed() { return false; }
    isMinimized() { return this.minimized; }
    restore() { this.minimized = false; }
    async loadURL() {}
  }
  class Tray { constructor() { tray = this; } setToolTip() {} setContextMenu(menu) { this.menu = menu; } destroy() { this.destroyed = true; } }
  const electron = { app, BrowserWindow: Window, Tray, Menu: { buildFromTemplate: x => x }, nativeImage: { createFromPath: () => ({ setTemplateImage() {} }) }, ipcMain: { handle() {} }, dialog: { showErrorBox: (_, err) => { throw Error(err); } } };
  vm.runInNewContext(source, { require: id => id === 'electron' ? electron : require(id), __dirname, process: { platform, env: {} }, console, testHost: host, URL, Buffer });
  await new Promise(resolve => setImmediate(resolve));
  return { app, window, tray, releaseClose, closes: () => closes, exited: () => exited };
}
test('Mac close hides window and preserves host; tray and activation restore it', async () => {
  const b = await boot();
  let prevented = false;
  b.window.emit('close', { preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(b.window.visible, false);
  assert.equal(b.closes(), 0);
  b.window.minimized = true;
  b.tray.menu[0].click();
  assert.equal(b.window.visible, true);
  assert.equal(b.window.minimized, false);
  b.window.hide(); b.app.emit('activate'); assert.equal(b.window.visible, true);
  b.window.hide(); b.app.emit('second-instance'); assert.equal(b.window.visible, true);
});
test('Explicit quit drains host exactly once even with repeated quit requests', async () => {
  const b = await boot();
  b.tray.menu[3].click(); b.app.quit();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(b.closes(), 1); assert.equal(b.exited(), false);
  let prevented = false;
  b.window.emit('close', { preventDefault() { prevented = true; } });
  assert.equal(prevented, false);
  b.releaseClose();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(b.exited(), true); assert.equal(b.tray.destroyed, true);
});
test('Windows retains existing close-to-quit behavior', async () => {
  const b = await boot('win32');
  assert.equal(b.tray, undefined);
  let prevented = false; b.window.emit('close', { preventDefault() { prevented = true; } });
  assert.equal(prevented, false);
  b.app.emit('window-all-closed');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(b.closes(), 1);
  b.releaseClose();
});

test('Rebranding preserves the original user-data directory', async () => {
  const b = await boot();
  assert.equal(b.app.savedPath.key, 'userData');
  assert.equal(b.app.savedPath.value, path.join('/test/appData', 'feishu-collaborator'));
});
