const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('juDesktop',Object.freeze({
  printReport:()=>ipcRenderer.invoke('report:print')
}));
