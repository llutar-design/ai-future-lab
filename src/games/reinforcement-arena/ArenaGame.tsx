import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameProps } from '../../app/GameHost';
import { useWatching } from '../../app/store';
import { fmtPct, movingAverage } from '../../ai/evaluation/metrics';
import { newSeed } from '../../ai/rng';
import { QLearner, evaluateAgent, type EvalResult } from '../../ai/training/qlearning';
import { BarChart, LineChart } from '../../components/Charts';
import { GameShell, type GameApi } from '../../components/GameShell';
import { useFootControls } from '../../input/controls';
import { DEFAULT_RULES, GridEnv, MAZES, RULE_INFO, type RewardRules } from '../../simulation/gridworld';
import { ArenaScene } from './ArenaScene';

const ROBOT_COLORS = ['#94a3b8', '#fbbf24', '#f472b6'];
const ROBOT_NAMES = ['학습 전 로봇', '1차 학습 로봇', '2차 학습 로봇'];
const MAX_EPISODES = 400;
const MIN_EPISODES = 40;
const EVAL_TRIALS = 20;
const SEC_PER_STEP = 0.5;

export default function ArenaGame(props: GameProps) {
  return (
    <GameShell
      meta={props.meta}
      minutes={props.minutes}
      onExit={props.onExit}
      onRestart={props.onRestart}
      intro={[
        { title: '로봇 코치가 되어 볼까요?', text: '로봇은 처음엔 길을 하나도 몰라요. 여러 번 부딪히고 실패하면서 스스로 길을 배워요. 이것을 강화학습이라고 해요.' },
        { title: '보상이 선생님이에요', text: '좋은 행동에는 점수(보상)를, 나쁜 행동에는 벌점을 줘요. 로봇은 점수를 가장 많이 받는 방법을 찾아요.', mood: 'think' },
        { title: '진행 순서', text: '보상 규칙 정하기 → 학습 관찰 → 규칙 바꿔 다시 학습 → 로봇 챔피언십에서 학습 전후 실력 비교!' },
      ]}
    >
      {(api) => <ArenaPlay api={api} grade={props.grade} quality={props.quality} />}
    </GameShell>
  );
}

type Step = 'rules' | 'learn' | 'observe' | 'champ';

interface Round {
  rules: RewardRules;
  agent: QLearner;
}

