import type { Costume } from '../app/gameIds';

export type Mood = 'happy' | 'think' | 'surprised' | 'sad';

/**
 * AI 안내 로봇 '에이봇'. 얼굴(화면형 얼굴, 하늘색 눈, 안테나)은 모든 게임에서 같고 복장만 바뀝니다.
 */
export function Abot({ costume = 'guide', mood = 'happy', size = 180, talking = false }: { costume?: Costume; mood?: Mood; size?: number; talking?: boolean }) {
  return (
    <svg className="abot" width={size} height={size * 1.2} viewBox="0 0 200 240" aria-label="에이봇">
      <defs>
        <linearGradient id="abotShell" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f8fbff" />
          <stop offset="1" stopColor="#c9d8ee" />
        </linearGradient>
        <radialGradient id="abotGlow">
          <stop offset="0" stopColor="#7df9ff" />
          <stop offset="1" stopColor="#7df9ff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g className="abot-float">
        {/* 안테나 */}
        <line x1="100" y1="30" x2="100" y2="10" stroke="#9fb3cf" strokeWidth="5" strokeLinecap="round" />
        <circle cx="100" cy="9" r="14" fill="url(#abotGlow)" className="abot-antenna" />
        <circle cx="100" cy="9" r="6" fill="#7df9ff" />
        {/* 몸 */}
        <rect x="58" y="128" width="84" height="80" rx="30" fill="url(#abotShell)" stroke="#8aa2c4" strokeWidth="3" />
        <circle cx="100" cy="160" r="10" fill="#38bdf8" className="abot-core" />
        {/* 팔 */}
        <rect x="34" y="140" width="22" height="50" rx="11" fill="url(#abotShell)" stroke="#8aa2c4" strokeWidth="3" className="abot-arm-l" />
        <rect x="144" y="140" width="22" height="50" rx="11" fill="url(#abotShell)" stroke="#8aa2c4" strokeWidth="3" className="abot-arm-r" />
        {/* 다리 */}
        <rect x="72" y="204" width="20" height="24" rx="8" fill="#9fb3cf" />
        <rect x="108" y="204" width="20" height="24" rx="8" fill="#9fb3cf" />
        <CostumeBody costume={costume} />
        {/* 머리 */}
        <rect x="36" y="28" width="128" height="98" rx="42" fill="url(#abotShell)" stroke="#8aa2c4" strokeWidth="3" />
        <rect x="52" y="46" width="96" height="62" rx="28" fill="#0f1f3d" />
        <Face mood={mood} talking={talking} />
        <circle cx="62" cy="96" r="7" fill="#ff8fb1" opacity="0.6" />
        <circle cx="138" cy="96" r="7" fill="#ff8fb1" opacity="0.6" />
        <CostumeHead costume={costume} />
      </g>
    </svg>
  );
}

function Face({ mood, talking }: { mood: Mood; talking: boolean }) {
  const eye = '#7df9ff';
  return (
    <g>
      <g className="abot-eyes">
        {mood === 'happy' && (
          <>
            <path d="M70 80 q10 -14 20 0" stroke={eye} strokeWidth="6" fill="none" strokeLinecap="round" />
            <path d="M110 80 q10 -14 20 0" stroke={eye} strokeWidth="6" fill="none" strokeLinecap="round" />
          </>
        )}
        {mood === 'think' && (
          <>
            <ellipse cx="80" cy="76" rx="8" ry="10" fill={eye} />
            <rect x="112" y="74" width="18" height="5" rx="2.5" fill={eye} />
          </>
        )}
        {mood === 'surprised' && (
          <>
            <circle cx="80" cy="75" r="11" fill={eye} />
            <circle cx="120" cy="75" r="11" fill={eye} />
          </>
        )}
        {mood === 'sad' && (
          <>
            <path d="M70 74 q10 10 20 0" stroke={eye} strokeWidth="6" fill="none" strokeLinecap="round" />
            <path d="M110 74 q10 10 20 0" stroke={eye} strokeWidth="6" fill="none" strokeLinecap="round" />
          </>
        )}
      </g>
      {talking ? (
        <ellipse cx="100" cy="96" rx="8" ry="5" fill={eye} className="abot-talk" />
      ) : mood === 'sad' ? (
        <path d="M90 99 q10 -7 20 0" stroke={eye} strokeWidth="4" fill="none" strokeLinecap="round" />
      ) : (
        <path d="M90 94 q10 8 20 0" stroke={eye} strokeWidth="4" fill="none" strokeLinecap="round" />
      )}
    </g>
  );
}

