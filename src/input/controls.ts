import { useEffect, useRef } from 'react';
import { useApp } from '../app/store';
import type { Pedal } from './types';

/**
 * 화면 하단 O/X 안내와 실제 발판 동작을 하나로 묶는 장치.
 * 컴포넌트가 useFootControls로 "O: 무엇 / X: 무엇"을 등록하면
 * - 하단 안내 막대에 그 문구가 표시되고
 * - 발판을 밟으면 그 동작이 실행됩니다.
 * 안내와 동작이 같은 곳에서 나오므로 화면 안내와 실제 동작이 어긋나지 않습니다.
 * 가장 나중에 등록된 컴포넌트가 입력을 받습니다.
 */
export interface FootAction {
  label: string;
  run: () => void;
  disabled?: boolean;
}

type Ref = { current: { o: FootAction | null; x: FootAction | null } };
const handlers = new Map<number, Ref>();
let nextId = 1;

export function useFootControls(o: FootAction | null, x: FootAction | null, active = true) {
  const idRef = useRef(0);
  if (idRef.current === 0) idRef.current = nextId++;
  const ref = useRef({ o, x });
  ref.current = { o, x };

  useEffect(() => {
    if (!active) return;
    const id = idRef.current;
    handlers.set(id, ref);
    useApp.getState().pushControls(id);
    return () => {
      handlers.delete(id);
      useApp.getState().popControls(id);
    };
  }, [active]);

  const oL = o?.label ?? null;
  const xL = x?.label ?? null;
  const oD = !!o?.disabled;
  const xD = !!x?.disabled;
  useEffect(() => {
    if (!active) return;
    useApp
      .getState()
      .setControlLabels(idRef.current, oL === null ? null : { label: oL, disabled: oD }, xL === null ? null : { label: xL, disabled: xD });
  }, [active, oL, xL, oD, xD]);
}

/** 발판 입력을 현재 맨 위 컨트롤에 전달. 실행되었으면 true */
export function dispatchPedal(p: Pedal): boolean {
  const stack = useApp.getState().controls;
  for (let i = stack.length - 1; i >= 0; i--) {
    const h = handlers.get(stack[i].id);
    if (!h) continue;
    const a = p === 'O' ? h.current.o : h.current.x;
    if (!a || a.disabled) return false;
    a.run();
    return true;
  }
  return false;
}
