import { describe, expect, it } from 'vitest';
import { MLP } from '../src/ai/models/mlp';
import { accuracy, imbalanceRatio, perClassAccuracy, stratifiedSplit } from '../src/ai/evaluation/metrics';
import { createRng } from '../src/ai/rng';
import { QLearner, evaluateAgent } from '../src/ai/training/qlearning';
import { DEFAULT_RULES, GridEnv, MAZES } from '../src/simulation/gridworld';

describe('신경망(MLP) 학습', () => {
  it('학습할수록 손실이 실제로 줄어든다', () => {
    const rng = createRng(3);
    const X: number[][] = [];
    const Y: number[] = [];
    for (let i = 0; i < 60; i++) {
      const a = rng() * 2 - 1;
      const b = rng() * 2 - 1;
      X.push([a, b]);
      Y.push(a + b > 0 ? 1 : 0);
    }
    const m = new MLP([2, 6, 2], 1);
    const l0 = m.loss(X, Y);
    for (let e = 0; e < 150; e++) m.trainEpoch(X, Y, { lr: 0.03 });
    const l1 = m.loss(X, Y);
    expect(l1).toBeLessThan(l0 * 0.5);
  });

  it('처음 보는 데이터에서 90% 이상 맞힌다(분리 가능한 데이터)', () => {
    const rng = createRng(11);
    const gen = (n: number) => {
      const X: number[][] = [];
      const Y: number[] = [];
      for (let i = 0; i < n; i++) {
        const a = rng() * 2 - 1;
        const b = rng() * 2 - 1;
        X.push([a, b]);
        Y.push(a * a + b * b < 0.4 ? 1 : 0); // 원 안/밖 (비선형)
      }
      return { X, Y };
    };
    const tr = gen(200);
    const te = gen(200);
    const m = new MLP([2, 10, 2], 5);
    for (let e = 0; e < 300; e++) m.trainEpoch(tr.X, tr.Y, { lr: 0.03 });
    const pred = te.X.map((x) => m.predict(x).label);
    expect(accuracy(pred, te.Y)).toBeGreaterThan(0.9);
  });

  it('라벨이 뒤섞인(잘못된) 데이터로 학습하면 정확도가 떨어진다', () => {
    const rng = createRng(21);
    const make = (n: number, noise: number) => {
      const X: number[][] = [];
      const Y: number[] = [];
      for (let i = 0; i < n; i++) {
        const a = rng() * 2 - 1;
        X.push([a, rng() * 2 - 1]);
        let y = a > 0 ? 1 : 0;
        if (rng() < noise) y = 1 - y;
        Y.push(y);
      }
      return { X, Y };
    };
    const clean = make(40, 0);
    const noisy = { X: clean.X, Y: clean.Y.map((y, i) => (i % 5 < 2 ? 1 - y : y)) }; // 40% 뒤집기
    const test = make(300, 0);
    const train = (d: { X: number[][]; Y: number[] }) => {
      const m = new MLP([2, 6, 2], 2);
      for (let e = 0; e < 200; e++) m.trainEpoch(d.X, d.Y);
      return accuracy(
        test.X.map((x) => m.predict(x).label),
        test.Y,
      );
    };
    expect(train(clean)).toBeGreaterThan(train(noisy));
  });

  it('같은 시드면 같은 결과(재현성)', () => {
    const X = [
      [0, 1],
      [1, 0],
      [1, 1],
      [0, 0],
    ];
    const Y = [1, 1, 0, 0];
    const a = new MLP([2, 4, 2], 9);
    const b = new MLP([2, 4, 2], 9);
    for (let i = 0; i < 20; i++) {
      a.trainEpoch(X, Y);
      b.trainEpoch(X, Y);
    }
    expect(a.predictProba([1, 0])).toEqual(b.predictProba([1, 0]));
  });

  it('입력 크기가 다르면 오류', () => {
    expect(() => new MLP([3, 2], 1).predict([1, 2])).toThrow();
  });
});

