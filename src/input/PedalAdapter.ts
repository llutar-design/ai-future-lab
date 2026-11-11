import type { InputManager } from './InputManager';
import type { GamepadMapping } from './types';

export interface PedalDeviceStatus {
  gamepadSupported: boolean;
  gamepads: { index: number; id: string; buttons: number }[];
  /** 키보드형 발판은 운영체제상 일반 키보드와 구분되지 않아 연결 여부를 직접 알 수 없습니다. */
  keyboardNote: string;
}

/**
 * 게임패드(HID 조이스틱)형 발판 어댑터.
 * 발판 제조사 프로토콜을 확인하지 않았으므로 표준 Gamepad API로 보이는 장치만 지원합니다.
 * 기본값은 꺼짐이며 관리자 메뉴에서 버튼 번호를 지정해 켭니다.
 */
export class PedalAdapter {
  private raf = 0;
  private prev: Record<'O' | 'X', boolean> = { O: false, X: false };
  suspended = false;

  constructor(private input: InputManager, private mapping: GamepadMapping) {
    this.loop = this.loop.bind(this);
    if (typeof navigator !== 'undefined' && 'getGamepads' in navigator) this.raf = requestAnimationFrame(this.loop);
  }

  setMapping(m: GamepadMapping) {
    this.mapping = m;
  }

  static status(): PedalDeviceStatus {
    const supported = typeof navigator !== 'undefined' && 'getGamepads' in navigator;
    const pads = supported ? Array.from(navigator.getGamepads()).filter((g): g is Gamepad => !!g) : [];
    return {
      gamepadSupported: supported,
      gamepads: pads.map((g) => ({ index: g.index, id: g.id, buttons: g.buttons.length })),
      keyboardNote: '키보드형 발판은 일반 키보드와 구분되지 않습니다. 발판 입력 테스트로 확인하세요.',
    };
  }

  /** 관리자 화면에서 눌린 버튼 번호를 확인하기 위한 함수 */
  static pressedButtons(): { pad: number; button: number }[] {
    if (typeof navigator === 'undefined' || !('getGamepads' in navigator)) return [];
    const out: { pad: number; button: number }[] = [];
    for (const g of navigator.getGamepads()) {
      if (!g) continue;
      g.buttons.forEach((b, i) => b.pressed && out.push({ pad: g.index, button: i }));
    }
    return out;
  }

  private loop() {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.mapping.enabled || this.suspended) return;
    const pads = navigator.getGamepads();
    let o = false;
    let x = false;
    for (const g of pads) {
      if (!g) continue;
      o ||= !!g.buttons[this.mapping.O]?.pressed;
      x ||= !!g.buttons[this.mapping.X]?.pressed;
    }
    this.edge('O', o);
    this.edge('X', x);
  }

  private edge(p: 'O' | 'X', now: boolean) {
    if (now && !this.prev[p]) this.input.press(p, 'gamepad');
    if (!now && this.prev[p]) this.input.release(p, 'gamepad');
    this.prev[p] = now;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
  }
}
