import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameProps } from '../../app/GameHost';
import { useWatching } from '../../app/store';
import { accuracy, countLabels, fmtPct, imbalanceRatio, perClassAccuracy, stratifiedSplit } from '../../ai/evaluation/metrics';
import { MLP } from '../../ai/models/mlp';
import { createRng, newSeed } from '../../ai/rng';
import { useLiveTraining, type TrainJob } from '../../ai/training/useLiveTraining';
import { Abot } from '../../components/Abot';
import { BarChart, LineChart, ProgressBar } from '../../components/Charts';
import { GameShell, type GameApi } from '../../components/GameShell';
import { useFootControls } from '../../input/controls';
import { CreatureView } from './CreatureView';
import { COLORS, INPUT_DIM, collectionSet, describeCreature, encodeCreature, freshCreatures, pickRule, type Creature, type SuggestedRule } from './creatures';

const GROUP = ['A그룹', 'B그룹'];
const GROUP_COLOR = ['#3b82f6', '#ef4444'];
const SIZES = [INPUT_DIM, 8, 2];

export default function TrainingGame(props: GameProps) {
  return (
    <GameShell
      meta={props.meta}
      minutes={props.minutes}
      onExit={props.onExit}
      onRestart={props.onRestart}
      intro={[
        { title: '오늘 나는 AI 선생님!', text: '연구소의 로봇 친구들을 두 그룹으로 나누면, AI가 그걸 보고 스스로 규칙을 배워요.' },
        { title: '1단계 · 데이터 만들기', text: 'O 발판은 A그룹, X 발판은 B그룹이에요. 여러분이 나눈 것이 AI의 학습 데이터가 돼요.', mood: 'think' },
        { title: '2~4단계 · 학습, 시험, 고치기', text: 'AI가 진짜로 학습하고, 처음 보는 로봇을 맞혀 봐요. 틀리면 다시 가르쳐서 더 똑똑하게 만들어요!' },
      ]}
    >
      {(api) => <TrainingPlay api={api} grade={props.grade} />}
    </GameShell>
  );
}

type Step = 'rule' | 'collect' | 'train' | 'predict' | 'fix' | 'retrain' | 'exam' | 'report';

interface Labeled {
  c: Creature;
  y: number;
}

