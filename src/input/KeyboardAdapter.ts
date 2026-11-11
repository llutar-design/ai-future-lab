import type { InputManager } from './InputManager';
import type { KeyMapping, Pedal } from './types';

/**
 * 키보드형 USB HID 발판 어댑터.
 * 대부분의 USB 발판은 키보드처럼 동작해 정해진 키 코드를 보냅니다.
 * 키 코드는 관리자 메뉴에서 바꿀 수 있습니다(e.code 기준이라 한/영 상태와 무관).
 */
export class KeyboardAdapter {
  private keymap: KeyMapping;
  /** 관리자 키 재설정 중에는 키를 가로챕니다 */
  captureHandler: ((code: string) => void) | null = null;
  /** 발판 입력을 막아야 할 때(관리자 화면 등) true */
  suspended = false;
  lastCode = '';

  constructor(private input: InputManager, keymap: KeyMapping, private target: Window = window) {
    this.keymap = keymap;
    target.addEventListener('keydown', this.onDown, true);
    target.addEventListener('keyup', this.onUp, true);
    target.addEventListener('blur', this.onBlur);
  }

  setKeymap(k: KeyMapping) {
    this.keymap = k;
  }

  pedalFor(code: string): Pedal | null {
    if (this.keymap.O.includes(code)) return 'O';
    if (this.keymap.X.includes(code)) return 'X';
    return null;
  }

  private onDown = (e: KeyboardEvent) => {
    this.lastCode = e.code;
    if (this.captureHandler) {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) this.captureHandler(e.code);
      return;
    }
    if (this.suspended) return;
    const p = this.pedalFor(e.code);
    if (!p) return;
    e.preventDefault();
    this.input.press(p, 'keyboard', e.repeat);
  };

  private onUp = (e: KeyboardEvent) => {
    if (this.suspended || this.captureHandler) return;
    const p = this.pedalFor(e.code);
    if (!p) return;
    e.preventDefault();
    this.input.release(p, 'keyboard');
  };

  private onBlur = () => this.input.releaseAll();

  dispose() {
    this.target.removeEventListener('keydown', this.onDown, true);
    this.target.removeEventListener('keyup', this.onUp, true);
    this.target.removeEventListener('blur', this.onBlur);
  }
}