function ArenaPlay({ api, grade, quality }: { api: GameApi; grade: GameProps['grade']; quality: GameProps['quality'] }) {
  const maze = MAZES[grade];
  const env = useMemo(() => new GridEnv(maze, DEFAULT_RULES), [maze]);
  const seed = useMemo(() => newSeed(), []);
  const holder = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<ArenaScene | null>(null);
  const [step, setStep] = useState<Step>('rules');
  const [rounds, setRounds] = useState<Round[]>([]);
  const [champ, setChamp] = useState<EvalResult[] | null>(null);

  useEffect(() => {
    const s = new ArenaScene(holder.current!, env, quality);
    s.setRobots([ROBOT_COLORS[1]]);
    setScene(s);
    return () => s.dispose();
  }, [env, quality]);

  const roundNo = rounds.length;
  const stepIdx = step === 'rules' ? (roundNo === 0 ? 0 : 3) : step === 'learn' ? (roundNo <= 1 ? 1 : 3) : step === 'observe' ? (roundNo <= 1 ? 2 : 3) : 4;
  useEffect(() => {
    const m: Record<Step, string> = {
      rules: roundNo === 0 ? '로봇에게 줄 보상 규칙 정하기' : '보상 규칙을 바꿔 보기',
      learn: '로봇이 시행착오로 배우는 모습 관찰하기',
      observe: '학습한 로봇의 실력 확인하기',
      champ: '로봇 챔피언십: 학습 전후 비교',
    };
    api.setProgress(stepIdx, 5, m[step]);
  }, [step, roundNo, stepIdx, api]);

  useEffect(() => api.report(summary(rounds, champ)), [rounds, champ, api]);

  const current = rounds[rounds.length - 1];

  return (
    <div className="ar">
      <div className="ar-3d" ref={holder}>
        <div className="ar-maze-name">
          {maze.name} <span className="tag tag-real">실제 Q-learning</span>
        </div>
      </div>
      <div className="ar-side">
        {step === 'rules' && (
          <RulesStep
            api={api}
            initial={current?.rules ?? DEFAULT_RULES}
            round={roundNo}
            onStart={(rules) => {
              env.rules = rules;
              const agent = new QLearner(env.numStates, 4, seed + roundNo * 17);
              setRounds((r) => [...r, { rules, agent }]);
              scene?.setRobots([ROBOT_COLORS[Math.min(2, roundNo + 1)]]);
              scene?.showPolicy(null);
              setStep('learn');
            }}
          />
        )}
        {step === 'learn' && current && scene && (
          <LearnStep
            key={roundNo}
            api={api}
            env={env}
            agent={current.agent}
            scene={scene}
            onDone={() => setStep('observe')}
          />
        )}
        {step === 'observe' && current && scene && (
          <ObserveStep
            api={api}
            env={env}
            agent={current.agent}
            scene={scene}
            canChange={roundNo < 2}
            onChange={() => setStep('rules')}
            onChamp={() => setStep('champ')}
          />
        )}
        {step === 'champ' && scene && (
          <ChampStep
            api={api}
            env={env}
            rounds={rounds}
            scene={scene}
            seed={seed}
            result={champ}
            setResult={setChamp}
            onFinish={() => api.finish(summary(rounds, champ))}
          />
        )}
      </div>
    </div>
  );
}

function rulesText(r: RewardRules) {
  const on = RULE_INFO.filter((i) => r[i.key]).map((i) => i.name);
  return on.length ? on.join(', ') : '보상 없음';
}

function summary(rounds: Round[], champ: EvalResult[] | null) {
  const stats: { label: string; value: string }[] = rounds.map((r, i) => ({
    label: `${i + 1}차 학습 (${r.agent.episodes}회)`,
    value: rulesText(r.rules),
  }));
  if (champ) {
    champ.forEach((c, i) => stats.push({ label: `${ROBOT_NAMES[i]} 도달률`, value: fmtPct(c.successRate) }));
  }
  let headline = '로봇이 보상을 받으며 스스로 길을 배웠어요!';
  if (champ && champ.length > 1) {
    const best = champ.slice(1).reduce((a, b) => (b.successRate > a.successRate ? b : a));
    headline =
      best.successRate > champ[0].successRate
        ? `학습 전 ${fmtPct(champ[0].successRate)} → 학습 후 ${fmtPct(best.successRate)}! 로봇이 시행착오로 실력을 키웠어요.`
        : '이번 보상 규칙으로는 로봇이 목표를 잘 찾지 못했어요. 보상 설계가 정말 중요해요!';
  }
  return {
    headline,
    stats: stats.slice(0, 6),
    lessons: [
      'AI는 보상을 최대화하도록 행동을 학습합니다. 어떤 보상을 주는지가 매우 중요해요.',
      '처음에는 마구 돌아다니며(탐험) 실패하지만, 경험이 쌓이면 배운 대로(활용) 움직여요.',
      '보상을 잘못 주면 로봇이 엉뚱한 행동을 배울 수 있어요. 예: 목표 보상 없이 걸음 벌점만 주면 일찍 끝내려고 위험 구역에 뛰어들기도 해요.',
    ],
    metric: champ ? champ.map((c) => Math.round(c.successRate * 100)).join('/') : undefined,
  };
}

