'use strict';

// 外部窗口隐藏器：把「鼠标放上去显示、挪开立即隐藏、老板键彻底隐藏」的能力
// 应用到任意外部窗口（如安卓模拟器）。通过 koffi 调用 user32 实现。
// 注：DWM Cloak(DWMWA_CLOAK) 对外部进程窗口返回 E_ACCESSDENIED（实测），
// 故采用 ShowWindow(SW_HIDE/SW_SHOW)：窗口从屏幕与任务栏完全消失、程序继续运行。

const config = require('./config');

let koffi = null;
let user32 = null;
let api = null;

function ensureApi() {
  if (api) return api;
  try {
    koffi = require('koffi');
    user32 = koffi.load('user32.dll');
    koffi.struct('HiderRect', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' });
    api = {
      GetForegroundWindow: user32.func('void *GetForegroundWindow()'),
      GetWindowRect: user32.func('int GetWindowRect(void *hWnd, _Out_ HiderRect *rect)'),
      IsWindow: user32.func('int IsWindow(void *hWnd)'),
      IsWindowVisible: user32.func('int IsWindowVisible(void *hWnd)'),
      IsIconic: user32.func('int IsIconic(void *hWnd)'),
      ShowWindow: user32.func('int ShowWindow(void *hWnd, int cmd)'),
      FindWindowW: user32.func('void *FindWindowW(str16 cls, str16 title)'),
      GetWindowTextW: user32.func('int GetWindowTextW(void *hWnd, str16 buf, int max)'),
      GetClassNameW: user32.func('int GetClassNameW(void *hWnd, str16 buf, int max)'),
      GetWindowLongW: user32.func('int32 GetWindowLongW(void *hWnd, int index)')
    };
  } catch (err) {
    console.error('[winHider] koffi 初始化失败:', err.message);
    api = null;
  }
  return api;
}

const SW_HIDE = 0;
const SW_SHOW = 5;
const SW_RESTORE = 9;
const SW_SHOWNA = 8;
const PAD = 8; // 触发容差

// 运行时状态
let hwnd = null;          // 绑定的窗口句柄（void*）
let meta = null;          // { className, title } 持久化于 config.hiderTarget
let hidden = false;       // 当前是否已隐藏
let rect = null;          // 可见时记录的窗口矩形；隐藏后作为鼠标唤出判定区
let stealthLock = false;  // 老板键锁定：解锁前鼠标移回不自动显示

function pointInRect(x, y, r, pad) {
  const p = pad || 0;
  return x >= r.left - p && x <= r.right + p && y >= r.top - p && y <= r.bottom + p;
}

function readTitle(h) {
  const buf = Buffer.alloc(512);
  api.GetWindowTextW(h, buf, 256);
  return buf.toString('utf16le').replace(/\0.*$/, '') || '';
}

function readClassName(h) {
  const buf = Buffer.alloc(512);
  api.GetClassNameW(h, buf, 256);
  return buf.toString('utf16le').replace(/\0.*$/, '') || '';
}

function refreshRect() {
  const r = {};
  if (!api.GetWindowRect(hwnd, r)) return false;
  if (r.right - r.left <= 0 || r.bottom - r.top <= 0) return false;
  rect = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  return true;
}

function findByMeta() {
  if (!meta) return null;
  const a = ensureApi();
  if (!a) return null;
  // 类名+标题精确匹配优先，其次仅类名（模拟器类名稳定），再次仅标题
  if (meta.className && meta.title) {
    const h = a.FindWindowW(meta.className, meta.title);
    if (h) return h;
  }
  if (meta.className) {
    const h = a.FindWindowW(meta.className, null);
    if (h) return h;
  }
  if (meta.title) {
    const h = a.FindWindowW(null, meta.title);
    if (h) return h;
  }
  return null;
}

function doHide() {
  if (!hwnd || !api.IsWindow(hwnd)) return;
  api.ShowWindow(hwnd, SW_HIDE);
  hidden = true;
}

function doShow() {
  if (!hwnd || !api.IsWindow(hwnd)) return;
  if (api.IsIconic(hwnd)) api.ShowWindow(hwnd, SW_RESTORE);
  else api.ShowWindow(hwnd, SW_SHOWNA);
  hidden = false;
  refreshRect(); // 窗口可能被移动过，以最新矩形作为下一次唤出判定区
}

module.exports = {
  // 绑定当前前台窗口
  bindForeground() {
    const a = ensureApi();
    if (!a) return { ok: false, error: 'koffi 不可用' };
    const h = a.GetForegroundWindow();
    if (!h) return { ok: false, error: '未找到前台窗口' };
    const className = readClassName(h);
    const title = readTitle(h);
    if (!className && !title) return { ok: false, error: '无法读取窗口信息' };
    hwnd = h;
    meta = { className, title };
    hidden = a.IsWindowVisible(h) ? false : true;
    refreshRect();
    config.update({ hiderTarget: meta });
    return { ok: true, className, title };
  },

  unbind() {
    try { if (hwnd && api && api.IsWindow(hwnd) && hidden) api.ShowWindow(hwnd, SW_SHOWNA); } catch (_) {}
    hwnd = null; meta = null; rect = null; hidden = false; stealthLock = false;
    config.update({ hiderTarget: null });
    return { ok: true };
  },

  // 启动时按持久化记录恢复绑定
  restoreOnBoot() {
    const a = ensureApi();
    const saved = config.load().hiderTarget;
    if (!a || !saved) return { ok: false };
    meta = saved;
    const h = findByMeta();
    if (!h) return { ok: false };
    hwnd = h;
    hidden = !a.IsWindowVisible(h);
    refreshRect();
    return { ok: true, className: meta.className, title: meta.title };
  },

  // 老板键联动：on=彻底隐藏并锁定；off=按鼠标位置恢复
  setStealth(on) {
    if (!hwnd || !api) return;
    if (on) {
      stealthLock = true;
      if (!hidden) doHide();
    } else {
      stealthLock = false;
      // 恢复后由 tick 决定是否显示
    }
  },

  // 是否处于老板键锁定态
  isStealth() { return stealthLock; },

  state() {
    return { bound: Boolean(hwnd && meta), meta, hidden, stealthLock };
  },

  // 每次轮询调用（约 60ms）
  tick(cursor) {
    if (stealthLock) return;
    const a = ensureApi();
    if (!meta) return;
    // 句柄失效（目标重启）→ 按记录重找
    if (!hwnd || !a.IsWindow(hwnd)) {
      const h = findByMeta();
      if (!h) return;
      hwnd = h;
      hidden = !a.IsWindowVisible(h);
    }
    if (hidden) {
      if (rect && pointInRect(cursor.x, cursor.y, rect, PAD)) doShow();
    } else {
      if (!refreshRect()) return;
      // 鼠标离开窗口矩形立即隐藏（与阅读窗 graceMs=0 行为一致）
      if (!pointInRect(cursor.x, cursor.y, rect, 0)) doHide();
    }
  }
};
