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