function TrainingPlay({ api, grade }: { api: GameApi; grade: GameProps['grade'] }) {
  const seed = useMemo(() => newSeed(), []);
  const rng = useMemo(() => createRng(seed), [seed]);
  const nCollect = grade === 'low' ? 10 : grade === 'mid' ? 14 : 18;
  const nPredict = grade === 'low' ? 6 : 8;
  const nExam = 6;

  const [step, setStep] = useState<Step>('rule');
  const [rule, setRule] = useState<SuggestedRule | null>(null);
  const suggested = useMemo(() => pickRule(rng), [rng]);
  const [toCollect, setToCollect] = useState<Creature[]>([]);
  const [data, setData] = useState<Labeled[]>([]);
  const [model1, setModel1] = useState<MLP | null>(null);
  const [split, setSplit] = useState<{ train: number[]; val: number[] } | null>(null);
  const [trainStats, setTrainStats] = useState<{ trainAcc: number; valAcc: number } | null>(null);
  const [predicted, setPredicted] = useState<{ c: Creature; pred: number; conf: number; correct: boolean }[]>([]);
  const [model2, setModel2] = useState<MLP | null>(null);
  const [exam, setExam] = useState<{ before: number; after: number; noisy: number; perClass: number[]; items: { c: Creature; y: number; p1: number; p2: number }[] } | null>(null);

  const stepNo: Record<Step, number> = { rule: 0, collect: 0, train: 1, predict: 2, fix: 3, retrain: 3, exam: 3, report: 3 };
  const missions: Record<Step, string> = {
    rule: '분류 기준 정하기',
    collect: `로봇 ${nCollect}마리를 A/B그룹으로 나눠 학습 데이터 만들기`,
    train: 'AI 모델 훈련 관찰하기',
    predict: '처음 보는 로봇으로 AI 시험하기',
    fix: '틀린 문제 다시 가르치기',
    retrain: 'AI 다시 학습시키기',
    exam: '최종 시험: 재학습 전후 비교',
    report: '결과 확인',
  };
  useEffect(() => api.setProgress(stepNo[step], 4, missions[step]), [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // 진행 요약(시간 초과 대비)
  useEffect(() => {
    api.report(buildSummary(data, trainStats, predicted, exam));
  }, [data, trainStats, predicted, exam, api]);

  const finish = () => api.finish(buildSummary(data, trainStats, predicted, exam));
  // 원래 데이터 + 시험에서 학생이 확인한 정답(재학습·실험용). 배열을 고정해 학습이 다시 시작되지 않게 함
  const fullData = useMemo(() => [...data, ...predicted.map((p) => ({ c: p.c, y: p.correct ? p.pred : 1 - p.pred }))], [data, predicted]);

  return (
    <div className="tg">
      {step === 'rule' && (
        <RuleStep
          suggested={suggested}
          api={api}
          onPick={(r) => {
            setRule(r);
            setToCollect(collectionSet(rng, nCollect, r));
            setStep('collect');
          }}
        />
      )}
      {step === 'collect' && (
        <CollectStep
          api={api}
          rule={rule}
          items={toCollect}
          data={data}
          onLabel={(l) => setData((d) => [...d, l])}
          onDone={() => {
            setSplit(stratifiedSplit(data.map((d) => d.y), 0.25, rng));
            setStep('train');
          }}
        />
      )}
      {step === 'train' && split && (
        <TrainStep
          api={api}
          data={data}
          split={split}
          seed={seed}
          onDone={(m, st) => {
            setModel1(m);
            setTrainStats(st);
            setStep('predict');
          }}
        />
      )}
      {step === 'predict' && model1 && (
        <PredictStep
          api={api}
          model={model1}
          makeItems={() => freshCreatures(rng, nPredict, data.map((d) => d.c))}
          onDone={(p) => {
            setPredicted(p);
            setStep('fix');
          }}
        />
      )}
      {step === 'fix' && <FixStep api={api} predicted={predicted} onNext={() => setStep('retrain')} />}
      {step === 'retrain' && (
        <RetrainStep
          api={api}
          data={fullData}
          seed={seed + 1}
          onDone={(m) => {
            setModel2(m);
            setStep('exam');
          }}
        />
      )}
      {step === 'exam' && model1 && model2 && (
        <ExamStep
          api={api}
          rng={rng}
          n={nExam}
          avoid={[...data.map((d) => d.c), ...predicted.map((p) => p.c)]}
          model1={model1}
          model2={model2}
          allData={fullData}
          seed={seed + 2}
          exam={exam}
          setExam={setExam}
          onFinish={finish}
        />
      )}
    </div>
  );
}

/** 컴포넌트가 처음 그려질 때 한 번만 값을 만듦 */
function useMemoOnce<T>(fn: () => T): T {
  const ref = useRef<{ v: T } | null>(null);
  if (!ref.current) ref.current = { v: fn() };
  return ref.current.v;
}

function buildSummary(
  data: Labeled[],
  trainStats: { trainAcc: number; valAcc: number } | null,
  predicted: { correct: boolean }[],
  exam: { before: number; after: number; noisy: number } | null,
) {
  const predAcc = predicted.length ? predicted.filter((p) => p.correct).length / predicted.length : NaN;
  const stats = [
    { label: '내가 만든 학습 데이터', value: `${data.length}개` },
    { label: '검증 정확도(학습 직후)', value: trainStats ? fmtPct(trainStats.valAcc) : '-' },
    { label: '처음 보는 로봇 시험', value: predicted.length ? `${predicted.filter((p) => p.correct).length}/${predicted.length} (${fmtPct(predAcc)})` : '-' },
    { label: '최종 시험 · 재학습 전', value: exam ? fmtPct(exam.before) : '-' },
    { label: '최종 시험 · 재학습 후', value: exam ? fmtPct(exam.after) : '-' },
    { label: '잘못된 데이터 실험', value: exam ? fmtPct(exam.noisy) : '-' },
  ];
  let headline = 'AI에게 데이터로 규칙을 가르쳐 봤어요!';
  if (exam) {
    if (exam.after > exam.before) headline = `다시 가르쳤더니 AI 정확도가 ${fmtPct(exam.before)} → ${fmtPct(exam.after)}로 올랐어요!`;
    else if (exam.after === exam.before) headline = `재학습 전후 정확도가 ${fmtPct(exam.after)}로 같았어요. 데이터가 더 필요할지도 몰라요.`;
    else headline = `이번에는 재학습 후 정확도가 ${fmtPct(exam.after)}로 떨어졌어요. AI 학습은 항상 좋아지기만 하진 않아요.`;
  }
  return {
    headline,
    stats,
    lessons: [
      'AI는 내가 준 데이터만큼만 배워요. 좋은 데이터가 좋은 AI를 만들어요.',
      '학습 정확도가 높아도 처음 보는 데이터(검증·시험)에서 틀릴 수 있어요. AI도 실수해요.',
      '한쪽 그룹 데이터가 너무 적거나 잘못된 라벨이 섞이면 AI가 치우친(편향된) 판단을 해요.',
    ],
    metric: exam ? `exam ${Math.round(exam.before * 100)}→${Math.round(exam.after * 100)}` : undefined,
  };
}

function RuleStep({ suggested, api, onPick }: { suggested: SuggestedRule; api: GameApi; onPick: (r: SuggestedRule | null) => void }) {
  useEffect(() => api.say('로봇을 나눌 기준을 골라요. 에이봇 추천 기준을 쓰거나, 나만의 기준을 정할 수 있어요.'), [api]);
  useFootControls({ label: '에이봇 추천 기준', run: () => (api.sfx('select'), onPick(suggested)) }, { label: '내 기준 정하기', run: () => (api.sfx('select'), onPick(null)) });
  return (
    <div className="tg-center">
      <Abot costume="researcher" size={220} mood="think" />
      <div className="tg-rulebox">
        <div className="big-q">어떤 기준으로 로봇을 나눌까요?</div>
        <div className="tg-rule-options">
          <div className="panel tg-opt tg-opt-o">
            <h3>○ 에이봇 추천 기준</h3>
            <div className="tg-rule-text">{suggested.text}</div>
            <div className="muted">
              A그룹: {suggested.a} / B그룹: {suggested.b}
            </div>
          </div>
          <div className="panel tg-opt tg-opt-x">
            <h3>✕ 내 마음대로 기준 정하기</h3>
            <div className="tg-rule-text">예: "귀여운 로봇은 A", "안테나 많은 로봇은 B"</div>
            <div className="muted">기준을 마음속으로 정하고 끝까지 지켜 보세요!</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CollectStep({
  api,
  rule,
  items,
  data,
  onLabel,
  onDone,
}: {
  api: GameApi;
  rule: SuggestedRule | null;
  items: Creature[];
  data: Labeled[];
  onLabel: (l: Labeled) => void;
  onDone: () => void;
}) {
  const i = data.length;
  const cur = items[i];
  const [fly, setFly] = useState<{ c: Creature; y: number; k: number } | null>(null);
  useEffect(() => {
    if (i === 0) api.say('이 로봇은 어느 그룹일까요? O 발판은 A그룹, X 발판은 B그룹!');
  }, [i, api]);
  useEffect(() => {
    if (i >= items.length) {
      api.sfx('success');
      api.say('학습 데이터가 완성됐어요! 이제 AI를 훈련시켜요.');
      const t = setTimeout(onDone, 1200);
      return () => clearTimeout(t);
    }
  }, [i, items.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const label = (y: number) => {
    if (!cur) return;
    api.sfx(y === 0 ? 'move' : 'select');
    setFly({ c: cur, y, k: i });
    onLabel({ c: cur, y });
  };
  useFootControls({ label: 'A그룹', run: () => label(0), disabled: !cur }, { label: 'B그룹', run: () => label(1), disabled: !cur });

  const counts = countLabels(
    data.map((d) => d.y),
    2,
  );
  const offRule = rule ? data.filter((d) => rule.labelOf(d.c) !== d.y).length : 0;
  return (
    <div className="tg-collect">
      <Bin side={0} items={data.filter((d) => d.y === 0)} />
      <div className="tg-stage">
        <div className="tg-count">
          데이터 {Math.min(i + 1, items.length)} / {items.length}
        </div>
        {rule && <div className="tg-rule-remind">기준: {rule.text}</div>}
        {cur ? (
          <div key={cur.id} className="tg-creature-in">
            <CreatureView c={cur} size={360} />
            <div className="tg-desc">{describeCreature(cur)}</div>
          </div>
        ) : (
          <div className="big-q">데이터 완성! 🎉</div>
        )}
        {fly && (
          <div key={fly.k} className={`tg-fly tg-fly-${fly.y}`}>
            <CreatureView c={fly.c} size={160} />
          </div>
        )}
        <div className="tg-mini-stats">
          <span style={{ color: GROUP_COLOR[0] }}>A {counts[0]}</span> · <span style={{ color: GROUP_COLOR[1] }}>B {counts[1]}</span>
          {rule && offRule > 0 && <span className="warn-text"> · 기준과 다르게 넣은 데이터 {offRule}개</span>}
        </div>
      </div>
      <Bin side={1} items={data.filter((d) => d.y === 1)} />
    </div>
  );
}

function Bin({ side, items }: { side: number; items: Labeled[] }) {
  return (
    <div className="tg-bin" style={{ borderColor: GROUP_COLOR[side] }}>
      <div className="tg-bin-title" style={{ background: GROUP_COLOR[side] }}>
        {side === 0 ? '○ ' : '✕ '}
        {GROUP[side]} ({items.length})
      </div>
      <div className="tg-bin-items">
        {items.map((d) => (
          <CreatureView key={d.c.id} c={d.c} size={76} />
        ))}
      </div>
    </div>
  );
}

function TrainStep({
  api,
  data,
  split,
  seed,
  onDone,
}: {
  api: GameApi;
  data: Labeled[];
  split: { train: number[]; val: number[] };
  seed: number;
  onDone: (m: MLP, st: { trainAcc: number; valAcc: number }) => void;
}) {
  const [run, setRun] = useState(0);
  const job = useMemo<TrainJob>(
    () => ({
      X: split.train.map((i) => encodeCreature(data[i].c)),
      Y: split.train.map((i) => data[i].y),
      Xv: split.val.map((i) => encodeCreature(data[i].c)),
      Yv: split.val.map((i) => data[i].y),
      sizes: SIZES,
      epochs: 150,
      seed: seed + run * 101,
    }),
    [data, split, seed, run],
  );
  const live = useLiveTraining(job);
  const done = !!live?.done;
  useWatching(!done);
  useEffect(() => api.say('AI가 학습 중이에요. 손실값이 줄어들수록 AI가 데이터의 규칙을 잘 찾고 있다는 뜻이에요.'), [api, run]);
  useEffect(() => {
    if (done) {
      api.sfx('correct');
      const va = live!.valAcc[live!.valAcc.length - 1];
      api.say(Number.isFinite(va) ? `학습 완료! 따로 떼어 둔 검증 데이터에서 ${Math.round(va * 100)}퍼센트를 맞혔어요.` : '학습 완료!');
    }
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  useFootControls(
    { label: '처음부터 다시 학습', disabled: !done, run: () => (api.sfx('move'), setRun((r) => r + 1)) },
    {
      label: 'AI 시험 보러 가기',
      disabled: !done,
      run: () => {
        api.sfx('select');
        onDone(live!.model, { trainAcc: live!.trainAcc[live!.trainAcc.length - 1], valAcc: live!.valAcc[live!.valAcc.length - 1] });
      },
    },
  );

  const counts = countLabels(
    data.map((d) => d.y),
    2,
  );
  const ratio = imbalanceRatio(counts);
  const lastTrain = live ? live.trainAcc[live.trainAcc.length - 1] : NaN;
  const lastVal = live ? live.valAcc[live.valAcc.length - 1] : NaN;
  return (
    <div className="tg-train">
      <div className="panel tg-train-main">
        <h3>
          AI 모델 훈련 <span className="tag tag-real">실제 학습 중</span> <span className="tag">신경망 12→8→2</span>
        </h3>
        <ProgressBar value={live ? live.epoch / live.epochs : 0} label={live ? `학습 반복 ${live.epoch} / ${live.epochs}회` : '준비 중'} />
        <div className="tg-charts">
          <div>
            <div className="chart-title">손실값 (낮을수록 좋아요)</div>
            <LineChart series={[{ name: '손실', color: '#f472b6', values: live?.loss ?? [] }]} width={600} height={250} yMin={0} />
          </div>
          <div>
            <div className="chart-title">정확도</div>
            <LineChart
              series={[
                { name: '학습 데이터', color: '#38bdf8', values: live?.trainAcc ?? [] },
                { name: '검증 데이터', color: '#fbbf24', values: live?.valAcc ?? [], dashed: true },
              ]}
              width={600}
              height={250}
              yMin={0}
              yMax={1}
              percent
            />
          </div>
        </div>
        <div className="tg-acc-row">
          <div>
            학습 정확도 <b>{fmtPct(lastTrain)}</b> <small>(공부한 문제)</small>
          </div>
          <div>
            검증 정확도 <b>{fmtPct(lastVal)}</b> <small>(따로 떼어 둔 {split.val.length}개)</small>
          </div>
        </div>
        {done && <div className="tg-note">💡 학습 정확도는 공부한 문제 점수, 검증 정확도는 처음 보는 문제 점수예요. 검증 데이터가 {split.val.length}개뿐이라 한 개마다 점수가 크게 바뀌어요.</div>}
      </div>
      <div className="tg-train-side">
        <div className="panel">
          <h3>데이터 분포</h3>
          <BarChart
            bars={[
              { label: 'A그룹', value: counts[0], color: GROUP_COLOR[0] },
              { label: 'B그룹', value: counts[1], color: GROUP_COLOR[1] },
            ]}
            width={520}
          />
          <ColorTable data={data} />
          {ratio >= 2 && <div className="warn-text tg-bias">⚠ {counts[0] > counts[1] ? 'B' : 'A'}그룹 데이터가 훨씬 적어요. AI가 한쪽으로 치우칠(편향) 수 있어요.</div>}
        </div>
        {done && live && <ValPreview model={live.model} data={split.val.map((i) => data[i])} />}
      </div>
    </div>
  );
}

function ColorTable({ data }: { data: Labeled[] }) {
  return (
    <table className="tg-colortable">
      <thead>
        <tr>
          <th>색깔</th>
          <th style={{ color: GROUP_COLOR[0] }}>A</th>
          <th style={{ color: GROUP_COLOR[1] }}>B</th>
        </tr>
      </thead>
      <tbody>
        {COLORS.map((c, i) => (
          <tr key={c.name}>
            <td>
              <span className="swatch" style={{ background: c.hex }} /> {c.name}
            </td>
            <td>{data.filter((d) => d.c.color === i && d.y === 0).length}</td>
            <td>{data.filter((d) => d.c.color === i && d.y === 1).length}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ValPreview({ model, data }: { model: MLP; data: Labeled[] }) {
  return (
    <div className="panel">
      <h3>검증 데이터 예측 결과</h3>
      <div className="tg-val-grid">
        {data.map((d) => {
          const p = model.predict(encodeCreature(d.c));
          const ok = p.label === d.y;
          return (
            <div key={d.c.id} className={`tg-val ${ok ? 'ok' : 'no'}`}>
              <CreatureView c={d.c} size={80} />
              <div>
                AI: {GROUP[p.label][0]} {ok ? '✓' : '✗'}
              </div>
            </div>
          );
        })}
        {data.length === 0 && <div className="muted">검증용으로 뗄 데이터가 부족해요</div>}
      </div>
    </div>
  );
}

function PredictStep({
  api,
  model,
  makeItems,
  onDone,
}: {
  api: GameApi;
  model: MLP;
  makeItems: () => Creature[];
  onDone: (p: { c: Creature; pred: number; conf: number; correct: boolean }[]) => void;
}) {
  const items = useMemoOnce(makeItems);
  const [results, setResults] = useState<{ c: Creature; pred: number; conf: number; correct: boolean }[]>([]);
  const [thinking, setThinking] = useState(true);
  const [feedback, setFeedback] = useState<boolean | null>(null);
  const i = results.length;
  const cur = items[i];
  const pred = useMemo(() => (cur ? model.predict(encodeCreature(cur)) : null), [cur, model]);

  useEffect(() => {
    if (!cur) return;
    setThinking(true);
    setFeedback(null);
    api.sfx('analyze');
    const t = setTimeout(() => {
      setThinking(false);
      if (i === 0) api.say('AI가 처음 보는 로봇이에요. AI의 답이 여러분 기준에 맞으면 O, 틀리면 X를 밟아요.');
    }, 900);
    return () => clearTimeout(t);
  }, [cur, i, api]);

  useEffect(() => {
    if (i >= items.length && items.length) {
      const t = setTimeout(() => onDone(results), 1400);
      return () => clearTimeout(t);
    }
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

  const answer = (correct: boolean) => {
    if (!cur || !pred || thinking) return;
    api.sfx(correct ? 'correct' : 'wrong');
    setFeedback(correct);
    setTimeout(() => setResults((r) => [...r, { c: cur, pred: pred.label, conf: pred.confidence, correct }]), 500);
  };
  const ready = !!cur && !thinking && feedback === null;
  useFootControls({ label: 'AI가 맞았어요', disabled: !ready, run: () => answer(true) }, { label: 'AI가 틀렸어요', disabled: !ready, run: () => answer(false) });

  const correct = results.filter((r) => r.correct).length;
  return (
    <div className="tg-predict">
      <div className="panel tg-pred-main">
        <div className="tg-count">
          처음 보는 로봇 {Math.min(i + 1, items.length)} / {items.length}
        </div>
        {cur && pred ? (
          <div className={`tg-pred-card ${feedback === true ? 'flash-good' : feedback === false ? 'flash-bad' : ''}`} key={cur.id}>
            <CreatureView c={cur} size={300} />
            <div className="tg-pred-info">
              <div className="tg-desc">{describeCreature(cur)}</div>
              {thinking ? (
                <div className="tg-thinking">
                  <span className="scan-dot" /> AI가 생각 중…
                </div>
              ) : (
                <>
                  <div className="tg-ai-says">
                    AI의 답: <b style={{ color: GROUP_COLOR[pred.label] }}>{GROUP[pred.label]}</b>
                  </div>
                  <div className="tg-conf">
                    확신도 {Math.round(pred.confidence * 100)}%
                    <ProgressBar value={pred.confidence} color={GROUP_COLOR[pred.label]} />
                  </div>
                  <div className="tg-proba">
                    A {Math.round(pred.proba[0] * 100)}% · B {Math.round(pred.proba[1] * 100)}%
                  </div>
                  {feedback !== null && <div className={feedback ? 'good-text' : 'bad-text'}>{feedback ? '정답! AI가 맞혔어요' : 'AI가 틀렸어요. 이 사례를 기록해 둘게요'}</div>}
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="big-q">
            시험 끝! AI 점수: {correct} / {items.length}
          </div>
        )}
      </div>
      <div className="panel tg-pred-side">
        <h3>AI 시험 기록 (학생이 채점)</h3>
        <div className="tg-score">
          {correct} / {results.length} 맞힘
        </div>
        <div className="tg-val-grid">
          {results.map((r) => (
            <div key={r.c.id} className={`tg-val ${r.correct ? 'ok' : 'no'}`}>
              <CreatureView c={r.c} size={70} />
              <div>
                {GROUP[r.pred][0]} {r.correct ? '✓' : '✗'}
              </div>
            </div>
          ))}
        </div>
        <div className="muted">확신도가 높아도 틀릴 수 있어요. AI의 확신도는 "정답 확률"이 아니라 AI가 스스로 계산한 값이에요.</div>
      </div>
    </div>
  );
}

function FixStep({ api, predicted, onNext }: { api: GameApi; predicted: { c: Creature; pred: number; correct: boolean }[]; onNext: () => void }) {
  const wrong = predicted.filter((p) => !p.correct);
  useEffect(() => {
    api.say(
      wrong.length
        ? `AI가 ${wrong.length}개를 틀렸어요. 틀린 로봇의 올바른 그룹을 알려주고 다시 학습시켜요.`
        : 'AI가 모두 맞혔어요! 그래도 시험 본 로봇들을 데이터에 더해서 다시 학습시켜 볼게요.',
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useFootControls(null, { label: '다시 학습시키기', run: () => (api.sfx('select'), onNext()) });
  return (
    <div className="tg-center col">
      <Abot costume="researcher" size={200} mood={wrong.length ? 'think' : 'happy'} />
      <div className="big-q">{wrong.length ? `AI가 틀린 ${wrong.length}개를 고쳐서 다시 가르쳐요` : 'AI가 모두 맞혔어요!'}</div>
      <div className="tg-fix-row">
        {wrong.map((w) => (
          <div key={w.c.id} className="panel tg-fix-card">
            <CreatureView c={w.c} size={150} />
            <div>
              AI: <s>{GROUP[w.pred]}</s> → 정답: <b style={{ color: GROUP_COLOR[1 - w.pred] }}>{GROUP[1 - w.pred]}</b>
            </div>
          </div>
        ))}
      </div>
      <div className="muted big">고친 데이터 {wrong.length}개 + 맞힌 데이터 {predicted.length - wrong.length}개가 학습 데이터에 추가돼요.</div>
    </div>
  );
}

function RetrainStep({ api, data, seed, onDone }: { api: GameApi; data: Labeled[]; seed: number; onDone: (m: MLP) => void }) {
  const job = useMemo<TrainJob>(() => ({ X: data.map((d) => encodeCreature(d.c)), Y: data.map((d) => d.y), sizes: SIZES, epochs: 150, seed }), [data, seed]);
  const live = useLiveTraining(job);
  const done = !!live?.done;
  useWatching(!done);
  useEffect(() => api.say('고친 데이터를 더해서 AI를 다시 학습시키는 중이에요.'), [api]);
  useFootControls(null, { label: '최종 시험 보기', disabled: !done, run: () => (api.sfx('select'), onDone(live!.model)) });
  return (
    <div className="tg-center col">
      <div className="panel tg-retrain">
        <h3>
          재학습 <span className="tag tag-real">실제 학습 중</span> · 데이터 {data.length}개
        </h3>
        <ProgressBar value={live ? live.epoch / live.epochs : 0} label={live ? `학습 반복 ${live.epoch} / ${live.epochs}회` : ''} />
        <LineChart
          series={[
            { name: '손실', color: '#f472b6', values: live?.loss ?? [] },
          ]}
          width={1100}
          height={300}
          yMin={0}
        />
        <div className="tg-acc-row">
          <div>
            학습 정확도 <b>{fmtPct(live ? live.trainAcc[live.trainAcc.length - 1] : NaN)}</b>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExamStep({
  api,
  rng,
  n,
  avoid,
  model1,
  model2,
  allData,
  seed,
  exam,
  setExam,
  onFinish,
}: {
  api: GameApi;
  rng: () => number;
  n: number;
  avoid: Creature[];
  model1: MLP;
  model2: MLP;
  allData: Labeled[];
  seed: number;
  exam: { before: number; after: number; noisy: number; perClass: number[]; items: { c: Creature; y: number; p1: number; p2: number }[] } | null;
  setExam: (e: { before: number; after: number; noisy: number; perClass: number[]; items: { c: Creature; y: number; p1: number; p2: number }[] }) => void;
  onFinish: () => void;
}) {
  const items = useMemoOnce(() => freshCreatures(rng, n, avoid));
  const [labels, setLabels] = useState<number[]>([]);
  const i = labels.length;
  const cur = items[i];

  useEffect(() => api.say('최종 시험이에요! AI 몰래 이 로봇들의 정답을 먼저 정해 주세요. O는 A그룹, X는 B그룹.'), [api]);

  useEffect(() => {
    if (i < items.length || exam) return;
    // 실제 평가: 학생이 정한 정답 vs 두 모델의 예측
    const X = items.map(encodeCreature);
    const p1 = X.map((x) => model1.predict(x).label);
    const p2 = X.map((x) => model2.predict(x).label);
    // 잘못된 데이터 실험: 학습 데이터 라벨 30%를 뒤집어 같은 방식으로 학습
    const noisyRng = createRng(seed);
    const nX = allData.map((d) => encodeCreature(d.c));
    const nY = allData.map((d) => (noisyRng() < 0.3 ? 1 - d.y : d.y));
    const noisyModel = new MLP(SIZES, seed);
    for (let e = 0; e < 150; e++) noisyModel.trainEpoch(nX, nY, { lr: 0.05, batchSize: 4 });
    const pn = X.map((x) => noisyModel.predict(x).label);
    const result = {
      before: accuracy(p1, labels),
      after: accuracy(p2, labels),
      noisy: accuracy(pn, labels),
      perClass: perClassAccuracy(p2, labels, 2),
      items: items.map((c, k) => ({ c, y: labels[k], p1: p1[k], p2: p2[k] })),
    };
    setExam(result);
    api.sfx('success');
    api.say(`재학습 전 ${Math.round(result.before * 100)}퍼센트, 재학습 후 ${Math.round(result.after * 100)}퍼센트예요. 라벨을 일부러 뒤섞은 AI는 ${Math.round(result.noisy * 100)}퍼센트였어요.`);
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

  const label = (y: number) => {
    if (!cur) return;
    api.sfx(y ? 'select' : 'move');
    setLabels((l) => [...l, y]);
  };
  useFootControls(
    exam ? null : { label: 'A그룹이 정답', run: () => label(0), disabled: !cur },
    exam ? { label: '결과 보기', run: () => (api.sfx('select'), onFinish()) } : { label: 'B그룹이 정답', run: () => label(1), disabled: !cur },
  );

  if (!exam)
    return (
      <div className="tg-center col">
        <div className="tg-count">
          최종 시험 정답 정하기 {Math.min(i + 1, n)} / {n}
        </div>
        {cur && (
          <div key={cur.id} className="tg-creature-in">
            <CreatureView c={cur} size={340} />
            <div className="tg-desc">{describeCreature(cur)}</div>
          </div>
        )}
        <div className="muted big">AI는 아직 답을 몰라요. 여러분이 정한 정답으로 AI를 채점해요.</div>
      </div>
    );

  return (
    <div className="tg-exam">
      <div className="panel">
        <h3>
          최종 시험 결과 <span className="tag tag-real">실제 평가</span>
        </h3>
        <BarChart
          bars={[
            { label: '재학습 전 AI', value: exam.before, color: '#94a3b8', text: fmtPct(exam.before) },
            { label: '재학습 후 AI', value: exam.after, color: '#38bdf8', text: fmtPct(exam.after) },
            { label: '잘못된 데이터 AI', value: exam.noisy, color: '#f87171', text: fmtPct(exam.noisy) },
          ]}
          max={1}
          width={860}
          rowH={64}
        />
        <div className="muted">
          ※ 시험 문제 {n}개 기준이라 한 문제당 {Math.round(100 / n)}%씩 차이가 나요. "잘못된 데이터 AI"는 학습 데이터의 약 30% 라벨을 일부러 뒤바꿔 학습시킨 AI예요.
        </div>
        <div className="tg-perclass">
          재학습 후 그룹별 정확도: A그룹 <b>{fmtPct(exam.perClass[0])}</b> · B그룹 <b>{fmtPct(exam.perClass[1])}</b>
          {Math.abs((exam.perClass[0] || 0) - (exam.perClass[1] || 0)) >= 0.5 && Number.isFinite(exam.perClass[0]) && Number.isFinite(exam.perClass[1]) && (
            <span className="warn-text"> → 한 그룹만 잘 맞히는 편향이 보여요!</span>
          )}
        </div>
      </div>
      <div className="panel">
        <h3>문제별 결과</h3>
        <div className="tg-exam-grid">
          {exam.items.map((it) => (
            <div key={it.c.id} className="tg-exam-item">
              <CreatureView c={it.c} size={110} />
              <div>정답 {GROUP[it.y][0]}</div>
              <div className={it.p1 === it.y ? 'good-text' : 'bad-text'}>전 {GROUP[it.p1][0]}</div>
              <div className={it.p2 === it.y ? 'good-text' : 'bad-text'}>후 {GROUP[it.p2][0]}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
