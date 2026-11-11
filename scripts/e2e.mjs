/**
 * 통합 E2E 테스트 (실제 브라우저 = 설치된 Microsoft Edge 사용, 추가 다운로드 없음)
 *
 *  node scripts/e2e.mjs            헤드리스 실행
 *  node scripts/e2e.mjs --headed   화면에 창을 띄워 실제 GPU로 실행(FPS 측정용)
 *  node scripts/e2e.mjs --quick    20회 연속 체험을 4회로 줄여 빠르게
 *
 * 발판 입력은 키보드 A(=O), D(=X)로 보냅니다. 외부 네트워크 요청은 모두 차단·기록합니다(오프라인 검증).
 * 결과: tests/e2e-report.md, tests/screenshots/*.png
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const HEADED = process.argv.includes('--headed');
const QUICK = process.argv.includes('--quick');
const PORT = 4173;
const BASE = `http://localhost:${PORT}/?test=1`;
const PRESS_GAP = 420; // 입력 잠금(350ms)보다 길게
mkdirSync('tests/screenshots', { recursive: true });

const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
};

function startServer() {
  const p = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('preview 서버 시작 실패')), 20000);
    p.stdout.on('data', (d) => {
      if (String(d).includes('localhost')) {
        clearTimeout(t);
        resolve(p);
      }
    });
    p.on('exit', (c) => reject(new Error('preview 종료 ' + c)));
  });
}

let rngState = 12345;
const rand = () => ((rngState = (rngState * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: !HEADED,
    args: ['--enable-precise-memory-info', '--js-flags=--expose-gc', '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const external = [];
  const consoleErrors = [];
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith(`http://localhost:${PORT}`) || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
    external.push(u);
    return route.abort();
  });
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

  const press = async (pedal) => {
    const key = pedal === 'O' ? 'a' : 'd';
    await page.keyboard.down(key);
    await sleep(60);
    await page.keyboard.up(key);
    await sleep(PRESS_GAP);
  };
  const pads = () =>
    page.evaluate(() => {
      const get = (s) => {
        const el = document.querySelector(`.pad-${s}`);
        return { label: el?.querySelector('.pad-label')?.textContent ?? '', on: !!el && !el.classList.contains('pad-off') };
      };
      return { O: get('O'), X: get('X') };
    });
  const has = (sel) => page.evaluate((s) => !!document.querySelector(s), sel);
  const waitFor = async (sel, ms = 10000) => {
    try {
      await page.waitForSelector(sel, { timeout: ms });
      return true;
    } catch {
      return false;
    }
  };
  const selectedCard = () => page.evaluate(() => Number(document.querySelector('.card-sel .card-num')?.textContent ?? -1));
  const heapMB = () =>
    page.evaluate(() => {
      (window.gc ?? (() => {}))();
      return Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576);
    });
  const measureFps = (ms = 2000) =>
    page.evaluate(
      (ms) =>
        new Promise((res) => {
          let n = 0;
          const t0 = performance.now();
          const f = () => {
            n++;
            if (performance.now() - t0 < ms) requestAnimationFrame(f);
            else res(Math.round((n * 1000) / (performance.now() - t0)));
          };
          requestAnimationFrame(f);
        }),
      ms,
    );
  const goToMenuCard = async (k) => {
    for (let i = 0; i < 5 && (await selectedCard()) !== k + 1; i++) await press('O');
  };

  // ---------- 1. 메인 메뉴 ----------
  await page.goto(BASE);
  record('메인 메뉴 표시', await waitFor('.menu'));
  await sleep(800);
  await page.screenshot({ path: 'tests/screenshots/00-menu.png' });
  const seq = [await selectedCard()];
  for (let i = 0; i < 4; i++) {
    await press('O');
    seq.push(await selectedCard());
  }
  record('O 발판 메뉴 순환 1→2→3→4→1', seq.join() === '1,2,3,4,1', seq.join('→'));
  const cursorHidden = await page.evaluate(() => getComputedStyle(document.querySelector('.viewport')).cursor === 'none');
  record('마우스 커서 숨김', cursorHidden);

  // ---------- 2. 동시 입력 ----------
  await page.keyboard.down('a');
  await sleep(15);
  await page.keyboard.down('d');
  await sleep(120);
  const notice = await page.evaluate(() => document.querySelector('.notice')?.textContent ?? '');
  await page.keyboard.up('a');
  await page.keyboard.up('d');
  await sleep(500);
  record('동시 입력 감지 및 무시', notice.includes('하나씩') && (await selectedCard()) === 1, notice);

  // ---------- 3. 길게 밟기 (키 반복) ----------
  await page.keyboard.down('a');
  for (let i = 0; i < 10; i++) {
    await page.keyboard.down('a'); // repeat
    await sleep(50);
  }
  await page.keyboard.up('a');
  await sleep(PRESS_GAP);
  record('길게 밟기 시 한 번만 이동', (await selectedCard()) === 2, `선택=${await selectedCard()}`);

  // 화면의 O/X 버튼 클릭·터치 (웹 체험용)
  await page.click('.pad-O');
  await sleep(PRESS_GAP);
  record('화면 O 버튼 클릭으로 메뉴 이동', (await selectedCard()) === 3, `선택=${await selectedCard()}`);
  await goToMenuCard(0);

  // ---------- 4. 관리자 메뉴 ----------
  await page.keyboard.press('Control+Shift+M');
  const loginShown = await waitFor('.admin-login', 3000);
  await page.fill('.admin-login input', '0000');
  await page.keyboard.press('Enter');
  await sleep(300);
  const wrongBlocked = !(await has('.admin'));
  await page.fill('.admin-login input', '2580');
  await page.keyboard.press('Enter');
  const adminOk = await waitFor('.admin', 3000);
  if (adminOk) {
    await page.click('text=발판 · 진단');
    await sleep(300);
    await page.keyboard.down('a');
    await sleep(80);
    await page.keyboard.up('a');
    await sleep(300);
    const diag = await page.evaluate(() => document.querySelector('.diag-log')?.textContent ?? '');
    record('발판 입력 진단 화면 기록', diag.includes('O 밟음'), diag.slice(0, 40));
    await page.screenshot({ path: 'tests/screenshots/01-admin.png' });
    for (const tab of ['게임 · 시간', '화면 · 소리', '통계 · 데이터', '시스템']) {
      await page.click(`text=${tab}`);
      await sleep(250);
    }
    await page.screenshot({ path: 'tests/screenshots/02-admin-system.png' });
  }
  record('관리자 메뉴: 단축키·비밀번호 확인', loginShown && wrongBlocked && adminOk);
  await page.keyboard.press('Escape');
  await sleep(300);
  record('관리자 화면 중 발판 입력이 메뉴로 새지 않음', (await selectedCard()) === 1);

  // ---------- 5. 게임별 전체 플레이 (발판 입력만으로) ----------
  const gameNames = ['AI 훈련 연구소', 'AI 자율주행 연구소', 'AI 딥페이크 탐정단', 'AI 강화학습 아레나'];
  for (let k = 0; k < 4; k++) {
    await goToMenuCard(k);
    await press('X');
    const intro = await waitFor('.intro', 8000);
    await press('O');
    await press('X');
    const play = await waitFor('.play-area', 5000);
    await sleep(1500);
    const canvases = await page.evaluate(() => document.querySelectorAll('canvas.three-canvas').length);
    await page.screenshot({ path: `tests/screenshots/1${k}-${k}-start.png` });
    const t0 = Date.now();
    let steps = 0;
    let shots = 0;
    let observedOnce = false;
    let stuckSince = Date.now();
    let lastSig = '';
    let fps = null;
    let crashed = false;
    while (!(await has('.result')) && Date.now() - t0 < 6 * 60_000) {
      if ((await has('.menu')) || (await page.evaluate(() => document.querySelector('.center-msg')?.textContent?.includes('문제') ?? false))) {
        crashed = true;
        break;
      }
      const p = await pads();
      const sig = p.O.label + p.X.label + p.O.on + p.X.on;
      if (sig !== lastSig) {
        lastSig = sig;
        stuckSince = Date.now();
      }
      let choice = null;
      if (k === 3) {
        if (p.X.label === '학습 시작!') choice = 'X';
        else if (p.O.label === '다음 항목') choice = 'O';
        else if (p.O.label === '빠르게 학습' && p.O.on) choice = 'O';
        else if (p.X.label === '학습 마치기' && p.X.on) choice = 'X';
        else if (p.O.label === '보상 규칙 바꾸기' && p.O.on && !observedOnce) {
          observedOnce = true;
          choice = 'O';
        } else if (p.X.on) choice = 'X';
      } else if (p.O.on && p.X.on) choice = rand() < 0.5 ? 'O' : 'X';
      else if (p.X.on) choice = 'X';
      else if (p.O.on && !p.O.label.includes('센서')) choice = 'O';
      if (choice) {
        await press(choice);
        steps++;
        if (steps % 12 === 0 && shots < 4) {
          await page.screenshot({ path: `tests/screenshots/1${k}-${k}-play${shots++}.png` });
        }
        if (fps === null && canvases > 0 && steps === 6) fps = await measureFps();
      } else await sleep(300);
      if (Date.now() - stuckSince > 60_000) break;
    }
    await page.screenshot({ path: `tests/screenshots/1${k}-${k}-result.png` });
    const kicker = await page.evaluate(() => document.querySelector('.result-kicker')?.textContent ?? '');
    const finished = !crashed && (await has('.result')) && kicker.includes(gameNames[k]) && kicker.includes('체험 완료');
    const resultText = finished ? await page.evaluate(() => document.querySelector('.result-main h1')?.textContent ?? '') : '';
    record(
      `${gameNames[k]}: 발판만으로 끝까지 플레이`,
      intro && play && finished,
      `${crashed ? '중간에 오류/메뉴 복귀 · ' : ''}입력 ${steps}회 · ${Math.round((Date.now() - t0) / 1000)}초${canvases ? ` · 3D 캔버스 ${canvases}개` : ''}${fps !== null ? ` · ${fps}FPS` : ''} · "${resultText}"`,
    );
    if (!finished) {
      // 다음 테스트를 위해 메뉴로 복구
      await page.evaluate(() => window.__aifl?.forceFinish?.());
      await sleep(500);
    }
    await press('X');
    record(`${gameNames[k]}: 결과 화면 → X → 메인 메뉴`, await waitFor('.menu', 5000));
    const leftover = await page.evaluate(() => document.querySelectorAll('canvas.three-canvas').length);
    record(`${gameNames[k]}: 3D 렌더러 해제`, leftover === 0, `남은 3D 캔버스 ${leftover}개`);
  }

  // ---------- 6. 결과 화면 자동 복귀 ----------
  await goToMenuCard(2);
  await press('X');
  await waitFor('.intro');
  await press('X');
  await waitFor('.play-area');
  await page.evaluate(() => window.__aifl?.forceFinish?.());
  await waitFor('.result', 3000);
  const autoBack = await waitFor('.menu', 20000);
  record('결과 화면 15초 후 자동 메인 복귀', autoBack);

  const SETTINGS_KEY = 'aifl.settings.v1';
  const originalSettings = await page.evaluate((k) => localStorage.getItem(k), SETTINGS_KEY);

  // ---------- 6-1. 체험 중 관리자 설정 변경 (회귀 테스트) ----------
  await goToMenuCard(3);
  await press('X');
  await waitFor('.intro');
  await press('X');
  await waitFor('.play-area');
  await sleep(1500);
  const cursorBefore = await page.evaluate(() => [...document.querySelectorAll('.choice')].findIndex((c) => c.classList.contains('cursor')));
  await page.keyboard.press('Control+Shift+M');
  await waitFor('.admin-login', 3000);
  await page.fill('.admin-login input', '2580');
  await page.keyboard.press('Enter');
  await waitFor('.admin', 3000);
  await page.click('text=화면 · 소리');
  await page.selectOption('.admin select >> nth=0', 'low');
  await page.click('text=게임 · 시간');
  await page.selectOption('.admin select >> nth=0', 'high'); // 학년 5~6
  await page.keyboard.press('Escape');
  await sleep(800);
  const canvasesAfter = await page.evaluate(() => document.querySelectorAll('canvas.three-canvas').length);
  const mazeName = await page.evaluate(() => document.querySelector('.ar-maze-name')?.textContent ?? '');
  await press('O');
  const cursorAfter = await page.evaluate(() => [...document.querySelectorAll('.choice')].findIndex((c) => c.classList.contains('cursor')));
  const stillPlaying = (await has('.play-area')) && !(await has('.center-msg'));
  record(
    '체험 중 관리자 설정 변경 → 진행 중인 게임 유지',
    canvasesAfter === 1 && stillPlaying && mazeName.includes('6×6') && cursorAfter === (cursorBefore + 1) % 6,
    `3D 캔버스 ${canvasesAfter}개 · 미로 "${mazeName.split(' 실제')[0]}" 유지 · 커서 ${cursorBefore}→${cursorAfter}`,
  );
  await page.evaluate(() => window.__aifl?.forceFinish?.());
  await waitFor('.result', 3000);
  await press('X');
  await waitFor('.menu', 5000);
  // 바뀐 설정은 다음 체험부터 적용
  await goToMenuCard(3);
  await press('X');
  await waitFor('.intro');
  await press('X');
  await waitFor('.play-area');
  await sleep(1200);
  const mazeNext = await page.evaluate(() => document.querySelector('.ar-maze-name')?.textContent ?? '');
  record('바뀐 설정은 다음 체험부터 적용', mazeNext.includes('7×7'), `다음 체험 미로 "${mazeNext.split(' 실제')[0]}"`);
  await page.evaluate(() => window.__aifl?.forceFinish?.());
  await waitFor('.result', 3000);
  await press('X');
  await waitFor('.menu', 5000);

  // ---------- 6-2. 무입력 안내 → 메인 메뉴 복귀 (짧은 시간으로 설정) ----------
  await page.evaluate(
    ([k, v]) => {
      const s = JSON.parse(v ?? '{}');
      localStorage.setItem(k, JSON.stringify({ ...s, idleWarnSeconds: 5, idleReturnSeconds: 20 }));
    },
    [SETTINGS_KEY, originalSettings],
  );
  await page.reload();
  await waitFor('.menu');
  await goToMenuCard(0);
  await press('X');
  await waitFor('.intro');
  await press('X');
  await waitFor('.play-area');
  const tIdle = Date.now();
  const warned = await waitFor('.idle-warn', 12000);
  const warnAt = Math.round((Date.now() - tIdle) / 1000);
  const back = await waitFor('.menu', 30000);
  const backAt = Math.round((Date.now() - tIdle) / 1000);
  record('무입력 안내 표시 후 메인 메뉴 자동 복귀', warned && back, `안내 ${warnAt}초 · 복귀 ${backAt}초 (설정 5초/20초)`);
  // 원래 설정 복원
  await page.evaluate(([k, v]) => (v ? localStorage.setItem(k, v) : localStorage.removeItem(k)), [SETTINGS_KEY, originalSettings]);
  await page.reload();
  await waitFor('.menu');

  // ---------- 7. 연속 체험 + 메모리 ----------
  const N = QUICK ? 4 : 20;
  const heap0 = await heapMB();
  const heaps = [];
  let okRuns = 0;
  for (let n = 0; n < N; n++) {
    const k = n % 4;
    await goToMenuCard(k);
    await press('X');
    if (!(await waitFor('.intro', 8000))) continue;
    await press('X');
    if (!(await waitFor('.play-area', 5000))) continue;
    await sleep(1800);
    for (let i = 0; i < 3; i++) await press(rand() < 0.5 ? 'O' : 'X');
    await page.evaluate(() => window.__aifl?.forceFinish?.());
    if (!(await waitFor('.result', 3000))) continue;
    await press('X');
    if (await waitFor('.menu', 5000)) okRuns++;
    heaps.push(await heapMB());
  }
  const heap1 = await heapMB();
  record(`연속 ${N}회 체험 (4개 게임 순환)`, okRuns === N, `${okRuns}/${N}회 정상 복귀`);
  record('장시간 메모리 사용량', heap1 - heap0 < 60, `JS 힙 ${heap0}MB → ${heap1}MB (기록: ${heaps.join(', ')})`);

  // ---------- 8. 오프라인/오류 ----------
  record('오프라인: 외부 네트워크 요청 0건', external.length === 0, external.slice(0, 3).join(', '));
  const realErrors = consoleErrors.filter((e) => !e.includes('net::ERR') && !e.includes('favicon'));
  record('콘솔 오류 없음', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

  await browser.close();
  server.kill();

  const pass = results.filter((r) => r.ok).length;
  const md = [
    '# E2E 테스트 결과',
    '',
    `- 실행: ${new Date().toLocaleString('ko-KR')} · 브라우저: Microsoft Edge (${HEADED ? '화면 표시' : '헤드리스'}) · 1920×1080`,
    `- 결과: **${pass}/${results.length} 통과**`,
    '',
    '| 결과 | 항목 | 상세 |',
    '|---|---|---|',
    ...results.map((r) => `| ${r.ok ? '✅' : '❌'} | ${r.name} | ${r.detail.replace(/\|/g, '/')} |`),
    '',
  ].join('\n');
  writeFileSync(HEADED ? 'tests/e2e-report-headed.md' : 'tests/e2e-report.md', md);
  console.log(`\n${pass}/${results.length} 통과`);
  process.exit(pass === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
