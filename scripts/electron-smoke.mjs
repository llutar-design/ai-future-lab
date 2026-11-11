/**
 * Electron 키오스크 실행 확인: dist/를 file://로 불러와 메인 메뉴 → 게임 진입 → 복귀까지 확인
 *   npm run build && node scripts/electron-smoke.mjs
 *   node scripts/electron-smoke.mjs --packaged   (release\win-unpacked 의 배포본 실행 확인)
 */
import { _electron as electron } from 'playwright-core';

const packaged = process.argv.includes('--packaged');
const app = await electron.launch(
  packaged ? { executablePath: 'release/win-unpacked/AI FUTURE LAB.exe', args: ['--windowed'] } : { args: ['.', '--windowed'] },
);
const win = await app.firstWindow();
const errors = [];
win.on('pageerror', (e) => errors.push(e.message));
win.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const press = async (k) => {
  await win.keyboard.down(k);
  await sleep(60);
  await win.keyboard.up(k);
  await sleep(450);
};
let ok = true;
const check = (name, v) => {
  console.log(`${v ? '✅' : '❌'} ${name}`);
  ok &&= v;
};
try {
  await win.waitForSelector('.menu', { timeout: 15000 });
  check('Electron(file://)에서 메인 메뉴 표시', true);
  check('kioskApi 노출', await win.evaluate(() => !!window.kioskApi?.isElectron));
  await press('d'); // 1번 게임 실행
  check('게임 인트로 진입', !!(await win.waitForSelector('.intro', { timeout: 8000 }).catch(() => null)));
  await press('d');
  check('게임 시작', !!(await win.waitForSelector('.play-area', { timeout: 8000 }).catch(() => null)));
  await win.screenshot({ path: 'tests/screenshots/electron-game.png' });
  // 외부 요청 차단 확인
  const blocked = await win.evaluate(() =>
    fetch('https://example.com/')
      .then(() => false)
      .catch(() => true),
  );
  check('외부 네트워크 요청 차단', blocked);
  check('페이지 오류 없음', errors.filter((e) => !e.includes('example.com') && !e.includes('ERR_BLOCKED')).length === 0);
  if (errors.length) console.log(errors.slice(0, 5));
} catch (e) {
  console.error(e);
  ok = false;
} finally {
  await app.close();
}
process.exit(ok ? 0 : 1);
