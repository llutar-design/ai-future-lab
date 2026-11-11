/** 실제 예측값과 정답으로 계산하는 평가 지표 */

export function accuracy(pred: number[], truth: number[]): number {
  if (pred.length !== truth.length) throw new Error('길이가 다릅니다');
  if (pred.length === 0) return NaN;
  let c = 0;
  for (let i = 0; i < pred.length; i++) if (pred[i] === truth[i]) c++;
  return c / pred.length;
}

/** matrix[정답][예측] */
export function confusion(pred: number[], truth: number[], k: number): number[][] {
  const m = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  for (let i = 0; i < pred.length; i++) m[truth[i]][pred[i]]++;
  return m;
}

/** 클래스별 정확도(재현율). 해당 클래스 데이터가 없으면 NaN */
export function perClassAccuracy(pred: number[], truth: number[], k: number): number[] {
  const m = confusion(pred, truth, k);
  return m.map((row, c) => {
    const total = row.reduce((a, b) => a + b, 0);
    return total ? row[c] / total : NaN;
  });
}

export function countLabels(labels: number[], k: number): number[] {
  const c = new Array<number>(k).fill(0);
  for (const l of labels) c[l]++;
  return c;
}

/** 큰 쪽 / 작은 쪽 비율. 한 쪽이 0이면 Infinity */
export function imbalanceRatio(counts: number[]): number {
  const nz = counts.filter((c) => c > 0);
  if (nz.length < counts.length) return Infinity;
  return Math.max(...counts) / Math.min(...counts);
}

export function fmtPct(v: number): string {
  return Number.isFinite(v) ? `${Math.round(v * 100)}%` : '측정 불가';
}

export function movingAverage(values: number[], window: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    out.push(sum / Math.min(i + 1, window));
  }
  return out;
}

/** 학습/검증 분할: 클래스별로 비율을 맞춰 나눕니다(층화 분할) */
export function stratifiedSplit(labels: number[], valFraction: number, rng: () => number): { train: number[]; val: number[] } {
  const byClass = new Map<number, number[]>();
  labels.forEach((l, i) => byClass.set(l, [...(byClass.get(l) ?? []), i]));
  const train: number[] = [];
  const val: number[] = [];
  for (const idx of byClass.values()) {
    const s = idx.slice();
    for (let i = s.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [s[i], s[j]] = [s[j], s[i]];
    }
    // 클래스 데이터가 2개 이상일 때만 검증용으로 떼어냄(학습용이 최소 1개 남도록)
    const nVal = s.length >= 2 ? Math.max(1, Math.round(s.length * valFraction)) : 0;
    val.push(...s.slice(0, Math.min(nVal, s.length - 1)));
    train.push(...s.slice(Math.min(nVal, s.length - 1)));
  }
  return { train, val };
}
