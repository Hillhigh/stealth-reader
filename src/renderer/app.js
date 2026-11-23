'use strict';

const API = window.readerAPI;
const webview = document.getElementById('reader');
const loading = document.getElementById('loading');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const btnMode = document.getElementById('btnMode');
const onboarding = document.getElementById('onboarding');

let config = {};
let firstRunDone = false;
let onboardingTimer = null;

function applyConfig(cfg) {
  config = cfg || {};
  btnMode.textContent = config.mode === 'edge' ? '贴边模式' : '自由摆放';
  document.getElementById('obBossKey').textContent = config.bossKey || 'Ctrl+Alt+Q';
}

function loadSite() {
  const url = config.url || 'https://fanqienovel.com/';
  loading.classList.remove('hidden');
  webview.src = url;
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
    statusText.textContent = '已淡出';
  }
}

function finishOnboarding() {
  if (firstRunDone) return;
  firstRunDone = true;
  if (onboardingTimer) clearTimeout(onboardingTimer);
  onboarding.classList.add('hidden');
  if (typeof API.completeFirstRun === 'function') API.completeFirstRun();
}

async function init() {
  try {
    config = await API.getConfig();
    applyConfig(config);
  } catch (err) {
    console.error('读取配置失败', err);
  }

  webview.addEventListener('did-finish-load', () => {
    loading.classList.add('hidden');
  });
  webview.addEventListener('did-fail-load', (e) => {
    if (e.errorCode === -3) return;
    loading.classList.remove('hidden');
  });
  webview.addEventListener('new-window', (e) => {
    e.preventDefault();
  });

  document.getElementById('btnReload').addEventListener('click', loadSite);
  btnMode.addEventListener('click', async () => {
    const next = config.mode === 'edge' ? 'free' : 'edge';
    config = await API.setConfig({ mode: next });
    applyConfig(config);
  });
  document.getElementById('btnStealth').addEventListener('click', () => API.toggleStealth());
  document.getElementById('btnHide').addEventListener('click', () => API.hide());
  document.getElementById('btnQuit').addEventListener('click', () => API.quit());
  document.getElementById('btnGotIt').addEventListener('click', finishOnboarding);

  API.onStateChanged((state) => {
    updateState(state);
  });

  // 首次启动：展示提示浮层，超时自动进入常规逻辑
  if (config.firstRunShown === false) {
    onboarding.classList.remove('hidden');
    onboardingTimer = setTimeout(finishOnboarding, 15000);
  }

  loadSite();
}

init();
