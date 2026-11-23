'use strict';

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { app } = require('electron');

const DEFAULTS = {
  edge: 'right',
  windowWidth: 460,
  windowHeight: 760,
  revealPx: 6,
  triggerBandPx: 18,
  graceMs: 0,
  animationMs: 220,
  pollMs: 60,
  bossKey: 'Ctrl+Alt+Q',
  normalTrayLabel: '输入助手',
  stealthTrayLabel: '系统服务',
  openAtLogin: false,
  cleanMode: false,
  // force_mobile=0：番茄默认会把桌面 webview 判定成手机端并塞 force_mobile=1，
  // 手机端网页只显示"下载 App"引导；带此参数可强制走桌面版，书架/阅读均正常。
  url: 'https://fanqienovel.com/bookshelf?force_mobile=0',
  homeUrl: 'https://fanqienovel.com/?force_mobile=0',
  mode: 'free',
  windowX: null,
  windowY: null,
  idleOpacity: 0,
  resizable: true,
  firstRunShown: false,
  hiderTarget: null,   // 外部窗口隐藏器绑定目标 {className,title}，null=未绑定
  schemaVersion: 5
};

// 仅对番茄首页/书架补全桌面版参数；其它页面（如 /reader/）与自定义网址不动。
function desktopUrl(u) {
  if (typeof u !== 'string') return u;
  if (!/^https:\/\/fanqienovel\.com\/(bookshelf)?\/?(?:[?#].*)?$/.test(u)) return u;
  if (/[?&]force_mobile=0(?:&|$)/.test(u)) return u;
  try {
    const parsed = new URL(u);
    parsed.searchParams.set('force_mobile', '0');
    return parsed.toString();
  } catch (err) {
    return u;
  }
}

// 配置迁移：按顺序升级，保证幂等
function migrate(parsed) {
  const out = { ...parsed };
  const ver = Number(parsed.schemaVersion) || 1;
  if (ver < 2 && out.graceMs === 500) {
    out.graceMs = 0;
  }
  if (ver < 3 && out.idleOpacity === 0.06) {
    out.idleOpacity = 0;
  }
  // v4：默认打开书架页；仅当用户仍是未手动改过的旧首页默认值时升级
  if (ver < 4 && (out.url === 'https://fanqienovel.com/' || out.url === undefined)) {
    out.url = 'https://fanqienovel.com/bookshelf';
  }
  // v5：番茄把桌面 webview 误判为手机端，强制走"下载 App"落地页；
  // 给首页/书架网址补 force_mobile=0 以恢复桌面版（自定义网址保持原样）。
  if (ver < 5) {
    out.url = desktopUrl(out.url);
    if (out.homeUrl) out.homeUrl = desktopUrl(out.homeUrl);
  }
  out.schemaVersion = 5;
  return out;
}

const EDITABLE_KEYS = new Set([
  'edge', 'windowWidth', 'windowHeight', 'revealPx', 'triggerBandPx',
  'graceMs', 'animationMs', 'pollMs', 'bossKey',
  'normalTrayLabel', 'stealthTrayLabel', 'openAtLogin', 'cleanMode', 'url', 'homeUrl',
  'mode', 'windowX', 'windowY', 'idleOpacity', 'firstRunShown', 'resizable',
  'hiderTarget'
]);

let cache = null;
const emitter = new EventEmitter();

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function sanitize(raw) {
  const out = {};
  if (!isPlainObject(raw)) return out;
  for (const key of EDITABLE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      out[key] = raw[key];
    }
  }
  return out;
}

function load() {
  if (cache) return { ...cache };
  let parsed = {};
  try {
    const text = fs.readFileSync(configPath(), 'utf8');
    parsed = JSON.parse(text);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn('[config] 读取失败，使用默认配置:', err.message);
    }
  }
  const migrated = migrate(parsed);
  cache = { ...DEFAULTS, ...sanitize(migrated) };
  // 若发生了迁移，写回磁盘使其一次性生效（保留用户其它设置与窗口位置）
  if (Number(parsed.schemaVersion) !== 5 && Object.keys(parsed).length > 0) {
    try {
      const file = configPath();
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(cache, null, 2), 'utf8');
    } catch (err) {
      console.warn('[config] 迁移写回失败:', err.message);
    }
  }
  return { ...cache };
}

function save(next) {
  const merged = { ...DEFAULTS, ...sanitize(next) };
  const file = configPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(merged, null, 2), 'utf8');
  fs.renameSync(tmp, file);
  cache = merged;
  return { ...cache };
}

function update(partial) {
  const current = load();
  const delta = sanitize(partial);
  const before = { ...current };
  const next = save({ ...current, ...delta });
  const changed = new Set();
  for (const key of Object.keys(delta)) {
    if (before[key] !== next[key]) changed.add(key);
  }
  if (changed.size > 0) emitter.emit('changed', changed, next);
  return next;
}

module.exports = { DEFAULTS, EDITABLE_KEYS, emitter, load, save, update, configPath };
