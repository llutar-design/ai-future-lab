import { createRng, type Rng } from '../rng';
import { GridEnv, type StepEvent } from '../../simulation/gridworld';

/**
 * 표 형식 Q-learning.
 * Q(s,a) ← Q(s,a) + α [ r + γ·max Q(s',·) − Q(s,a) ]
 * 탐험률 ε는 에피소드마다 줄어듭니다(처음엔 마구 돌아다니고 점점 배운 대로 움직임).
 */
export interface EpisodeResult {
  steps: number;
  moved: number;
  totalReward: number;
  success: boolean;
  collisions: number;
  energy: number;
  ended: StepEvent;
  path: [number, number][];
}

export class QLearner {
  Q: Float64Array;
  alpha = 0.5;
  gamma = 0.95;
  epsilon = 1;
  epsilonMin = 0.05;
  epsilonDecay = 0.985;
  episodes = 0;
  history: EpisodeResult[] = [];
  private rng: Rng;

  constructor(
    readonly nStates: number,
    readonly nActions: number,
    seed = 1,
  ) {
    this.Q = new Float64Array(nStates * nActions);
    this.rng = createRng(seed);
  }

  /** 가장 좋은 행동(동점이면 무작위로 하나) */
  greedy(s: number): number {
    let best = -Infinity;
    let ties: number[] = [];
    for (let a = 0; a < this.nActions; a++) {
      const q = this.Q[s * this.nActions + a];
      if (q > best + 1e-12) {
        best = q;
        ties = [a];
      } else if (Math.abs(q - best) <= 1e-12) ties.push(a);
    }
    return ties[Math.floor(this.rng() * ties.length)];
  }

  act(s: number, explore: boolean): number {
    if (explore && this.rng() < this.epsilon) return Math.floor(this.rng() * this.nActions);
    return this.greedy(s);
  }

  maxQ(s: number) {
    let m = -Infinity;
    for (let a = 0; a < this.nActions; a++) m = Math.max(m, this.Q[s * this.nActions + a]);
    return m;
  }

  update(s: number, a: number, r: number, s2: number, done: boolean) {
    const i = s * this.nActions + a;
    const target = done ? r : r + this.gamma * this.maxQ(s2);
    this.Q[i] += this.alpha * (target - this.Q[i]);
  }

  /** 환경에서 한 에피소드 실행. learn=true면 매 걸음 Q를 갱신하고 탐험률을 줄입니다. */
  runEpisode(env: GridEnv, opts: { learn: boolean; explore: boolean }): EpisodeResult {
    let s = env.reset();
    const path: [number, number][] = [[env.x, env.y]];
    let total = 0;
    let collisions = 0;
    let moved = 0;
    let energy = 0;
    let ended: StepEvent = 'timeout';
    let success = false;
    for (;;) {
      const a = this.act(s, opts.explore);
      const r = env.step(a);
      if (opts.learn) this.update(s, a, r.reward, r.state, r.done);
      total += r.reward;
      if (r.event === 'bump') collisions++;
      else moved++;
      if (r.event === 'energy') energy++;
      path.push([r.x, r.y]);
      s = r.state;
      if (r.done) {
        ended = r.event;
        success = r.event === 'goal';
        break;
      }
    }
    const res: EpisodeResult = { steps: env.steps, moved, totalReward: total, success, collisions, energy, ended, path };
    if (opts.learn) {
      this.episodes++;
      this.epsilon = Math.max(this.epsilonMin, this.epsilon * this.epsilonDecay);
      this.history.push(res);
    }
    return res;
  }
}

export interface EvalResult {
  successRate: number;
  avgDistance: number;
  avgSteps: number;
  avgCollisions: number;
  runs: EpisodeResult[];
}

/** 같은 환경에서 탐험 없이(배운 대로만) trials번 실행해 성능 측정 */
export function evaluateAgent(agent: QLearner, env: GridEnv, trials: number): EvalResult {
  const runs: EpisodeResult[] = [];
  for (let i = 0; i < trials; i++) runs.push(agent.runEpisode(env, { learn: false, explore: false }));
  const avg = (f: (r: EpisodeResult) => number) => runs.reduce((a, r) => a + f(r), 0) / runs.length;
  return {
    successRate: avg((r) => (r.success ? 1 : 0)),
    avgDistance: avg((r) => r.moved),
    avgSteps: avg((r) => r.steps),
    avgCollisions: avg((r) => r.collisions),
    runs,
  };
}
