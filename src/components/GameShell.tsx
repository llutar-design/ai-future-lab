import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { GameMeta } from '../app/gameIds';
import { useApp } from '../app/store';
import { play, type Sfx } from '../audio/sound';
import { speak, stopSpeech } from '../audio/speech';
import { useFootControls } from '../input/controls';
import { addSession } from '../storage/db';
import { Abot, type Mood } from './Abot';

export interface GameSummary {
  headline: string;
  stats: { label: string; value: string }[];
  lessons: string[];
  metric?: string;
}

export interface GameApi {
  setProgress: (step: number, total: number, mission: string) => void;
  /** 자막 + 음성 안내 */
  say: (text: string) => void;
  sfx: (s: Sfx) => void;
  /** 진행 중 요약(시간 초과 시 결과 화면에 사용) */
  report: (s: GameSummary) => void;
  finish: (s: GameSummary) => void;
  secondsLeft: () => number;
}

export interface IntroPage {
  title: string;
  text: string;
  mood?: Mood;
}

interface Props {
  meta: GameMeta;
  minutes: number;
  intro: IntroPage[];
  onExit: () => void;
  onRestart: () => void;
  children: (api: GameApi) => ReactNode;
}

type Phase = 'intro' | 'play' | 'result';

export function GameShell({ meta, minutes, intro, onExit, onRestart, children }: Props) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [page, setPage] = useState(0);
  const [progress, setProgressState] = useState({ step: 0, total: 1, mission: '' });
  const [result, setResult] = useState<{ summary: GameSummary; timeUp: boolean } | null>(null);
  const endAt = useRef(0);
  const startedAt = useRef(Date.now());
  const latest = useRef<GameSummary>({ headline: '체험을 마쳤어요', stats: [], lessons: [] });
  const finished = useRef(false);
  const setSubtitle = useApp((s) => s.setSubtitle);

  const api = useMemo<GameApi>(
    () => ({
      setProgress: (step, total, mission) => setProgressState({ step, total, mission }),
      say: (text) => {
        setSubtitle(text);
        speak(text);
      },
      sfx: (s) => play(s),
      report: (s) => {
        latest.current = s;
      },
      finish: (s) => {
        if (finished.current) return;
        finished.current = true;
        latest.current = s;
        setResult({ summary: s, timeUp: false });
        setPhase('result');
      },
      secondsLeft: () => Math.max(0, (endAt.current - performance.now()) / 1000),
    }),
    [setSubtitle],
  );

  // 인트로 안내
  useEffect(() => {
    if (phase !== 'intro') return;
    const p = intro[page];
    setSubtitle(p.text);
    speak(page === 0 ? `${meta.speakName}. ${p.text}` : p.text);
  }, [phase, page, intro, meta.speakName, setSubtitle]);

  // 제한 시간
  useEffect(() => {
    if (phase !== 'play') return;
    endAt.current = performance.now() + minutes * 60_000;
    const t = setTimeout(() => {
      if (finished.current) return;
      finished.current = true;
      play('warn');
      setResult({ summary: latest.current, timeUp: true });
      setPhase('result');
    }, minutes * 60_000);
    return () => clearTimeout(t);
  }, [phase, minutes]);

  // 결과 기록 + 음성
  useEffect(() => {
    if (phase !== 'result' || !result) return;
    play('success');
    const text = result.timeUp ? `시간이 다 되었어요. ${result.summary.headline}` : result.summary.headline;
    setSubtitle(text);
    speak(text);
    void addSession({
      game: meta.id,
      startedAt: startedAt.current,
      durationSec: Math.round((Date.now() - startedAt.current) / 1000),
      completed: !result.timeUp,
      metric: result.summary.metric,
    });
  }, [phase, result, meta.id, setSubtitle]);

  useEffect(() => () => stopSpeech(), []);

  // 테스트 훅 (?test=1 일 때만)
  useEffect(() => {
    if (!isTestMode()) return;
    const w = window as unknown as { __aifl?: Record<string, unknown> };
    w.__aifl = { ...(w.__aifl ?? {}), phase, forceFinish: () => api.finish({ ...latest.current, headline: latest.current.headline }) };
  }, [phase, api]);

  const lastPage = page >= intro.length - 1;
  useFootControls(
    {
      label: lastPage ? '설명 처음부터' : `설명 넘기기 (${page + 1}/${intro.length})`,
      run: () => {
        play('move');
        setPage((p) => (p + 1) % intro.length);
      },
    },
    {
      label: '체험 시작!',
      run: () => {
        play('select');
        startedAt.current = Date.now();
        setPhase('play');
      },
    },
    phase === 'intro',
  );

  // 게임 화면은 한 번만 만들어 HUD 갱신 때 다시 렌더링되지 않게 합니다.
  const playElement = useMemo(() => (phase === 'play' ? children(api) : null), [phase === 'play']); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="game-shell" style={{ ['--accent' as string]: meta.color }}>
      {phase === 'intro' && (
        <div className="intro screen-enter">
          <div className="intro-head">
            <Abot costume={meta.costume} mood={intro[page].mood ?? 'happy'} size={260} talking />
            <div>
              <div className="intro-kicker">{meta.tech}</div>
              <h1 className="intro-title">{meta.name}</h1>
              <div className="intro-time">예상 체험 시간 {minutes}분</div>
            </div>
          </div>
          <div className="intro-card" key={page}>
            <h2>{intro[page].title}</h2>
            <p>{intro[page].text}</p>
            <div className="intro-dots">
              {intro.map((_, i) => (
                <span key={i} className={i === page ? 'on' : ''} />
              ))}
            </div>
          </div>
        </div>
      )}
      {phase === 'play' && (
        <>
          <Hud meta={meta} progress={progress} endAt={endAt} />
          <div className="play-area">{playElement}</div>
        </>
      )}
      {phase === 'result' && result && <ResultScreen meta={meta} result={result} onExit={onExit} onRestart={onRestart} />}
    </div>
  );
}

