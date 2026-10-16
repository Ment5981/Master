const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('masterV2', {
  load: () => ipcRenderer.invoke('master:v2-load'),
  execute: request => ipcRenderer.invoke('master:v2-execute', request),
  undo: revision => ipcRenderer.invoke('master:v2-undo', revision),
  export: () => ipcRenderer.invoke('master:v2-export'),
  getGatewayConfig: () => ipcRenderer.invoke('master:v2-gateway'),
  readLegacy: () => ipcRenderer.invoke('master:v2-legacy'),
  openConfigFolder: () => ipcRenderer.invoke('master:v2-config-folder'),
  subscribe: callback => { const listener = () => callback(); ipcRenderer.on('master:v2-changed', listener); return () => ipcRenderer.removeListener('master:v2-changed', listener) },
})
