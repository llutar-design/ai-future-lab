import { InputManager } from './InputManager';
import { KeyboardAdapter } from './KeyboardAdapter';
import { PedalAdapter } from './PedalAdapter';
import type { Settings } from '../admin/settings';

/** 앱 전체에서 하나만 존재하는 입력 장치들 */
export interface InputRuntime {
  input: InputManager;
  keyboard: KeyboardAdapter;
  gamepad: PedalAdapter;
}

let runtime: InputRuntime | null = null;

export function getInputRuntime(settings: Settings): InputRuntime {
  if (!runtime) {
    const input = new InputManager(settings.timing);
    runtime = {
      input,
      keyboard: new KeyboardAdapter(input, settings.keymap),
      gamepad: new PedalAdapter(input, settings.gamepad),
    };
  }
  return runtime;
}

export function peekInputRuntime(): InputRuntime | null {
  return runtime;
}

export function applyInputSettings(s: Settings) {
  if (!runtime) return;
  runtime.input.setTiming(s.timing);
  runtime.keyboard.setKeymap(s.keymap);
  runtime.gamepad.setMapping(s.gamepad);
}
