'use strict';

const path = require('path');
const { app, BrowserWindow, shell, dialog, globalShortcut, session } = require('electron');
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

// 干净浏览器 UA（去掉 Electron/InputHelper 标识，降低风控特征）
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

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
    resizable: Boolean(c.resizable),
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

  // 无边框窗口启用边缘拖拽缩放（Windows/Linux）
  applyResizeRegion();

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // 拖拽缩放后持久化新尺寸（节流）
  let sizeTimer = null;
  mainWindow.on('resized', () => {
    if (sizeTimer) clearTimeout(sizeTimer);
    sizeTimer = setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      const b = mainWindow.getBounds();
      config.update({ windowWidth: b.width, windowHeight: b.height });
      applyResizeRegion();
    }, 300);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/** 设置无边框窗口的可缩放边缘区域 */
function applyResizeRegion() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!config.load().resizable) {
    try { mainWindow.setResizable(false); } catch (_) {}
    return;
  }
  try { mainWindow.setResizable(true); } catch (_) {}
  // setResizeRegion 仅 Windows/Linux 有效：四周 6px 为拖拽缩放热区
  if (typeof mainWindow.setResizeRegion === 'function') {
    try {
      const [w, h] = mainWindow.getSize();
      mainWindow.setResizeRegion({ x: 6, y: 6, width: w - 12, height: h - 12 });
      mainWindow.setResizeRegionSize({ width: w, height: h });
    } catch (_) {}
  }
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

  // 按请求目标切换 UA（改请求头，不动导航生命周期）：
  // - 阅读页 /reader/ 主文档及由阅读页发起的请求（referrer 判定）用手机 UA 走移动版：
  //   免"SVIP 网页畅读"限制（移动网页与手机端同权益），且无常驻章节/字体工具栏，
  //   阅读体验与手机一致。
  // - 书架/首页等用桌面 UA + force_mobile=0（移动版书架番茄不提供，只有下载引导）。
  // 注意：不能在 webContents.will-navigate 里 setUserAgent——实测会取消正在进行的导航
  // （点击书架书籍后导航被取消并回退书架）。webRequest 改头无此问题。
  const fanqieSession = session.fromPartition('persist:fanqie');
  fanqieSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const isReader = /fanqienovel\.com\/reader\//.test(details.url)
      || /fanqienovel\.com\/reader\//.test(details.referrer || '');
    const headers = { ...details.requestHeaders, 'User-Agent': isReader ? MOBILE_UA : DESKTOP_UA };
    callback({ requestHeaders: headers });
  });

  createWindow();

  edge = new EdgeController(mainWindow);
  trayManager = new TrayManager({
    onToggle: () => {
      if (bossKey.isActive()) {
        bossKey.setActive(false);
        handleStealth(false);
      } else if (edge.getState() === 'HIDDEN') {
        edge.show();
      } else {
        bossKey.trigger();
      }
    },
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

  // 唤出快捷键：无痕模式下随时强制显示窗口（含从 STEALTH 恢复）
  const revealOk = globalShortcut.register('Ctrl+Alt+E', () => {
    if (bossKey.isActive()) {
      bossKey.setActive(false);
      handleStealth(false);
    }
    edge.show();
  });
  console.log('[index] 唤出快捷键 Ctrl+Alt+E 注册' + (revealOk ? '成功' : '失败'));

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
    if (changed.has('resizable')) {
      applyResizeRegion();
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
