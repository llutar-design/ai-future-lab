const { contextBridge, ipcRenderer } = require('electron');

// 화면(웹) 쪽에 최소한의 키오스크 기능만 노출
contextBridge.exposeInMainWorld('kioskApi', {
  isElectron: true,
  setFullscreen: (v) => ipcRenderer.send('kiosk:fullscreen', !!v),
  quit: () => ipcRenderer.send('kiosk:quit'),
});
