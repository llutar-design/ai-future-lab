import type { GameId } from '../app/gameIds';

/** 메인 메뉴 카드의 움직이는 미리보기 (SVG + CSS 애니메이션) */
export function MenuPreview({ id, active }: { id: GameId; active: boolean }) {
  return (
    <svg viewBox="0 0 400 200" className={`preview ${active ? 'preview-on' : ''}`} preserveAspectRatio="xMidYMid meet">
      <rect width="400" height="200" fill="#0b1635" />
      {id === 'ai-training' && <TrainingPreview />}
      {id === 'autonomous-driving' && <DrivingPreview />}
      {id === 'deepfake-detective' && <DetectivePreview />}
      {id === 'reinforcement-arena' && <ArenaPreview />}
    </svg>
  );
}

function TrainingPreview() {
  return (
    <g>
      <rect x="20" y="130" width="140" height="56" rx="12" fill="#1d4ed8" opacity="0.5" />
      <text x="90" y="166" textAnchor="middle" fill="#fff" fontSize="20" fontWeight="700">A그룹</text>
      <rect x="240" y="130" width="140" height="56" rx="12" fill="#b91c1c" opacity="0.5" />
      <text x="310" y="166" textAnchor="middle" fill="#fff" fontSize="20" fontWeight="700">B그룹</text>
      <g className="pv-drop-l">
        <circle cx="200" cy="40" r="20" fill="#38bdf8" />
        <circle cx="193" cy="36" r="4" fill="#0b1635" />
        <circle cx="207" cy="36" r="4" fill="#0b1635" />
      </g>
      <g className="pv-drop-r">
        <rect x="182" y="22" width="36" height="36" rx="6" fill="#f87171" />
        <circle cx="193" cy="38" r="4" fill="#0b1635" />
        <circle cx="207" cy="38" r="4" fill="#0b1635" />
      </g>
      <polyline points="20,110 80,90 140,70 200,62 260,56 320,53 380,52" fill="none" stroke="#7df9ff" strokeWidth="3" className="pv-line" />
    </g>
  );
}

function DrivingPreview() {
  return (
    <g>
      <polygon points="150,0 250,0 400,200 0,200" fill="#1f2937" />
      <g className="pv-road">
        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={i} x="196" y={i * 48 - 20} width="8" height="24" fill="#fde047" />
        ))}
      </g>
      <rect x="300" y="40" width="10" height="60" fill="#475569" />
      <rect x="292" y="20" width="26" height="44" rx="5" fill="#111827" />
      <circle cx="305" cy="32" r="6" fill="#ef4444" className="pv-light-r" />
      <circle cx="305" cy="52" r="6" fill="#22c55e" className="pv-light-g" />
      <g transform="translate(170,120)">
        <rect width="60" height="56" rx="12" fill="#34d399" />
        <rect x="8" y="6" width="44" height="18" rx="6" fill="#0f172a" />
        <path d="M30 0 L-40 -90 M30 0 L100 -90" stroke="#7df9ff" strokeWidth="2" opacity="0.6" className="pv-sensor" />
      </g>
      <circle cx="120" cy="90" r="9" fill="#fbbf24" className="pv-ped" />
    </g>
  );
}

function DetectivePreview() {
  return (
    <g>
      <rect x="40" y="25" width="200" height="150" rx="8" fill="#e2e8f0" />
      <rect x="50" y="35" width="180" height="100" fill="#7dd3fc" />
      <circle cx="190" cy="65" r="16" fill="#fde047" />
      <path d="M50 135 L110 85 L160 135 Z" fill="#16a34a" />
      <text x="140" y="160" textAnchor="middle" fontSize="16" fill="#334155">출처: ???</text>
      <g className="pv-glass">
        <circle cx="0" cy="0" r="34" fill="#cdeffd" fillOpacity="0.25" stroke="#c084fc" strokeWidth="7" />
        <line x1="24" y1="24" x2="52" y2="52" stroke="#c084fc" strokeWidth="9" strokeLinecap="round" />
      </g>
      <g transform="translate(270,40)">
        {['출처', '그림자', '메타데이터'].map((t, i) => (
          <g key={t} transform={`translate(0, ${i * 44})`} className={`pv-ev pv-ev-${i}`}>
            <rect width="110" height="34" rx="8" fill="#581c87" />
            <text x="55" y="23" textAnchor="middle" fill="#fff" fontSize="16">{t} ✓</text>
          </g>
        ))}
      </g>
    </g>
  );
}

function ArenaPreview() {
  const cells = [];
  for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) cells.push([x, y]);
  return (
    <g transform="translate(40,16)">
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x * 40} y={y * 40} width="38" height="38" rx="5" fill={(x === 3 && y < 3) || (x === 5 && y > 0) ? '#475569' : x === 6 && y === 0 ? '#7f1d1d' : '#1e3a5f'} />
      ))}
      <text x={7 * 40 + 19} y={3 * 40 + 28} textAnchor="middle" fontSize="24">🏁</text>
      <text x={1 * 40 + 19} y={2 * 40 + 28} textAnchor="middle" fontSize="20">⚡</text>
      <g className="pv-robot">
        <circle cx="19" cy="19" r="14" fill="#fbbf24" />
        <circle cx="14" cy="16" r="3" fill="#0b1635" />
        <circle cx="24" cy="16" r="3" fill="#0b1635" />
      </g>
      <text x="0" y="182" fill="#fde68a" fontSize="16">보상을 받으며 길을 배워요 (미리보기)</text>
    </g>
  );
}
