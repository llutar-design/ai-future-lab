import { useEffect, useMemo, useState } from 'react';
import type { GameProps } from '../../app/GameHost';
import { DETECTOR_LIMITS, runDetector, type DetectorResult } from '../../ai/models/detector';
import { createRng, newSeed, shuffle } from '../../ai/rng';
import { Abot } from '../../components/Abot';
import { GameShell, type GameApi } from '../../components/GameShell';
import { useFootControls } from '../../input/controls';
import { CASES, EVIDENCE_INFO, POINTS_KO, WEIGHT_KO, type MediaCase } from './cases';

export default function DetectiveGame(props: GameProps) {
  return (
    <GameShell
      meta={props.meta}
      minutes={props.minutes}
      onExit={props.onExit}
      onRestart={props.onRestart}
      intro={[
        { title: '디지털 탐정단 출동!', text: '요즘 AI는 진짜 같은 사진, 그림, 영상을 만들 수 있어요. 탐정이 되어 자료가 어디서 왔는지 증거를 모아 봐요.' },
        { title: '수사 방법', text: '먼저 첫인상으로 추리하고, 증거를 조사한 다음, 최종 판단을 내려요. 정답은 마지막에 공개돼요.', mood: 'think' },
        { title: '탐정의 규칙', text: '손가락이나 눈 모양 하나만 보고 단정하지 않아요! 출처와 여러 근거를 함께 확인하는 것이 진짜 탐정이에요.' },
      ]}
    >
      {(api) => <DetectivePlay api={api} grade={props.grade} />}
    </GameShell>
  );
}

type Phase = 'view' | 'investigate' | 'detector' | 'final' | 'reveal';

interface CaseResult {
  c: MediaCase;
  first: 'ai' | 'real';
  final: 'ai' | 'real';
  opened: number;
}

