'use strict';

const API = window.readerAPI;
const webview = document.getElementById('reader');
const loading = document.getElementById('loading');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const btnMode = document.getElementById('btnMode');
const btnShelf = document.getElementById('btnShelf');
const onboarding = document.getElementById('onboarding');
const settings = document.getElementById('settings');

const setMode = document.getElementById('setMode');
const setOpacity = document.getElementById('setOpacity');
const setOpacityVal = document.getElementById('setOpacityVal');
const setResizable = document.getElementById('setResizable');
const setAutoStart = document.getElementById('setAutoStart');

let config = {};
let firstRunDone = false;
let onboardingTimer = null;
let saveTimer = null;
let onShelf = true;

function applyConfig(cfg) {
  config = cfg || {};
  btnMode.textContent = config.mode === 'edge' ? '贴边模式' : '自由摆放';
  document.getElementById('obBossKey').textContent = config.bossKey || 'Ctrl+Alt+Q';
  document.getElementById('setBossKey').textContent = config.bossKey || 'Ctrl+Alt+Q';
}

function fillSettings() {
  setMode.value = config.mode === 'edge' ? 'edge' : 'free';
  const pct = Math.round((Number(config.idleOpacity) || 0) * 100);
  setOpacity.value = String(Math.min(50, Math.max(0, pct)));
  setOpacityVal.textContent = pct + '%';
  setResizable.checked = config.resizable !== false;
  setAutoStart.checked = Boolean(config.openAtLogin);
}

const SHELF_URL = 'https://fanqienovel.com/bookshelf?force_mobile=0';
const HOME_URL = 'https://fanqienovel.com/?force_mobile=0';

// 番茄默认把桌面 webview 当手机端，塞 force_mobile=1 后只显示"下载 App"。
// 对首页/书架补 force_mobile=0 强制桌面版；阅读页与自定义网址不受影响。
function desktopUrl(url) {
  if (typeof url !== 'string') return url;
  if (!/^https:\/\/fanqienovel\.com\/(bookshelf)?\/?(?:[?#].*)?$/.test(url)) return url;
  if (/[?&]force_mobile=0(?:&|$)/.test(url)) return url;
  try {
    const u = new URL(url);
    u.searchParams.set('force_mobile', '0');
    return u.toString();
  } catch (err) {
    return url;
  }
}

function loadSite() {
  const url = desktopUrl(config.url || SHELF_URL);
  onShelf = /bookshelf/.test(url);
  btnShelf.textContent = onShelf ? '书城' : '书架';
  btnShelf.title = onShelf ? '切换到书城首页' : '切换到我的书架';
  loading.classList.remove('hidden');
  webview.src = url;
}

function toggleShelf() {
  const shelfUrl = SHELF_URL;
  const homeUrl = desktopUrl(config.homeUrl || HOME_URL);
  const target = onShelf ? homeUrl : shelfUrl;
  onShelf = !onShelf;
  btnShelf.textContent = onShelf ? '书城' : '书架';
  btnShelf.title = onShelf ? '切换到书城首页' : '切换到我的书架';
  loading.classList.remove('hidden');
  webview.src = target;
  // 记住用户当前所在页，下次启动保持
  API.setConfig({ url: target });
}

function updateState(state) {
  const stealth = Boolean(state && state.stealth);
  const edgeState = state && state.edgeState;
  statusDot.className = 'dot';
  if (stealth) {
    statusDot.classList.add('stealth');
    statusText.textContent = '隐身中';
  } else if (edgeState === 'VISIBLE' || edgeState === 'SHOWING') {
    statusDot.classList.add('online');
    statusText.textContent = '阅读中';
  } else {
    statusDot.classList.add('hidden');
    statusText.textContent = '已隐藏';
  }
}

function flashSaved() {
  const el = document.getElementById('setSaved');
  el.textContent = '已保存 ✓';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { el.textContent = '已自动保存'; }, 1200);
}

async function savePatch(patch) {
  config = await API.setConfig(patch);
  applyConfig(config);
  flashSaved();
}

function finishOnboarding() {
  if (firstRunDone) return;
  firstRunDone = true;
  if (onboardingTimer) clearTimeout(onboardingTimer);
  onboarding.classList.add('hidden');
  if (typeof API.holdVisible === 'function') API.holdVisible(false);
  if (typeof API.completeFirstRun === 'function') API.completeFirstRun();
}

function openSettings() {
  fillSettings();
  settings.classList.remove('hidden');
  if (typeof API.holdVisible === 'function') API.holdVisible(true);
}

function closeSettings() {
  settings.classList.add('hidden');
  if (typeof API.holdVisible === 'function') API.holdVisible(false);
}

async function init() {
  try {
    config = await API.getConfig();
    applyConfig(config);
  } catch (err) {
    console.error('读取配置失败', err);
  }

  webview.addEventListener('did-finish-load', () => loading.classList.add('hidden'));
  webview.addEventListener('did-fail-load', (e) => {
    if (e.errorCode === -3) return;
    loading.classList.remove('hidden');
  });
  webview.addEventListener('new-window', (e) => e.preventDefault());
  // 用户在网页内点导航时同步按钮状态；番茄站内跳回首页/书架会丢掉参数，
  // 这里自动补 force_mobile=0，避免又变成"下载 App"落地页。
  webview.addEventListener('did-navigate', (e) => {
    if (!/fanqienovel\.com/.test(e.url)) return;
    const fixed = desktopUrl(e.url);
    if (fixed !== e.url) {
      webview.src = fixed;
      return;
    }
    onShelf = /bookshelf/.test(e.url);
    btnShelf.textContent = onShelf ? '书城' : '书架';
    btnShelf.title = onShelf ? '切换到书城首页' : '切换到我的书架';
  });

  document.getElementById('btnReload').addEventListener('click', loadSite);
  btnShelf.addEventListener('click', toggleShelf);
  btnMode.addEventListener('click', async () => {
    const next = config.mode === 'edge' ? 'free' : 'edge';
    config = await API.setConfig({ mode: next });
    applyConfig(config);
  });
  document.getElementById('btnStealth').addEventListener('click', () => API.toggleStealth());
  document.getElementById('btnHide').addEventListener('click', () => API.hide());
  document.getElementById('btnQuit').addEventListener('click', () => API.quit());
  document.getElementById('btnGotIt').addEventListener('click', finishOnboarding);

  document.getElementById('btnSettings').addEventListener('click', openSettings);
  document.getElementById('btnCloseSettings').addEventListener('click', closeSettings);
  setMode.addEventListener('change', () => savePatch({ mode: setMode.value }));
  setOpacity.addEventListener('input', () => {
    setOpacityVal.textContent = setOpacity.value + '%';
  });
  setOpacity.addEventListener('change', () => {
    savePatch({ idleOpacity: Number(setOpacity.value) / 100 });
  });
  setResizable.addEventListener('change', () => savePatch({ resizable: setResizable.checked }));
  setAutoStart.addEventListener('change', () => savePatch({ openAtLogin: setAutoStart.checked }));
  document.getElementById('btnResetSettings').addEventListener('click', async () => {
    config = await API.setConfig({
      mode: 'free', idleOpacity: 0, resizable: true,
      graceMs: 0, edge: 'right'
    });
    applyConfig(config);
    fillSettings();
    flashSaved();
  });

  API.onStateChanged(updateState);

  if (config.firstRunShown === false) {
    onboarding.classList.remove('hidden');
    if (typeof API.holdVisible === 'function') API.holdVisible(true);
    onboardingTimer = setTimeout(finishOnboarding, 15000);
  }

  loadSite();
}

init();
