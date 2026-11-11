import { describe, expect, it } from 'vitest';
import { GAME_IDS } from '../src/app/gameIds';
import { initialKiosk, kioskReducer, nextEnabledIndex, type KioskState } from '../src/kiosk/KioskManager';
import { IdleManager } from '../src/kiosk/IdleManager';
import { defaultSettings, mergeSettings } from '../src/admin/settings';
import { KeyboardAdapter } from '../src/input/KeyboardAdapter';
import { InputManager } from '../src/input/InputManager';
import { ManualClock } from './helpers';

const ALL = [true, true, true, true];

describe('메인 메뉴 O/X 이동', () => {
  it('O를 누르면 1→2→3→4→1 순환', () => {
    let s = initialKiosk();
    const seen = [s.menuIndex];
    for (let i = 0; i < 4; i++) {
      s = kioskReducer(s, { type: 'menuNext', enabled: ALL });
      seen.push(s.menuIndex);
    }
    expect(seen).toEqual([0, 1, 2, 3, 0]);
  });

  it('비활성 게임은 건너뛴다', () => {
    expect(nextEnabledIndex(0, [true, false, true, false])).toBe(2);
    expect(nextEnabledIndex(2, [true, false, true, false])).toBe(0);
    expect(nextEnabledIndex(1, [false, true, false, false])).toBe(1);
  });

  it('X를 누르면 선택한 게임이 실행된다 (4개 모두)', () => {
    for (let k = 0; k < 4; k++) {
      let s = initialKiosk();
      for (let i = 0; i < k; i++) s = kioskReducer(s, { type: 'menuNext', enabled: ALL });
      s = kioskReducer(s, { type: 'menuSelect', enabled: ALL });
      expect(s.screen).toBe('game');
      expect(s.gameId).toBe(GAME_IDS[k]);
    }
  });

  it('게임 화면에서는 메뉴 동작이 무시된다', () => {
    let s = kioskReducer(initialKiosk(), { type: 'menuSelect', enabled: ALL });
    const before = s;
    s = kioskReducer(s, { type: 'menuNext', enabled: ALL });
    expect(s).toBe(before);
  });

  it('게임 종료 후 메인 메뉴로 복귀, 다시 도전 시 새 세션 키', () => {
    let s = kioskReducer(initialKiosk(), { type: 'menuSelect', enabled: ALL });
    const k1 = s.sessionKey;
    s = kioskReducer(s, { type: 'restart' });
    expect(s.sessionKey).toBe(k1 + 1);
    expect(s.screen).toBe('game');
    s = kioskReducer(s, { type: 'exitToMenu', enabled: ALL });
    expect(s.screen).toBe('menu');
    expect(s.gameId).toBeNull();
  });

  it('연속 20회 체험: 매번 새 세션으로 시작하고 메뉴로 돌아온다', () => {
    let s: KioskState = initialKiosk();
    const keys = new Set<number>();
    for (let n = 0; n < 20; n++) {
      const moves = n % 4;
      for (let i = 0; i < moves; i++) s = kioskReducer(s, { type: 'menuNext', enabled: ALL });
      s = kioskReducer(s, { type: 'menuSelect', enabled: ALL });
      expect(s.screen).toBe('game');
      keys.add(s.sessionKey);
      s = kioskReducer(s, { type: 'exitToMenu', enabled: ALL });
      expect(s.screen).toBe('menu');
    }
    expect(keys.size).toBe(20);
    expect(s.sessionsStarted).toBe(20);
    expect(s.sessionsEnded).toBe(20);
  });
});

