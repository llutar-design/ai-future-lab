/**
 * AI FUTURE LAB — Windows 키오스크 실행기 (Electron)
 *  - 전체 화면 키오스크 모드, 메뉴 막대 없음
 *  - 로컬 파일 외 모든 네트워크 요청 차단 (오프라인 보장)
 *  - 화면 꺼짐 방지, 렌더러 오류 시 자동 재시작
 *  - 실행 옵션: --windowed (설치/점검용 창 모드)
 */
const { app, BrowserWindow, ipcMain, powerSaveBlocker, session, Menu } = require('electron');
const path = require('node:path');

const windowed = process.argv.includes('--windowed');

// 부팅 직후 첫 발판 입력 전에도 효과음·음성 안내가 나오도록
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let win = null;

  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  const createWindow = () => {
    win = new BrowserWindow({
      width: 1920,
      height: 1080,
      fullscreen: !windowed,
      kiosk: !windowed,
      autoHideMenuBar: true,
      backgroundColor: '#000000',
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        spellcheck: false,
      },
    });
    Menu.setApplicationMenu(null);
    win.once('ready-to-show', () => win.show());
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

    // 외부 페이지 이동/새 창 차단
    win.webContents.on('will-navigate', (e, url) => {
      if (!url.startsWith('file://')) e.preventDefault();
    });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    // 렌더러가 죽으면 다시 불러오기
    win.webContents.on('render-process-gone', (_e, details) => {
      console.error('render-process-gone', details.reason);
      setTimeout(() => win && !win.isDestroyed() && win.reload(), 1500);
    });
    win.on('unresponsive', () => setTimeout(() => win && !win.isDestroyed() && win.reload(), 3000));
  };

  app.whenReady().then(() => {
    // 오프라인 보장: file://, devtools 외 요청 차단
    session.defaultSession.webRequest.onBeforeRequest((details, cb) => {
      const u = details.url;
      const ok = u.startsWith('file://') || u.startsWith('devtools://') || u.startsWith('data:') || u.startsWith('blob:');
      cb({ cancel: !ok });
    });
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    powerSaveBlocker.start('prevent-display-sleep');
    createWindow();
  });

  ipcMain.on('kiosk:fullscreen', (_e, v) => {
    if (!win || windowed) return;
    win.setKiosk(!!v);
    win.setFullScreen(!!v);
  });
  ipcMain.on('kiosk:quit', () => app.quit());

  app.on('window-all-closed', () => app.quit());
}
