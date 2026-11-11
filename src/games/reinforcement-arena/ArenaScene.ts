import * as THREE from 'three';
import type { Quality } from '../../admin/settings';
import { ThreeStage } from '../../simulation/ThreeStage';
import { ACTIONS, type GridEnv } from '../../simulation/gridworld';

interface RobotAnim {
  group: THREE.Group;
  path: [number, number][];
  i: number;
  t: number;
  speed: number;
  done: boolean;
  onDone?: () => void;
  trail: THREE.Line;
  trailPts: THREE.Vector3[];
  energyTaken: Set<string>;
  endFx: 'none' | 'goal' | 'danger';
}

/** 강화학습 아레나 3D 장면 */
export class ArenaScene {
  private stage: ThreeStage;
  private robots: RobotAnim[] = [];
  private energyMeshes = new Map<string, THREE.Mesh>();
  private dangerMats: THREE.MeshStandardMaterial[] = [];
  private arrows: THREE.Mesh[][] = [];
  private arrowGroup = new THREE.Group();
  private ox: number;
  private oz: number;

  constructor(
    container: HTMLElement,
    private env: GridEnv,
    quality: Quality,
  ) {
    this.stage = new ThreeStage(container, quality, 45);
    const { scene, camera } = this.stage;
    scene.background = new THREE.Color('#071230');
    scene.fog = new THREE.Fog('#071230', 18, 40);
    this.ox = -(env.w - 1) / 2;
    this.oz = -(env.h - 1) / 2;
    const span = Math.max(env.w, env.h);
    camera.position.set(0, span * 1.25, span * 1.05);
    camera.lookAt(0, 0, 0.6);

    scene.add(new THREE.HemisphereLight('#bcd7ff', '#1b1033', 1.4));
    const sun = new THREE.DirectionalLight('#ffffff', 2.2);
    sun.position.set(4, 10, 6);
    sun.castShadow = this.stage.shadows;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = sc.bottom = -span;
    sc.right = sc.top = span;
    scene.add(sun);

    // 바닥 받침
    const base = new THREE.Mesh(new THREE.BoxGeometry(env.w + 0.6, 0.3, env.h + 0.6), new THREE.MeshStandardMaterial({ color: '#0c1a3d', metalness: 0.3, roughness: 0.6 }));
    base.position.y = -0.25;
    base.receiveShadow = true;
    scene.add(base);
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(env.w + 0.6, 0.3, env.h + 0.6)),
      new THREE.LineBasicMaterial({ color: '#7df9ff', transparent: true, opacity: 0.6 }),
    );
    edge.position.copy(base.position);
    scene.add(edge);

    const tileGeo = new THREE.BoxGeometry(0.94, 0.1, 0.94);
    const wallGeo = new THREE.BoxGeometry(0.94, 0.9, 0.94);
    for (let y = 0; y < env.h; y++) {
      for (let x = 0; x < env.w; x++) {
        const c = env.cells[y][x];
        const p = this.cellPos(x, y);
        if (c === 'wall') {
          const m = new THREE.Mesh(wallGeo, new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.5, metalness: 0.2 }));
          m.position.set(p.x, 0.45, p.z);
          m.castShadow = true;
          m.receiveShadow = true;
          scene.add(m);
          continue;
        }
        const color = c === 'danger' ? '#7f1d1d' : c === 'goal' ? '#065f46' : c === 'start' ? '#1e40af' : '#1e3a5f';
        const mat = new THREE.MeshStandardMaterial({ color, emissive: c === 'danger' ? '#ef4444' : c === 'goal' ? '#10b981' : '#000000', emissiveIntensity: 0.4 });
        if (c === 'danger') this.dangerMats.push(mat);
        const tile = new THREE.Mesh(tileGeo, mat);
        tile.position.set(p.x, 0, p.z);
        tile.receiveShadow = true;
        scene.add(tile);
        if (c === 'goal') scene.add(this.makeFlag(p));
        if (c === 'energy') {
          const e = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), new THREE.MeshStandardMaterial({ color: '#facc15', emissive: '#facc15', emissiveIntensity: 0.9 }));
          e.position.set(p.x, 0.45, p.z);
          scene.add(e);
          this.energyMeshes.set(`${x},${y}`, e);
        }
        if (c === 'danger') {
          const w = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 20), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.6 }));
          w.position.set(p.x, 0.07, p.z);
          scene.add(w);
        }
      }
    }
    // 정책 화살표 (AI가 배운 방향)
    const arrowGeo = new THREE.ConeGeometry(0.12, 0.32, 8);
    arrowGeo.rotateX(Math.PI / 2);
    for (let y = 0; y < env.h; y++) {
      const row: THREE.Mesh[] = [];
      for (let x = 0; x < env.w; x++) {
        const m = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: '#7df9ff', transparent: true, opacity: 0 }));
        const p = this.cellPos(x, y);
        m.position.set(p.x, 0.12, p.z);
        m.visible = false;
        this.arrowGroup.add(m);
        row.push(m);
      }
      this.arrows.push(row);
    }
    scene.add(this.arrowGroup);

    this.stage.onFrame((dt, t) => this.frame(dt, t));
    this.stage.start();
  }

  private cellPos(x: number, y: number) {
    return new THREE.Vector3(this.ox + x, 0, this.oz + y);
  }

  private makeFlag(p: THREE.Vector3) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9), new THREE.MeshStandardMaterial({ color: '#e5e7eb' }));
    pole.position.y = 0.45;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.26), new THREE.MeshStandardMaterial({ color: '#34d399', side: THREE.DoubleSide, emissive: '#10b981', emissiveIntensity: 0.5 }));
    flag.position.set(0.2, 0.75, 0);
    g.add(pole, flag);
    g.position.set(p.x - 0.2, 0, p.z);
    return g;
  }

  private makeRobot(color: string) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16), new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.1 }));
    body.position.y = 0.38;
    body.castShadow = true;
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2.2), new THREE.MeshStandardMaterial({ color: '#0f172a' }));
    face.rotation.x = Math.PI / 2;
    face.position.set(0, 0.42, 0.16);
    const eyeMat = new THREE.MeshBasicMaterial({ color: '#7df9ff' });
    const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.045), eyeMat);
    const e2 = e1.clone();
    e1.position.set(-0.08, 0.45, 0.33);
    e2.position.set(0.08, 0.45, 0.33);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.2), new THREE.MeshStandardMaterial({ color: '#cbd5e1' }));
    ant.position.y = 0.76;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05), new THREE.MeshBasicMaterial({ color: '#7df9ff' }));
    tip.position.y = 0.88;
    g.add(body, face, e1, e2, ant, tip);
    return g;
  }

  /** 로봇 n대 준비(색 지정). 기존 로봇은 제거 */
  setRobots(colors: string[]) {
    for (const r of this.robots) {
      this.stage.scene.remove(r.group, r.trail);
      r.group.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        (m.material as THREE.Material | undefined)?.dispose?.();
      });
      r.trail.geometry.dispose();
      (r.trail.material as THREE.Material).dispose();
    }
    this.robots = colors.map((c, k) => {
      const group = this.makeRobot(c);
      const s = this.cellPos(...this.env.start);
      group.position.set(s.x + (colors.length > 1 ? (k - (colors.length - 1) / 2) * 0.22 : 0), 0, s.z);
      this.stage.scene.add(group);
      const trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.85 }));
      this.stage.scene.add(trail);
      return { group, path: [], i: 0, t: 0, speed: 8, done: true, trail, trailPts: [], energyTaken: new Set(), endFx: 'none' as const };
    });
  }

  /** 경로를 따라 로봇 움직이기 (stepsPerSec 칸/초) */
  playPath(k: number, path: [number, number][], stepsPerSec: number, onDone?: () => void) {
    const r = this.robots[k];
    if (!r) return;
    r.path = path;
    r.i = 0;
    r.t = 0;
    r.speed = stepsPerSec;
    r.done = false;
    r.onDone = onDone;
    r.energyTaken = new Set();
    r.endFx = 'none';
    r.group.scale.setScalar(1);
    const off = this.robots.length > 1 ? (k - (this.robots.length - 1) / 2) * 0.22 : 0;
    r.trailPts = [this.cellPos(...path[0]).add(new THREE.Vector3(off, 0.15, 0))];
    r.trail.geometry.setFromPoints(r.trailPts);
    if (k === 0) for (const m of this.energyMeshes.values()) m.visible = true;
  }

  /** Q표에서 각 칸의 최선 행동을 화살표로 표시 */
  showPolicy(Q: Float64Array | null, mask = 0) {
    if (!Q) {
      this.arrowGroup.visible = false;
      return;
    }
    this.arrowGroup.visible = true;
    const env = this.env;
    let lo = Infinity;
    let hi = -Infinity;
    const best: { a: number; q: number; any: boolean }[][] = [];
    for (let y = 0; y < env.h; y++) {
      best.push([]);
      for (let x = 0; x < env.w; x++) {
        const s = env.stateIndex(x, y, mask);
        let a = 0;
        let q = -Infinity;
        let any = false;
        for (let k = 0; k < 4; k++) {
          const v = Q[s * 4 + k];
          if (v !== 0) any = true;
          if (v > q) {
            q = v;
            a = k;
          }
        }
        best[y].push({ a, q, any });
        if (any) {
          lo = Math.min(lo, q);
          hi = Math.max(hi, q);
        }
      }
    }
    for (let y = 0; y < env.h; y++)
      for (let x = 0; x < env.w; x++) {
        const m = this.arrows[y][x];
        const c = env.cells[y][x];
        const b = best[y][x];
        m.visible = b.any && c !== 'wall' && c !== 'goal' && c !== 'danger';
        if (!m.visible) continue;
        const [dx, dy] = ACTIONS[b.a];
        m.rotation.y = Math.atan2(dx, dy);
        const n = hi > lo ? (b.q - lo) / (hi - lo) : 1;
        const mat = m.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.25 + 0.7 * n;
        mat.color.setHSL(0.5 - 0.35 * (1 - n), 0.9, 0.6);
      }
  }

  private frame(dt: number, t: number) {
    for (const m of this.dangerMats) m.emissiveIntensity = 0.35 + 0.25 * Math.sin(t * 4);
    for (const m of this.energyMeshes.values()) {
      m.rotation.y += dt * 2;
      m.position.y = 0.45 + Math.sin(t * 3) * 0.06;
    }
    this.robots.forEach((r, k) => this.animateRobot(r, k, dt, t));
  }

  private animateRobot(r: RobotAnim, k: number, dt: number, t: number) {
    const off = this.robots.length > 1 ? (k - (this.robots.length - 1) / 2) * 0.22 : 0;
    if (r.done) {
      if (r.endFx === 'goal') r.group.position.y = Math.abs(Math.sin(t * 6)) * 0.25;
      return;
    }
    r.t += dt * r.speed;
    while (r.t >= 1 && r.i < r.path.length - 1) {
      r.t -= 1;
      r.i++;
      const [x, y] = r.path[r.i];
      const p = this.cellPos(x, y);
      r.trailPts.push(p.clone().add(new THREE.Vector3(off, 0.15, 0)));
      if (r.trailPts.length > 400) r.trailPts.shift();
      r.trail.geometry.dispose();
      r.trail.geometry = new THREE.BufferGeometry().setFromPoints(r.trailPts);
      const key = `${x},${y}`;
      if (k === 0 && this.energyMeshes.has(key)) this.energyMeshes.get(key)!.visible = false;
      r.energyTaken.add(key);
    }
    const a = r.path[Math.max(0, r.i)];
    const b = r.path[Math.min(r.path.length - 1, r.i + 1)];
    const pa = this.cellPos(...a);
    const pb = this.cellPos(...b);
    const bump = a[0] === b[0] && a[1] === b[1] && r.i + 1 < r.path.length;
    const s = Math.min(1, r.t);
    r.group.position.set(pa.x + (pb.x - pa.x) * s + off, 0, pa.z + (pb.z - pa.z) * s);
    if (bump) r.group.position.x += Math.sin(s * Math.PI * 4) * 0.08;
    if (!(a[0] === b[0] && a[1] === b[1])) r.group.rotation.y = Math.atan2(pb.x - pa.x, pb.z - pa.z);
    r.group.position.y = Math.abs(Math.sin(s * Math.PI)) * 0.08;
    if (r.i >= r.path.length - 1) {
      r.done = true;
      const [x, y] = r.path[r.path.length - 1];
      const c = this.env.cells[y][x];
      r.endFx = c === 'goal' ? 'goal' : c === 'danger' ? 'danger' : 'none';
      if (r.endFx === 'danger') {
        r.group.position.y = -0.3;
        r.group.scale.setScalar(0.6);
      }
      r.onDone?.();
    }
  }

  get fps() {
    return this.stage.fps;
  }

  dispose() {
    this.stage.dispose();
    this.robots = [];
  }
}
