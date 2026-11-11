export type Pedal = 'O' | 'X';
export type InputSource = 'keyboard' | 'gamepad' | 'test';

export interface PedalEvent {
  pedal: Pedal;
  time: number;
  source: InputSource;
}

export type RejectReason = 'held' | 'debounce' | 'locked' | 'simultaneous' | 'disabled';

/** 진단 화면용 원시 입력 기록 */
export interface DiagEvent {
  pedal: Pedal;
  time: number;
  source: InputSource;
  kind: 'down' | 'up';
  accepted: boolean;
  reason?: RejectReason;
  detail?: string;
}

export interface InputTiming {
  /** 같은 발판이 이 시간 안에 다시 눌리면 접점 떨림으로 보고 무시 */
  debounceMs: number;
  /** 입력이 받아들여진 뒤 모든 입력을 잠시 잠그는 시간 */
  lockMs: number;
  /** 두 발판이 이 시간 안에 함께 눌리면 동시 입력으로 처리 */
  simulWindowMs: number;
}

export const DEFAULT_TIMING: InputTiming = {
  debounceMs: 120,
  lockMs: 350,
  simulWindowMs: 70,
};

export interface KeyMapping {
  O: string[];
  X: string[];
}

export const DEFAULT_KEYMAP: KeyMapping = {
  O: ['KeyA', 'ArrowLeft'],
  X: ['KeyD', 'ArrowRight'],
};

export interface GamepadMapping {
  enabled: boolean;
  O: number;
  X: number;
}

export const DEFAULT_GAMEPAD: GamepadMapping = { enabled: false, O: 0, X: 1 };
