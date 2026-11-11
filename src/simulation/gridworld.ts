/**
 * 강화학습 아레나 환경(격자 미로).
 * 기호: S 출발, G 목표, # 장애물, ~ 위험 구역, E 에너지 아이템, . 길
 */
export type CellType = 'floor' | 'wall' | 'danger' | 'goal' | 'energy' | 'start';

export interface MazeDef {
  name: string;
  rows: string[];
}

export const MAZES: Record<'low' | 'mid' | 'high', MazeDef> = {
  low: {
    name: '꼬마 미로 (5×5)',
    rows: ['S..#.', '.#...', '.#E#.', '...~.', '#.~.G'],
  },
  mid: {
    name: '도전 미로 (6×6)',
    rows: ['S...#.', '.##.#E', '.#....', '.#.##.', 'E..~..', '##...G'],
  },
  high: {
    name: '챔피언 미로 (7×7)',
    rows: ['S..#...', '.#.#.#E', '.#...#.', '.###.#.', '...#~..', 'E#~...#', '..#.#.G'],
  },
};

export interface RewardRules {
  goal: boolean;
  collision: boolean;
  fast: boolean;
  energy: boolean;
  danger: boolean;
}

export const REWARD_VALUES = { goal: 10, collision: -1, step: -0.1, energy: 2, danger: -10 } as const;

export const RULE_INFO: { key: keyof RewardRules; name: string; desc: string }[] = [
  { key: 'goal', name: '목표 도착 보상', desc: `목표에 도착하면 +${REWARD_VALUES.goal}점` },
  { key: 'collision', name: '충돌 벌점', desc: `장애물·벽에 부딪히면 ${REWARD_VALUES.collision}점` },
  { key: 'fast', name: '빠른 도착 보상', desc: `한 걸음마다 ${REWARD_VALUES.step}점 → 짧은 길일수록 이득` },
  { key: 'energy', name: '에너지 아이템 보상', desc: `에너지를 모으면 +${REWARD_VALUES.energy}점` },
  { key: 'danger', name: '위험 구역 벌점', desc: `위험 구역에 빠지면 ${REWARD_VALUES.danger}점` },
];

export const DEFAULT_RULES: RewardRules = { goal: true, collision: true, fast: false, energy: false, danger: true };

export const ACTIONS: [number, number][] = [
  [0, -1], // 위
  [1, 0], // 오른쪽
  [0, 1], // 아래
  [-1, 0], // 왼쪽
];

export type StepEvent = 'move' | 'bump' | 'goal' | 'danger' | 'energy' | 'timeout';

export interface StepResult {
  state: number;
  reward: number;
  done: boolean;
  event: StepEvent;
  x: number;
  y: number;
}

export class GridEnv {
  readonly w: number;
  readonly h: number;
  readonly cells: CellType[][];
  readonly start: [number, number];
  readonly goal: [number, number];
  readonly energies: [number, number][];
  readonly maxSteps: number;
  x = 0;
  y = 0;
  mask = 0;
  steps = 0;

  constructor(
    readonly maze: MazeDef,
    public rules: RewardRules,
  ) {
    this.h = maze.rows.length;
    this.w = maze.rows[0].length;
    const map: Record<string, CellType> = { S: 'start', G: 'goal', '#': 'wall', '~': 'danger', E: 'energy', '.': 'floor' };
    this.cells = maze.rows.map((r) => r.split('').map((ch) => map[ch] ?? 'floor'));
    let start: [number, number] = [0, 0];
    let goal: [number, number] = [this.w - 1, this.h - 1];
    const energies: [number, number][] = [];
    this.cells.forEach((row, y) =>
      row.forEach((c, x) => {
        if (c === 'start') start = [x, y];
        if (c === 'goal') goal = [x, y];
        if (c === 'energy') energies.push([x, y]);
      }),
    );
    this.start = start;
    this.goal = goal;
    this.energies = energies;
    this.maxSteps = this.w * this.h * 2 + 10;
    this.reset();
  }

  get numStates() {
    return this.w * this.h * (1 << this.energies.length);
  }

  stateIndex(x = this.x, y = this.y, mask = this.mask) {
    return (mask * this.h + y) * this.w + x;
  }

  reset(): number {
    [this.x, this.y] = this.start;
    this.mask = 0;
    this.steps = 0;
    return this.stateIndex();
  }

  isBlocked(x: number, y: number) {
    return x < 0 || y < 0 || x >= this.w || y >= this.h || this.cells[y][x] === 'wall';
  }

  step(action: number): StepResult {
    const [dx, dy] = ACTIONS[action];
    const nx = this.x + dx;
    const ny = this.y + dy;
    const R = this.rules;
    let reward = R.fast ? REWARD_VALUES.step : 0;
    let event: StepEvent = 'move';
    let done = false;
    this.steps++;
    if (this.isBlocked(nx, ny)) {
      event = 'bump';
      if (R.collision) reward += REWARD_VALUES.collision;
    } else {
      this.x = nx;
      this.y = ny;
      const c = this.cells[ny][nx];
      if (c === 'goal') {
        event = 'goal';
        done = true;
        if (R.goal) reward += REWARD_VALUES.goal;
      } else if (c === 'danger') {
        event = 'danger';
        done = true;
        if (R.danger) reward += REWARD_VALUES.danger;
      } else if (c === 'energy') {
        const k = this.energies.findIndex(([ex, ey]) => ex === nx && ey === ny);
        if (k >= 0 && !(this.mask & (1 << k))) {
          this.mask |= 1 << k;
          event = 'energy';
          if (R.energy) reward += REWARD_VALUES.energy;
        }
      }
    }
    if (!done && this.steps >= this.maxSteps) {
      done = true;
      event = event === 'move' ? 'timeout' : event;
    }
    return { state: this.stateIndex(), reward, done, event, x: this.x, y: this.y };
  }

  /** 출발점에서 목표까지 최단 거리(BFS). 도달 불가면 -1 */
  shortestPath(): number {
    const dist = new Map<string, number>();
    const q: [number, number][] = [this.start];
    dist.set(this.start.join(','), 0);
    while (q.length) {
      const [x, y] = q.shift()!;
      const d = dist.get(`${x},${y}`)!;
      if (x === this.goal[0] && y === this.goal[1]) return d;
      for (const [dx, dy] of ACTIONS) {
        const nx = x + dx;
        const ny = y + dy;
        if (this.isBlocked(nx, ny) || this.cells[ny][nx] === 'danger') continue;
        const k = `${nx},${ny}`;
        if (!dist.has(k)) {
          dist.set(k, d + 1);
          q.push([nx, ny]);
        }
      }
    }
    return -1;
  }
}
