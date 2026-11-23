'use strict';

const path = require('path');
const { app, BrowserWindow, shell, dialog } = require('electron');
const config = require('./config');
const { EdgeController, STATE } = require('./edgeController');
const { BossKey } = require('./bossKey');
const { TrayManager } = require('./tray');
const { registerIPC } = require('./ipc');

let mainWindow = null;
let edge = null;
let bossKey = null;
let trayManager = null;
let stateListeners = [];
let isQuitting = false;
let firstRunPending = false;

function broadcastState(state) {
  for (const fn of stateListeners) {
    try { fn(state); } catch (_) {}
  }
}

function openBossKeyDialog() {
  const current = config.load().bossKey;
  const result = dialog.showMessageBoxSync({
    type: 'question',
    buttons: ['使用 Ctrl+Alt+W', '使用 Ctrl+Alt+Q', '取消'],
    defaultId: 0,
    title: '更换老板键',
    message: `当前老板键：${current}`,
    detail: '常见组合若被占用，可换一个。更换后立即生效。'
  });
  if (result === 2) return;
  const next = result === 0 ? 'Ctrl+Alt+W' : 'Ctrl+Alt+Q';
  const reg = bossKey.register(next);
  trayManager.setBossKeyStatus(reg.ok);
  if (reg.ok) config.update({ bossKey: next });
  else {
    dialog.showMessageBoxSync({
      type: 'warning',
      buttons: ['知道了'],
      message: '该组合键仍被占用',
      detail: '请关闭占用此快捷键的软件后重试。'
    });
  }
}

function handleStealth(active) {
  if (active) edge.enterStealth();
  else edge.exitStealth();
  trayManager.setStealth(active);
  broadcastState({ edgeState: edge.getState(), stealth: active });
}

function createWindow() {
  const c = config.load();
  mainWindow = new BrowserWindow({
    width: Number(c.windowWidth),
    height: Number(c.windowHeight),
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true
    }
  });

  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function bootstrap() {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }
  app.on('second-instance', () => {
    if (edge) edge.show();
  });

  createWindow();

  edge = new EdgeController(mainWindow);
  trayManager = new TrayManager({
    onToggle: () => bossKey.trigger(),
    onSetEdge: (edgeName) => config.update({ edge: edgeName }),
    onSetMode: (mode) => {
      config.update({ mode });
      trayManager.rebuild();
      // 切到贴边后重置到该边的隐藏位置；切回自由则用记忆位置
      edge.refreshBounds();
    },
    onSetBossKey: openBossKeyDialog,
    onSetAutoStart: (enabled) => {
      config.update({ openAtLogin: enabled });
      app.setLoginItemSettings({ openAtLogin: enabled });
    },
    onQuit: () => app.quit()
  });
  trayManager.create();

  bossKey = new BossKey(handleStealth);
  const reg = bossKey.register(config.load().bossKey);
  trayManager.setBossKeyStatus(reg.ok);
  if (!reg.ok) {
    setTimeout(() => {
      dialog.showMessageBoxSync({
        type: 'warning',
        buttons: ['知道了'],
        message: '老板键注册失败',
        detail: '默认组合键被占用，请在托盘图标上点击「老板键」更换。'
      });
    }, 400);
  }

  app.setLoginItemSettings({ openAtLogin: Boolean(config.load().openAtLogin) });

  registerIPC({
    edge,
    bossKey,
    trayManager,
    onStateChanged: (fn) => stateListeners.push(fn),
    onFirstRunComplete: completeFirstRun
  });

  config.emitter.on('changed', (changed) => {
    if (changed.has('bossKey')) {
      const r = bossKey.register(config.load().bossKey);
      trayManager.setBossKeyStatus(r.ok);
    }
    if (changed.has('normalTrayLabel') || changed.has('stealthTrayLabel')) {
      trayManager.setStealth(bossKey.isActive());
    }
  });

  edge.on('state', (edgeState) => {
    broadcastState({ edgeState, stealth: bossKey.isActive() });
  });

  // 首次启动：显示窗口并让 renderer 展示操作提示
  firstRunPending = !config.load().firstRunShown;
  edge.start({ firstRun: firstRunPending });
}

/** 首次提示结束（用户点击"知道了"或超时），进入常规隐藏逻辑 */
function completeFirstRun() {
  if (!firstRunPending) return;
  firstRunPending = false;
  config.update({ firstRunShown: true });
  edge.finishFirstRun();
}

app.whenReady().then(bootstrap);

app.on('window-all-closed', () => {
  if (!isQuitting && process.platform === 'darwin') app.quit();
});

app.on('before-quit', () => {
  isQuitting = true;
  if (edge) edge.destroy();
  if (bossKey) bossKey.destroy();
  if (trayManager) trayManager.destroy();
});

app.on('activate', () => {
  if (mainWindow && edge) edge.show();
});
