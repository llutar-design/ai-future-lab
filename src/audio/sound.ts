/**
 * Web Audio API로 합성하는 효과음. 외부 음원 파일이 없어 오프라인에서도 항상 동작합니다.
 */
export type Sfx = 'move' | 'select' | 'correct' | 'wrong' | 'success' | 'train' | 'analyze' | 'transition' | 'warn' | 'tick';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let volume = 0.7;
let enabled = true;

function ensure(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function setSoundOptions(o: { volume?: number; enabled?: boolean }) {
  if (o.volume !== undefined) volume = o.volume;
  if (o.enabled !== undefined) enabled = o.enabled;
  if (master) master.gain.value = volume;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.25, slideTo?: number) {
  const c = ctx!;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime + start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + start + dur);
  g.gain.setValueAtTime(0.0001, c.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  osc.connect(g);
  g.connect(master!);
  osc.start(c.currentTime + start);
  osc.stop(c.currentTime + start + dur + 0.05);
}

export function play(s: Sfx) {
  if (!enabled || volume <= 0) return;
  const c = ensure();
  if (!c) return;
  switch (s) {
    case 'move':
      tone(520, 0, 0.12, 'triangle', 0.2, 700);
      break;
    case 'select':
      tone(660, 0, 0.1, 'square', 0.12);
      tone(990, 0.08, 0.18, 'triangle', 0.2);
      break;
    case 'correct':
      tone(784, 0, 0.12, 'triangle', 0.22);
      tone(1046, 0.1, 0.25, 'triangle', 0.22);
      break;
    case 'wrong':
      tone(300, 0, 0.18, 'sawtooth', 0.12, 200);
      tone(220, 0.15, 0.25, 'sawtooth', 0.1, 160);
      break;
    case 'success':
      [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.1, 0.3, 'triangle', 0.2));
      break;
    case 'train':
      tone(1200 + Math.random() * 400, 0, 0.05, 'sine', 0.06);
      break;
    case 'analyze':
      tone(400, 0, 0.4, 'sine', 0.1, 1200);
      break;
    case 'transition':
      tone(300, 0, 0.35, 'sine', 0.12, 900);
      break;
    case 'warn':
      tone(880, 0, 0.12, 'square', 0.1);
      tone(880, 0.18, 0.12, 'square', 0.1);
      break;
    case 'tick':
      tone(1500, 0, 0.03, 'sine', 0.05);
      break;
  }
}

export function disposeAudio() {
  void ctx?.close();
  ctx = null;
  master = null;
}