function RulesStep({ api, initial, round, onStart }: { api: GameApi; initial: RewardRules; round: number; onStart: (r: RewardRules) => void }) {
  const [rules, setRules] = useState<RewardRules>({ ...initial });
  const [cursor, setCursor] = useState(0);
  const items = RULE_INFO.length + 1;
  useEffect(() => {
    api.say(
      round === 0
        ? 'O 발판으로 규칙을 고르고 X 발판으로 켜고 끌 수 있어요. 다 정했으면 학습 시작을 골라 X를 밟아요.'
        : '보상 규칙을 바꿔 보세요. 규칙이 바뀌면 로봇은 처음부터 다시 배워요.',
    );
  }, [api, round]);
  const onStartItem = cursor === RULE_INFO.length;
  useFootControls(
    { label: '다음 항목', run: () => (api.sfx('move'), setCursor((c) => (c + 1) % items)) },
    {
      label: onStartItem ? '학습 시작!' : rules[RULE_INFO[cursor].key] ? '이 규칙 끄기' : '이 규칙 켜기',
      run: () => {
        if (onStartItem) {
          api.sfx('success');
          onStart(rules);
        } else {
          api.sfx('select');
          const k = RULE_INFO[cursor].key;
          setRules((r) => ({ ...r, [k]: !r[k] }));
        }
      },
    },
  );
  const none = !Object.values(rules).some(Boolean);
  return (
    <div className="ar-panel">
      <h2>{round === 0 ? '1단계 · 보상 규칙 정하기' : '4단계 · 보상 규칙 바꾸기'}</h2>
      <div className="choice-list">
        {RULE_INFO.map((r, i) => (
          <div key={r.key} className={`choice ${cursor === i ? 'cursor' : ''} ${rules[r.key] ? 'checked' : ''}`}>
            <span className="box">{rules[r.key] ? '✓' : ''}</span>
            <div>
              {r.name}
              <small>{r.desc}</small>
            </div>
          </div>
        ))}
        <div className={`choice choice-start ${onStartItem ? 'cursor' : ''}`}>
          <span className="box">▶</span>
          <div>
            학습 시작
            <small>{none ? '⚠ 보상이 하나도 없으면 로봇은 배울 것이 없어요' : '이 규칙으로 로봇을 훈련해요'}</small>
          </div>
        </div>
      </div>
    </div>
  );
}

