import { useEffect, useState } from 'react';
import { useApp } from '../app/store';
import { peekInputRuntime } from '../input/runtime';

/** 화면 하단 O/X 발판 안내. 현재 맨 위 컨트롤의 문구를 보여줍니다. */
export function FootBar() {
  const controls = useApp((s) => s.controls);
  const pressFx = useApp((s) => s.pressFx);
  const top = controls[controls.length - 1];
  const [flash, setFlash] = useState<'O' | 'X' | null>(null);

  useEffect(() => {
    if (!pressFx) return;
    setFlash(pressFx.pedal);
    const t = setTimeout(() => setFlash(null), 260);
    return () => clearTimeout(t);
  }, [pressFx]);

  return (
    <div className="footbar">
      <Pad side="O" label={top?.o?.label} disabled={top?.o?.disabled} flash={flash === 'O'} />
      <Pad side="X" label={top?.x?.label} disabled={top?.x?.disabled} flash={flash === 'X'} />
    </div>
  );
}

function Pad({ side, label, disabled, flash }: { side: 'O' | 'X'; label?: string; disabled?: boolean; flash: boolean }) {
  const empty = !label;
  // 터치스크린·마우스로도 발판과 똑같이 입력(같은 입력 관리자를 거침) — 웹 체험 링크용
  const input = () => peekInputRuntime()?.input;
  return (
    <div
      className={`pad pad-${side} ${disabled || empty ? 'pad-off' : ''} ${flash ? 'pad-flash' : ''}`}
      onPointerDown={(e) => {
        e.preventDefault();
        input()?.press(side, 'pointer');
      }}
      onPointerUp={() => input()?.release(side, 'pointer')}
      onPointerLeave={() => input()?.release(side, 'pointer')}
      onPointerCancel={() => input()?.release(side, 'pointer')}
    >
      <div className="pad-mark">{side === 'O' ? '○' : '✕'}</div>
      <div className="pad-text">
        <span className="pad-key">{side} 발판</span>
        <span className="pad-label">{empty ? '—' : label}</span>
      </div>
    </div>
  );
}
