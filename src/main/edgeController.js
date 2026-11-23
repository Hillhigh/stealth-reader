'use strict';

const { EventEmitter } = require('events');
const { screen } = require('electron');
const config = require('./config');

const STATE = Object.freeze({
  HIDDEN: 'HIDDEN',
  SHOWING: 'SHOWING',
  VISIBLE: 'VISIBLE',
  HIDING: 'HIDING',
  STEALTH: 'STEALTH'
});

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function pointInRect(px, py, rect) {
  return px >= rect.x && px <= rect.x + rect.width &&
         py >= rect.y && py <= rect.y + rect.height;
}

class EdgeController extends EventEmitter {
  constructor(win) {
    super();
    this.win = win;
    this.state = STATE.HIDDEN;
    this.preStealthState = STATE.HIDDEN;
    this.pollTimer = null;
    this.animTimer = null;
    this.saveTimer = null;
    this.leftAt = null;
    this.display = null;
    this.firstRunHoldUntil = 0;
    this.holdVisible = false;
    this._bounds = { x: 0, y: 0, width: 0, height: 0 };
    this._dragging = false;
    this._dragMoved = false;
    this._onConfigChanged = this._onConfigChanged.bind(this);
    config.emitter.on('changed', this._onConfigChanged);
    this._bindDragEvents();
  }

  mode() {
    return config.load().mode === 'edge' ? 'edge' : 'free';
  }

  start(opts = {}) {
    const firstRun = Boolean(opts.firstRun);
    // 透明无边框窗口以 show:false 创建，必须显式 show 才会真正绘制
    try { this.win.showInactive(); } catch (_) {
      try { this.win.show(); } catch (__) {}
    }
    if (this.mode() === 'free') {
      this._placeAt(this._freeBounds());
    } else {
      this._placeAt(this._hiddenBounds());
    }
    if (firstRun) {
      // 首次启动：正常显示，由 renderer 展示提示浮层，不进入隐藏态
      this._setOpacity(1);
      this._setClickThrough(false);
      this.state = STATE.VISIBLE;
      this.leftAt = null;
      // 首次提示期间不要因鼠标移出而淡出，给足 60 秒
      this.firstRunHoldUntil = Date.now() + 60000;
    } else {
      this._setOpacity(this.mode() === 'free' ? this._idleOpacity() : 1);
      this._setClickThrough(true);
      this.state = STATE.HIDDEN;
      this.leftAt = null;
    }
    this._startPoll();
    this.emit('state', this.state);
  }

  /** 首次提示结束后调用，进入常规隐藏逻辑 */
  finishFirstRun() {
    this.firstRunHoldUntil = 0;
    if (this.state === STATE.VISIBLE || this.state === STATE.SHOWING) {
      this.hide();
    }
  }

  /** UI 面板打开时暂停自动隐藏 */
  setHoldVisible(hold) {
    this.holdVisible = Boolean(hold);
    if (this.holdVisible) {
      this.leftAt = null;
      if (this.state === STATE.HIDDEN) this.show();
    }
  }

  getState() {
    return this.state;
  }

  show() {
    if (this.state !== STATE.HIDDEN) return;
    if (this.mode() === 'free') {
      this._setClickThrough(false);
      this._fadeTo(1, () => {
        this.state = STATE.VISIBLE;
        this.leftAt = null;
        this.emit('state', this.state);
      });
    } else {
      this._animateTo(this._visibleBounds(), () => {
        this.state = STATE.VISIBLE;
        this.leftAt = null;
        this._setClickThrough(false);
        this.emit('state', this.state);
      });
    }
    this.state = STATE.SHOWING;
    this.emit('state', this.state);
  }

  hide() {
    if (this.state !== STATE.VISIBLE) return;
    if (this.mode() === 'free') {
      this._fadeTo(this._idleOpacity(), () => {
        this.state = STATE.HIDDEN;
        this.leftAt = null;
        this._setClickThrough(true);
        this.emit('state', this.state);
      });
    } else {
      this._animateTo(this._hiddenBounds(), () => {
        this.state = STATE.HIDDEN;
        this.leftAt = null;
        this._setClickThrough(true);
        this.emit('state', this.state);
      });
    }
    this.state = STATE.HIDING;
    this.emit('state', this.state);
  }

  toggle() {
    if (this.state === STATE.HIDDEN) this.show();
    else if (this.state === STATE.VISIBLE) this.hide();
  }

  enterStealth() {
    if (this.state === STATE.STEALTH) return;
    this.preStealthState = this.state;
    this._stopAnimation();
    this.state = STATE.STEALTH;
    try { this.win.hide(); } catch (_) {}
    this.emit('state', this.state);
  }

