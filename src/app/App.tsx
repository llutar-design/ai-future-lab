import { useEffect, useMemo, useRef, useState } from 'react';
import { AdminPanel } from '../admin/AdminPanel';
import { setSoundOptions, play } from '../audio/sound';
import { repeatLastSpeech, setSpeechOptions, speak } from '../audio/speech';
import { Background } from '../components/Background';
import { FootBar } from '../components/FootBar';
import { Overlays } from '../components/Overlays';
import { dispatchPedal } from '../input/controls';
import { applyInputSettings, getInputRuntime } from '../input/runtime';
import { IdleManager } from '../kiosk/IdleManager';
import { addLog } from '../storage/db';
import { GameHost } from './GameHost';
import { MainMenu } from './MainMenu';
import { enabledList, useApp } from './store';

declare global {
  interface Window {
    kioskApi?: { isElectron: boolean; setFullscreen: (v: boolean) => void; quit: () => void };
  }
}

export function App() {
  const settings = useApp((s) => s.settings);
  const screen = useApp((s) => s.kiosk.screen);
  const adminOpen = useApp((s) => s.adminOpen);
  const rt = useMemo(() => getInputRuntime(useApp.getState().settings), []);
  const scale = useStageScale(settings.fit);

  useEffect(() => {
    applyInputSettings(settings);
    setSoundOptions({ volume: settings.volume, enabled: settings.sfx });
    setSpeechOptions({ enabled: settings.voice, rate: settings.voiceRate, volume: settings.volume });
  }, [settings]);

  // 발판 입력 → 현재 화면 컨트롤
  const idleRef = useRef<IdleManager | null>(null);
  useEffect(() => {
    const offPress = rt.input.subscribe((e) => {
      idleRef.current?.activity(performance.now());
      const st = useApp.getState();
      // 관리자 화면(발판 진단)이 열려 있으면 게임/메뉴로 전달하지 않음
      if (st.adminOpen) return;
      if (st.idleWarning) st.setIdleWarning(false);
      st.setPressFx(e.pedal);
      if (st.settings.kioskFullscreen && !window.kioskApi && !document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      }
      dispatchPedal(e.pedal);
    });
    const offSimul = rt.input.onSimultaneous(() => {
      play('warn');
      useApp.getState().showNotice('발판을 하나씩 밟아 주세요!');
    });
    return () => {
      offPress();
      offSimul();
    };
  }, [rt]);

  // 관리자 메뉴 단축키 (별도 키보드의 Ctrl+Shift+M)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyM') {
        e.preventDefault();
        useApp.getState().setAdminOpen(true);
      }
      // 키오스크에서 브라우저 단축키 차단
      if (!useApp.getState().adminOpen && (e.code === 'F5' || (e.ctrlKey && ['KeyR', 'KeyW', 'KeyP', 'KeyS'].includes(e.code)))) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    rt.keyboard.suspended = adminOpen;
    rt.gamepad.suspended = adminOpen;
    rt.input.enabled = !adminOpen;
    if (!adminOpen) rt.input.releaseAll();
  }, [adminOpen, rt]);

  // 무입력: 안내 반복 → 메인 메뉴 복귀
  useEffect(() => {
    const idle = new IdleManager(
      { warnAfterSec: settings.idleWarnSeconds, returnAfterSec: settings.idleReturnSeconds },
      {
        onWarn: () => {
          const st = useApp.getState();
          if (st.adminOpen) return;
          if (st.kiosk.screen === 'game') {
            st.setIdleWarning(true);
            repeatLastSpeech();
          } else speak('O 발판으로 연구소를 고르고, X 발판으로 체험을 시작해요.');
        },
        onTimeout: () => {
          const st = useApp.getState();
          if (st.adminOpen) return idle.activity(performance.now());
          st.setIdleWarning(false);
          if (st.kiosk.screen === 'game') {
            void addLog('info', '장시간 입력이 없어 메인 메뉴로 돌아갔습니다');
            st.dispatch({ type: 'exitToMenu', enabled: enabledList(st.settings) });
          }
          idle.activity(performance.now());
        },
      },
      performance.now(),
    );
    idleRef.current = idle;
    const i = setInterval(() => {
      // AI 관찰 장면(자동 주행, 학습 관찰 등)에서는 무입력으로 보지 않음
      if (useApp.getState().watching > 0) idle.activity(performance.now());
      idle.tick(performance.now());
    }, 1000);
    return () => clearInterval(i);
  }, [settings.idleWarnSeconds, settings.idleReturnSeconds]);

  // 화면 전환 시 무입력 타이머 초기화
  useEffect(() => idleRef.current?.activity(performance.now()), [screen]);

  // Electron 전체 화면
  useEffect(() => window.kioskApi?.setFullscreen(settings.kioskFullscreen), [settings.kioskFullscreen]);

  const q = settings.quality === 'auto' ? 'high' : settings.quality;
  return (
    <div className={`viewport ${adminOpen ? 'show-cursor' : ''}`}>
      <div className="stage" style={{ transform: `translate(-50%, -50%) scale(${scale.x}, ${scale.y})` }}>
        {screen === 'menu' && <Background quality={q} />}
        {screen === 'menu' ? <MainMenu /> : <GameHost />}
        <FootBar />
        <Overlays />
      </div>
      {adminOpen && <AdminPanel />}
    </div>
  );
}

/** 1920×1080 무대를 창 크기에 맞춰 확대/축소 */
function useStageScale(fit: 'contain' | 'cover') {
  const calc = () => {
    const sx = window.innerWidth / 1920;
    const sy = window.innerHeight / 1080;
    if (fit === 'cover') return { x: sx, y: sy };
    const s = Math.min(sx, sy);
    return { x: s, y: s };
  };
  const [scale, setScale] = useState(calc);
  useEffect(() => {
    const on = () => setScale(calc());
    on();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [fit]); // eslint-disable-line react-hooks/exhaustive-deps
  return scale;
}
