import { useEffect, useState } from 'react';
import { MLP } from '../models/mlp';
import { accuracy } from '../evaluation/metrics';
import { play } from '../../audio/sound';

export interface TrainJob {
  X: number[][];
  Y: number[];
  Xv?: number[][];
  Yv?: number[];
  sizes: number[];
  epochs: number;
  seed: number;
  lr?: number;
  batchSize?: number;
}

export interface LiveTrain {
  model: MLP;
  epoch: number;
  epochs: number;
  loss: number[];
  trainAcc: number[];
  valAcc: number[];
  done: boolean;
}

function acc(m: MLP, X: number[][], Y: number[]) {
  if (!X.length) return NaN;
  return accuracy(
    X.map((x) => m.predict(x).label),
    Y,
  );
}

/**
 * 화면 프레임마다 실제 학습을 1~2 에포크씩 진행하며 손실/정확도 기록을 돌려줍니다.
 * 그래프에 그려지는 값은 모두 이 학습 과정에서 계산된 실제 값입니다.
 */
export function useLiveTraining(job: TrainJob | null): LiveTrain | null {
  const [state, setState] = useState<LiveTrain | null>(null);
  useEffect(() => {
    if (!job) {
      setState(null);
      return;
    }
    const model = new MLP(job.sizes, job.seed);
    const loss: number[] = [model.loss(job.X, job.Y)];
    const trainAcc: number[] = [acc(model, job.X, job.Y)];
    const valAcc: number[] = job.Xv ? [acc(model, job.Xv, job.Yv!)] : [];
    const perFrame = Math.max(1, Math.ceil(job.epochs / 120));
    let raf = 0;
    let epoch = 0;
    const tick = () => {
      for (let k = 0; k < perFrame && epoch < job.epochs; k++) {
        loss.push(model.trainEpoch(job.X, job.Y, { lr: job.lr ?? 0.05, batchSize: job.batchSize ?? 4 }));
        epoch++;
        trainAcc.push(acc(model, job.X, job.Y));
        if (job.Xv) valAcc.push(acc(model, job.Xv, job.Yv!));
      }
      if (epoch % 6 === 0) play('train');
      const done = epoch >= job.epochs;
      setState({ model, epoch, epochs: job.epochs, loss: loss.slice(), trainAcc: trainAcc.slice(), valAcc: valAcc.slice(), done });
      if (!done) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [job]);
  return state;
}