export function isTestMode() {
  return typeof location !== 'undefined' && new URLSearchParams(location.search).has('test');
}

function Hud({ meta, progress, endAt }: { meta: GameMeta; progress: { step: number; total: number; mission: string }; endAt: React.RefObject<number> }) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    const tick = () => setLeft(Math.max(0, Math.ceil((endAt.current - performance.now()) / 1000)));
    tick();
    const i = setInterval(tick, 500);
    return () => clearInterval(i);
  }, [endAt]);
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');
  return (
    <div className="hud">
      <div className="hud-title">
        <span className="hud-dot" />
        {meta.name}
      </div>
      <div className="hud-mission">
        <span className="hud-mission-k">현재 미션</span>
        {progress.mission}
      </div>
      <div className="hud-steps">
        {Array.from({ length: progress.total }, (_, i) => (
          <span key={i} className={i < progress.step ? 'done' : i === progress.step ? 'now' : ''}>
            {i + 1}
          </span>
        ))}
      </div>
      <div className={`hud-timer ${left <= 30 ? 'warn' : ''}`}>
        ⏱ {mm}:{ss}
      </div>
    </div>
  );
}

function ResultScreen({
  meta,
  result,
  onExit,
  onRestart,
}: {
  meta: GameMeta;
  result: { summary: GameSummary; timeUp: boolean };
  onExit: () => void;
  onRestart: () => void;
}) {
  const seconds = useApp((s) => s.settings.resultSeconds);
  const [left, setLeft] = useState(seconds);
  const exitRef = useRef(onExit);
  exitRef.current = onExit;
  useEffect(() => {
    const started = performance.now();
    const i = setInterval(() => {
      const l = Math.max(0, seconds - Math.floor((performance.now() - started) / 1000));
      setLeft(l);
      if (l <= 0) {
        clearInterval(i);
        exitRef.current();
      }
    }, 250);
    return () => clearInterval(i);
  }, [seconds]);

  useFootControls(
    { label: '다시 도전', run: () => (play('select'), onRestart()) },
    { label: '메인 메뉴', run: () => (play('select'), onExit()) },
  );
  const s = result.summary;
  return (
    <div className="result screen-enter">
      <div className="result-left">
        <Abot costume={meta.costume} mood="happy" size={240} />
        <div className="result-countdown">{left}초 뒤 메인 메뉴로 돌아가요</div>
      </div>
      <div className="result-main">
        <div className="result-kicker">{result.timeUp ? '시간 종료' : '체험 완료'} · {meta.name}</div>
        <h1>{s.headline}</h1>
        <div className="result-stats">
          {s.stats.map((st) => (
            <div className="result-stat" key={st.label}>
              <div className="rs-label">{st.label}</div>
              <div className={`rs-value ${st.value.length > 14 ? 'rs-small' : ''}`}>{st.value}</div>
            </div>
          ))}
        </div>
        <div className="result-lessons">
          {s.lessons.map((l, i) => (
            <div key={i} className="lesson">
              💡 {l}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
