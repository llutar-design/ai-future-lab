import { isSafeToGo, resolvedScenario, type Scenario } from './traffic';

/**
 * 1차원 도로 위 차량 주행 시뮬레이션 + 규칙 기반 안전 제어기.
 *
 * 구조
 *  - AI(학생 데이터로 학습한 모델)는 "출발/정지"를 제안만 합니다.
 *  - 안전 제어기(SafetyController)는 교통 규칙으로 위험을 확인하고,
 *    위험할 때는 AI나 학생의 결정과 상관없이 정지선을 넘지 못하게 막습니다.
 *  → 학생의 잘못된 선택이나 AI 오류가 있어도 충돌이 일어나지 않습니다.
 */
export type DriveDecision = 'go' | 'stop';

export interface DriveEventState {
  original: Scenario;
  current: Scenario;
  at: number;
  stopLine: number;
  decided: DriveDecision | null;
  intervened: boolean;
  overCautious: boolean;
  revealed: boolean;
}

export type SimPhase = 'cruise' | 'decide' | 'wait' | 'pass' | 'finished';

export type SimSignal =
  | { type: 'needDecision'; index: number }
  | { type: 'intervention'; index: number; emergency: boolean }
  | { type: 'resolved'; index: number }
  | { type: 'eventDone'; index: number }
  | { type: 'finished' };

export const CRUISE = 11; // m/s (화면 표시 시 km/h 환산)
const ACCEL = 4;
const BRAKE = 6;
const EMERGENCY_BRAKE = 14;
export const EVENT_SPACING = 55;
const SUDDEN_TRIGGER = 10;

/** 남은 거리 d에서 BRAKE로 멈출 수 있는 최대 속도(+정지선 바로 앞까지 천천히 다가가는 최소 속도) */
function approachSpeed(d: number) {
  if (d <= 0.2) return 0;
  return Math.max(0.8, Math.sqrt(2 * BRAKE * (d - 0.2)));
}

export class SafetyController {
  interventions = 0;
  /** 위험하면 출발을 거부 */
  allowGo(s: Scenario): boolean {
    return isSafeToGo(s);
  }
}

export class DriveSim {
  pos = 0;
  speed = 0;
  phase: SimPhase = 'cruise';
  index = 0;
  events: DriveEventState[];
  readonly endPos: number;
  safety = new SafetyController();
  collisions = 0;
  private waitTimer = 0;
  private signals: SimSignal[] = [];
  laneOffset = 0;
  time = 0;

  constructor(scenarios: Scenario[], startGap = 30) {
    this.events = scenarios.map((s, i) => {
      const at = startGap + i * EVENT_SPACING + 8;
      return {
        original: s,
        current: s.sudden ? { ...s, obstacle: false } : s,
        at,
        stopLine: at - 7,
        decided: null,
        intervened: false,
        overCautious: false,
        revealed: !s.sudden,
      };
    });
    this.endPos = startGap + scenarios.length * EVENT_SPACING + 15;
  }

  get event(): DriveEventState | null {
    return this.events[this.index] ?? null;
  }

  /** 현재 구간 장면이 위험한가(안전 제어기 판단) */
  get hazardActive(): boolean {
    const e = this.event;
    return !!e && !this.safety.allowGo(e.current);
  }

  drain(): SimSignal[] {
    const s = this.signals;
    this.signals = [];
    return s;
  }

  /** AI/학생의 최종 결정 전달 */
  decide(d: DriveDecision) {
    const e = this.event;
    if (!e || this.phase !== 'decide') return;
    e.decided = d;
    if (d === 'go' && !this.safety.allowGo(e.current)) {
      e.intervened = true;
      this.safety.interventions++;
      this.signals.push({ type: 'intervention', index: this.index, emergency: false });
      this.phase = 'wait';
      this.waitTimer = 2.6;
    } else if (d === 'stop') {
      e.overCautious = this.safety.allowGo(e.current);
      this.phase = 'wait';
      this.waitTimer = e.overCautious ? 1.4 : 2.6;
    } else {
      this.phase = 'pass';
    }
  }

  update(dt: number) {
    if (this.phase === 'finished') return;
    this.time += dt;
    const e = this.event;
    let target = CRUISE;
    let brake = BRAKE;

    if (e) {
      // 갑작스러운 장애물: 가까워지면 나타남 → 안전 제어기 긴급 제동
      if (!e.revealed && this.pos >= e.stopLine - SUDDEN_TRIGGER) {
        e.revealed = true;
        e.current = e.original;
        e.intervened = true;
        this.safety.interventions++;
        this.signals.push({ type: 'intervention', index: this.index, emergency: true });
      }
      if (this.phase === 'cruise') {
        const dist = e.stopLine - this.pos;
        // 정지선에서 멈추도록 감속 (결정 대기)
        if (!e.original.sudden) target = Math.min(CRUISE, approachSpeed(dist));
        if (e.revealed && e.original.sudden && this.hazardActive) {
          target = 0;
          brake = EMERGENCY_BRAKE;
        }
        if (((!e.original.sudden && dist <= 0.6) || (e.original.sudden && e.revealed)) && this.speed < 0.3) {
          this.speed = 0;
          this.phase = 'decide';
          this.signals.push({ type: 'needDecision', index: this.index });
        }
      } else if (this.phase === 'decide' || this.phase === 'wait') {
        target = 0;
        if (this.phase === 'wait') {
          this.waitTimer -= dt;
          if (this.waitTimer <= 0) {
            if (!isSafeToGo(e.current)) {
              e.current = resolvedScenario(e.current);
              this.signals.push({ type: 'resolved', index: this.index });
            }
            this.phase = 'pass';
          }
        }
      } else if (this.phase === 'pass') {
        // 공사 구간 등 장애물 구간은 옆 차선으로 돌아감
        const avoid = e.original.obstacle && Math.abs(this.pos - e.at) < 10;
        this.laneOffset += ((avoid ? -3.2 : 0) - this.laneOffset) * Math.min(1, dt * 2.5);
        if (e.original.school) target = CRUISE * 0.55;
        if (this.pos > e.at + 6) {
          this.signals.push({ type: 'eventDone', index: this.index });
          this.index++;
          this.phase = 'cruise';
        }
      }
    } else {
      this.laneOffset += (0 - this.laneOffset) * Math.min(1, dt * 2.5);
      const dist = this.endPos - this.pos;
      target = Math.min(CRUISE, approachSpeed(dist));
      if (dist <= 0.6 && this.speed < 0.3) {
        this.speed = 0;
        this.phase = 'finished';
        this.signals.push({ type: 'finished' });
        return;
      }
    }

    if (this.speed < target) this.speed = Math.min(target, this.speed + ACCEL * dt);
    else this.speed = Math.max(target, this.speed - brake * dt);
    let next = this.pos + this.speed * dt;

    // 안전 제어기 최종 보호: 위험한 구간이면 어떤 경우에도 정지선을 넘지 않음
    // (이번 프레임에 구간이 바뀌었을 수 있으므로 현재 구간 기준)
    const cur = this.event;
    if (cur && this.hazardActive && this.phase !== 'pass') {
      const limit = cur.stopLine + (cur.original.sudden ? 4 : 0);
      if (next > limit) {
        next = Math.max(this.pos, limit);
        this.speed = 0;
      }
    }
    this.pos = next;
    // 충돌 판정: 위험 요소가 남아있는데 위험 구간에 들어감
    if (cur && this.hazardActive && this.pos > cur.at - 1) this.collisions++;
  }
}
