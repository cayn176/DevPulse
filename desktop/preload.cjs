const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('devpulse', Object.freeze({
  isDesktop: true,
  saveAppearance: values => ipcRenderer.invoke('devpulse:appearance', values),
  chooseFolder: () => ipcRenderer.invoke('devpulse:choose-folder'),
  openVSCode: (path) => ipcRenderer.invoke('devpulse:open-vscode', path),
  openExternal: (url) => ipcRenderer.invoke('devpulse:open-external', url),
  appInfo: () => ipcRenderer.invoke('devpulse:app-info'),
}));