function CostumeBody({ costume }: { costume: Costume }) {
  switch (costume) {
    case 'researcher':
      return (
        <g>
          <path d="M58 150 L58 208 L96 208 L88 140 Z" fill="#ffffff" stroke="#b9c7dc" strokeWidth="2" />
          <path d="M142 150 L142 208 L104 208 L112 140 Z" fill="#ffffff" stroke="#b9c7dc" strokeWidth="2" />
          <rect x="120" y="170" width="12" height="16" rx="2" fill="#38bdf8" />
          <rect x="150" y="160" width="26" height="34" rx="4" fill="#fde68a" stroke="#d6a52c" strokeWidth="2" />
          <line x1="155" y1="170" x2="171" y2="170" stroke="#a16207" strokeWidth="2" />
          <line x1="155" y1="178" x2="168" y2="178" stroke="#a16207" strokeWidth="2" />
        </g>
      );
    case 'driver':
      return (
        <g>
          <path d="M70 132 L100 150 L130 132" stroke="#f97316" strokeWidth="8" fill="none" strokeLinecap="round" />
          <circle cx="100" cy="182" r="16" fill="none" stroke="#334155" strokeWidth="5" />
          <line x1="100" y1="166" x2="100" y2="198" stroke="#334155" strokeWidth="4" />
          <line x1="84" y1="182" x2="116" y2="182" stroke="#334155" strokeWidth="4" />
        </g>
      );
    case 'detective':
      return (
        <g>
          <path d="M58 140 L100 200 L142 140 L142 208 L58 208 Z" fill="#a47148" opacity="0.9" />
          <circle cx="166" cy="140" r="14" fill="#cdeffd" fillOpacity="0.5" stroke="#5b3a1e" strokeWidth="5" />
          <line x1="158" y1="152" x2="150" y2="170" stroke="#5b3a1e" strokeWidth="6" strokeLinecap="round" />
        </g>
      );
    case 'coach':
      return (
        <g>
          <path d="M78 130 L100 172 L122 130" stroke="#ef4444" strokeWidth="3" fill="none" />
          <rect x="94" y="170" width="14" height="9" rx="4" fill="#facc15" stroke="#a16207" strokeWidth="2" />
          <rect x="60" y="186" width="80" height="8" fill="#ef4444" opacity="0.8" />
        </g>
      );
    default:
      return <path d="M66 134 q34 18 68 0 l-6 12 q-28 12 -56 0 z" fill="#38bdf8" />;
  }
}

function CostumeHead({ costume }: { costume: Costume }) {
  switch (costume) {
    case 'researcher':
      return (
        <g>
          <rect x="66" y="22" width="68" height="10" rx="5" fill="#38bdf8" />
          <text x="100" y="31" fontSize="9" textAnchor="middle" fill="#fff" fontWeight="700">AI LAB</text>
        </g>
      );
    case 'driver':
      return (
        <g>
          <path d="M44 48 q56 -46 112 0 z" fill="#2563eb" />
          <rect x="40" y="44" width="120" height="10" rx="5" fill="#1e40af" />
          <path d="M120 50 q30 0 44 10 l-44 0 z" fill="#1e3a8a" />
          <circle cx="100" cy="34" r="6" fill="#facc15" />
        </g>
      );
    case 'detective':
      return (
        <g>
          <path d="M40 46 q60 -50 120 0 z" fill="#8b5a2b" />
          <rect x="34" y="42" width="132" height="10" rx="5" fill="#6b4423" />
          <path d="M60 30 l-8 -10 M140 30 l8 -10" stroke="#6b4423" strokeWidth="6" strokeLinecap="round" />
        </g>
      );
    case 'coach':
      return (
        <g>
          <rect x="38" y="40" width="124" height="12" rx="6" fill="#ef4444" />
          <rect x="152" y="38" width="10" height="26" rx="5" fill="#ef4444" />
        </g>
      );
    default:
      return null;
  }
}
