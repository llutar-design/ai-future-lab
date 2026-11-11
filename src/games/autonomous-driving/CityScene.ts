import * as THREE from 'three';
import type { Quality } from '../../admin/settings';
import { createRng } from '../../ai/rng';
import { ThreeStage, disposeObject, textSprite } from '../../simulation/ThreeStage';
import type { DriveSim } from '../../simulation/driveSim';
import type { Scenario, Weather } from '../../simulation/traffic';

const LANE_X = 5.2;
const ROAD_W = 14;
const ROAD_LEN = 520;

interface EventProps {
  root: THREE.Group;
  lamps?: { red: THREE.MeshStandardMaterial; yellow: THREE.MeshStandardMaterial; green: THREE.MeshStandardMaterial };
  peds: { g: THREE.Group; role: 'crossing' | 'sidewalk'; x: number; walk: number }[];
  obstacle?: THREE.Group;
  ball?: THREE.Mesh;
  carAhead?: THREE.Group;
  boxes: THREE.LineSegments[];
  at: number;
  stopLine: number;
}

/**
 * 자율주행 연구소 3D 미래도시. DriveSim 상태를 매 프레임 그대로 그립니다.
 * 센서 표시는 장면 데이터로 만든 "가상 센서 시뮬레이션"입니다.
 */
export class CityScene {
  private stage: ThreeStage;
  private car: THREE.Group;
  private eventsGroup = new THREE.Group();
  private props: EventProps[] = [];
  private sim: DriveSim | null = null;
  private rain: THREE.Points;
  private sensorFan: THREE.Mesh;
  private sensorLines: THREE.LineSegments;
  private fog: THREE.Fog;
  private weather: Weather = 'clear';
  private wheels: THREE.Mesh[] = [];
  private brakeMat: THREE.MeshStandardMaterial;
  sensorsOn = true;
  scanning = false;

  constructor(container: HTMLElement, quality: Quality) {
    this.stage = new ThreeStage(container, quality, 60);
    const { scene } = this.stage;
    scene.background = new THREE.Color('#0a1433');
    this.fog = new THREE.Fog('#0a1433', 40, 260);
    scene.fog = this.fog;

    scene.add(new THREE.HemisphereLight('#c7dcff', '#20183a', 1.3));
    const sun = new THREE.DirectionalLight('#fff4e0', 2);
    sun.position.set(30, 50, 20);
    scene.add(sun);

    this.buildRoad();
    this.buildCity(quality);
    this.car = this.buildCar('#34d399', true);
    scene.add(this.car);
    this.brakeMat = (this.car.userData.brake as THREE.MeshStandardMaterial) ?? new THREE.MeshStandardMaterial();
    scene.add(this.eventsGroup);

    // 가상 센서 부채꼴
    const fanGeo = new THREE.CircleGeometry(30, 32, Math.PI / 2 - 0.45, 0.9);
    fanGeo.rotateX(-Math.PI / 2);
    this.sensorFan = new THREE.Mesh(fanGeo, new THREE.MeshBasicMaterial({ color: '#7df9ff', transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
    this.sensorFan.position.y = 0.06;
    scene.add(this.sensorFan);
    this.sensorLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }));
    scene.add(this.sensorLines);

    // 비
    const n = quality === 'low' ? 600 : 2000;
    const pos = new Float32Array(n * 3);
    const r = createRng(9);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (r() - 0.5) * 60;
      pos[i * 3 + 1] = r() * 30;
      pos[i * 3 + 2] = (r() - 0.5) * 80;
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.Points(rg, new THREE.PointsMaterial({ color: '#9fc3ff', size: 0.12, transparent: true, opacity: 0.8 }));
    this.rain.visible = false;
    scene.add(this.rain);

    this.stage.onFrame((dt, t) => this.frame(dt, t));
    this.stage.start();
  }

