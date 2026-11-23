'use strict';

const { globalShortcut } = require('electron');

class BossKey {
  constructor(onTrigger) {
    this.onTrigger = onTrigger;
    this.accelerator = null;
    this.active = false;
  }

  register(accelerator) {
    this.unregister();
    const ok = globalShortcut.register(accelerator, () => this.trigger());
    this.accelerator = ok ? accelerator : null;
    return { ok, accelerator };
  }

  unregister() {
    if (this.accelerator) {
      globalShortcut.unregister(this.accelerator);
      this.accelerator = null;
    }
  }

  trigger() {
    this.active = !this.active;
    if (typeof this.onTrigger === 'function') {
      this.onTrigger(this.active);
    }
    return this.active;
  }

  setActive(active) {
    this.active = Boolean(active);
  }

  isActive() {
    return this.active;
  }

  destroy() {
    this.unregister();
    globalShortcut.unregisterAll();
  }
}

module.exports = { BossKey };
