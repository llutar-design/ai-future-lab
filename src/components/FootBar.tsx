import { useEffect, useState } from 'react';
import { useApp } from '../app/store';

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
  return (
    <div className={`pad pad-${side} ${disabled || empty ? 'pad-off' : ''} ${flash ? 'pad-flash' : ''}`}>
      <div className="pad-mark">{side === 'O' ? '○' : '✕'}</div>
      <div className="pad-text">
        <span className="pad-key">{side} 발판</span>
        <span className="pad-label">{empty ? '—' : label}</span>
      </div>
    </div>
  );
}