function LearnStep({ api, env, agent, scene, onDone }: { api: GameApi; env: GridEnv; agent: QLearner; scene: ArenaScene; onDone: () => void }) {
  const [fast, setFast] = useState(false);
  const [, setTick] = useState(0);
  const fastRef = useRef(fast);
  fastRef.current = fast;
  const stopped = useRef(false);

  useEffect(() => api.say('로봇이 학습을 시작했어요! 처음에는 이리저리 헤매지만 점점 길을 찾아갈 거예요.'), [api]);

  useEffect(() => {
    stopped.current = false;
    let timer: ReturnType<typeof setTimeout>;
    const cycle = () => {
      if (stopped.current) return;
      // 화면에 보이지 않는 에피소드도 실제로 학습합니다
      const silent = fastRef.current ? 24 : 3;
      for (let i = 0; i < silent && agent.episodes < MAX_EPISODES; i++) agent.runEpisode(env, { learn: true, explore: true });
      if (agent.episodes >= MAX_EPISODES) {
        setTick((t) => t + 1);
        return;
      }
      const ep = agent.runEpisode(env, { learn: true, explore: true });
      setTick((t) => t + 1);
      scene.showPolicy(agent.Q);
      const speed = fastRef.current ? 40 : 14;
      const shown = ep.path.length > 80 ? ep.path.slice(0, 80) : ep.path;
      scene.playPath(0, shown, speed, () => {
        if (ep.success) api.sfx('correct');
        else if (ep.ended === 'danger') api.sfx('wrong');
        timer = setTimeout(cycle, fastRef.current ? 60 : 250);
      });
    };
    cycle();
    return () => {
      stopped.current = true;
      clearTimeout(timer);
    };
  }, [agent, env, scene, api]);

  const done = agent.episodes >= MAX_EPISODES;
  useWatching(!done);
  useEffect(() => {
    if (done) api.say('최대 학습 횟수에 도달했어요. 로봇의 실력을 확인해 봐요!');
  }, [done, api]);

  useFootControls(
    { label: fast ? '보통 속도로' : '빠르게 학습', disabled: done, run: () => (api.sfx('move'), setFast((f) => !f)) },
    {
      label: agent.episodes < MIN_EPISODES ? `학습 중… (${MIN_EPISODES}회 이후 종료 가능)` : '학습 마치기',
      disabled: agent.episodes < MIN_EPISODES,
      run: () => {
        stopped.current = true;
        api.sfx('select');
        onDone();
      },
    },
  );

  const h = agent.history;
  const last20 = h.slice(-20);
  const succ = last20.length ? last20.filter((e) => e.success).length / last20.length : 0;
  const rewards = movingAverage(
    h.map((e) => e.totalReward),
    10,
  );
  const succCurve = movingAverage(
    h.map((e) => (e.success ? 1 : 0)),
    20,
  );
  const lastEp = h[h.length - 1];
  return (
    <div className="ar-panel">
      <h2>2·3단계 · 학습 관찰</h2>
      <div className="ar-stats">
        <Stat k="학습 에피소드" v={`${agent.episodes} / ${MAX_EPISODES}`} />
        <Stat k="탐험률 ε" v={`${Math.round(agent.epsilon * 100)}%`} />
        <Stat k="최근 20회 성공률" v={fmtPct(succ)} />
        <Stat k="이번 누적 보상" v={lastEp ? lastEp.totalReward.toFixed(1) : '-'} />
        <Stat k="이번 충돌 횟수" v={lastEp ? `${lastEp.collisions}회` : '-'} />
        <Stat k="이번 이동 칸 수" v={lastEp ? `${lastEp.moved}칸` : '-'} />
      </div>
      <div className="chart-title">에피소드별 누적 보상 (10회 평균)</div>
      <LineChart series={[{ name: '누적 보상', color: '#fbbf24', values: rewards }]} width={700} height={190} />
      <div className="chart-title">성공률 (20회 평균)</div>
      <LineChart series={[{ name: '성공률', color: '#34d399', values: succCurve }]} width={700} height={170} yMin={0} yMax={1} percent />
      <div className="muted">화면에는 일부 에피소드만 보여줘요. 화살표는 로봇이 지금까지 배운 "가장 좋은 방향"이에요.</div>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="ar-stat">
      <div className="ar-stat-k">{k}</div>
      <div className="ar-stat-v">{v}</div>
    </div>
  );
}

function ObserveStep({
  api,
  env,
  agent,
  scene,
  canChange,
  onChange,
  onChamp,
}: {
  api: GameApi;
  env: GridEnv;
  agent: QLearner;
  scene: ArenaScene;
  canChange: boolean;
  onChange: () => void;
  onChamp: () => void;
}) {
  const [run, setRun] = useState<ReturnType<QLearner['runEpisode']> | null>(null);
  const [playing, setPlaying] = useState(true);
  useWatching(playing);
  useEffect(() => {
    // 탐험 없이 배운 대로만 움직이기
    const r = agent.runEpisode(env, { learn: false, explore: false });
    setRun(r);
    setPlaying(true);
    scene.showPolicy(agent.Q);
    scene.playPath(0, r.path.slice(0, 120), 6, () => {
      setPlaying(false);
      api.sfx(r.success ? 'success' : 'wrong');
      api.say(
        r.success
          ? `배운 대로 움직였더니 ${r.moved}칸 만에 목표에 도착했어요!`
          : r.ended === 'danger'
            ? '로봇이 위험 구역에 빠졌어요. 보상 규칙이나 학습 횟수를 바꿔 볼까요?'
            : '로봇이 아직 목표를 찾지 못했어요. 보상 규칙을 바꿔 볼까요?',
      );
    });
  }, [agent, env, scene, api]);
  useFootControls(
    canChange ? { label: '보상 규칙 바꾸기', disabled: playing, run: () => (api.sfx('select'), onChange()) } : null,
    { label: '로봇 챔피언십', disabled: playing, run: () => (api.sfx('select'), onChamp()) },
  );
  return (
    <div className="ar-panel">
      <h2>학습한 로봇 실력 보기</h2>
      <p className="big">탐험 없이, 배운 대로만 움직여요.</p>
      {run && !playing && (
        <div className="ar-stats">
          <Stat k="결과" v={run.success ? '목표 도착 🏁' : run.ended === 'danger' ? '위험 구역 😵' : '시간 초과 ⏰'} />
          <Stat k="이동 칸 수" v={`${run.moved}칸`} />
          <Stat k="충돌" v={`${run.collisions}회`} />
          <Stat k="최단 경로" v={`${env.shortestPath()}칸`} />
        </div>
      )}
      <div className="muted">
        {canChange
          ? 'O: 보상 규칙을 바꿔서 로봇을 다시 훈련해요. 예) "빠른 도착 보상"을 켜면 더 짧은 길을 찾을까요?'
          : '두 번의 학습을 모두 마쳤어요. 챔피언십에서 비교해 봐요!'}
      </div>
    </div>
  );
}

