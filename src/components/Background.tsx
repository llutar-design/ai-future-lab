import { useEffect, useRef } from 'react';
import { createRng } from '../ai/rng';

/**
 * 메인 배경: 원근 격자 바닥, 3겹 미래도시 실루엣(시차 효과), 회로선 위를 흐르는 데이터 입자, 홀로그램 고리.
 * 2D 캔버스로 그려 GPU 부담이 적습니다. low 품질에서는 30fps로 그립니다.
 */
export function Background({ quality = 'high' }: { quality?: 'low' | 'medium' | 'high' }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const W = 1920;
    const H = 1080;
    canvas.width = W;
    canvas.height = H;
    const rng = createRng(7);

    type B = { x: number; w: number; h: number; layer: number; win: number[] };
    const buildings: B[] = [];
    for (let layer = 0; layer < 3; layer++) {
      let x = -100;
      while (x < W + 200) {
        const w = 60 + rng() * (120 - layer * 20);
        const h = (layer === 0 ? 260 : layer === 1 ? 200 : 140) + rng() * (220 - layer * 50);
        const win: number[] = [];
        for (let i = 0; i < 40; i++) win.push(rng());
        buildings.push({ x, w, h, layer, win });
        x += w + 6 + rng() * 30;
      }
    }
    // 회로선
    const circuits: { pts: [number, number][]; len: number }[] = [];
    for (let i = 0; i < 14; i++) {
      const pts: [number, number][] = [];
      let x = rng() * W;
      let y = rng() * 380;
      pts.push([x, y]);
      for (let k = 0; k < 4; k++) {
        if (k % 2 === 0) x += (rng() - 0.5) * 500;
        else y += rng() * 120;
        pts.push([x, y]);
      }
      let len = 0;
      for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
      circuits.push({ pts, len });
    }
    const particles = Array.from({ length: quality === 'low' ? 18 : 45 }, () => ({ c: Math.floor(rng() * circuits.length), t: rng(), v: 0.04 + rng() * 0.08 }));

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const frameMs = quality === 'low' ? 33 : 0;
    const horizon = 640;

    const pointOn = (c: (typeof circuits)[number], t: number): [number, number] => {
      let d = t * c.len;
      for (let k = 1; k < c.pts.length; k++) {
        const [ax, ay] = c.pts[k - 1];
        const [bx, by] = c.pts[k];
        const seg = Math.hypot(bx - ax, by - ay);
        if (d <= seg) return [ax + ((bx - ax) * d) / seg, ay + ((by - ay) * d) / seg];
        d -= seg;
      }
      return c.pts[c.pts.length - 1];
    };

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      acc += dt * 1000;
      if (frameMs && acc < frameMs) return;
      acc = 0;
      const time = now / 1000;

      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#050a1f');
      sky.addColorStop(0.55, '#0b1640');
      sky.addColorStop(1, '#120a2e');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // 회로
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(56,189,248,0.12)';
      for (const c of circuits) {
        ctx.beginPath();
        c.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      }
      for (const p of particles) {
        p.t = (p.t + p.v * dt) % 1;
        const [x, y] = pointOn(circuits[p.c], p.t);
        const g = ctx.createRadialGradient(x, y, 0, x, y, 10);
        g.addColorStop(0, 'rgba(125,249,255,0.9)');
        g.addColorStop(1, 'rgba(125,249,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 10, y - 10, 20, 20);
      }

      // 홀로그램 고리
      ctx.save();
      ctx.translate(W / 2, 330);
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = `rgba(192,132,252,${0.12 + 0.05 * Math.sin(time * 1.5 + i)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, 520 + i * 90, 70 + i * 14, 0, time * 0.1 * (i % 2 ? 1 : -1), time * 0.1 * (i % 2 ? 1 : -1) + Math.PI * 1.6);
        ctx.stroke();
      }
      ctx.restore();

      // 도시
      for (let layer = 2; layer >= 0; layer--) {
        const shift = (time * (6 + layer * 4)) % (W + 300);
        const base = horizon + layer * 30;
        const shade = ['#0d1b45', '#0a1538', '#070f2b'][layer];
        for (const b of buildings) {
          if (b.layer !== layer) continue;
          let x = b.x - shift * (layer === 0 ? 1 : 0.5);
          if (x + b.w < -100) x += W + 300;
          const y = base - b.h * (1 - layer * 0.2);
          ctx.fillStyle = shade;
          ctx.fillRect(x, y, b.w, base - y + 2);
          if (layer === 0 || quality !== 'low') {
            const cols = Math.max(2, Math.floor(b.w / 18));
            for (let i = 0; i < 40; i++) {
              const cx = i % cols;
              const cy = Math.floor(i / cols);
              const wy = y + 14 + cy * 22;
              if (wy > base - 12) break;
              const lit = b.win[i] > 0.55 + 0.2 * Math.sin(time * 0.4 + i);
              if (!lit) continue;
              ctx.fillStyle = b.win[i] > 0.85 ? 'rgba(192,132,252,0.55)' : 'rgba(125,249,255,0.45)';
              ctx.fillRect(x + 6 + cx * 18, wy, 8, 10);
            }
          }
        }
      }

      // 바닥 격자
      ctx.strokeStyle = 'rgba(56,189,248,0.22)';
      ctx.lineWidth = 1.5;
      for (let i = -24; i <= 24; i++) {
        ctx.beginPath();
        ctx.moveTo(W / 2 + i * 12, horizon + 30);
        ctx.lineTo(W / 2 + i * 220, H);
        ctx.stroke();
      }
      const scroll = (time * 0.5) % 1;
      for (let k = 0; k < 14; k++) {
        const z = (k + scroll) / 14;
        const y = horizon + 30 + (H - horizon - 30) * z * z;
        ctx.globalAlpha = z;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      const glow = ctx.createLinearGradient(0, horizon - 40, 0, horizon + 60);
      glow.addColorStop(0, 'rgba(192,132,252,0)');
      glow.addColorStop(0.5, 'rgba(192,132,252,0.25)');
      glow.addColorStop(1, 'rgba(192,132,252,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, horizon - 40, W, 100);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [quality]);

  return <canvas ref={ref} className="bg-canvas" />;
}
