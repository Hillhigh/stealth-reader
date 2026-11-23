'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('readerAPI', {
  getConfig: () => ipcRenderer.invoke('app:get-config'),
  setConfig: (patch) => ipcRenderer.invoke('app:set-config', patch),
  toggleStealth: () => ipcRenderer.invoke('app:toggle-stealth'),
  hide: () => ipcRenderer.invoke('app:hide'),
  completeFirstRun: () => ipcRenderer.invoke('app:complete-first-run'),
  holdVisible: (hold) => ipcRenderer.invoke('app:hold-visible', hold),
  setEdge: (edgeName) => ipcRenderer.invoke('app:set-edge', edgeName),
  quit: () => ipcRenderer.invoke('app:quit'),
  onStateChanged: (callback) => {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('state:changed', (event, state) => callback(state));
  }
});
