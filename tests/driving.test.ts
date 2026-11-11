import { describe, expect, it } from 'vitest';
import { createRng } from '../src/ai/rng';
import { MLP } from '../src/ai/models/mlp';
import { DriveSim } from '../src/simulation/driveSim';
import { FEATURE_DIM, encodeScenario, finalMissionRoute, hazards, isSafeToGo, randomScenario } from '../src/simulation/traffic';

function runSim(sim: DriveSim, policy: () => 'go' | 'stop', maxT = 400) {
  let t = 0;
  while (sim.phase !== 'finished' && t < maxT) {
    sim.update(1 / 30);
    for (const s of sim.drain()) if (s.type === 'needDecision') sim.decide(policy());
    t += 1 / 30;
  }
  return t;
}

describe('자율주행 안전 제어기', () => {
  it('규칙: 빨간불/횡단 보행자/장애물/가까운 앞차는 위험', () => {
    const base = { light: 'green', ped: 'none', obstacle: false, school: false, weather: 'clear', car: 'none' } as const;
    expect(isSafeToGo(base)).toBe(true);
    expect(isSafeToGo({ ...base, light: 'red' })).toBe(false);
    expect(isSafeToGo({ ...base, ped: 'crossing' })).toBe(false);
    expect(isSafeToGo({ ...base, obstacle: true })).toBe(false);
    expect(isSafeToGo({ ...base, car: 'near' })).toBe(false);
    expect(isSafeToGo({ ...base, school: true, ped: 'sidewalk' })).toBe(false);
    expect(hazards({ ...base, light: 'red', car: 'near' }).length).toBe(2);
  });

  it('AI가 항상 "출발"이라고 해도(최악의 판단) 충돌이 0회', () => {
    const rng = createRng(1);
    for (let k = 0; k < 30; k++) {
      const route = Array.from({ length: 6 }, () => randomScenario(rng, 0.3));
      const sim = new DriveSim(route);
      runSim(sim, () => 'go');
      expect(sim.collisions).toBe(0);
      expect(sim.phase).toBe('finished');
    }
  });

  it('최종 미션(갑작스러운 장애물 포함)을 무작위 판단으로 50번 달려도 충돌 0회, 항상 도착', () => {
    const rng = createRng(2);
    for (let k = 0; k < 50; k++) {
      const sim = new DriveSim(finalMissionRoute());
      runSim(sim, () => (rng() < 0.5 ? 'go' : 'stop'));
      expect(sim.collisions).toBe(0);
      expect(sim.phase).toBe('finished');
    }
  });

  it('위험한데 출발하려 하면 안전 제어기가 개입한다', () => {
    const sim = new DriveSim([{ light: 'red', ped: 'none', obstacle: false, school: false, weather: 'clear', car: 'none' }]);
    runSim(sim, () => 'go');
    expect(sim.events[0].intervened).toBe(true);
    expect(sim.safety.interventions).toBe(1);
  });

  it('갑작스러운 장애물은 긴급 제동(개입)으로 처리된다', () => {
    const sim = new DriveSim([finalMissionRoute()[4]]);
    runSim(sim, () => 'stop');
    expect(sim.events[0].intervened).toBe(true);
    expect(sim.collisions).toBe(0);
  });

  it('안전한데 멈추면 "너무 조심" 기록', () => {
    const sim = new DriveSim([{ light: 'green', ped: 'none', obstacle: false, school: false, weather: 'clear', car: 'none' }]);
    runSim(sim, () => 'stop');
    expect(sim.events[0].overCautious).toBe(true);
  });

  it('학생 판단 데이터로 학습한 주행 AI가 교통 규칙을 배운다(일관된 데이터)', () => {
    const rng = createRng(5);
    const train = Array.from({ length: 40 }, () => randomScenario(rng));
    const X = train.map(encodeScenario);
    const Y = train.map((s) => (isSafeToGo(s) ? 1 : 0));
    expect(X[0].length).toBe(FEATURE_DIM);
    const m = new MLP([FEATURE_DIM, 8, 2], 3);
    for (let e = 0; e < 200; e++) m.trainEpoch(X, Y);
    const test = Array.from({ length: 200 }, () => randomScenario(rng));
    const acc = test.filter((s) => m.predict(encodeScenario(s)).label === (isSafeToGo(s) ? 1 : 0)).length / test.length;
    expect(acc).toBeGreaterThan(0.85);
  });
});
