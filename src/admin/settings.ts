import { GAME_IDS, GAME_META, type GameId } from '../app/gameIds';
import { DEFAULT_GAMEPAD, DEFAULT_KEYMAP, DEFAULT_TIMING, type GamepadMapping, type InputTiming, type KeyMapping } from '../input/types';

export type Quality = 'auto' | 'low' | 'medium' | 'high';
export type Grade = 'low' | 'mid' | 'high';

export const GRADE_LABEL: Record<Grade, string> = { low: '1~2학년', mid: '3~4학년', high: '5~6학년' };

export interface Settings {
  version: 1;
  games: Record<GameId, { enabled: boolean; minutes: number }>;
  keymap: KeyMapping;
  gamepad: GamepadMapping;
  timing: InputTiming;
  quality: Quality;
  showFps: boolean;
  fit: 'contain' | 'cover';
  volume: number;
  sfx: boolean;
  voice: boolean;
  voiceRate: number;
  grade: Grade;
  resultSeconds: number;
  idleWarnSeconds: number;
  idleReturnSeconds: number;
  kioskFullscreen: boolean;
  /** 관리자 비밀번호 SHA-256. 빈 값이면 기본 비밀번호(DEFAULT_ADMIN_PASSWORD) 사용 */
  adminHash: string;
  /** 자율주행: 이전 학생들이 만든 학습 데이터를 이어서 사용 */
  accumulateDriving: boolean;
}

export function defaultSettings(): Settings {
  const games = {} as Settings['games'];
  for (const id of GAME_IDS) games[id] = { enabled: true, minutes: GAME_META[id].defaultMinutes };
  return {
    version: 1,
    games,
    keymap: { O: [...DEFAULT_KEYMAP.O], X: [...DEFAULT_KEYMAP.X] },
    gamepad: { ...DEFAULT_GAMEPAD },
    timing: { ...DEFAULT_TIMING },
    quality: 'auto',
    showFps: false,
    fit: 'contain',
    volume: 0.7,
    sfx: true,
    voice: true,
    voiceRate: 1.05,
    grade: 'mid',
    resultSeconds: 15,
    idleWarnSeconds: 25,
    idleReturnSeconds: 90,
    kioskFullscreen: true,
    adminHash: '',
    accumulateDriving: false,
  };
}

const KEY = 'aifl.settings.v1';

/** 저장된 값과 기본값을 병합(새 항목이 추가돼도 깨지지 않게) */
export function mergeSettings(raw: unknown): Settings {
  const d = defaultSettings();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<Settings>;
  const games = { ...d.games };
  for (const id of GAME_IDS) {
    const g = r.games?.[id];
    if (g) games[id] = { enabled: g.enabled !== false, minutes: clampNum(g.minutes, 2, 20, d.games[id].minutes) };
  }
  return {
    ...d,
    ...r,
    version: 1,
    games,
    keymap: r.keymap && Array.isArray(r.keymap.O) && Array.isArray(r.keymap.X) ? r.keymap : d.keymap,
    gamepad: { ...d.gamepad, ...(r.gamepad ?? {}) },
    timing: { ...d.timing, ...(r.timing ?? {}) },
    volume: clampNum(r.volume, 0, 1, d.volume),
    resultSeconds: clampNum(r.resultSeconds, 5, 60, d.resultSeconds),
    idleWarnSeconds: clampNum(r.idleWarnSeconds, 5, 120, d.idleWarnSeconds),
    idleReturnSeconds: clampNum(r.idleReturnSeconds, 20, 600, d.idleReturnSeconds),
  };
}

function clampNum(v: unknown, min: number, max: number, fallback: number) {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

export function loadSettings(): Settings {
  try {
    const s = localStorage.getItem(KEY);
    return mergeSettings(s ? JSON.parse(s) : null);
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch (e) {
    console.error('설정 저장 실패', e);
  }
}

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export const DEFAULT_ADMIN_PASSWORD = '2580';

export async function checkPassword(s: Settings, pw: string): Promise<boolean> {
  const h = await sha256(pw);
  if (!s.adminHash) return h === (await sha256(DEFAULT_ADMIN_PASSWORD));
  return h === s.adminHash;
}
