const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('fabBrowser', {
  initial: () => ipcRenderer.invoke('initial'),
  library: () => ipcRenderer.invoke('library'), bookmark: () => ipcRenderer.invoke('bookmark'),
  navigate: value => ipcRenderer.invoke('navigate', String(value)),
  back: () => ipcRenderer.invoke('back'), forward: () => ipcRenderer.invoke('forward'),
  reload: () => ipcRenderer.invoke('reload'), developer: () => ipcRenderer.invoke('developer'),
  onState: callback => { const listener = (_event, state) => callback(state); ipcRenderer.on('state', listener); return () => ipcRenderer.removeListener('state', listener); },
});
