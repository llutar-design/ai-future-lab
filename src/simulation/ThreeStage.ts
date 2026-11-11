import * as THREE from 'three';
import type { Quality } from '../admin/settings';

export type ResolvedQuality = 'low' | 'medium' | 'high';

const PIXEL_CAP: Record<ResolvedQuality, number> = { low: 0.75, medium: 1, high: 1.5 };

/**
 * Three.js 렌더러/장면/루프를 감싸는 클래스.
 * - 품질(low/medium/high)과 auto(FPS를 보고 해상도 자동 조절)
 * - dispose() 시 장면의 지오메트리·재질·텍스처, 렌더러, WebGL 컨텍스트까지 해제(게임 전환 시 메모리 누수 방지)
 */
export class ThreeStage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  quality: ResolvedQuality;
  private auto: boolean;
  private raf = 0;
  private last = 0;
  private callbacks: ((dt: number, t: number) => void)[] = [];
  private ro: ResizeObserver;
  private fpsWindow: number[] = [];
  private scaleFactor = 1;
  private disposed = false;
  fps = 60;

  constructor(private container: HTMLElement, q: Quality, fov = 55) {
    this.auto = q === 'auto';
    this.quality = q === 'auto' ? 'high' : q;
    this.renderer = new THREE.WebGLRenderer({ antialias: this.quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = this.quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'three-canvas';
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(fov, 16 / 9, 0.1, 600);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this.loop = this.loop.bind(this);
  }

  get shadows() {
    return this.quality !== 'low';
  }

  private resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    // 1920×1080 무대가 CSS로 축소/확대되므로 실제 화면 픽셀 기준으로 해상도를 맞춥니다.
    const rect = this.container.getBoundingClientRect();
    const stageScale = rect.width > 0 ? rect.width / w : 1;
    const ratio = Math.min(window.devicePixelRatio * stageScale, PIXEL_CAP[this.quality]) * this.scaleFactor;
    this.renderer.setPixelRatio(Math.max(0.4, ratio));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  onFrame(cb: (dt: number, t: number) => void) {
    this.callbacks.push(cb);
  }

  start() {
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  private loop(now: number) {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (dt > 0) {
      this.fpsWindow.push(1 / dt);
      if (this.fpsWindow.length > 90) this.fpsWindow.shift();
      this.fps = this.fpsWindow.reduce((a, b) => a + b, 0) / this.fpsWindow.length;
      this.adapt();
    }
    for (const cb of this.callbacks) cb(dt, now / 1000);
    this.renderer.render(this.scene, this.camera);
  }

  private adapt() {
    if (!this.auto || this.fpsWindow.length < 90) return;
    if (this.fps < 45 && this.scaleFactor > 0.5) {
      this.scaleFactor = Math.max(0.5, this.scaleFactor - 0.15);
      if (this.quality === 'high') this.quality = 'medium';
      this.fpsWindow = [];
      this.resize();
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.callbacks = [];
    disposeObject(this.scene);
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}

export function disposeObject(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (mat) (Array.isArray(mat) ? mat : [mat]).forEach(disposeMaterial);
  });
}

function disposeMaterial(m: THREE.Material) {
  for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
  m.dispose();
}

/** 캔버스로 글자 스프라이트 만들기(라벨, 표지판) */
export function textSprite(text: string, opts: { color?: string; bg?: string; size?: number; scale?: number } = {}) {
  const size = opts.size ?? 48;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  ctx.font = `bold ${size}px "Malgun Gothic", sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + size;
  c.width = w;
  c.height = size * 1.6;
  ctx.font = `bold ${size}px "Malgun Gothic", sans-serif`;
  if (opts.bg) {
    ctx.fillStyle = opts.bg;
    ctx.beginPath();
    ctx.roundRect(0, 0, c.width, c.height, size * 0.4);
    ctx.fill();
  }
  ctx.fillStyle = opts.color ?? '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true });
  const s = new THREE.Sprite(mat);
  const scale = opts.scale ?? 1;
  s.scale.set((c.width / c.height) * scale, scale, 1);
  return s;
}
