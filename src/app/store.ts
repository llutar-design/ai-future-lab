import { useEffect } from 'react';
import { create } from 'zustand';
import { loadSettings, saveSettings, type Settings } from '../admin/settings';
import { initialKiosk, kioskReducer, type KioskAction, type KioskState } from '../kiosk/KioskManager';
import type { Pedal } from '../input/types';

export interface ControlLabel {
  label: string;
  disabled?: boolean;
}

export interface ControlEntry {
  id: number;
  o: ControlLabel | null;
  x: ControlLabel | null;
}

interface AppStore {
  settings: Settings;
  updateSettings: (fn: (s: Settings) => Settings) => void;
  kiosk: KioskState;
  dispatch: (a: KioskAction) => void;
  adminOpen: boolean;
  setAdminOpen: (v: boolean) => void;
  controls: ControlEntry[];
  pushControls: (id: number) => void;
  popControls: (id: number) => void;
  setControlLabels: (id: number, o: ControlLabel | null, x: ControlLabel | null) => void;
  pressFx: { pedal: Pedal; t: number } | null;
  setPressFx: (p: Pedal) => void;
  notice: { text: string; t: number } | null;
  showNotice: (text: string) => void;
  subtitle: string;
  setSubtitle: (s: string) => void;
  idleWarning: boolean;
  setIdleWarning: (v: boolean) => void;
  /** AI가 혼자 움직이는 장면(관찰 단계) 수. 0보다 크면 무입력 타이머를 멈춤 */
  watching: number;
}

export const useApp = create<AppStore>((set, get) => ({
  settings: loadSettings(),
  updateSettings: (fn) => {
    const next = fn(get().settings);
    saveSettings(next);
    set({ settings: next });
  },
  kiosk: initialKiosk(),
  dispatch: (a) => set({ kiosk: kioskReducer(get().kiosk, a) }),
  adminOpen: false,
  setAdminOpen: (v) => set({ adminOpen: v }),
  controls: [],
  pushControls: (id) => set({ controls: [...get().controls.filter((c) => c.id !== id), { id, o: null, x: null }] }),
  popControls: (id) => set({ controls: get().controls.filter((c) => c.id !== id) }),
  setControlLabels: (id, o, x) =>
    set({ controls: get().controls.map((c) => (c.id === id ? { id, o, x } : c)) }),
  pressFx: null,
  setPressFx: (p) => set({ pressFx: { pedal: p, t: performance.now() } }),
  notice: null,
  showNotice: (text) => set({ notice: { text, t: performance.now() } }),
  subtitle: '',
  setSubtitle: (s) => set({ subtitle: s }),
  idleWarning: false,
  setIdleWarning: (v) => set({ idleWarning: v }),
  watching: 0,
}));

/** 학생이 화면을 지켜보기만 하는 동안(입력이 필요 없는 동안) 무입력 복귀를 막음 */
export function useWatching(active: boolean) {
  useEffect(() => {
    if (!active) return;
    useApp.setState((s) => ({ watching: s.watching + 1 }));
    return () => useApp.setState((s) => ({ watching: Math.max(0, s.watching - 1) }));
  }, [active]);
}

export function enabledList(s: Settings): boolean[] {
  return Object.values(s.games).map((g) => g.enabled);
}
