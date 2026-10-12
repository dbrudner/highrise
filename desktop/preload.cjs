// Exposes a tiny, explicit API to the game as `window.native`.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('native', {
  platform: process.platform,
  deck: ipcRenderer.sendSync('app:info').deck,
  steam: ipcRenderer.sendSync('steam:info'),
  readSave: () => ipcRenderer.sendSync('save:read'),
  writeSave: data => ipcRenderer.sendSync('save:write', data),
  unlockAchievement: id => ipcRenderer.send('steam:achievement', id),
  toggleFullscreen: () => ipcRenderer.send('app:fullscreen'),
  quit: () => ipcRenderer.send('app:quit'),
  onMenu: cb => ipcRenderer.on('menu', (_e, act) => cb(act)),
});
