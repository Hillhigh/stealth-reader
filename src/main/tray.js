'use strict';

const path = require('path');
const { Tray, Menu, nativeImage, app } = require('electron');
const config = require('./config');

const ICON_NORMAL = path.join(__dirname, '..', '..', 'assets', 'icon.ico');
const ICON_STEALTH = path.join(__dirname, '..', '..', 'assets', 'icon-stealth.ico');

class TrayManager {
  constructor({ onToggle, onSetEdge, onSetBossKey, onSetAutoStart, onQuit, onHiderBind, onHiderUnbind, onSetMode }) {
    this.handlers = { onToggle, onSetEdge, onSetBossKey, onSetAutoStart, onQuit, onHiderBind, onHiderUnbind, onSetMode };
    this.stealth = false;
    this.bossKeyOk = true;
    this.tray = null;
  }

  create() {
    const icon = nativeImage.createFromPath(ICON_NORMAL);
    this.tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
    this.tray.setToolTip(config.load().normalTrayLabel);
    this.tray.on('click', () => this.handlers.onToggle());
    this.rebuild();
    return this.tray;
  }

  setStealth(active) {
    this.stealth = Boolean(active);
    const c = config.load();
    const label = this.stealth ? c.stealthTrayLabel : c.normalTrayLabel;
    const iconPath = this.stealth ? ICON_STEALTH : ICON_NORMAL;
    const icon = nativeImage.createFromPath(iconPath);
    if (!icon.isEmpty()) this.tray.setImage(icon);
    this.tray.setToolTip(label);
    this.rebuild();
  }

  setBossKeyStatus(ok) {
    this.bossKeyOk = ok;
    this.rebuild();
  }

  rebuild() {
    if (!this.tray) return;
    const c = config.load();
    const mode = c.mode === 'edge' ? 'edge' : 'free';
    const edges = [
      { key: 'right', label: '右侧' },
      { key: 'left', label: '左侧' },
      { key: 'top', label: '顶部' },
      { key: 'bottom', label: '底部' }
    ];
    const menu = Menu.buildFromTemplate([
      {
        label: this.stealth ? '恢复阅读窗' : '隐藏阅读窗',
        click: () => this.handlers.onToggle()
      },
      { type: 'separator' },
      {
        label: '定位模式',
        submenu: [
          {
            label: '自由摆放（可拖动）',
            type: 'radio',
            checked: mode === 'free',
            click: () => this.handlers.onSetMode('free')
          },
          {
            label: '贴边隐藏',
            type: 'radio',
            checked: mode === 'edge',
            click: () => this.handlers.onSetMode('edge')
          }
        ]
      },
      {
        label: '贴边位置',
        enabled: mode === 'edge',
        submenu: edges.map((e) => ({
          label: e.label,
          type: 'radio',
          checked: c.edge === e.key,
          click: () => this.handlers.onSetEdge(e.key)
        }))
      },
      {
        label: `老板键：${c.bossKey}${this.bossKeyOk ? '' : '（注册失败，点此更换）'}`,
        click: () => this.handlers.onSetBossKey()
      },
      {
        label: `窗口隐藏器${this.hiderLabel(c)}`,
        submenu: [
          {
            label: '绑定前台窗口（3秒倒计时，去点目标窗口）',
            click: () => this.handlers.onHiderBind()
          },
          {
            label: '解除绑定',
            enabled: Boolean(c.hiderTarget),
            click: () => this.handlers.onHiderUnbind()
          }
        ]
      },
      {
        label: '开机自启',
        type: 'checkbox',
        checked: Boolean(c.openAtLogin),
        click: (item) => this.handlers.onSetAutoStart(item.checked)
      },
      { type: 'separator' },
      { label: '退出', click: () => this.handlers.onQuit() }
    ]);
    this.tray.setContextMenu(menu);
  }

  hiderLabel(c) {
    if (!c.hiderTarget) return '：未绑定';
    const t = c.hiderTarget.title || c.hiderTarget.className || '';
    return `：${t.slice(0, 12)}`;
  }

  destroy() {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}

module.exports = { TrayManager };
