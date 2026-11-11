import { describe, expect, it } from 'vitest';
import { createRng } from '../src/ai/rng';
import { runDetector, activeDetector } from '../src/ai/models/detector';
import { CASES } from '../src/games/deepfake-detective/cases';
import { INPUT_DIM, RULES, collectionSet, encodeCreature, freshCreatures } from '../src/games/ai-training/creatures';

describe('딥페이크 탐정단 사례 자료', () => {
  it('사례마다 증거 6종, 사실·불확실·추가 확인 항목이 있다', () => {
    for (const c of CASES) {
      expect(new Set(c.evidence.map((e) => e.type)).size).toBe(6);
      expect(c.facts.length).toBeGreaterThan(0);
      expect(c.uncertain.length).toBeGreaterThan(0);
      expect(c.moreChecks.length).toBeGreaterThan(0);
      expect(c.preAnalysis.note).toContain('예시');
    }
  });

  it('실제 자료와 AI 생성 자료가 모두 있다(무조건 의심하지 않도록)', () => {
    expect(CASES.some((c) => c.truth === 'real')).toBe(true);
    expect(CASES.some((c) => c.truth === 'ai')).toBe(true);
  });

  it('외형 단서(세부 표현)만으로는 강한 근거가 되지 않는다', () => {
    for (const c of CASES) expect(c.evidence.find((e) => e.type === 'detail')!.weight).not.toBe('strong');
  });

  it('탐지 모델이 없으면 결과는 반드시 "사전 분석(precomputed)"으로 표시', async () => {
    expect(activeDetector()).toBeNull();
    const r = await runDetector(null, CASES[0].preAnalysis);
    expect(r.kind).toBe('precomputed');
  });

  it('탐지기가 틀리는 사례(오탐)가 포함되어 한계를 보여준다', () => {
    const fp = CASES.filter((c) => c.truth === 'real' && c.preAnalysis.aiScore > 0.5);
    expect(fp.length).toBeGreaterThan(0);
  });
});

describe('AI 훈련 연구소 데이터', () => {
  it('특징 인코딩 길이와 범위', () => {
    for (const c of freshCreatures(createRng(1), 50)) {
      const v = encodeCreature(c);
      expect(v.length).toBe(INPUT_DIM);
      for (const x of v) expect(Math.abs(x)).toBeLessThanOrEqual(1);
    }
  });

  it('처음 보는 데이터는 학습 데이터와 겹치지 않는다', () => {
    const rng = createRng(2);
    const train = freshCreatures(rng, 18);
    const test = freshCreatures(rng, 8, train);
    const key = (c: (typeof train)[0]) => `${c.color}${c.shape}${c.pattern}${c.antennas}${c.size > 0.5 ? 1 : 0}`;
    const keys = new Set(train.map(key));
    for (const t of test) expect(keys.has(key(t))).toBe(false);
  });

  it('추천 기준 사용 시 두 그룹이 고르게 섞여 나온다', () => {
    for (const rule of RULES) {
      const set = collectionSet(createRng(3), 14, rule);
      const a = set.filter((c) => rule.labelOf(c) === 0).length;
      expect(set.length).toBe(14);
      expect(Math.abs(a - 7)).toBeLessThanOrEqual(1);
    }
  });
});
