const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron');
const { join, delimiter } = require('node:path');
const { homedir } = require('node:os');
const { readdirSync } = require('node:fs');
const { pathToFileURL } = require('node:url');
let host, window, quitting = false;
function augmentPath() {
  const home = homedir();
  const dirs = [join(home, '.local', 'bin'), join(home, '.cargo', 'bin'), '/opt/homebrew/bin', '/usr/local/bin'];
  if (process.platform === 'win32') dirs.push(join(process.env.APPDATA || home, 'npm'), join(process.env.LOCALAPPDATA || home, 'Microsoft', 'WinGet', 'Links'));
  try { for (const v of readdirSync(join(home, '.nvm', 'versions', 'node')).sort((a,b) => b.localeCompare(a, undefined, { numeric: true }))) dirs.push(join(home, '.nvm', 'versions', 'node', v, 'bin')); } catch {}
  process.env.PATH = [...new Set([...(process.env.PATH || '').split(delimiter), ...dirs])].filter(Boolean).join(delimiter);
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { window?.show(); window?.focus(); });
  app.whenReady().then(async () => {
    augmentPath();
    process.env.LARK_CHANNEL_HOME = process.env.LARK_WORKBENCH_HOME || join(homedir(), '.lark-workbench');
    process.env.LARK_BRIDGE_CLI_ENTRY = join(__dirname, '..', 'dist', 'cli.js');
    const { startDesktopHost } = await import(pathToFileURL(join(__dirname, '..', 'dist', 'desktop-host.js')).href);
    // Trial uses its own configuration, never replaces running Bridge services.
    host = await startDesktopHost(process.env.LARK_WORKBENCH_HOME || join(homedir(), '.lark-workbench'));
    window = new BrowserWindow({ width: 1100, height: 840, minWidth: 760, minHeight: 600,
      title: 'feishu-collaborator', backgroundColor: '#ffffff',
      webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://')) void shell.openExternal(url);
      return { action: 'deny' };
    });
    const origin = new URL(host.url).origin;
    window.webContents.on('will-navigate', (event, url) => {
      if (new URL(url).origin !== origin) { event.preventDefault(); if (url.startsWith('https://')) void shell.openExternal(url); }
    });
    window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    ipcMain.handle('workbench:copy-query-permissions', (event) => {
      if (event.sender !== window.webContents || new URL(event.senderFrame.url).origin !== origin) throw new Error('Unauthorized');
      clipboard.writeText(JSON.stringify({ scopes: { tenant: [], user: ['contact:user:search', 'im:chat:read'] } }, null, 2));
      return true;
    });
    ipcMain.handle('workbench:choose-directory', async (event) => {
      if (event.sender !== window.webContents || new URL(event.senderFrame.url).origin !== origin) throw new Error('Unauthorized');
      const result = await dialog.showOpenDialog(window, { properties: ['openDirectory'] });
      return result.canceled ? null : result.filePaths[0];
    });
    await window.loadURL(host.url);
  }).catch(err => { dialog.showErrorBox('工作台启动失败', String(err)); app.quit(); });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', event => {
    if (host && !quitting) { event.preventDefault(); quitting = true; host.close().finally(() => app.quit()); }
  });
}