function DetectivePlay({ api, grade }: { api: GameApi; grade: GameProps['grade'] }) {
  const cases = useMemo(() => {
    const rng = createRng(newSeed());
    const n = grade === 'high' ? 4 : 3;
    // 실제 자료와 AI 생성 자료가 반드시 섞이도록
    const picked = shuffle(rng, CASES).slice(0, n);
    for (const t of ['real', 'ai'] as const) {
      if (!picked.some((c) => c.truth === t)) picked[n - 1] = shuffle(rng, CASES.filter((c) => c.truth === t))[0];
    }
    return shuffle(rng, picked);
  }, [grade]);
  const picks = grade === 'high' ? 4 : 3;
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('view');
  const [first, setFirst] = useState<'ai' | 'real' | null>(null);
  const [opened, setOpened] = useState<number[]>([]);
  const [cursor, setCursor] = useState(0);
  const [detector, setDetector] = useState<DetectorResult | null>(null);
  const [results, setResults] = useState<CaseResult[]>([]);
  const c = cases[idx];

  const phaseStep: Record<Phase, number> = { view: 0, investigate: 1, detector: 2, final: 3, reveal: 3 };
  useEffect(() => {
    const m: Record<Phase, string> = {
      view: `사건 ${idx + 1}/${cases.length} · 첫인상으로 추리하기`,
      investigate: `증거 조사하기 (최대 ${picks}개)`,
      detector: 'AI 탐지기 결과 살펴보기',
      final: '증거를 모아 최종 판단하기',
      reveal: '사건 결과 확인',
    };
    api.setProgress(phaseStep[phase] + 1, 5, m[phase]);
  }, [phase, idx]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => api.report(summary(results)), [results, api]);

  useEffect(() => {
    if (phase === 'view') api.say(`사건 ${idx + 1}. ${c.title} 이 자료는 AI가 만든 걸까요?`);
    if (phase === 'investigate') api.say(`O 발판으로 증거를 고르고 X 발판으로 조사해요. ${picks}개까지 조사할 수 있어요.`);
    if (phase === 'final') api.say('모은 증거를 떠올리며 최종 판단을 내려요.');
  }, [phase, idx]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (phase !== 'detector') return;
    api.sfx('analyze');
    let alive = true;
    void runDetector(null, c.preAnalysis).then((r) => {
      if (!alive) return;
      setDetector(r);
      api.say(r.kind === 'precomputed' ? '이 결과는 사전 분석된 사례예요. 탐지기 점수는 참고만 하고, 혼자서 결정하지 않아요.' : '로컬 탐지 모델의 분석 결과예요.');
    });
    return () => {
      alive = false;
    };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const nextCase = () => {
    if (idx + 1 >= cases.length) {
      api.finish(summary(results));
      return;
    }
    setIdx((i) => i + 1);
    setPhase('view');
    setFirst(null);
    setOpened([]);
    setCursor(0);
    setDetector(null);
  };

  const items = c.evidence.length + 1; // 마지막: 조사 끝내기
  const doneItem = cursor === c.evidence.length;
  const canOpen = opened.length < picks;

  const controls: Record<Phase, Parameters<typeof useFootControls>> = {
    view: [
      { label: 'AI 생성으로 의심', run: () => (api.sfx('select'), setFirst('ai'), setPhase('investigate')) },
      { label: '실제 자료로 추정', run: () => (api.sfx('select'), setFirst('real'), setPhase('investigate')) },
    ],
    investigate: [
      { label: '다음 증거', run: () => (api.sfx('move'), setCursor((k) => (k + 1) % items)) },
      {
        label: doneItem ? '조사 끝내기' : opened.includes(cursor) ? '이미 조사함' : canOpen ? '이 증거 조사' : `조사 횟수 끝 (${picks}개)`,
        disabled: !doneItem && (opened.includes(cursor) || !canOpen),
        run: () => {
          if (doneItem) {
            api.sfx('select');
            setPhase('detector');
            return;
          }
          api.sfx('analyze');
          const ev = c.evidence[cursor];
          setOpened((o) => [...o, cursor]);
          api.say(ev.finding);
          if (opened.length + 1 >= picks) setTimeout(() => setCursor(c.evidence.length), 400);
        },
      },
    ],
    detector: [null, { label: '최종 판단하기', disabled: !detector, run: () => (api.sfx('select'), setPhase('final')) }],
    final: [
      {
        label: 'AI 생성으로 판단',
        run: () => {
          setResults((r) => [...r, { c, first: first ?? 'ai', final: 'ai', opened: opened.length }]);
          api.sfx(c.truth === 'ai' ? 'correct' : 'wrong');
          setPhase('reveal');
        },
      },
      {
        label: '실제 자료로 판단',
        run: () => {
          setResults((r) => [...r, { c, first: first ?? 'real', final: 'real', opened: opened.length }]);
          api.sfx(c.truth === 'real' ? 'correct' : 'wrong');
          setPhase('reveal');
        },
      },
    ],
    reveal: [null, { label: idx + 1 >= cases.length ? '수사 결과 보기' : '다음 사건', run: () => (api.sfx('select'), nextCase()) }],
  };
  useFootControls(...controls[phase]);

  const last = results[results.length - 1];
  useEffect(() => {
    if (phase !== 'reveal' || !last) return;
    api.say(`${last.final === c.truth ? '정확한 판단이에요!' : '이번엔 판단이 달랐어요.'} ${c.truthText}`);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const highlight = phase === 'investigate' && opened.includes(cursor) ? c.evidence[cursor]?.highlight : opened.length ? c.evidence[opened[opened.length - 1]]?.highlight : undefined;

  return (
    <div className="df">
      <div className="df-media panel">
        <div className="df-media-head">
          <span className="tag">{c.kind}</span> <b>{c.title}</b>
        </div>
        <div className="df-media-box">
          <svg viewBox="0 0 800 500" className="df-svg">
            {c.art()}
            {highlight && phase !== 'view' && <circle cx={highlight.x} cy={highlight.y} r={highlight.r} fill="none" stroke="#c084fc" strokeWidth="8" strokeDasharray="18 10" className="df-hl" />}
          </svg>
          {phase === 'detector' && !detector && <div className="scan" />}
        </div>
        <div className="df-caption">{c.caption}</div>
        <div className="muted">교육용으로 직접 만든 가상 자료입니다.</div>
      </div>
      <div className="df-side">
        {phase === 'view' && (
          <div className="panel df-panel">
            <Abot costume="detective" size={160} mood="think" />
            <div className="big-q">첫인상으로 추리해 봐요</div>
            <p className="big">이 자료는 AI가 만든 걸까요, 실제로 찍거나 만든 걸까요? 정답은 증거 조사 후에 공개돼요!</p>
          </div>
        )}
        {phase === 'investigate' && (
          <div className="panel df-panel">
            <h3>
              🕵️ 증거 조사 · {opened.length}/{picks}개 조사
            </h3>
            <div className="df-ev-list">
              {c.evidence.map((ev, i) => {
                const info = EVIDENCE_INFO[ev.type];
                const isOpen = opened.includes(i);
                return (
                  <div key={ev.type} className={`df-ev ${cursor === i ? 'cursor' : ''} ${isOpen ? 'open' : ''}`}>
                    <div className="df-ev-title">
                      {info.icon} {info.name}
                      {isOpen && <span className={`df-w df-w-${ev.weight}`}>{WEIGHT_KO[ev.weight]}</span>}
                    </div>
                    {isOpen && <div className="df-ev-find">{ev.finding}</div>}
                  </div>
                );
              })}
              <div className={`df-ev df-ev-done ${doneItem ? 'cursor' : ''}`}>▶ 조사 끝내고 탐지기 보기</div>
            </div>
          </div>
        )}
        {phase === 'detector' && (
          <div className="panel df-panel">
            <h3>🤖 AI 탐지기</h3>
            {detector ? (
              <>
                <div>{detector.kind === 'precomputed' ? <span className="tag tag-pre">사전 분석된 사례 · 실제 AI 분석 아님</span> : <span className="tag tag-real">로컬 모델 실제 분석</span>}</div>
                <div className="df-gauge">
                  <div className="df-gauge-bar">
                    <div className="df-gauge-fill" style={{ width: `${detector.aiScore * 100}%` }} />
                    <div className="df-gauge-zone" />
                  </div>
                  <div className="df-gauge-labels">
                    <span>실제 자료 같음</span>
                    <span>판단 보류</span>
                    <span>AI 생성 같음</span>
                  </div>
                  <div className="df-score">AI 생성 가능성 점수 {Math.round(detector.aiScore * 100)}점</div>
                </div>
                <div className="df-note">{detector.note}</div>
                <h3>탐지기의 한계</h3>
                <ul className="df-limits">
                  {DETECTOR_LIMITS.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="big">분석 중…</div>
            )}
          </div>
        )}
        {phase === 'final' && (
          <div className="panel df-panel">
            <Abot costume="detective" size={150} mood="think" />
            <div className="big-q">최종 판단!</div>
            <div className="df-recap">
              <div>
                처음 추리: <b>{first === 'ai' ? 'AI 생성 의심' : '실제 자료 추정'}</b>
              </div>
              <div>조사한 증거:</div>
              {opened.map((k) => (
                <div key={k} className="df-recap-ev">
                  {EVIDENCE_INFO[c.evidence[k].type].icon} {POINTS_KO[c.evidence[k].points]} · {WEIGHT_KO[c.evidence[k].weight]}
                </div>
              ))}
              {detector && <div>탐지기(사전 분석): {Math.round(detector.aiScore * 100)}점</div>}
            </div>
          </div>
        )}
        {phase === 'reveal' && last && (
          <div className="panel df-panel df-reveal">
            <div className={`df-verdict ${last.final === c.truth ? 'good' : 'bad'}`}>
              {last.final === c.truth ? '🎉 정확한 판단!' : '🤔 판단이 달랐어요'}
            </div>
            <div className="df-truth">정답: {c.truthText}</div>
            <div className="df-cols">
              <div>
                <h4>나의 판단</h4>
                처음 {last.first === 'ai' ? 'AI 의심' : '실제 추정'} → 최종 {last.final === 'ai' ? 'AI 생성' : '실제 자료'}
              </div>
              <div>
                <h4>확인된 사실</h4>
                {c.facts.map((f) => (
                  <div key={f}>✔ {f}</div>
                ))}
              </div>
              <div>
                <h4>불확실한 부분</h4>
                {c.uncertain.map((f) => (
                  <div key={f}>？ {f}</div>
                ))}
              </div>
              <div>
                <h4>추가로 확인할 것</h4>
                {c.moreChecks.map((f) => (
                  <div key={f}>➜ {f}</div>
                ))}
              </div>
            </div>
            <div className="df-limit-one">🤖 탐지기의 한계: {c.preAnalysis.note}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function summary(results: CaseResult[]) {
  const right = results.filter((r) => r.final === r.c.truth).length;
  const changed = results.filter((r) => r.first !== r.final).length;
  return {
    headline: results.length ? `${results.length}개 사건 중 ${right}개를 증거로 밝혀냈어요!` : '디지털 탐정 수사를 시작했어요',
    stats: [
      { label: '해결한 사건', value: `${right} / ${results.length}` },
      { label: '증거 조사 횟수', value: `${results.reduce((a, r) => a + r.opened, 0)}회` },
      { label: '증거를 보고 생각을 바꾼 사건', value: `${changed}개` },
    ],
    lessons: [
      'AI가 만든 콘텐츠는 매우 자연스러울 수 있습니다. 눈으로 보는 것뿐 아니라 출처와 근거를 확인해야 합니다.',
      '이상해 보이는 사진이 진짜일 수도, 완벽해 보이는 그림이 사람 작품일 수도 있어요. 한 가지 단서로 단정하지 않아요.',
      'AI 탐지기도 틀릴 수 있어요. 탐지기 점수는 여러 근거 중 하나일 뿐이에요.',
    ],
    metric: `${right}/${results.length}`,
  };
}
