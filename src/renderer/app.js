'use strict';

const API = window.readerAPI;
const webview = document.getElementById('reader');
const loading = document.getElementById('loading');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const btnMode = document.getElementById('btnMode');
const btnShelf = document.getElementById('btnShelf');
const btnLogin = document.getElementById('btnLogin');
const onboarding = document.getElementById('onboarding');
const settings = document.getElementById('settings');
const loginConfirm = document.getElementById('loginConfirm');

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

// ===== 内容自适应窗口尺寸 =====
// 番茄书架/首页是固定 ~1224px 宽的桌面布局，挤进小窗口会横向溢出、书被裁切。
// 阅读页本身是响应式的（宽度=窗口宽），不能缩放，否则字号变小影响阅读。
// 这里在 webview 页面内按 scrollWidth / 窗口宽 计算缩放比，仅对溢出的列表页缩放。
const FIT_SCRIPT = `
(function(){
  try {
    // 阅读页右侧工具栏（目录/字号/夜间/翻章）：默认淡化到 6% 不干扰阅读，
    // 鼠标悬停立即恢复可点（移动版/桌面版都生效，功能不丢失）。
    var st = document.getElementById('__reader_fit_style');
    if (!st) {
      st = document.createElement('style');
      st.id = '__reader_fit_style';
      document.head.appendChild(st);
    }
    st.textContent = '.reader-toolbar{opacity:0.06!important;transition:opacity .25s}.reader-toolbar:hover{opacity:1!important}';
    var w = window.innerWidth;
    var body = document.body;
    // 先恢复 zoom=1 再测量真实内容宽度（zoom 会影响 scrollWidth 测量）
    body.style.zoom = '1';
    var sw = Math.max(document.documentElement.scrollWidth, body.scrollWidth || 0);
    // 只有明显溢出（超过窗口 8px）才缩放；阅读页本身响应式，跳过
    if (sw > w + 8) {
      // 书架页：完整适配窗口（约 1224px 内容缩到 0.29 也能看清单行书名）。
      // 书城首页：内容超宽（约 2500px），设 0.45 下限保可读性，允许少量横向滚动。
      var isShelf = /bookshelf/.test(location.pathname);
      var minZoom = isShelf ? 0.05 : 0.45;
      body.style.zoom = Math.max(minZoom, Math.min(1, w / sw));
    } else {
      body.style.zoom = '1';
    }
  } catch (e) {}
})();
`;

let fitTimer = null;
function fitContent() {
  if (typeof API.fitContent !== 'function') return;
  API.fitContent(FIT_SCRIPT).catch(() => {});
}

// 页面加载完成后缩放；窗口尺寸变化时节流重算
function scheduleFit() {
  if (fitTimer) clearTimeout(fitTimer);
  fitTimer = setTimeout(() => {
    fitContent();
    // 页面图片/字体加载完后布局可能变化，二次注入确认
    if (fitTimer) clearTimeout(fitTimer);
    fitTimer = setTimeout(fitContent, 900);
  }, 200);
}

// ===== 重新登录 / 切换账号 =====
function openLoginConfirm() {
  loginConfirm.classList.remove('hidden');
  if (typeof API.holdVisible === 'function') API.holdVisible(true);
}
function closeLoginConfirm() {
  loginConfirm.classList.add('hidden');
  if (typeof API.holdVisible === 'function') API.holdVisible(false);
}
async function doRelogin() {
  closeLoginConfirm();
  loading.classList.remove('hidden');
  try {
    if (typeof API.clearLogin === 'function') await API.clearLogin();
  } catch (err) {
    console.error('清除登录态失败', err);
  }
  // 清态后回到书城首页，用户在此扫码/手机号登录
  const target = HOME_URL;
  config = await API.setConfig({ url: target });
  onShelf = false;
  btnShelf.textContent = '书架';
  btnShelf.title = '切换到我的书架';
  // 强制重新加载：先加不同查询参数避开同 URL 不重载的问题
  webview.setAttribute('src', target + '&relogin=' + Date.now());
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

  webview.addEventListener('did-finish-load', () => {
    loading.classList.add('hidden');
    scheduleFit(); // 页面加载后按窗口宽度适配内容
  });
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
  btnLogin.addEventListener('click', openLoginConfirm);
  document.getElementById('btnLoginCancel').addEventListener('click', closeLoginConfirm);
  document.getElementById('btnLoginConfirm').addEventListener('click', doRelogin);
  // 窗口尺寸变化时重新适配内容（webview 会跟随窗口拉伸）
  window.addEventListener('resize', scheduleFit);
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
