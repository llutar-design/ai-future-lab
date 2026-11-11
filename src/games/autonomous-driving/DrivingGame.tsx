import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameProps } from '../../app/GameHost';
import { useApp, useWatching } from '../../app/store';
import { accuracy, fmtPct } from '../../ai/evaluation/metrics';
import type { MLP } from '../../ai/models/mlp';
import { createRng, newSeed } from '../../ai/rng';
import { useLiveTraining, type TrainJob } from '../../ai/training/useLiveTraining';
import { BarChart, LineChart, ProgressBar } from '../../components/Charts';
import { GameShell, type GameApi } from '../../components/GameShell';
import { useFootControls } from '../../input/controls';
import { DriveSim } from '../../simulation/driveSim';
import {
  FEATURE_DIM,
  describe,
  detectedObjects,
  encodeScenario,
  finalMissionRoute,
  hazards,
  isSafeToGo,
  randomScenario,
  riskScore,
  sensorConfidence,
  type Scenario,
} from '../../simulation/traffic';
import { getData, setData } from '../../storage/db';
import { CityScene } from './CityScene';

const SIZES = [FEATURE_DIM, 8, 2];
const GO = 1;
const STOP = 0;
const DECISION_KO = ['정지', '출발'];
const ACC_KEY = 'driving.accumulated';

export default function DrivingGame(props: GameProps) {
  return (
    <GameShell
      meta={props.meta}
      minutes={props.minutes}
      onExit={props.onExit}
      onRestart={props.onRestart}
      intro={[
        { title: 'AI 자동차를 가르쳐요', text: '자율주행 자동차는 센서로 주변을 살피고, AI가 출발할지 멈출지 판단해요. 오늘은 여러분이 AI 운전 선생님이에요!' },
        { title: '1단계 · 판단 데이터 만들기', text: '여러 교통 상황을 보고, 출발해도 안전하면 O, 위험하면 X를 밟아요. 여러분의 판단으로 AI가 학습해요.', mood: 'think' },
        { title: '2~4단계 · 주행과 미션', text: 'AI가 직접 운전하고, 여러분이 판단을 승인하거나 고쳐요. 마지막엔 학교까지 안전하게 가는 최종 미션!' },
        { title: '안전 약속', text: '이 자동차에는 AI와 따로 움직이는 "안전 제어기"가 있어요. AI나 사람이 실수해도 위험하면 자동으로 멈춰요. 센서 화면은 가상 시뮬레이션이에요.' },
      ]}
    >
      {(api) => <DrivingPlay api={api} grade={props.grade} quality={props.quality} />}
    </GameShell>
  );
}

type Step = 'collect' | 'train' | 'test' | 'review' | 'retrain' | 'mission';

interface Sample {
  f: number[];
  y: number;
}

export interface DecisionRecord {
  scenario: Scenario;
  title?: string;
  ai: number;
  conf: number;
  final: number;
  truth: number;
  intervened: boolean;
  emergency: boolean;
  reviewed: boolean;
}