describe('평가 지표', () => {
  it('정확도와 클래스별 정확도', () => {
    expect(accuracy([1, 0, 1, 1], [1, 0, 0, 1])).toBe(0.75);
    expect(perClassAccuracy([1, 0, 1, 1], [1, 0, 0, 1], 2)).toEqual([0.5, 1]);
    expect(imbalanceRatio([6, 2])).toBe(3);
    expect(imbalanceRatio([6, 0])).toBe(Infinity);
  });

  it('층화 분할: 학습/검증이 겹치지 않고 클래스마다 학습 데이터가 남는다', () => {
    const labels = [0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 1, 1];
    const { train, val } = stratifiedSplit(labels, 0.25, createRng(1));
    expect(new Set([...train, ...val]).size).toBe(labels.length);
    expect(train.some((i) => labels[i] === 0) && train.some((i) => labels[i] === 1)).toBe(true);
    expect(val.length).toBeGreaterThan(0);
  });
});

describe('강화학습(Q-learning)', () => {
  for (const level of ['low', 'mid', 'high'] as const) {
    it(`${MAZES[level].name}: 목표까지 길이 있다`, () => {
      expect(new GridEnv(MAZES[level], DEFAULT_RULES).shortestPath()).toBeGreaterThan(0);
    });
  }

  it('기본 보상 규칙으로 학습하면 학습 전보다 성공률이 높아진다', () => {
    for (const level of ['low', 'mid', 'high'] as const) {
      const env = new GridEnv(MAZES[level], DEFAULT_RULES);
      const untrained = new QLearner(env.numStates, 4, 1);
      const before = evaluateAgent(untrained, env, 30);
      const agent = new QLearner(env.numStates, 4, 2);
      for (let i = 0; i < 400; i++) agent.runEpisode(env, { learn: true, explore: true });
      const after = evaluateAgent(agent, env, 30);
      expect(after.successRate).toBeGreaterThan(before.successRate);
      expect(after.successRate).toBeGreaterThanOrEqual(0.9);
    }
  });

  it('빠른 도착 규칙을 켜면 최단 경로에 가까워진다', () => {
    const env = new GridEnv(MAZES.mid, { ...DEFAULT_RULES, fast: true });
    const agent = new QLearner(env.numStates, 4, 4);
    for (let i = 0; i < 600; i++) agent.runEpisode(env, { learn: true, explore: true });
    const r = evaluateAgent(agent, env, 10);
    expect(r.successRate).toBe(1);
    expect(r.avgDistance).toBeLessThanOrEqual(env.shortestPath() + 2);
  });

  it('목표 보상을 끄면 로봇은 목표를 찾을 이유가 없다(보상 설계의 중요성)', () => {
    const env = new GridEnv(MAZES.mid, { goal: false, collision: true, fast: true, energy: false, danger: false });
    const agent = new QLearner(env.numStates, 4, 6);
    for (let i = 0; i < 400; i++) agent.runEpisode(env, { learn: true, explore: true });
    const r = evaluateAgent(agent, env, 20);
    // 걸음 벌점만 있고 위험 구역 벌점이 없으면 위험 구역으로 뛰어들어 빨리 끝내는 행동을 배운다
    const dangerEnds = r.runs.filter((x) => x.ended === 'danger').length;
    expect(dangerEnds).toBeGreaterThan(r.runs.filter((x) => x.success).length);
  });

  it('탐험률은 학습하며 줄어든다', () => {
    const env = new GridEnv(MAZES.low, DEFAULT_RULES);
    const agent = new QLearner(env.numStates, 4, 1);
    for (let i = 0; i < 100; i++) agent.runEpisode(env, { learn: true, explore: true });
    expect(agent.epsilon).toBeLessThan(0.3);
    expect(agent.history.length).toBe(100);
  });
});