  exitStealth() {
    if (this.state !== STATE.STEALTH) return;
    try { this.win.show(); } catch (_) {}
    this.leftAt = null;
    const restored = this.preStealthState;
    if (this.mode() === 'free') {
      this._placeAt(this._freeBounds());
    } else {
      this._placeAt(restored === STATE.VISIBLE ? this._visibleBounds() : this._hiddenBounds());
    }
    this._setOpacity(this.mode() === 'free' && restored !== STATE.VISIBLE
      ? this._idleOpacity() : 1);
    this._setClickThrough(restored !== STATE.VISIBLE);
    this.state = restored;
    this.emit('state', this.state);
  }

  refreshBounds() {
    if (this.state === STATE.STEALTH) return;
    if (this.mode() === 'free') {
      this._stopAnimation();
      this._placeAt(this._freeBounds());
      return;
    }
    if (this.state === STATE.HIDDEN || this.state === STATE.HIDING) {
      this._stopAnimation();
      this._placeAt(this._hiddenBounds());
      this.state = STATE.HIDDEN;
      this._setClickThrough(true);
      this.emit('state', this.state);
    } else if (this.state === STATE.VISIBLE || this.state === STATE.SHOWING) {
      this._stopAnimation();
      this._placeAt(this._visibleBounds());
      this.state = STATE.VISIBLE;
      this.leftAt = null;
      this._setClickThrough(false);
      this.emit('state', this.state);
    }
  }

  destroy() {
    this._stopPoll();
    this._stopAnimation();
    this._flushDragSave();
    config.emitter.removeListener('changed', this._onConfigChanged);
    this.removeAllListeners();
  }

  _onConfigChanged(changedKeys) {
    if (changedKeys.has('edge') || changedKeys.has('windowWidth') ||
        changedKeys.has('windowHeight') || changedKeys.has('revealPx') ||
        changedKeys.has('mode')) {
      this.refreshBounds();
    }
    if (changedKeys.has('idleOpacity') && this.state === STATE.HIDDEN && this.mode() === 'free') {
      this._setOpacity(this._idleOpacity());
    }
  }