function DrivingPlay({ api, grade, quality }: { api: GameApi; grade: GameProps['grade']; quality: GameProps['quality'] }) {
  const seed = useMemo(() => newSeed(), []);
  const rng = useMemo(() => createRng(seed), [seed]);
  const nCollect = grade === 'low' ? 8 : grade === 'mid' ? 10 : 12;
  const holder = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<CityScene | null>(null);
  const [step, setStep] = useState<Step>('collect');
  const [samples, setSamples] = useState<Sample[]>([]);
  const [collectAgree, setCollectAgree] = useState(0);
  const [prior, setPrior] = useState<Sample[]>([]);
  const [model1, setModel1] = useState<MLP | null>(null);
  const [model2, setModel2] = useState<MLP | null>(null);
  const [reviewLog, setReviewLog] = useState<DecisionRecord[]>([]);
  const [testLog, setTestLog] = useState<DecisionRecord[]>([]);
  const [missionLog, setMissionLog] = useState<DecisionRecord[] | null>(null);
  const [evalAcc, setEvalAcc] = useState<{ before: number; after: number | null } | null>(null);
  const accumulate = useApp((s) => s.settings.accumulateDriving);

  // 평가용 문제: 교통 규칙으로 정답을 붙인 60개 상황(같은 세트로 재학습 전후 비교)
  const evalSet = useMemo(() => {
    const r = createRng(seed + 7);
    return Array.from({ length: 60 }, () => randomScenario(r, 0.5));
  }, [seed]);
  const evaluate = (m: MLP) =>
    accuracy(
      evalSet.map((s) => m.predict(encodeScenario(s)).label),
      evalSet.map((s) => (isSafeToGo(s) ? GO : STOP)),
    );

  useEffect(() => {
    const s = new CityScene(holder.current!, quality);
    setScene(s);
    return () => s.dispose();
  }, [quality]);

  useEffect(() => {
    if (!accumulate) return;
    void getData<Sample[]>(ACC_KEY).then((d) => d && setPrior(d.filter((x) => Array.isArray(x.f) && x.f.length === FEATURE_DIM)));
  }, [accumulate]);

  const stepIdx: Record<Step, number> = { collect: 0, train: 0, test: 1, review: 2, retrain: 2, mission: 3 };
  const missions: Record<Step, string> = {
    collect: `교통 상황 ${nCollect}개 판단해서 AI 학습 데이터 만들기`,
    train: '자율주행 AI 훈련하기',
    test: 'AI 혼자 주행 테스트 관찰하기',
    review: 'AI 판단 승인하거나 고치기',
    retrain: '고친 판단으로 AI 다시 학습',
    mission: '최종 미션: 학교까지 안전하게!',
  };
  useEffect(() => api.setProgress(stepIdx[step], 4, missions[step]), [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const summary = () => buildSummary(samples, collectAgree, evalAcc, testLog, reviewLog, missionLog);
  useEffect(() => api.report(summary()), [samples, evalAcc, testLog, reviewLog, missionLog]); // eslint-disable-line react-hooks/exhaustive-deps

  // 학습 작업은 데이터 배열이 바뀔 때만 다시 시작되므로 배열을 고정
  const allTrain = useMemo(() => [...prior, ...samples], [prior, samples]);
  const retrainSamples = useMemo(() => [...allTrain, ...reviewLog.map((r) => ({ f: encodeScenario(r.scenario), y: r.final }))], [allTrain, reviewLog]);

  return (
    <div className="dg">
      <div className="dg-3d" ref={holder} />
      <div className="dg-sim-tag">
        <span className="tag tag-sim">가상 센서 시뮬레이션</span> 실제 카메라 영상을 분석하지 않아요
      </div>
      {scene && step === 'collect' && (
        <CollectStep
          api={api}
          scene={scene}
          rng={rng}
          n={nCollect}
          onDone={(s, agree) => {
            setSamples(s);
            setCollectAgree(agree);
            if (accumulate) void setData(ACC_KEY, [...prior, ...s].slice(-500));
            setStep('train');
          }}
        />
      )}
      {scene && step === 'train' && (
        <TrainPanel
          api={api}
          title="자율주행 AI 훈련"
          samples={allTrain}
          priorCount={prior.length}
          seed={seed}
          agree={collectAgree}
          n={samples.length}
          evaluate={evaluate}
          onDone={(m, acc) => {
            setModel1(m);
            setEvalAcc({ before: acc, after: null });
            setStep('test');
          }}
        />
      )}
      {scene && step === 'test' && model1 && (
        <DriveStep
          key="test"
          api={api}
          scene={scene}
          model={model1}
          makeRoute={() => randomRoute(rng, 4)}
          mode="auto"
          title="2단계 · AI 주행 테스트"
          onFinish={setTestLog}
          onNext={() => setStep('review')}
        />
      )}
      {scene && step === 'review' && model1 && (
        <DriveStep
          key="review"
          api={api}
          scene={scene}
          model={model1}
          makeRoute={() => randomRoute(rng, 4)}
          mode="review"
          title="3단계 · AI 판단 수정"
          onFinish={setReviewLog}
          onNext={() => setStep('retrain')}
        />
      )}
      {scene && step === 'retrain' && model1 && (
        <TrainPanel
          api={api}
          title="고친 판단으로 다시 학습"
          samples={retrainSamples}
          priorCount={prior.length}
          seed={seed + 1}
          evaluate={evaluate}
          before={evalAcc?.before}
          corrections={reviewLog.filter((r) => r.final !== r.ai).length}
          onDone={(m, acc) => {
            setModel2(m);
            setEvalAcc((e) => ({ before: e?.before ?? NaN, after: acc }));
            setStep('mission');
          }}
        />
      )}
      {scene && step === 'mission' && model2 && (
        <DriveStep
          key="mission"
          api={api}
          scene={scene}
          model={model2}
          makeRoute={finalMissionRoute}
          mode="review"
          mission
          title="4단계 · 최종 미션: 학교 가는 길"
          onFinish={setMissionLog}
          onNext={() => api.finish(summary())}
        />
      )}
    </div>
  );
}

function randomRoute(rng: () => number, n: number) {
  return Array.from({ length: n }, () => randomScenario(rng, 0.4));
}

function buildSummary(
  samples: Sample[],
  agree: number,
  evalAcc: { before: number; after: number | null } | null,
  testLog: DecisionRecord[],
  reviewLog: DecisionRecord[],
  missionLog: DecisionRecord[] | null,
) {
  const aiRight = (l: DecisionRecord[]) => l.filter((r) => r.ai === r.truth).length;
  const stats = [
    { label: '내가 만든 주행 데이터', value: `${samples.length}개 (규칙 일치 ${agree}개)` },
    { label: 'AI 평가 정확도 (재학습 전→후)', value: evalAcc ? `${fmtPct(evalAcc.before)} → ${evalAcc.after === null ? '-' : fmtPct(evalAcc.after)}` : '-' },
    { label: '주행 테스트 AI 판단', value: testLog.length ? `${aiRight(testLog)}/${testLog.length} 정답` : '-' },
    { label: '내가 고친 AI 판단', value: `${reviewLog.filter((r) => r.final !== r.ai).length}개` },
    {
      label: '최종 미션 AI 판단',
      value: missionLog ? `${aiRight(missionLog)}/${missionLog.length} 정답` : '-',
    },
    {
      label: '안전 제어기 개입 / 충돌',
      value: `${[...testLog, ...reviewLog, ...(missionLog ?? [])].filter((r) => r.intervened).length}회 / 0회`,
    },
  ];
  return {
    headline: missionLog ? '학교에 안전하게 도착했어요! 🏫' : 'AI 자동차를 훈련하고 주행해 봤어요!',
    stats,
    lessons: [
      '자율주행 AI는 사람이 만든 데이터로 학습해요. 판단 데이터가 정확해야 AI도 안전하게 판단해요.',
      'AI는 확신이 높아도 틀릴 수 있어요. 그래서 실제 자동차는 AI와 별도로 안전 장치를 함께 둬요.',
      '비나 안개처럼 센서가 잘 못 보는 날에는 더 조심해야 해요.',
    ],
    metric: evalAcc ? `eval ${Math.round(evalAcc.before * 100)}→${evalAcc.after === null ? '-' : Math.round(evalAcc.after * 100)}` : undefined,
  };
}

function snapshotSim(s: Scenario) {
  const sim = new DriveSim([s], 0);
  sim.pos = sim.events[0].stopLine - 0.2;
  sim.phase = 'decide';
  if (s.sudden) {
    sim.events[0].revealed = true;
    sim.events[0].current = s;
  }
  return sim;
}

function CollectStep({ api, scene, rng, n, onDone }: { api: GameApi; scene: CityScene; rng: () => number; n: number; onDone: (s: Sample[], agree: number) => void }) {
  const list = useMemo(() => Array.from({ length: n }, () => randomScenario(rng, 0.5)), [rng, n]);
  const [labels, setLabels] = useState<number[]>([]);
  const i = labels.length;
  const cur = list[i];
  useEffect(() => {
    if (cur) {
      scene.setSim(snapshotSim(cur));
      scene.scanning = true;
    }
  }, [cur, scene]);
  useEffect(() => {
    if (i === 0) api.say('이 상황에서 출발해도 안전할까요? 안전하면 O, 위험하면 X를 밟아요.');
    if (i >= n) {
      const agree = list.filter((s, k) => (isSafeToGo(s) ? GO : STOP) === labels[k]).length;
      api.sfx('success');
      onDone(
        list.map((s, k) => ({ f: encodeScenario(s), y: labels[k] })),
        agree,
      );
    }
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps
  const label = (y: number) => {
    if (!cur) return;
    api.sfx(y === GO ? 'move' : 'select');
    setLabels((l) => [...l, y]);
  };
  useFootControls({ label: '출발 가능', run: () => label(GO), disabled: !cur }, { label: '출발하면 위험', run: () => label(STOP), disabled: !cur });
  if (!cur) return null;
  return (
    <div className="dg-question">
      <div className="dg-q-count">
        1단계 · 판단 데이터 {i + 1} / {n}
      </div>
      <div className="big-q">출발해도 안전할까요?</div>
      <div className="dg-facts">
        {describe(cur).map((d) => (
          <span key={d} className="tag">
            {d}
          </span>
        ))}
      </div>
    </div>
  );
}

function TrainPanel({
  api,
  title,
  samples,
  priorCount,
  seed,
  agree,
  n,
  evaluate,
  before,
  corrections,
  onDone,
}: {
  api: GameApi;
  title: string;
  samples: Sample[];
  priorCount: number;
  seed: number;
  agree?: number;
  n?: number;
  evaluate: (m: MLP) => number;
  before?: number;
  corrections?: number;
  onDone: (m: MLP, evalAcc: number) => void;
}) {
  const job = useMemo<TrainJob>(() => ({ X: samples.map((s) => s.f), Y: samples.map((s) => s.y), sizes: SIZES, epochs: 120, seed }), [samples, seed]);
  const live = useLiveTraining(job);
  const done = !!live?.done;
  useWatching(!done);
  const acc = useMemo(() => (done && live ? evaluate(live.model) : NaN), [done]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => api.say('여러분의 판단 데이터로 자율주행 AI를 학습시키고 있어요.'), [api]);
  useEffect(() => {
    if (done) {
      api.sfx('correct');
      api.say(`학습 완료! 교통 규칙으로 정답을 정해 둔 육십 개 상황에서 ${Math.round(acc * 100)}퍼센트를 맞혔어요.`);
    }
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps
  useFootControls(null, { label: before === undefined ? 'AI 주행 테스트' : '최종 미션 출발', disabled: !done, run: () => (api.sfx('select'), onDone(live!.model, acc)) });
  return (
    <div className="dg-train panel">
      <h3>
        {title} <span className="tag tag-real">실제 학습</span> <span className="tag">신경망 15→8→2</span>
      </h3>
      <div className="dg-train-row">
        <div>
          <ProgressBar value={live ? live.epoch / live.epochs : 0} label={live ? `학습 반복 ${live.epoch}/${live.epochs}` : ''} />
          <LineChart series={[{ name: '손실', color: '#f472b6', values: live?.loss ?? [] }]} width={560} height={210} yMin={0} />
        </div>
        <div className="dg-train-info">
          <div>
            학습 데이터 <b>{samples.length}개</b>
            {priorCount > 0 && <small> (이전 학생들 데이터 {priorCount}개 포함)</small>}
          </div>
          {agree !== undefined && n !== undefined && (
            <div>
              내 판단과 교통 규칙 일치 <b>{agree}/{n}</b>
              {agree < n && <small className="warn-text"> · 규칙과 다른 판단은 AI에게 잘못된 데이터가 될 수 있어요</small>}
            </div>
          )}
          {corrections !== undefined && (
            <div>
              3단계에서 검토한 판단이 학습 데이터에 추가됐어요 (내가 고친 판단 <b>{corrections}개</b>)
            </div>
          )}
          {done && (
            <BarChart
              bars={[
                ...(before !== undefined ? [{ label: '재학습 전', value: before, color: '#94a3b8', text: fmtPct(before) }] : []),
                { label: before !== undefined ? '재학습 후' : 'AI 평가', value: acc, color: '#34d399', text: fmtPct(acc) },
              ]}
              max={1}
              width={560}
              rowH={54}
            />
          )}
          {done && <div className="muted">평가: 교통 규칙으로 정답을 붙인 가상 상황 60개 (학습에 쓰지 않은 문제)</div>}
        </div>
      </div>
    </div>
  );
}

interface PendingDecision {
  index: number;
  scenario: Scenario;
  ai: number;
  conf: number;
  ready: boolean;
  emergency: boolean;
}

function DriveStep({
  api,
  scene,
  model,
  makeRoute,
  mode,
  title,
  mission,
  onFinish,
  onNext,
}: {
  api: GameApi;
  scene: CityScene;
  model: MLP;
  makeRoute: () => Scenario[];
  mode: 'auto' | 'review';
  title: string;
  mission?: boolean;
  onFinish: (log: DecisionRecord[]) => void;
  onNext: () => void;
}) {
  // 경로와 시뮬레이션은 이 단계가 마운트될 때 한 번만 생성
  const [sim] = useState(() => new DriveSim(makeRoute()));
  const [, setTick] = useState(0);
  const [pending, setPending] = useState<PendingDecision | null>(null);
  const [banner, setBanner] = useState<{ text: string; kind: 'safe' | 'warn' | 'info' } | null>(null);
  const [log, setLog] = useState<DecisionRecord[]>([]);
  const [done, setDone] = useState(false);
  const emergencyRef = useRef(new Set<number>());
  const logRef = useRef<DecisionRecord[]>([]);

  useEffect(() => {
    scene.setSim(sim);
    scene.scanning = false;
    api.say(mode === 'auto' ? 'AI가 혼자 운전해요. AI가 어떻게 판단하는지 지켜봐요.' : 'AI가 판단을 제안하면, 맞으면 O로 승인하고 틀리면 X로 고쳐 주세요.');
    let raf = 0;
    let last = performance.now();
    let hudT = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      sim.update(dt);
      for (const sg of sim.drain()) {
        const e = sim.events[sg.type === 'finished' ? 0 : sg.index];
        if (sg.type === 'needDecision') {
          const p = model.predict(encodeScenario(e.current));
          scene.scanning = true;
          api.sfx('analyze');
          setPending({ index: sg.index, scenario: { ...e.current }, ai: p.label, conf: p.confidence, ready: false, emergency: emergencyRef.current.has(sg.index) });
          setTimeout(() => setPending((pp) => (pp && pp.index === sg.index ? { ...pp, ready: true } : pp)), 1300);
        } else if (sg.type === 'intervention') {
          api.sfx('warn');
          if (sg.emergency) emergencyRef.current.add(sg.index);
          setBanner({ text: sg.emergency ? '긴급 제동! 안전 제어기가 갑자기 나타난 장애물을 감지했어요' : '안전 제어기 개입: 위험해서 출발하지 않고 기다려요', kind: 'warn' });
        } else if (sg.type === 'resolved') {
          setBanner({ text: '위험 요소가 사라졌어요. 안전하게 출발!', kind: 'safe' });
        } else if (sg.type === 'eventDone') {
          scene.scanning = false;
          setTimeout(() => setBanner(null), 600);
        } else if (sg.type === 'finished') {
          setDone(true);
          api.sfx('success');
          onFinish(logRef.current);
        }
      }
      hudT += dt;
      if (hudT > 0.1) {
        hudT = 0;
        setTick((t) => t + 1);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [sim]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (final: number, reviewed: boolean) => {
    if (!pending) return;
    const e = sim.events[pending.index];
    const truth = isSafeToGo(e.current) ? GO : STOP;
    const willIntervene = final === GO && truth === STOP;
    const rec: DecisionRecord = {
      scenario: pending.scenario,
      title: e.original.title,
      ai: pending.ai,
      conf: pending.conf,
      final,
      truth,
      intervened: willIntervene || pending.emergency,
      emergency: pending.emergency,
      reviewed,
    };
    logRef.current = [...logRef.current, rec];
    setLog(logRef.current);
    setPending(null);
    if (final === truth) setBanner({ text: final === GO ? '안전한 판단이에요. 출발!' : '좋은 판단! 위험해서 기다려요', kind: 'safe' });
    else if (final === STOP) setBanner({ text: '안전한 상황이었어요. 조금 늦어지지만 출발해요', kind: 'info' });
    sim.decide(final === GO ? 'go' : 'stop');
  };

  // 자동 모드: AI 판단을 그대로 실행
  useEffect(() => {
    if (mode === 'auto' && pending?.ready) {
      const t = setTimeout(() => commit(pending.ai, false), 500);
      return () => clearTimeout(t);
    }
  }, [pending?.ready, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mode === 'review' && pending?.ready) api.say(`AI는 ${DECISION_KO[pending.ai]}하자고 해요. 승인할까요?`);
  }, [pending?.ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const reviewReady = mode === 'review' && !!pending?.ready;
  useWatching(!done && !reviewReady);
  useFootControls(
    reviewReady
      ? { label: `AI 판단 승인 (${DECISION_KO[pending!.ai]})`, run: () => (api.sfx('correct'), commit(pending!.ai, true)) }
      : mode === 'auto'
        ? { label: scene.sensorsOn ? '센서 화면 끄기' : '센서 화면 켜기', run: () => (scene.sensorsOn = !scene.sensorsOn) }
        : null,
    reviewReady
      ? { label: `AI 판단 재검토 → ${DECISION_KO[1 - pending!.ai]}`, run: () => (api.sfx('select'), commit(1 - pending!.ai, true)) }
      : done
        ? { label: mission ? '결과 보기' : '다음 단계', run: () => (api.sfx('select'), onNext()) }
        : { label: '주행 중…', disabled: true, run: () => {} },
  );

  const ev = sim.event;
  const cur = ev?.current;
  const dist = ev ? ev.stopLine - sim.pos : 0;
  const near = ev && dist < 30;
  const objs = cur && near ? detectedObjects(cur, dist) : [];
  const conf = sensorConfidence(cur?.weather ?? 'clear');
  const risk = cur && near ? riskScore(cur) : 0.05;
  return (
    <>
      <div className="dg-hud panel">
        <h3>{title}</h3>
        <div className="dg-speed">
          {Math.round(sim.speed * 3.6)}
          <small>km/h</small>
        </div>
        {mission && ev?.original.title && <div className="dg-zone">📍 {ev.original.title}</div>}
        <div className="dg-row">
          <span>위험도</span>
          <ProgressBar value={risk} color={risk > 0.5 ? '#ef4444' : risk > 0.25 ? '#fbbf24' : '#34d399'} label={`${Math.round(risk * 100)}%`} />
        </div>
        <div className="dg-row">
          <span>센서 신뢰도</span>
          <ProgressBar value={conf} color="#7df9ff" label={`${Math.round(conf * 100)}%`} />
        </div>
        <div className="dg-objs">
          <div className="dg-objs-title">감지된 물체 (가상 센서)</div>
          {objs.length === 0 && <div className="muted">감지된 물체 없음</div>}
          {objs.map((o) => (
            <div key={o.label} className={o.danger ? 'bad-text' : ''}>
              {o.danger ? '⚠ ' : '• '}
              {o.label} · {o.distance.toFixed(0)}m
            </div>
          ))}
        </div>
        <div className="dg-log">
          {log.map((r, i) => (
            <div key={i}>
              {r.title ?? `상황 ${i + 1}`}: AI {DECISION_KO[r.ai]} {r.ai === r.truth ? '✓' : '✗'}
              {r.reviewed && r.final !== r.ai ? ` → 수정 ${DECISION_KO[r.final]}` : ''}
              {r.intervened ? ' 🛡' : ''}
            </div>
          ))}
        </div>
      </div>
      {pending && (
        <div className="dg-decision panel">
          <div className="dg-ai-head">🤖 AI 판단 {pending.ready ? '' : '분석 중…'}</div>
          {pending.ready ? (
            <>
              <div className={`dg-ai-dec ${pending.ai === GO ? 'go' : 'stop'}`}>{pending.ai === GO ? '출발 🟢' : '정지 🔴'}</div>
              <div>확신도 {Math.round(pending.conf * 100)}%</div>
              <div className="dg-facts">
                {describe(pending.scenario).map((d) => (
                  <span key={d} className="tag">
                    {d}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div className="scan-bar" />
          )}
        </div>
      )}
      {banner && !pending && <div className={`dg-banner ${banner.kind}`}>{banner.text}</div>}
      {done && (
        <div className="dg-done panel">
          <h3>{mission ? '🏫 학교 도착! 미션 성공' : '주행 완료'}</h3>
          <table className="dg-table">
            <thead>
              <tr>
                <th>상황</th>
                <th>위험 요소(교통 규칙)</th>
                <th>AI</th>
                {mode === 'review' && <th>최종</th>}
                <th>안전 제어기</th>
              </tr>
            </thead>
            <tbody>
              {log.map((r, i) => (
                <tr key={i}>
                  <td>{r.title ?? `상황 ${i + 1}`}</td>
                  <td>{hazards(r.scenario).join(', ') || '없음 (출발 가능)'}</td>
                  <td className={r.ai === r.truth ? 'good-text' : 'bad-text'}>{DECISION_KO[r.ai]}</td>
                  {mode === 'review' && <td className={r.final === r.truth ? 'good-text' : 'bad-text'}>{DECISION_KO[r.final]}</td>}
                  <td>{r.emergency ? '긴급 제동' : r.intervened ? '개입(정지)' : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="muted">충돌 {sim.collisions}회 · 안전 제어기는 AI와 별도로 교통 규칙을 확인해요</div>
        </div>
      )}
    </>
  );
}