function ChampStep({
  api,
  env,
  rounds,
  scene,
  seed,
  result,
  setResult,
  onFinish,
}: {
  api: GameApi;
  env: GridEnv;
  rounds: Round[];
  scene: ArenaScene;
  seed: number;
  result: EvalResult[] | null;
  setResult: (r: EvalResult[]) => void;
  onFinish: () => void;
}) {
  const [playing, setPlaying] = useState(true);
  useWatching(playing);
  useEffect(() => {
    // 같은 환경, 같은 조건(탐험 없음)으로 각각 EVAL_TRIALS번 측정
    const untrained = new QLearner(env.numStates, 4, seed + 999);
    const agents = [untrained, ...rounds.map((r) => r.agent)];
    const res = agents.map((a) => evaluateAgent(a, env, EVAL_TRIALS));
    setResult(res);
    scene.setRobots(agents.map((_, i) => ROBOT_COLORS[i]));
    scene.showPolicy(null);
    let left = agents.length;
    res.forEach((r, i) =>
      scene.playPath(i, r.runs[0].path.slice(0, 120), 6, () => {
        if (--left === 0) {
          setPlaying(false);
          api.sfx('success');
        }
      }),
    );
    api.say('로봇 챔피언십! 학습 전 로봇과 학습한 로봇들이 같은 미로에서 스무 번씩 도전해요.');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useFootControls(null, { label: '결과 보기', disabled: playing && !result, run: () => (api.sfx('select'), onFinish()) });
  if (!result) return null;
  const bars = (f: (r: EvalResult) => number, fmt: (v: number) => string) =>
    result.map((r, i) => ({ label: ROBOT_NAMES[i], value: f(r), color: ROBOT_COLORS[i], text: fmt(f(r)) }));
  return (
    <div className="ar-panel ar-champ">
      <h2>5단계 · AI 로봇 챔피언십</h2>
      <div className="muted">같은 미로 · 탐험 없음 · 로봇마다 {EVAL_TRIALS}번 측정</div>
      <div className="chart-title">목표 도달률</div>
      <BarChart bars={bars((r) => r.successRate, fmtPct)} max={1} width={700} rowH={42} />
      <div className="chart-title">평균 이동 거리</div>
      <BarChart bars={bars((r) => r.avgDistance, (v) => `${v.toFixed(1)}칸`)} width={700} rowH={42} />
      <div className="chart-title">평균 소요 시간 (시뮬레이션)</div>
      <BarChart bars={bars((r) => r.avgSteps * SEC_PER_STEP, (v) => `${v.toFixed(1)}초`)} width={700} rowH={42} />
      <div className="chart-title">평균 충돌 횟수</div>
      <BarChart bars={bars((r) => r.avgCollisions, (v) => `${v.toFixed(1)}회`)} width={700} rowH={42} />
    </div>
  );
}
