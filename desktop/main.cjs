const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, Tray, Menu, nativeImage } = require('electron');
const { join, delimiter } = require('node:path');
const { homedir } = require('node:os');
const { readdirSync, readFileSync } = require('node:fs');
const { pathToFileURL } = require('node:url');
let host, window, tray, quitting = false, shutdownStarted = false;
function showWorkbench() {
  if (!window || window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}
function installMenuBar() {
  if (process.platform !== 'darwin') return;
  const icon = nativeImage.createFromPath(join(__dirname, '..', 'resources', 'branding', 'owlTrayTemplate.png'));
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('FeiShu Bot · 关闭窗口后继续运行');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开工作台', click: showWorkbench },
    { label: '隐藏窗口', click: () => window?.hide() },
    { type: 'separator' },
    { label: '退出（停止机器人）', click: () => app.quit() },
  ]));
}
function augmentPath() {
  const home = homedir();
  const dirs = [join(home, '.local', 'bin'), join(home, '.cargo', 'bin'), '/opt/homebrew/bin', '/usr/local/bin'];
  if (process.platform === 'win32') dirs.push(join(process.env.APPDATA || home, 'npm'), join(process.env.LOCALAPPDATA || home, 'Microsoft', 'WinGet', 'Links'));
  try { for (const v of readdirSync(join(home, '.nvm', 'versions', 'node')).sort((a,b) => b.localeCompare(a, undefined, { numeric: true }))) dirs.push(join(home, '.nvm', 'versions', 'node', v, 'bin')); } catch {}
  process.env.PATH = [...new Set([...(process.env.PATH || '').split(delimiter), ...dirs])].filter(Boolean).join(delimiter);
}
// Preserve the original Electron session and single-instance directory after rebranding.
app.setPath('userData', join(app.getPath('appData'), 'feishu-collaborator'));
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', showWorkbench);
  app.on('activate', showWorkbench);
  app.whenReady().then(async () => {
    augmentPath();
    process.env.LARK_CHANNEL_HOME = process.env.LARK_WORKBENCH_HOME || join(homedir(), '.lark-workbench');
    process.env.LARK_BRIDGE_CLI_ENTRY = join(__dirname, '..', 'dist', 'cli.js');
    const { startDesktopHost } = await import(pathToFileURL(join(__dirname, '..', 'dist', 'desktop-host.js')).href);
    // Trial uses its own configuration, never replaces running Bridge services.
    host = await startDesktopHost(process.env.LARK_WORKBENCH_HOME || join(homedir(), '.lark-workbench'));
    if (process.platform === 'darwin') app.dock?.setIcon(join(__dirname, '..', 'resources', 'branding', 'icon.png'));
    window = new BrowserWindow({ width: 1100, height: 840, minWidth: 760, minHeight: 600,
      title: 'FeiShu Bot', icon: join(__dirname, '..', 'resources', 'branding', 'icon.png'), backgroundColor: '#ffffff',
      webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    installMenuBar();
    window.on('close', event => {
      if (tray && !quitting) {
        event.preventDefault();
        window.hide();
      }
    });
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://')) void shell.openExternal(url);
      return { action: 'deny' };
    });
    const origin = new URL(host.url).origin;
    window.webContents.on('will-navigate', (event, url) => {
      if (new URL(url).origin !== origin) { event.preventDefault(); if (url.startsWith('https://')) void shell.openExternal(url); }
    });
    window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    ipcMain.handle('workbench:copy-text', (event, text) => {
      if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || new URL(event.senderFrame.url).origin !== origin) throw new Error('Unauthorized');
      if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > 1024 * 1024) throw new Error('Invalid clipboard text');
      clipboard.writeText(text);
      return true;
    });
    ipcMain.handle('workbench:copy-query-permissions', (event) => {
      if (event.sender !== window.webContents || new URL(event.senderFrame.url).origin !== origin) throw new Error('Unauthorized');
      clipboard.writeText(JSON.stringify({ scopes: { tenant: [], user: ['contact:user:search', 'im:chat:read'] } }, null, 2));
      return true;
    });
    ipcMain.handle('workbench:copy-permission-preset', (event, ids) => {
      if (event.sender !== window.webContents || new URL(event.senderFrame.url).origin !== origin) throw new Error('Unauthorized');
      const presets = require('../resources/permission-presets.json');
      if (!Array.isArray(ids) || ids.length > presets.length || ids.some(id => !presets.some(p => p.id === id))) throw new Error('Invalid permission presets');
      const selected = presets.filter(p => ids.includes(p.id));
      clipboard.writeText(JSON.stringify({ scopes: { tenant: [...new Set(selected.flatMap(p => p.tenant))], user: [...new Set(selected.flatMap(p => p.user))] } }, null, 2));
      return true;
    });
    ipcMain.handle('workbench:permission-setup', async (event, profile) => {
      if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || new URL(event.senderFrame.url).origin !== origin) throw new Error('Unauthorized');
      const config = JSON.parse(readFileSync(join(process.env.LARK_CHANNEL_HOME, 'config.json'), 'utf8'));
      if (typeof profile !== 'string' || !Object.hasOwn(config.profiles || {}, profile)) throw new Error('Unknown profile');
      const account = config.profiles[profile].accounts?.app;
      return require('./permission-setup.cjs').openPermissionSetup(window, account.id, account.tenant);
    });
    ipcMain.handle('workbench:meeting-setup', async (event, profile) => {
      if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || new URL(event.senderFrame.url).origin !== origin) throw new Error('Unauthorized');
      if (typeof profile !== 'string') throw new Error('Invalid profile');
      const config = JSON.parse(readFileSync(join(process.env.LARK_CHANNEL_HOME, 'config.json'), 'utf8'));
      if (!Object.hasOwn(config.profiles || {}, profile)) throw new Error('Unknown profile');
      const bot = config.profiles[profile];
      const account = bot.accounts?.app;
      if (!account?.id) throw new Error('机器人未配置应用 ID');
      const persistVerified = async (result) => {
        const fs = require('node:fs/promises');
        const dir = join(process.env.LARK_CHANNEL_HOME, 'meeting-setup-status');
        await fs.mkdir(dir, { recursive: true });
        const file = join(dir, `${account.id}-${account.tenant || 'feishu'}.json`);
        const tmp = `${file}.tmp`;
        await fs.writeFile(tmp, JSON.stringify({ ...result, appId: account.id, checkedAt: new Date().toISOString() }), { mode: 0o600 });
        await fs.rename(tmp, file);
      }
      return require('./meeting-setup.cjs').openMeetingSetup(window, account.id, account.tenant, profile, persistVerified);
    });
    ipcMain.handle('workbench:meeting-setup-status', async (event, profile) => {
      if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || new URL(event.senderFrame.url).origin !== origin) throw new Error('Unauthorized');
      const config = JSON.parse(readFileSync(join(process.env.LARK_CHANNEL_HOME, 'config.json'), 'utf8'));
      if (typeof profile !== 'string' || !Object.hasOwn(config.profiles || {}, profile)) throw new Error('Unknown profile');
      const account = config.profiles[profile].accounts?.app;
      if (!account || !/^cli_[a-zA-Z0-9]+$/.test(account.id)) return null;
      try {
        const result = JSON.parse(await require('node:fs/promises').readFile(join(process.env.LARK_CHANNEL_HOME, 'meeting-setup-status', `${account.id}-${account.tenant || 'feishu'}.json`), 'utf8'));
        return result.appId === account.id ? result : null;
      } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
    });
    ipcMain.handle('workbench:choose-directory', async (event) => {
      if (event.sender !== window.webContents || new URL(event.senderFrame.url).origin !== origin) throw new Error('Unauthorized');
      const result = await dialog.showOpenDialog(window, { properties: ['openDirectory'] });
      return result.canceled ? null : result.filePaths[0];
    });
    await window.loadURL(host.url);
  }).catch(err => { dialog.showErrorBox('工作台启动失败', String(err)); app.quit(); });
  app.on('window-all-closed', () => { if (!tray) app.quit(); });
  app.on('before-quit', event => {
    quitting = true;
    if (host) {
      event.preventDefault();
      if (shutdownStarted) return;
      shutdownStarted = true;
      Promise.resolve().then(() => host.close()).catch(err => console.error('工作台退出清理失败', err)).finally(() => {
        host = null;
        tray?.destroy();
        tray = null;
        app.quit();
      });
    }
  });
}