  // ---------- 拖动持久化 ----------
  _bindDragEvents() {
    this.win.on('will-move', () => { this._dragging = true; this._dragMoved = false; });
    this.win.on('move', () => {
      if (this._dragging) this._dragMoved = true;
    });
    this.win.on('moved', () => {
      if (!this._dragMoved) return;
      const b = this.win.getBounds();
      this._bounds = { ...b };
      if (this.saveTimer) clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => this._flushDragSave(), 300);
    });
  }

  _flushDragSave() {
    if (!this._dragMoved) return;
    this._dragMoved = false;
    if (this.mode() !== 'free' || this.state === STATE.STEALTH) return;
    const b = this._bounds;
    if (Number.isFinite(b.x) && Number.isFinite(b.y)) {
      config.update({ windowX: Math.round(b.x), windowY: Math.round(b.y) });
    }
  }

  // ---------- 轮询 ----------
  _startPoll() {
    this._stopPoll();
    const interval = Math.max(20, Number(config.load().pollMs) || 60);
    this.pollTimer = setInterval(() => this._poll(), interval);
  }

  _stopPoll() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  _poll() {
    if (this._dragging) return;
    if (this.state === STATE.STEALTH || this.state === STATE.SHOWING || this.state === STATE.HIDING) {
      return;
    }
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    this.display = display;

    if (this.state === STATE.HIDDEN) {
      if (this.mode() === 'free') {
        // 向外扩 8px 容差，避免淡出后窗口边界微调导致移回命中不到
        const b = this._bounds;
        const pad = 8;
        if (pointInRect(cursor.x, cursor.y, {
          x: b.x - pad, y: b.y - pad,
          width: b.width + pad * 2, height: b.height + pad * 2
        })) this.show();
      } else if (pointInRect(cursor.x, cursor.y, this._triggerRect(display))) {
        this.show();
      }
      return;
    }

    if (this.state === STATE.VISIBLE) {
      if (this.holdVisible) return; // 面板打开时不自动隐藏
      if (pointInRect(cursor.x, cursor.y, this._bounds)) {
        this.leftAt = null;
      } else {
        const now = Date.now();
        if (now < this.firstRunHoldUntil) return; // 首次提示宽限期内不淡出
        const grace = Number(config.load().graceMs) || 0;
        // 宽限期为 0：鼠标一移出当帧立即淡出，不等待下一轮轮询
        if (grace <= 0) {
          this.hide();
          return;
        }
        if (this.leftAt === null) this.leftAt = now;
        if (now - this.leftAt >= grace) {
          this.hide();
        }
      }
    }
  }

  _idleOpacity() {
    const v = Number(config.load().idleOpacity);
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.06;
  }

  _triggerRect(display) {
    const c = config.load();
    const wa = display.workArea;
    const W = Number(c.windowWidth);
    const H = Number(c.windowHeight);
    const band = Math.max(8, Number(c.triggerBandPx));
    switch (c.edge) {
      case 'left':
        return { x: wa.x, y: wa.y + (wa.height - H) / 2, width: band, height: H };
      case 'top':
        return { x: wa.x + (wa.width - W) / 2, y: wa.y, width: W, height: band };
      case 'bottom':
        return { x: wa.x + (wa.width - W) / 2, y: wa.y + wa.height - band, width: W, height: band };
      case 'right':
      default:
        return { x: wa.x + wa.width - band, y: wa.y + (wa.height - H) / 2, width: band, height: H };
    }
  }

  _hiddenBounds() {
    return this._computeBounds(true);
  }

  _visibleBounds() {
    return this._computeBounds(false);
  }

  /** free 模式：用户保存的位置；无保存则屏幕中偏上 */
  _freeBounds() {
    const c = config.load();
    const W = Number(c.windowWidth);
    const H = Number(c.windowHeight);
    const display = this.display || screen.getPrimaryDisplay();
    const wa = display.workArea;
    let x = c.windowX;
    let y = c.windowY;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      x = wa.x + Math.round((wa.width - W) / 2);
      y = wa.y + Math.round((wa.height - H) / 3);
    }
    // 纠偏：确保窗口至少有一部分在屏幕内
    x = Math.max(wa.x - W + 60, Math.min(x, wa.x + wa.width - 60));
    y = Math.max(wa.y - H + 60, Math.min(y, wa.y + wa.height - 60));
    return { x: Math.round(x), y: Math.round(y), width: W, height: H };
  }

  _computeBounds(hidden) {
    const c = config.load();
    const display = this.display || screen.getPrimaryDisplay();
    const wa = display.workArea;
    const W = Number(c.windowWidth);
    const H = Number(c.windowHeight);
    const reveal = Math.max(2, Number(c.revealPx));
    let x, y;
    switch (c.edge) {
      case 'left':
        x = hidden ? wa.x - (W - reveal) : wa.x;
        y = wa.y + (wa.height - H) / 2;
        break;
      case 'top':
        x = wa.x + (wa.width - W) / 2;
        y = hidden ? wa.y - (H - reveal) : wa.y;
        break;
      case 'bottom':
        x = wa.x + (wa.width - W) / 2;
        y = hidden ? wa.y + wa.height - reveal : wa.y + wa.height - H;
        break;
      case 'right':
      default:
        x = hidden ? wa.x + wa.width - reveal : wa.x + wa.width - W;
        y = wa.y + (wa.height - H) / 2;
        break;
    }
    return { x: Math.round(x), y: Math.round(y), width: W, height: H };
  }

  _placeAt(bounds) {
    this._bounds = { ...bounds };
    try {
      this.win.setBounds({
        x: bounds.x, y: bounds.y,
        width: bounds.width, height: bounds.height
      });
    } catch (err) {
      console.warn('[edge] setBounds 失败:', err.message);
    }
  }

  _setClickThrough(enabled) {
    try {
      this.win.setIgnoreMouseEvents(enabled, { forward: true });
    } catch (_) {}
  }

  _setOpacity(value) {
    try {
      this.win.setOpacity(Math.min(1, Math.max(0, value)));
    } catch (_) {}
  }

  _stopAnimation() {
    if (this.animTimer) {
      clearInterval(this.animTimer);
      this.animTimer = null;
    }
  }

  _fadeTo(targetOpacity, done) {
    this._stopAnimation();
    const duration = Math.max(80, Number(config.load().animationMs));
    const from = this.win.getOpacity();
    const start = Date.now();
    this.animTimer = setInterval(() => {
      const elapsed = Date.now() - start;
      const t = Math.min(1, elapsed / duration);
      const k = easeOutCubic(t);
      this._setOpacity(from + (targetOpacity - from) * k);
      if (t >= 1) {
        this._stopAnimation();
        if (typeof done === 'function') done();
      }
    }, 16);
  }

  _animateTo(target, done) {
    this._stopAnimation();
    const duration = Math.max(60, Number(config.load().animationMs));
    const from = { ...this._bounds };
    const start = Date.now();
    this.animTimer = setInterval(() => {
      const elapsed = Date.now() - start;
      const t = Math.min(1, elapsed / duration);
      const k = easeOutCubic(t);
      const next = {
        x: Math.round(from.x + (target.x - from.x) * k),
        y: Math.round(from.y + (target.y - from.y) * k),
        width: target.width,
        height: target.height
      };
      this._placeAt(next);
      if (t >= 1) {
        this._stopAnimation();
        if (typeof done === 'function') done();
      }
    }, 16);
  }
}

module.exports = { EdgeController, STATE };
