import { pick, randInt, type Rng } from '../../ai/rng';

/** AI 훈련 연구소의 로봇 생명체. 특징(색·크기·모양·무늬·안테나)이 모델 입력이 됩니다. */
export interface Creature {
  id: number;
  color: number;
  size: number;
  shape: number;
  pattern: number;
  antennas: number;
}

export const COLORS = [
  { name: '빨강', hex: '#f87171' },
  { name: '노랑', hex: '#facc15' },
  { name: '파랑', hex: '#60a5fa' },
  { name: '초록', hex: '#4ade80' },
];
export const SHAPES = ['동그라미', '네모', '세모'];
export const PATTERNS = ['무늬 없음', '줄무늬', '점무늬'];

export const INPUT_DIM = 12;

export function encodeCreature(c: Creature): number[] {
  const v = new Array<number>(INPUT_DIM).fill(0);
  v[c.color] = 1;
  v[4] = c.size * 2 - 1;
  v[5 + c.shape] = 1;
  v[8 + c.pattern] = 1;
  v[11] = c.antennas / 2 - 0.5;
  return v;
}

export function describeCreature(c: Creature): string {
  return `${COLORS[c.color].name} · ${c.size > 0.5 ? '큰' : '작은'} ${SHAPES[c.shape]} · ${PATTERNS[c.pattern]} · 안테나 ${c.antennas}개`;
}

function key(c: Creature) {
  return `${c.color}${c.shape}${c.pattern}${c.antennas}${c.size > 0.5 ? 1 : 0}`;
}

let nextId = 1;

export function randomCreature(rng: Rng): Creature {
  return {
    id: nextId++,
    color: randInt(rng, 4),
    size: 0.15 + rng() * 0.8,
    shape: randInt(rng, 3),
    pattern: randInt(rng, 3),
    antennas: randInt(rng, 3),
  };
}

/** 겹치지 않는(처음 보는) 생명체 n개 */
export function freshCreatures(rng: Rng, n: number, avoid: Creature[] = []): Creature[] {
  const seen = new Set(avoid.map(key));
  const out: Creature[] = [];
  let guard = 0;
  while (out.length < n && guard++ < 2000) {
    const c = randomCreature(rng);
    if (seen.has(key(c))) continue;
    seen.add(key(c));
    out.push(c);
  }
  return out;
}

/** 에이봇이 추천하는 분류 기준. 학생이 직접 분류하므로 정답 채점용이 아니라 "기준과 다르게 넣은 데이터" 안내에만 씁니다. */
export interface SuggestedRule {
  id: string;
  text: string;
  a: string;
  b: string;
  labelOf: (c: Creature) => 0 | 1;
}

export const RULES: SuggestedRule[] = [
  { id: 'warm', text: '따뜻한 색은 A, 차가운 색은 B', a: '빨강·노랑', b: '파랑·초록', labelOf: (c) => (c.color < 2 ? 0 : 1) },
  { id: 'round', text: '동그라미는 A, 나머지 모양은 B', a: '동그라미', b: '네모·세모', labelOf: (c) => (c.shape === 0 ? 0 : 1) },
  { id: 'pattern', text: '무늬가 있으면 A, 없으면 B', a: '줄무늬·점무늬', b: '무늬 없음', labelOf: (c) => (c.pattern > 0 ? 0 : 1) },
];

export function pickRule(rng: Rng) {
  return pick(rng, RULES);
}

/** 수집용 생명체: 추천 기준을 쓸 때 두 그룹이 너무 한쪽으로 쏠리지 않게 섞습니다. */
export function collectionSet(rng: Rng, n: number, rule: SuggestedRule | null): Creature[] {
  const pool = freshCreatures(rng, n * 4);
  if (!rule) return pool.slice(0, n);
  const a = pool.filter((c) => rule.labelOf(c) === 0);
  const b = pool.filter((c) => rule.labelOf(c) === 1);
  const out: Creature[] = [];
  for (let i = 0; out.length < n; i++) {
    const src = i % 2 === 0 ? a : b;
    const c = src.shift() ?? a.shift() ?? b.shift();
    if (!c) break;
    out.push(c);
  }
  return out;
}
