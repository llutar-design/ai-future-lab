import { DEFAULT_TIMING, type DiagEvent, type InputSource, type InputTiming, type Pedal, type PedalEvent, type RejectReason } from './types';

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const realClock: Clock = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
};

type Listener<T> = (e: T) => void;

/**
 * 발판 입력의 단일 관문.
 * - 길게 밟기(키 반복) 무시
 * - 같은 발판의 짧은 떨림(디바운싱) 무시
 * - 두 발판 동시 밟기 감지 → 둘 다 무시하고 'simultaneous' 알림
 * - 입력 수락 후 lockMs 동안 잠금
 * 어댑터(키보드, 게임패드)는 press/release만 호출합니다.
 */
export class InputManager {
  private timing: InputTiming;
  private down: Record<Pedal, boolean> = { O: false, X: false };
  private lastRawDown: Record<Pedal, number> = { O: -Infinity, X: -Infinity };
  private lastAccepted = -Infinity;
  private pending: { ev: PedalEvent; handle: unknown } | null = null;
  private listeners = new Set<Listener<PedalEvent>>();
  private diagListeners = new Set<Listener<DiagEvent>>();
  private simulListeners = new Set<Listener<number>>();
  enabled = true;
  lastInputTime = -Infinity;

  constructor(timing: InputTiming = DEFAULT_TIMING, private clock: Clock = realClock) {
    this.timing = { ...timing };
  }

  setTiming(t: Partial<InputTiming>) {
    this.timing = { ...this.timing, ...t };
  }

  getTiming(): InputTiming {
    return { ...this.timing };
  }

  isDown(p: Pedal) {
    return this.down[p];
  }

  subscribe(fn: Listener<PedalEvent>) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  onDiag(fn: Listener<DiagEvent>) {
    this.diagListeners.add(fn);
    return () => void this.diagListeners.delete(fn);
  }

  onSimultaneous(fn: Listener<number>) {
    this.simulListeners.add(fn);
    return () => void this.simulListeners.delete(fn);
  }

  private diag(e: DiagEvent) {
    for (const l of this.diagListeners) l(e);
  }

  private reject(pedal: Pedal, source: InputSource, now: number, reason: RejectReason) {
    this.diag({ pedal, time: now, source, kind: 'down', accepted: false, reason });
  }

  press(pedal: Pedal, source: InputSource = 'keyboard', isRepeat = false) {
    const now = this.clock.now();
    this.lastInputTime = now;
    if (isRepeat || this.down[pedal]) {
      this.reject(pedal, source, now, 'held');
      return;
    }
    this.down[pedal] = true;
    const sinceLast = now - this.lastRawDown[pedal];
    this.lastRawDown[pedal] = now;
    if (!this.enabled) {
      this.reject(pedal, source, now, 'disabled');
      return;
    }
    if (sinceLast < this.timing.debounceMs) {
      this.reject(pedal, source, now, 'debounce');
      return;
    }
    // 다른 발판 입력이 대기 중이면 동시 입력
    if (this.pending && this.pending.ev.pedal !== pedal && now - this.pending.ev.time <= this.timing.simulWindowMs) {
      this.clock.clearTimeout(this.pending.handle);
      this.reject(this.pending.ev.pedal, this.pending.ev.source, now, 'simultaneous');
      this.reject(pedal, source, now, 'simultaneous');
      this.pending = null;
      this.lastAccepted = now;
      for (const l of this.simulListeners) l(now);
      return;
    }
    if (now - this.lastAccepted < this.timing.lockMs) {
      this.reject(pedal, source, now, 'locked');
      return;
    }
    if (this.pending) {
      // 같은 발판이 대기 중인데 다시 눌림 → 디바운스에서 걸러지므로 여기 오지 않음
      return;
    }
    const ev: PedalEvent = { pedal, time: now, source };
    if (this.timing.simulWindowMs <= 0) {
      this.emit(ev);
      return;
    }
    const handle = this.clock.setTimeout(() => {
      this.pending = null;
      this.emit(ev);
    }, this.timing.simulWindowMs);
    this.pending = { ev, handle };
  }

  release(pedal: Pedal, source: InputSource = 'keyboard') {
    const now = this.clock.now();
    if (!this.down[pedal]) return;
    this.down[pedal] = false;
    this.diag({ pedal, time: now, source, kind: 'up', accepted: true });
  }

  /** 창 포커스를 잃는 등 keyup을 놓쳤을 때 상태 초기화 */
  releaseAll() {
    this.down.O = false;
    this.down.X = false;
  }

  private emit(ev: PedalEvent) {
    this.lastAccepted = this.clock.now();
    this.diag({ ...ev, kind: 'down', accepted: true });
    for (const l of [...this.listeners]) {
      try {
        l(ev);
      } catch (err) {
        console.error('[InputManager] listener error', err);
      }
    }
  }

  dispose() {
    if (this.pending) this.clock.clearTimeout(this.pending.handle);
    this.pending = null;
    this.listeners.clear();
    this.diagListeners.clear();
    this.simulListeners.clear();
  }
}
