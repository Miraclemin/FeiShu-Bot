const { BrowserWindow, dialog } = require('electron');
const EVENTS = ['vc.bot.meeting_activity_v1', 'vc.bot.meeting_ended_v1', 'vc.bot.meeting_invited_v1'];
function targetUrl(appId, tenant) {
  if (!/^cli_[a-zA-Z0-9]+$/.test(appId)) throw new Error('无效的应用 ID');
  return `https://${tenant === 'lark' ? 'open.larksuite.com' : 'open.feishu.cn'}/app/${appId}/event?tab=event`;
}
// Runs only on the selected app's event page. Never reads cookies or credentials.
function pageStep(target, keys, action) {
  const expected = new URL(target);
  if (location.origin !== expected.origin || location.pathname !== expected.pathname) return { state: 'login' };
  const visible = e => !!e && e.getClientRects().length > 0;
  const normalize = value => (value || '').replace(/[\s\u200B-\u200D\uFEFF]/g, '');
  const text = e => normalize(e.textContent);
  const pageText = normalize(document.body.innerText);
  const buttons = [...document.querySelectorAll('button')].filter(visible);
  const button = name => buttons.find(b => text(b) === name);
  const rows = [...document.querySelectorAll('tr')].filter(visible);
  const installed = keys.filter(k => rows.some(r => text(r).includes(k)));
  const search = [...document.querySelectorAll('input[placeholder="搜索"]')].find(visible);
  if (!search) {
    if (!button('添加事件')) return { state: 'loading' };
    // Feishu renders connection labels across spans and loads them asynchronously.
    // Missing text is not evidence of a different connection mode.
    if (!pageText.includes('使用长连接接收事件')) {
      if (pageText.includes('使用请求地址接收事件')) return { state: 'connection', message: '当前页面显示使用请求地址接收事件。请改为使用长连接并保存，再重试。' };
      return { state: 'loading' };
    }
    if (installed.length === keys.length) {
      const missingScope = rows.some(r => keys.some(k => text(r).includes(k)) && text(r).includes('请开通'));
      return { state: 'configured', installed, published: pageText.includes('当前修改均已发布'), missingScope };
    }
    if (action === 'open') button('添加事件').click();
    return { state: 'open', installed };
  }
  if (search.value !== 'vc.bot') {
    if (action === 'search') {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(search, 'vc.bot');
      search.dispatchEvent(new Event('input', { bubbles: true }));
      search.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return { state: 'search', installed };
  }
  const checkboxes = [...document.querySelectorAll('input[type="checkbox"]')].filter(visible);
  const matches = keys.map(key => {
    const found = checkboxes.filter(box => {
      let row = box.parentElement;
      while (row && row !== document.body) {
        if (row.querySelectorAll('input[type="checkbox"]').length !== 1) break;
        if (text(row).includes(key)) return true;
        row = row.parentElement;
      }
      return false;
    });
    return { key, found };
  });
  if (matches.some(m => m.found.length !== 1 && !installed.includes(m.key))) return { state: 'unavailable', message: '未能唯一找到全部会议事件。请确认应用已开通相应能力，或手动检查页面。未提交更改。' };
  const selected = matches.flatMap(m => m.found).filter(b => !b.disabled);
  if (checkboxes.some(b => b.checked && !selected.includes(b) && !b.disabled)) return { state: 'unexpected', message: '发现清单之外的已选事件，已停止自动提交，请手动检查。' };
  if (action === 'select') for (const b of selected) if (!b.checked) b.click();
  const ready = selected.length > 0 && selected.every(b => b.checked) && button('添加') && !button('添加').disabled;
  if (action === 'submit' && ready) button('添加').click();
  return { state: ready ? 'review' : 'select', installed, selected: matches.filter(m => m.found.some(b => b.checked && !b.disabled)).map(m => m.key) };
}
let active;
let activeFinished = false;
async function openMeetingSetup(parent, appId, tenant, profile, onVerified = async () => {}) {
  if (active && !active.isDestroyed() && activeFinished) active.close();
  if (active && !active.isDestroyed()) { active.focus(); return { state: 'open', message: '配置窗口已打开，请在该窗口继续。' }; }
  activeFinished = false;
  const url = targetUrl(appId, tenant);
  const win = active = new BrowserWindow({ parent, width: 1160, height: 850, title: `会议事件配置 · ${profile}`,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, partition: 'meeting-setup' } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.session.setPermissionRequestHandler((_w, _p, cb) => cb(false));
  let timer, busy = false, finished = false, action = 'inspect', idle = 0, submitted = false, waitingForLogin = false;
  const finish = async (result) => {
    if (finished) return;
    finished = true; activeFinished = true; clearInterval(timer);
    if (result.state === 'configured') await onVerified(result);
    if (!win.isDestroyed()) await dialog.showMessageBox(win, { type: result.state === 'configured' ? 'info' : 'warning', message: result.message, detail: `机器人：${profile}\n应用：${appId}\n${url}` });
    return result;
  };
  return new Promise((resolve) => {
    win.on('closed', () => { clearInterval(timer); if (!finished) resolve({ state: 'cancelled', message: '配置窗口已关闭；未验证完成。' }); if (active === win) active = undefined; });
    const complete = async r => { await finish(r); resolve(r); };
    timer = setInterval(async () => {
      if (busy || finished || win.isDestroyed()) return;
      busy = true;
      try {
        const current = new URL(win.webContents.getURL() || 'about:blank');
        const expected = new URL(url);
        if (current.origin !== expected.origin || current.pathname !== expected.pathname) {
          waitingForLogin = true;
          win.setTitle('请登录飞书并返回该应用的事件配置页');
          if (++idle > 600) await complete({ state: 'timeout', message: '等待登录超时，请重新打开自动配置。' });
          return;
        }
        if (waitingForLogin) { idle = 0; waitingForLogin = false; }
        const r = await win.webContents.executeJavaScript(`(${pageStep.toString()})(${JSON.stringify(url)},${JSON.stringify(EVENTS)},${JSON.stringify(action)})`);
        if (r.state === 'configured') {
          await complete({ ...r, message: r.missingScope ? '三个事件已添加，但仍缺少关联权限。请在飞书后台补齐权限后发布。' : r.published ? '三个会议事件均已配置，页面显示当前修改已发布。下一步请真实邀请机器人，验证自动入会。' : '三个会议事件已添加。请在飞书后台创建版本并发布，审核通过后才能生效。' });
        } else if (['connection', 'unexpected'].includes(r.state)) await complete(r);
        else if (r.state === 'unavailable') { if (++idle >= 15) await complete(r); }
        else if (r.state === 'review' && !submitted) {
          const review = await dialog.showMessageBox(win, { type: 'question', buttons: ['添加这些事件', '取消'], defaultId: 0, cancelId: 1,
            message: `为「${profile}」添加会议事件？`, detail: `${appId}\n${r.selected.join('\n')}\n仅添加以上事件，不修改其他订阅，不自动申请权限或发布版本。` });
          if (review.response !== 0) await complete({ state: 'cancelled', message: '已取消，事件尚未提交。' });
          else { submitted = true; action = 'submit'; idle = 0; }
        } else if (submitted) {
          action = 'inspect';
          if (++idle >= 15) await complete({ state: 'unverified', message: '已尝试提交，但未验证全部事件出现在列表中。请检查后台结果，未标记为成功。' });
        } else { action = ['open', 'search', 'select'].includes(r.state) ? r.state : 'inspect'; if (++idle >= 90) await complete({ state: 'timeout', message: '页面未就绪或结构已变化，请在当前窗口检查后重试。' }); }
      } catch (e) { await complete({ state: 'error', message: `配置未完成：${String(e)}` }); }
      finally { busy = false; }
    }, 1000);
    win.loadURL(url).catch(e => {
      // Feishu redirects to its login page; Chromium reports the replaced load as aborted.
      if (e.code === 'ERR_ABORTED' || e.errno === -3) return;
      void complete({ state: 'error', message: `无法打开飞书后台：${String(e)}` });
    });
  });
}
module.exports = { openMeetingSetup, targetUrl, EVENTS, pageStep };
