import { GAME_IDS, type GameId } from '../app/gameIds';

/**
 * 키오스크 화면 흐름(메뉴 ↔ 게임)을 다루는 순수 상태 기계.
 * React와 분리해 연속 체험 테스트를 할 수 있게 했습니다.
 */
export interface KioskState {
  screen: 'menu' | 'game';
  menuIndex: number;
  gameId: GameId | null;
  /** 게임을 새로 시작할 때마다 증가 → 컴포넌트를 완전히 새로 마운트(이전 학생 데이터 초기화) */
  sessionKey: number;
  sessionsStarted: number;
  sessionsEnded: number;
}

export function initialKiosk(): KioskState {
  return { screen: 'menu', menuIndex: 0, gameId: null, sessionKey: 0, sessionsStarted: 0, sessionsEnded: 0 };
}

/** 다음 활성 게임 인덱스. 마지막에서 처음으로 순환합니다. */
export function nextEnabledIndex(current: number, enabled: boolean[]): number {
  const n = enabled.length;
  for (let step = 1; step <= n; step++) {
    const i = (current + step) % n;
    if (enabled[i]) return i;
  }
  return current;
}

export function firstEnabledIndex(enabled: boolean[]): number {
  const i = enabled.findIndex(Boolean);
  return i < 0 ? 0 : i;
}

export type KioskAction =
  | { type: 'menuNext'; enabled: boolean[] }
  | { type: 'menuSelect'; enabled: boolean[] }
  | { type: 'restart' }
  | { type: 'exitToMenu'; enabled: boolean[] };

export function kioskReducer(s: KioskState, a: KioskAction): KioskState {
  switch (a.type) {
    case 'menuNext':
      if (s.screen !== 'menu') return s;
      return { ...s, menuIndex: nextEnabledIndex(s.menuIndex, a.enabled) };
    case 'menuSelect': {
      if (s.screen !== 'menu') return s;
      if (!a.enabled[s.menuIndex]) return { ...s, menuIndex: firstEnabledIndex(a.enabled) };
      return {
        ...s,
        screen: 'game',
        gameId: GAME_IDS[s.menuIndex],
        sessionKey: s.sessionKey + 1,
        sessionsStarted: s.sessionsStarted + 1,
      };
    }
    case 'restart':
      if (s.screen !== 'game') return s;
      return { ...s, sessionKey: s.sessionKey + 1, sessionsStarted: s.sessionsStarted + 1, sessionsEnded: s.sessionsEnded + 1 };
    case 'exitToMenu': {
      if (s.screen !== 'game') return s;
      const idx = a.enabled[s.menuIndex] ? s.menuIndex : firstEnabledIndex(a.enabled);
      return { ...s, screen: 'menu', gameId: null, menuIndex: idx, sessionsEnded: s.sessionsEnded + 1 };
    }
  }
}
