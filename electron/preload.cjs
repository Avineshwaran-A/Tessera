// Narrow, typed bridge: the renderer never gets Node or raw ipcRenderer.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tesseraNative', {
  platform: process.platform,
  loadWorkspace: () => ipcRenderer.sendSync('ws:load'),
  saveWorkspace: text => ipcRenderer.invoke('ws:save', text),
  saveWorkspaceSync: text => ipcRenderer.sendSync('ws:saveSync', text),
  exportWorkspace: text => ipcRenderer.invoke('ws:export', text),
  importWorkspace: () => ipcRenderer.invoke('ws:import'),
  revealData: () => ipcRenderer.invoke('app:revealData'),
  info: () => ipcRenderer.sendSync('app:info'),
  quit: () => ipcRenderer.send('app:quit'),
  window: {
    minimize: () => ipcRenderer.send('win:minimize'),
    toggleMaximize: () => ipcRenderer.send('win:toggleMaximize'),
    close: () => ipcRenderer.send('win:close'),
    toggleFullscreen: () => ipcRenderer.send('win:toggleFullscreen'),
    toggleDevTools: () => ipcRenderer.send('win:devtools'),
    state: () => ipcRenderer.sendSync('win:state'),
    onState: cb => { const h = (_e, st) => cb(st); ipcRenderer.on('win:state', h); return () => ipcRenderer.removeListener('win:state', h); },
    onFocus: cb => { const h = (_e, f) => cb(f); ipcRenderer.on('win:focus', h); return () => ipcRenderer.removeListener('win:focus', h); },
  },
  onCommand: cb => {
    const h = (_e, id) => cb(id);
    ipcRenderer.on('app:command', h);
    return () => ipcRenderer.removeListener('app:command', h);
  },
});
