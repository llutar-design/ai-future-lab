import { describe, expect, it } from 'vitest';
import { InputManager } from '../src/input/InputManager';
import type { DiagEvent, Pedal } from '../src/input/types';
import { ManualClock } from './helpers';

function setup(timing = { debounceMs: 120, lockMs: 350, simulWindowMs: 70 }) {
  const clock = new ManualClock();
  const im = new InputManager(timing, clock);
  const got: Pedal[] = [];
  const diag: DiagEvent[] = [];
  let simul = 0;
  im.subscribe((e) => got.push(e.pedal));
  im.onDiag((d) => diag.push(d));
  im.onSimultaneous(() => simul++);
  const tap = (p: Pedal, holdMs = 80) => {
    im.press(p);
    clock.advance(holdMs);
    im.release(p);
  };
  return { clock, im, got, diag, tap, simul: () => simul };
}

describe('발판 입력 관리자', () => {
  it('O, X 한 번씩 밟으면 각각 전달된다', () => {
    const { clock, got, tap } = setup();
    tap('O');
    clock.advance(500);
    tap('X');
    clock.advance(500);
    expect(got).toEqual(['O', 'X']);
  });

  it('길게 밟아 생기는 키 반복은 무시한다', () => {
    const { clock, im, got, diag } = setup();
    im.press('O');
    for (let i = 0; i < 20; i++) {
      clock.advance(33);
      im.press('O', 'keyboard', true);
    }
    im.release('O');
    clock.advance(500);
    expect(got).toEqual(['O']);
    expect(diag.filter((d) => d.reason === 'held').length).toBe(20);
  });

  it('keyup 없이 다시 keydown(반복 플래그 없음)이 와도 누르고 있는 중이면 무시', () => {
    const { clock, im, got } = setup();
    im.press('X');
    clock.advance(400);
    im.press('X');
    clock.advance(400);
    expect(got).toEqual(['X']);
  });

  it('접점 떨림(짧은 연속 누름)은 디바운스로 무시', () => {
    const { clock, im, got, diag } = setup();
    im.press('O');
    clock.advance(20);
    im.release('O');
    clock.advance(30);
    im.press('O');
    clock.advance(20);
    im.release('O');
    clock.advance(500);
    expect(got).toEqual(['O']);
    expect(diag.some((d) => d.reason === 'debounce')).toBe(true);
  });

  it('두 발판을 동시에 밟으면 둘 다 무시하고 알린다', () => {
    const { clock, im, got, simul } = setup();
    im.press('O');
    clock.advance(30);
    im.press('X');
    clock.advance(200);
    im.release('O');
    im.release('X');
    clock.advance(500);
    expect(got).toEqual([]);
    expect(simul()).toBe(1);
  });

  it('입력 후 잠금 시간 동안의 입력은 무시하고, 잠금이 풀리면 다시 받는다', () => {
    const { clock, got, tap } = setup();
    tap('O', 50); // 70ms 후 수락
    clock.advance(100);
    tap('X', 50); // 수락 후 ~180ms → 잠김
    clock.advance(400);
    tap('X', 50);
    clock.advance(200);
    expect(got).toEqual(['O', 'X']);
  });

  it('동시 입력 창보다 늦게 밟은 다른 발판은 잠금 규칙만 적용된다', () => {
    const { clock, got, tap } = setup({ debounceMs: 120, lockMs: 100, simulWindowMs: 70 });
    tap('O', 10);
    clock.advance(200);
    tap('X', 10);
    clock.advance(200);
    expect(got).toEqual(['O', 'X']);
  });

  it('비활성화 상태에서는 아무것도 전달하지 않는다', () => {
    const { clock, im, got, tap } = setup();
    im.enabled = false;
    tap('O');
    clock.advance(500);
    expect(got).toEqual([]);
  });

  it('리스너에서 오류가 나도 다른 리스너는 계속 동작', () => {
    const { clock, im, got, tap } = setup();
    im.subscribe(() => {
      throw new Error('boom');
    });
    const orig = console.error;
    console.error = () => {};
    tap('O');
    clock.advance(200);
    console.error = orig;
    expect(got).toEqual(['O']);
  });

  it('빠르게 연속 200회 밟아도 잠금 간격 이상으로만 수락된다', () => {
    const { clock, got, tap } = setup();
    for (let i = 0; i < 200; i++) {
      tap(i % 2 ? 'O' : 'X', 40);
      clock.advance(60);
    }
    clock.advance(500);
    // 100ms 간격 입력, 수락 간격은 최소 350ms → 대략 200*100/400 ≈ 50개 이하
    expect(got.length).toBeGreaterThan(20);
    expect(got.length).toBeLessThanOrEqual(60);
  });
});
