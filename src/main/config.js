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
  graceMs: 500,
  animationMs: 220,
  pollMs: 60,
  bossKey: 'Ctrl+Alt+Q',
  normalTrayLabel: '输入助手',
  stealthTrayLabel: '系统服务',
  openAtLogin: false,
  cleanMode: false,
  url: 'https://fanqienovel.com/',
  mode: 'free',
  windowX: null,
  windowY: null,
  idleOpacity: 0.06,
  firstRunShown: false
};

const EDITABLE_KEYS = new Set([
  'edge', 'windowWidth', 'windowHeight', 'revealPx', 'triggerBandPx',
  'graceMs', 'animationMs', 'pollMs', 'bossKey',
  'normalTrayLabel', 'stealthTrayLabel', 'openAtLogin', 'cleanMode', 'url',
  'mode', 'windowX', 'windowY', 'idleOpacity', 'firstRunShown'
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
  cache = { ...DEFAULTS, ...sanitize(parsed) };
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
