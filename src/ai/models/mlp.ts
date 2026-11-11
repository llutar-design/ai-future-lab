import { createRng, gaussian, shuffle, type Rng } from '../rng';

/**
 * 작은 다층 퍼셉트론(신경망) 분류기.
 * - 은닉층: tanh, 출력층: softmax, 손실: 교차 엔트로피 + L2
 * - 최적화: Adam, 미니배치 경사하강
 * 브라우저 CPU에서 수십~수백 개 데이터를 수 ms 안에 학습하는 크기입니다.
 * 학습 곡선과 정확도는 모두 이 모델의 실제 계산 결과입니다.
 */
export interface TrainOptions {
  lr?: number;
  batchSize?: number;
  l2?: number;
}

export class MLP {
  readonly sizes: number[];
  W: Float64Array[] = [];
  b: Float64Array[] = [];
  private mW: Float64Array[] = [];
  private vW: Float64Array[] = [];
  private mB: Float64Array[] = [];
  private vB: Float64Array[] = [];
  private step = 0;
  private rng: Rng;
  epochs = 0;

  constructor(sizes: number[], seed = 1) {
    if (sizes.length < 2) throw new Error('층이 최소 2개 필요합니다');
    this.sizes = sizes.slice();
    this.rng = createRng(seed);
    for (let l = 0; l < sizes.length - 1; l++) {
      const nIn = sizes[l];
      const nOut = sizes[l + 1];
      const scale = Math.sqrt(1 / nIn); // Xavier 초기화
      const w = new Float64Array(nIn * nOut);
      for (let i = 0; i < w.length; i++) w[i] = gaussian(this.rng) * scale;
      this.W.push(w);
      this.b.push(new Float64Array(nOut));
      this.mW.push(new Float64Array(w.length));
      this.vW.push(new Float64Array(w.length));
      this.mB.push(new Float64Array(nOut));
      this.vB.push(new Float64Array(nOut));
    }
  }

  get numClasses() {
    return this.sizes[this.sizes.length - 1];
  }

  /** 각 층의 활성값 반환 (마지막은 softmax 확률) */
  private forward(x: ArrayLike<number>): Float64Array[] {
    const acts: Float64Array[] = [Float64Array.from(x)];
    const L = this.W.length;
    for (let l = 0; l < L; l++) {
      const nIn = this.sizes[l];
      const nOut = this.sizes[l + 1];
      const a = acts[l];
      const z = new Float64Array(nOut);
      const w = this.W[l];
      for (let j = 0; j < nOut; j++) {
        let s = this.b[l][j];
        for (let i = 0; i < nIn; i++) s += a[i] * w[i * nOut + j];
        z[j] = s;
      }
      if (l < L - 1) {
        for (let j = 0; j < nOut; j++) z[j] = Math.tanh(z[j]);
      } else {
        let m = -Infinity;
        for (let j = 0; j < nOut; j++) m = Math.max(m, z[j]);
        let sum = 0;
        for (let j = 0; j < nOut; j++) {
          z[j] = Math.exp(z[j] - m);
          sum += z[j];
        }
        for (let j = 0; j < nOut; j++) z[j] /= sum;
      }
      acts.push(z);
    }
    return acts;
  }

  predictProba(x: ArrayLike<number>): number[] {
    if (x.length !== this.sizes[0]) throw new Error(`입력 크기 ${x.length} ≠ ${this.sizes[0]}`);
    return Array.from(this.forward(x)[this.W.length]);
  }

  predict(x: ArrayLike<number>): { label: number; confidence: number; proba: number[] } {
    const p = this.predictProba(x);
    let best = 0;
    for (let i = 1; i < p.length; i++) if (p[i] > p[best]) best = i;
    return { label: best, confidence: p[best], proba: p };
  }

  loss(X: number[][], Y: number[], l2 = 1e-3): number {
    if (X.length === 0) return 0;
    let total = 0;
    for (let n = 0; n < X.length; n++) {
      const p = this.predictProba(X[n]);
      total -= Math.log(Math.max(p[Y[n]], 1e-12));
    }
    let reg = 0;
    for (const w of this.W) for (let i = 0; i < w.length; i++) reg += w[i] * w[i];
    return total / X.length + 0.5 * l2 * reg;
  }

  /** 한 에포크(전체 데이터 1회) 학습 후 평균 손실 반환 */
  trainEpoch(X: number[][], Y: number[], opts: TrainOptions = {}): number {
    const lr = opts.lr ?? 0.03;
    const bs = Math.max(1, opts.batchSize ?? 8);
    const l2 = opts.l2 ?? 1e-3;
    if (X.length === 0) return 0;
    const order = shuffle(
      this.rng,
      X.map((_, i) => i),
    );
    const L = this.W.length;
    for (let start = 0; start < order.length; start += bs) {
      const batch = order.slice(start, start + bs);
      const gW = this.W.map((w) => new Float64Array(w.length));
      const gB = this.b.map((b) => new Float64Array(b.length));
      for (const n of batch) {
        const acts = this.forward(X[n]);
        // 출력층 delta = p - onehot
        let delta = Float64Array.from(acts[L]);
        delta[Y[n]] -= 1;
        for (let l = L - 1; l >= 0; l--) {
          const nIn = this.sizes[l];
          const nOut = this.sizes[l + 1];
          const a = acts[l];
          const w = this.W[l];
          for (let j = 0; j < nOut; j++) {
            gB[l][j] += delta[j];
            for (let i = 0; i < nIn; i++) gW[l][i * nOut + j] += a[i] * delta[j];
          }
          if (l > 0) {
            const prev = new Float64Array(nIn);
            for (let i = 0; i < nIn; i++) {
              let s = 0;
              for (let j = 0; j < nOut; j++) s += w[i * nOut + j] * delta[j];
              prev[i] = s * (1 - a[i] * a[i]); // tanh'
            }
            delta = prev;
          }
        }
      }
      this.adam(gW, gB, batch.length, lr, l2);
    }
    this.epochs++;
    return this.loss(X, Y, l2);
  }

  private adam(gW: Float64Array[], gB: Float64Array[], n: number, lr: number, l2: number) {
    const b1 = 0.9;
    const b2 = 0.999;
    const eps = 1e-8;
    this.step++;
    const c1 = 1 - Math.pow(b1, this.step);
    const c2 = 1 - Math.pow(b2, this.step);
    for (let l = 0; l < this.W.length; l++) {
      const w = this.W[l];
      for (let i = 0; i < w.length; i++) {
        const g = gW[l][i] / n + l2 * w[i];
        this.mW[l][i] = b1 * this.mW[l][i] + (1 - b1) * g;
        this.vW[l][i] = b2 * this.vW[l][i] + (1 - b2) * g * g;
        w[i] -= (lr * (this.mW[l][i] / c1)) / (Math.sqrt(this.vW[l][i] / c2) + eps);
      }
      const b = this.b[l];
      for (let j = 0; j < b.length; j++) {
        const g = gB[l][j] / n;
        this.mB[l][j] = b1 * this.mB[l][j] + (1 - b1) * g;
        this.vB[l][j] = b2 * this.vB[l][j] + (1 - b2) * g * g;
        b[j] -= (lr * (this.mB[l][j] / c1)) / (Math.sqrt(this.vB[l][j] / c2) + eps);
      }
    }
  }

  toJSON() {
    return { sizes: this.sizes, W: this.W.map((w) => Array.from(w)), b: this.b.map((b) => Array.from(b)), epochs: this.epochs };
  }
}
