import { useEffect, useState } from 'react';
import { useApp } from '../app/store';
import { peekInputRuntime } from '../input/runtime';

/** 자막, 알림(동시 입력 등), 무입력 안내, FPS 표시 */
export function Overlays() {
  const subtitle = useApp((s) => s.subtitle);
  const notice = useApp((s) => s.notice);
  const idleWarning = useApp((s) => s.idleWarning);
  const showFps = useApp((s) => s.settings.showFps);
  const screen = useApp((s) => s.kiosk.screen);
  const [noticeVisible, setNoticeVisible] = useState(false);

  useEffect(() => {
    if (!notice) return;
    setNoticeVisible(true);
    const t = setTimeout(() => setNoticeVisible(false), 1600);
    return () => clearTimeout(t);
  }, [notice]);

  return (
    <>
      {screen === 'game' && subtitle && <div className="subtitle">{subtitle}</div>}
      {noticeVisible && notice && <div className="notice">{notice.text}</div>}
      {idleWarning && (
        <div className="idle-warn">
          <div className="idle-warn-box">
            <div className="idle-hand">👣</div>
            아직 체험 중인가요? 발판을 밟으면 계속할 수 있어요!
            <small>입력이 없으면 잠시 후 메인 메뉴로 돌아가요</small>
          </div>
        </div>
      )}
      {showFps && <Fps />}
      <PedalHeldWarning />
    </>
  );
}

function Fps() {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let frames = 0;
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      frames++;
      if (now - last >= 1000) {
        setFps(Math.round((frames * 1000) / (now - last)));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <div className="fps">{fps} FPS</div>;
}

/** 발판 위에 계속 서 있으면 안내 */
function PedalHeldWarning() {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    let since = 0;
    const i = setInterval(() => {
      const rt = peekInputRuntime();
      const down = !!rt && (rt.input.isDown('O') || rt.input.isDown('X'));
      if (down) since += 500;
      else since = 0;
      setHeld(since >= 4000);
    }, 500);
    return () => clearInterval(i);
  }, []);
  if (!held) return null;
  return <div className="notice notice-low">발판에서 발을 떼었다가 다시 밟아 주세요</div>;
}
