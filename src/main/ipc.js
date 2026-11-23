'use strict';

const { ipcMain } = require('electron');

function registerIPC({ edge, bossKey, trayManager, onStateChanged, onFirstRunComplete }) {
  ipcMain.handle('app:get-config', () => {
    const config = require('./config');
    return config.load();
  });

  ipcMain.handle('app:set-config', async (event, patch) => {
    const config = require('./config');
    return config.update(patch || {});
  });

  ipcMain.handle('app:toggle-stealth', () => {
    bossKey.trigger();
    return bossKey.isActive();
  });

  ipcMain.handle('app:hide', () => {
    edge.hide();
    return true;
  });

  ipcMain.handle('app:set-edge', (event, edgeName) => {
    const config = require('./config');
    config.update({ edge: edgeName });
    return config.load();
  });

  ipcMain.handle('app:complete-first-run', () => {
    if (typeof onFirstRunComplete === 'function') onFirstRunComplete();
    return true;
  });

  // 设置面板/提示浮层打开时暂停自动隐藏，避免操作中被隐藏
  ipcMain.handle('app:hold-visible', (event, hold) => {
    edge.setHoldVisible(Boolean(hold));
    return true;
  });

  // 在番茄 webview 页面内执行内容自适应脚本（按窗口宽度缩放固定宽度的列表页）
  ipcMain.handle('app:fit-content', (event, code) => {
    const { webContents } = require('electron');
    for (const wc of webContents.getAllWebContents()) {
      try {
        const u = wc.getURL();
        if (u && /fanqienovel\.com/.test(u) && !wc.isDestroyed()) {
          wc.executeJavaScript(code, true).catch(() => {});
        }
      } catch (_) {}
    }
    return true;
  });

  // 清除番茄 webview 的登录态（cookies + 本地存储），用于重新登录/切换账号
  ipcMain.handle('app:clear-login', async () => {
    const { session } = require('electron');
    const ses = session.fromPartition('persist:fanqie');
    try {
      await ses.clearStorageData({
        storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cache', 'webworkers', 'appcache', 'filesystem', 'shadercache', 'websql']
      });
    } catch (err) {
      // 某些 storage 类型可能不支持，忽略后继续清 cookies
      try { await ses.clearStorageData({ storages: ['cookies', 'localstorage'] }); } catch (_) {}
    }
    try { await ses.clearCache(); } catch (_) {}
    return true;
  });

  // 外部窗口隐藏器（模拟器等）：绑定前台窗口 / 解绑 / 查询状态
  ipcMain.handle('hider:bind-foreground', () => require('./winHider').bindForeground());
  ipcMain.handle('hider:unbind', () => require('./winHider').unbind());
  ipcMain.handle('hider:state', () => require('./winHider').state());

  ipcMain.handle('app:quit', () => {
    require('electron').app.quit();
  });

  if (typeof onStateChanged === 'function') {
    onStateChanged((state) => {
      const win = require('electron').BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) {
        win.webContents.send('state:changed', state);
      }
    });
  }
}

module.exports = { registerIPC };
