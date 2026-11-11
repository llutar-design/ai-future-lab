import { Component, Suspense, lazy, useEffect, useMemo, type ComponentType, type ReactNode } from 'react';
import type { Grade, Quality } from '../admin/settings';
import { stopSpeech } from '../audio/speech';
import { Abot } from '../components/Abot';
import { useFootControls } from '../input/controls';
import { addLog } from '../storage/db';
import { GAME_META, type GameId, type GameMeta } from './gameIds';
import { enabledList, useApp } from './store';

export interface GameProps {
  meta: GameMeta;
  minutes: number;
  grade: Grade;
  quality: Quality;
  onExit: () => void;
  onRestart: () => void;
}

// 게임별로 코드를 나눠 필요할 때만 불러옵니다(모두 로컬 번들에 포함).
const GAMES: Record<GameId, ComponentType<GameProps>> = {
  'ai-training': lazy(() => import('../games/ai-training/TrainingGame')),
  'autonomous-driving': lazy(() => import('../games/autonomous-driving/DrivingGame')),
  'deepfake-detective': lazy(() => import('../games/deepfake-detective/DetectiveGame')),
  'reinforcement-arena': lazy(() => import('../games/reinforcement-arena/ArenaGame')),
};

export function GameHost() {
  const kiosk = useApp((s) => s.kiosk);
  const settings = useApp((s) => s.settings);
  const dispatch = useApp((s) => s.dispatch);
  // 체험 중 관리자가 설정을 바꿔도 진행 중인 게임은 시작할 때의 설정을 유지(3D 장면·미로·타이머 재생성 방지)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const snap = useMemo(() => ({ games: settings.games, grade: settings.grade, quality: settings.quality }), [kiosk.sessionKey]);
  if (!kiosk.gameId) return null;
  const id = kiosk.gameId;
  const Game = GAMES[id];
  const exit = () => {
    stopSpeech();
    useApp.getState().setSubtitle('');
    dispatch({ type: 'exitToMenu', enabled: enabledList(useApp.getState().settings) });
  };
  const restart = () => {
    stopSpeech();
    dispatch({ type: 'restart' });
  };
  return (
    <GameErrorBoundary key={kiosk.sessionKey} onExit={exit}>
      <Suspense fallback={<Loading />}>
        <Game meta={GAME_META[id]} minutes={snap.games[id].minutes} grade={snap.grade} quality={snap.quality} onExit={exit} onRestart={restart} />
      </Suspense>
    </GameErrorBoundary>
  );
}

function Loading() {
  return (
    <div className="center-msg">
      <Abot mood="think" size={200} />
      <div>연구소 문을 여는 중…</div>
    </div>
  );
}

class GameErrorBoundary extends Component<{ children: ReactNode; onExit: () => void }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    void addLog('error', `게임 오류: ${error.message}\n${error.stack ?? ''}`);
  }
  render() {
    if (this.state.error) return <CrashScreen onExit={this.props.onExit} />;
    return this.props.children;
  }
}

/** 오류가 나도 화면이 멈추지 않고 메인 메뉴로 돌아갑니다. */
function CrashScreen({ onExit }: { onExit: () => void }) {
  useFootControls({ label: '메인 메뉴', run: onExit }, { label: '메인 메뉴', run: onExit });
  useEffect(() => {
    const t = setTimeout(onExit, 5000);
    return () => clearTimeout(t);
  }, [onExit]);
  return (
    <div className="center-msg">
      <Abot mood="sad" size={200} />
      <div>앗, 연구소에 작은 문제가 생겼어요. 잠시 후 메인 메뉴로 돌아갑니다.</div>
    </div>
  );
}