  private buildRoad() {
    const { scene } = this.stage;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, ROAD_LEN + 200), new THREE.MeshStandardMaterial({ color: '#0f1c2e' }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.02, -ROAD_LEN / 2 + 40);
    scene.add(ground);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, ROAD_LEN), new THREE.MeshStandardMaterial({ color: '#2a3140', roughness: 0.9 }));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, -ROAD_LEN / 2 + 40);
    scene.add(road);
    for (const side of [-1, 1]) {
      const walk = new THREE.Mesh(new THREE.BoxGeometry(4, 0.25, ROAD_LEN), new THREE.MeshStandardMaterial({ color: '#64748b' }));
      walk.position.set(side * (ROAD_W / 2 + 2), 0.12, -ROAD_LEN / 2 + 40);
      scene.add(walk);
    }
    // 차선
    const dashGeo = new THREE.PlaneGeometry(0.2, 3);
    const yellow = new THREE.MeshBasicMaterial({ color: '#facc15' });
    const white = new THREE.MeshBasicMaterial({ color: '#e5e7eb' });
    const center = new THREE.Mesh(new THREE.PlaneGeometry(0.25, ROAD_LEN), yellow);
    center.rotation.x = -Math.PI / 2;
    center.position.set(0, 0.01, -ROAD_LEN / 2 + 40);
    scene.add(center);
    const dashes = new THREE.InstancedMesh(dashGeo, white, Math.floor(ROAD_LEN / 8) * 2);
    const m = new THREE.Matrix4();
    let k = 0;
    for (let z = 40; z > -ROAD_LEN + 40; z -= 8) {
      for (const x of [-3.5, 3.5]) {
        m.makeRotationX(-Math.PI / 2).setPosition(x, 0.011, z);
        dashes.setMatrixAt(k++, m);
      }
    }
    scene.add(dashes);
  }

  private buildCity(quality: Quality) {
    const { scene } = this.stage;
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#0b1226';
    ctx.fillRect(0, 0, 64, 128);
    const r = createRng(3);
    for (let y = 4; y < 128; y += 10)
      for (let x = 4; x < 64; x += 10) {
        if (r() < 0.45) continue;
        ctx.fillStyle = r() < 0.2 ? '#c084fc' : r() < 0.5 ? '#7df9ff' : '#fde68a';
        ctx.fillRect(x, y, 6, 6);
      }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const count = quality === 'low' ? 50 : 110;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < count; i++) {
      const side = i % 2 ? 1 : -1;
      const w = 6 + r() * 8;
      const h = 8 + r() * 40;
      const d = 6 + r() * 8;
      const mat = new THREE.MeshStandardMaterial({ color: '#16213e', emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.9 });
      mat.emissiveMap = tex.clone();
      mat.emissiveMap.repeat.set(Math.max(1, w / 6), Math.max(1, h / 10));
      mat.emissiveMap.needsUpdate = true;
      const b = new THREE.Mesh(geo, mat);
      b.scale.set(w, h, d);
      b.position.set(side * (ROAD_W / 2 + 6 + w / 2 + r() * 10), h / 2, 40 - (i / count) * ROAD_LEN - r() * 6);
      scene.add(b);
    }
    // 하늘 위 홀로그램 고리
    const ring = new THREE.Mesh(new THREE.TorusGeometry(30, 0.3, 8, 64), new THREE.MeshBasicMaterial({ color: '#c084fc', transparent: true, opacity: 0.5 }));
    ring.position.set(0, 60, -200);
    scene.add(ring);
  }

  private buildCar(color: string, ego = false) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 4.2), new THREE.MeshStandardMaterial({ color, metalness: 0.4, roughness: 0.35 }));
    body.position.y = 0.7;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 2.2), new THREE.MeshStandardMaterial({ color: '#0f172a', metalness: 0.8, roughness: 0.1 }));
    cabin.position.set(0, 1.4, 0.2);
    g.add(body, cabin);
    const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: '#111827' });
    for (const [x, z] of [
      [-1, -1.4],
      [1, -1.4],
      [-1, 1.4],
      [1, 1.4],
    ]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.position.set(x, 0.38, z);
      g.add(w);
      if (ego) this.wheels.push(w);
    }
    const headMat = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff8d6', emissiveIntensity: 1.5 });
    for (const x of [-0.65, 0.65]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.05), headMat);
      h.position.set(x, 0.8, -2.11);
      g.add(h);
    }
    const brake = new THREE.MeshStandardMaterial({ color: '#7f1d1d', emissive: '#ef4444', emissiveIntensity: 0.2 });
    for (const x of [-0.7, 0.7]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.2, 0.05), brake);
      t.position.set(x, 0.8, 2.11);
      g.add(t);
    }
    g.userData.brake = brake;
    if (ego) {
      // 지붕 센서(라이다 모양)
      const lidar = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.3, 16), new THREE.MeshStandardMaterial({ color: '#7df9ff', emissive: '#7df9ff', emissiveIntensity: 0.6 }));
      lidar.position.set(0, 1.9, 0.2);
      g.add(lidar);
    }
    return g;
  }

  private buildPerson(color: string, child = false) {
    const g = new THREE.Group();
    const s = child ? 0.7 : 1;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28 * s, 0.8 * s, 4, 10), new THREE.MeshStandardMaterial({ color }));
    body.position.y = 0.75 * s;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24 * s, 16, 12), new THREE.MeshStandardMaterial({ color: '#f5d0a9' }));
    head.position.y = 1.5 * s;
    g.add(body, head);
    if (child) {
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 0.2), new THREE.MeshStandardMaterial({ color: '#facc15' }));
      bag.position.set(0, 0.85, 0.28);
      g.add(bag);
    }
    return g;
  }

  private wireBox(w: number, h: number, d: number, color: string) {
    const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 }));
    box.position.y = h / 2;
    box.visible = false;
    return box;
  }

  /** 주행 경로(시뮬레이션)에 맞춰 사건 소품 배치 */
  setSim(sim: DriveSim) {
    disposeObject(this.eventsGroup);
    this.eventsGroup.clear();
    this.props = [];
    this.sim = sim;
    sim.events.forEach((ev) => this.props.push(this.buildEvent(ev.original, ev.at, ev.stopLine)));
    // 학교(도착 지점)
    const school = new THREE.Group();
    const bld = new THREE.Mesh(new THREE.BoxGeometry(18, 9, 10), new THREE.MeshStandardMaterial({ color: '#fde68a' }));
    bld.position.y = 4.5;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(19, 0.8, 11), new THREE.MeshStandardMaterial({ color: '#b45309' }));
    roof.position.y = 9.4;
    const sign = textSprite('🏫 미래초등학교', { bg: '#1e3a8a', size: 56, scale: 2.4 });
    sign.position.set(0, 12, 5.5);
    school.add(bld, roof, sign);
    school.position.set(ROAD_W / 2 + 13, 0, -(sim.endPos + 6));
    this.eventsGroup.add(school);
    const goal = new THREE.Mesh(new THREE.PlaneGeometry(6, 2), new THREE.MeshBasicMaterial({ color: '#34d399', transparent: true, opacity: 0.6 }));
    goal.rotation.x = -Math.PI / 2;
    goal.position.set(LANE_X, 0.03, -sim.endPos);
    this.eventsGroup.add(goal);
  }

  private buildEvent(s: Scenario, at: number, stopLine: number): EventProps {
    const root = new THREE.Group();
    const z = (p: number) => -p;
    const p: EventProps = { root, peds: [], boxes: [], at, stopLine };
    // 정지선
    const sl = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W / 2, 0.5), new THREE.MeshBasicMaterial({ color: '#f8fafc' }));
    sl.rotation.x = -Math.PI / 2;
    sl.position.set(ROAD_W / 4, 0.015, z(stopLine));
    root.add(sl);
    if (s.light !== 'none' || s.ped !== 'none') {
      for (let i = 0; i < 7; i++) {
        const st = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 4), new THREE.MeshBasicMaterial({ color: '#e2e8f0' }));
        st.rotation.x = -Math.PI / 2;
        st.position.set(-ROAD_W / 2 + 1 + i * 2, 0.014, z(stopLine + 3));
        root.add(st);
      }
    }
    if (s.school) {
      const zone = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W / 2, 30), new THREE.MeshBasicMaterial({ color: '#b91c1c', transparent: true, opacity: 0.55 }));
      zone.rotation.x = -Math.PI / 2;
      zone.position.set(ROAD_W / 4, 0.012, z(stopLine + 4));
      root.add(zone);
      const sign = textSprite('어린이 보호구역 30', { bg: '#dc2626', size: 48, scale: 1.4 });
      // 차 앞쪽 길가에 세워 카메라를 가리지 않게
      sign.position.set(ROAD_W / 2 + 2, 3.2, z(stopLine + 14));
      root.add(sign);
    }
    if (s.light !== 'none') {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6), new THREE.MeshStandardMaterial({ color: '#475569' }));
      pole.position.set(ROAD_W / 2 + 0.5, 3, z(stopLine + 1));
      const arm = new THREE.Mesh(new THREE.BoxGeometry(5, 0.2, 0.2), new THREE.MeshStandardMaterial({ color: '#475569' }));
      arm.position.set(ROAD_W / 2 - 2, 5.8, z(stopLine + 1));
      const box = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 0.5), new THREE.MeshStandardMaterial({ color: '#111827' }));
      box.position.set(LANE_X - 1, 5.8, z(stopLine + 1));
      const mk = (c: string) => new THREE.MeshStandardMaterial({ color: '#1f2937', emissive: c, emissiveIntensity: 0.05 });
      const lamps = { red: mk('#ef4444'), yellow: mk('#facc15'), green: mk('#22c55e') };
      (['red', 'yellow', 'green'] as const).forEach((k, i) => {
        const l = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), lamps[k]);
        l.position.set(LANE_X - 1.75 + i * 0.75, 5.8, z(stopLine + 1) + 0.3);
        root.add(l);
      });
      root.add(pole, arm, box);
      p.lamps = lamps;
      const wb = this.wireBox(3, 1.5, 1, '#fbbf24');
      wb.position.set(LANE_X - 1, 5.1, z(stopLine + 1));
      root.add(wb);
      p.boxes.push(wb);
    }
    const pedColor = ['#f472b6', '#60a5fa', '#a78bfa', '#fb923c'];
    if (s.ped === 'crossing') {
      const g = this.buildPerson(pedColor[Math.floor(at) % 4], s.school);
      g.position.set(LANE_X - 0.5, 0, z(stopLine + 3));
      g.add(this.boxFor(p, 1.2, 2, 1.2));
      root.add(g);
      p.peds.push({ g, role: 'crossing', x: LANE_X - 0.5, walk: 0 });
    }
    if (s.ped === 'sidewalk') {
      const g = this.buildPerson(pedColor[(Math.floor(at) + 1) % 4], s.school);
      g.position.set(ROAD_W / 2 + 1.5, 0.25, z(stopLine + 2));
      g.add(this.boxFor(p, 1.2, 2, 1.2));
      root.add(g);
      p.peds.push({ g, role: 'sidewalk', x: ROAD_W / 2 + 1.5, walk: 0 });
    }
    if (s.obstacle && !s.sudden) {
      const og = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1, 12), new THREE.MeshStandardMaterial({ color: '#f97316', emissive: '#f97316', emissiveIntensity: 0.3 }));
        cone.position.set(LANE_X - 1 + i, 0.5, 0);
        og.add(cone);
      }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.5, 0.2), new THREE.MeshStandardMaterial({ color: '#fbbf24', emissive: '#fbbf24', emissiveIntensity: 0.3 }));
      bar.position.set(LANE_X, 1.1, 0);
      const sign = textSprite('공사 중', { bg: '#f97316', size: 48, scale: 1 });
      sign.position.set(LANE_X, 2.2, 0);
      og.add(bar, sign);
      og.position.z = z(at);
      og.add(this.boxFor(p, 4, 2, 1.4, LANE_X));
      root.add(og);
      p.obstacle = og;
    }
    if (s.sudden) {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.45, 20, 14), new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#ef4444', emissiveIntensity: 0.3 }));
      ball.position.set(ROAD_W / 2 + 3, 0.45, z(stopLine + 5));
      ball.visible = false;
      root.add(ball);
      p.ball = ball;
    }
    if (s.car !== 'none') {
      const c = this.buildCar('#60a5fa');
      const d = s.car === 'near' ? 7 : 24;
      c.position.set(LANE_X, 0, z(stopLine + d));
      c.add(this.boxFor(p, 2.4, 2.2, 4.6));
      root.add(c);
      p.carAhead = c;
    }
    this.eventsGroup.add(root);
    return p;
  }

  private boxFor(p: EventProps, w: number, h: number, d: number, x = 0) {
    const b = this.wireBox(w, h, d, '#f87171');
    b.position.x = x;
    p.boxes.push(b);
    return b;
  }

  private frame(dt: number, t: number) {
    const sim = this.sim;
    const { camera } = this.stage;
    const carZ = sim ? -sim.pos + 2.1 : 0;
    const carX = LANE_X + (sim?.laneOffset ?? 0);
    // 차선 변경 중에는 진행 방향으로 살짝 기울임
    const prevX = this.car.position.x;
    this.car.position.set(carX, 0, carZ);
    if (dt > 0 && sim) this.car.rotation.y = Math.max(-0.3, Math.min(0.3, ((prevX - carX) / dt / Math.max(1, sim.speed)) * 1.2));
    for (const w of this.wheels) w.rotation.x -= (sim?.speed ?? 0) * dt * 2.6;
    this.brakeMat.emissiveIntensity = sim && sim.speed < 3 ? 1.5 : 0.2;
    camera.position.set(carX - 1.5, 5.5, carZ + 11);
    camera.lookAt(carX - 0.8, 1.2, carZ - 14);

    // 날씨
    const ev = sim?.event;
    const w = ev ? ev.current.weather : 'clear';
    if (w !== this.weather) this.weather = w;
    const targetFar = w === 'fog' ? 42 : w === 'rain' ? 130 : 260;
    this.fog.far += (targetFar - this.fog.far) * Math.min(1, dt * 1.5);
    this.fog.near = Math.min(this.fog.far * 0.3, 40);
    this.rain.visible = w === 'rain';
    if (this.rain.visible) {
      const a = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < a.count; i++) {
        let y = a.getY(i) - dt * 28;
        if (y < 0) y += 30;
        a.setY(i, y);
      }
      a.needsUpdate = true;
      this.rain.position.set(carX, 0, carZ - 20);
    }

    // 사건 소품 상태 반영
    const lineVerts: number[] = [];
    const lineCols: number[] = [];
    if (sim) {
      sim.events.forEach((e, i) => {
        const p = this.props[i];
        if (!p) return;
        const s = e.current;
        if (p.lamps) {
          p.lamps.red.emissiveIntensity = s.light === 'red' ? 2.5 : 0.05;
          p.lamps.yellow.emissiveIntensity = s.light === 'yellow' ? 2.5 : 0.05;
          p.lamps.green.emissiveIntensity = s.light === 'green' ? 2.5 : 0.05;
        }
        for (const ped of p.peds) {
          const leaving = (ped.role === 'crossing' && s.ped !== 'crossing') || (ped.role === 'sidewalk' && e.original.school && s.ped === 'none');
          if (leaving) {
            ped.walk = Math.min(1, ped.walk + dt * 0.45);
            ped.g.position.x = ped.role === 'crossing' ? ped.x + ped.walk * 12 : ped.x + ped.walk * 6;
            ped.g.rotation.y = Math.PI / 2;
          }
          ped.g.position.y = (ped.role === 'sidewalk' ? 0.25 : 0) + Math.abs(Math.sin(t * (leaving ? 8 : 2) + i)) * 0.06;
          ped.g.visible = ped.walk < 1;
        }
        if (p.ball) {
          p.ball.visible = e.revealed && s.obstacle;
          if (p.ball.visible) {
            p.ball.position.x = Math.max(LANE_X, p.ball.position.x - dt * 8);
            p.ball.rotation.z += dt * 8;
          } else if (e.revealed) p.ball.visible = false;
        }
        if (p.obstacle) p.obstacle.visible = true;
        if (p.carAhead) {
          const isNear = s.car === 'near';
          const passed = i < sim.index;
          if (!isNear || passed) p.carAhead.position.z -= dt * (passed ? 14 : 6);
          p.carAhead.visible = p.carAhead.position.z > -sim.pos - 120;
        }
        const active = this.sensorsOn && i === sim.index && sim.pos > e.stopLine - 30;
        for (const b of p.boxes) {
          b.visible = active && b.parent!.visible && (b.parent === p.root ? s.light !== 'none' : true);
          (b.material as THREE.LineBasicMaterial).color.set(sim.hazardActive ? '#f87171' : '#34d399');
        }
        if (active) {
          const from = new THREE.Vector3(carX, 1.9, carZ - 0.5);
          for (const b of p.boxes) {
            if (!b.visible) continue;
            const to = new THREE.Vector3();
            b.getWorldPosition(to);
            lineVerts.push(from.x, from.y, from.z, to.x, to.y, to.z);
            const col = sim.hazardActive ? [0.97, 0.44, 0.44] : [0.2, 0.83, 0.6];
            lineCols.push(...col, ...col);
          }
        }
      });
    }
    this.sensorLines.geometry.dispose();
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lineVerts, 3));
    lg.setAttribute('color', new THREE.Float32BufferAttribute(lineCols, 3));
    this.sensorLines.geometry = lg;
    this.sensorFan.visible = this.sensorsOn;
    this.sensorFan.position.set(carX, 0.06, carZ - 2);
    const fm = this.sensorFan.material as THREE.MeshBasicMaterial;
    fm.opacity = (this.scanning ? 0.14 + 0.1 * Math.sin(t * 10) : 0.08) * (w === 'fog' ? 0.5 : 1);
  }

  get fps() {
    return this.stage.fps;
  }

  dispose() {
    this.sim = null;
    this.stage.dispose();
  }
}