describe('무입력 관리', () => {
  it('안내 반복 후 장시간 미사용 시 복귀', () => {
    let warns = 0;
    let timeouts = 0;
    const idle = new IdleManager({ warnAfterSec: 20, returnAfterSec: 90 }, { onWarn: () => warns++, onTimeout: () => timeouts++ }, 0);
    for (let t = 0; t <= 100_000; t += 1000) idle.tick(t);
    expect(warns).toBe(4); // 20, 40, 60, 80초
    expect(timeouts).toBe(1);
  });

  it('입력이 있으면 타이머가 초기화된다', () => {
    let timeouts = 0;
    const idle = new IdleManager({ warnAfterSec: 20, returnAfterSec: 30 }, { onWarn: () => {}, onTimeout: () => timeouts++ }, 0);
    for (let t = 0; t <= 120_000; t += 1000) {
      if (t % 25_000 === 0) idle.activity(t);
      idle.tick(t);
    }
    expect(timeouts).toBe(0);
  });
});

describe('발판 키 매핑', () => {
  class FakeTarget {
    handlers = new Map<string, ((e: unknown) => void)[]>();
    addEventListener(t: string, h: (e: unknown) => void) {
      this.handlers.set(t, [...(this.handlers.get(t) ?? []), h]);
    }
    removeEventListener(t: string, h: (e: unknown) => void) {
      this.handlers.set(t, (this.handlers.get(t) ?? []).filter((x) => x !== h));
    }
    fire(t: string, code: string, repeat = false) {
      const e = { code, repeat, preventDefault() {}, stopPropagation() {} };
      for (const h of this.handlers.get(t) ?? []) h(e);
    }
  }

  it('기본 매핑: A/← = O, D/→ = X', () => {
    const clock = new ManualClock();
    const im = new InputManager({ debounceMs: 0, lockMs: 0, simulWindowMs: 0 }, clock);
    const target = new FakeTarget();
    const kb = new KeyboardAdapter(im, defaultSettings().keymap, target as unknown as Window);
    const got: string[] = [];
    im.subscribe((e) => got.push(e.pedal));
    for (const code of ['KeyA', 'ArrowLeft', 'KeyD', 'ArrowRight', 'KeyQ']) {
      target.fire('keydown', code);
      target.fire('keyup', code);
      clock.advance(10);
    }
    expect(got).toEqual(['O', 'O', 'X', 'X']);
    kb.dispose();
  });

  it('관리자가 바꾼 매핑이 즉시 적용된다', () => {
    const clock = new ManualClock();
    const im = new InputManager({ debounceMs: 0, lockMs: 0, simulWindowMs: 0 }, clock);
    const target = new FakeTarget();
    const kb = new KeyboardAdapter(im, defaultSettings().keymap, target as unknown as Window);
    const got: string[] = [];
    im.subscribe((e) => got.push(e.pedal));
    kb.setKeymap({ O: ['F1'], X: ['F2'] });
    for (const code of ['KeyA', 'F1', 'F2']) {
      target.fire('keydown', code);
      target.fire('keyup', code);
      clock.advance(10);
    }
    expect(got).toEqual(['O', 'X']);
  });

  it('키 재설정 캡처 중에는 발판 입력으로 처리하지 않는다', () => {
    const clock = new ManualClock();
    const im = new InputManager({ debounceMs: 0, lockMs: 0, simulWindowMs: 0 }, clock);
    const target = new FakeTarget();
    const kb = new KeyboardAdapter(im, defaultSettings().keymap, target as unknown as Window);
    const got: string[] = [];
    const captured: string[] = [];
    im.subscribe((e) => got.push(e.pedal));
    kb.captureHandler = (c) => captured.push(c);
    target.fire('keydown', 'KeyA');
    expect(got).toEqual([]);
    expect(captured).toEqual(['KeyA']);
  });

  it('저장된 설정이 망가져 있어도 기본값으로 복구', () => {
    const s = mergeSettings({ volume: 'loud', games: { 'ai-training': { enabled: false, minutes: 999 } }, keymap: { O: 'x' } });
    expect(s.volume).toBe(0.7);
    expect(s.games['ai-training']).toEqual({ enabled: false, minutes: 20 });
    expect(s.keymap.O).toContain('KeyA');
  });
});
