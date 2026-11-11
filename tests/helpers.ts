import type { Clock } from '../src/input/InputManager';

/** 테스트용 수동 시계 */
export class ManualClock implements Clock {
  t = 0;
  private tasks: { at: number; fn: () => void; id: number }[] = [];
  private nextId = 1;
  now() {
    return this.t;
  }
  setTimeout(fn: () => void, ms: number) {
    const id = this.nextId++;
    this.tasks.push({ at: this.t + ms, fn, id });
    return id;
  }
  clearTimeout(h: unknown) {
    this.tasks = this.tasks.filter((t) => t.id !== h);
  }
  advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      this.tasks.sort((a, b) => a.at - b.at);
      const next = this.tasks[0];
      if (!next || next.at > end) break;
      this.tasks.shift();
      this.t = next.at;
      next.fn();
    }
    this.t = end;
  }
}
