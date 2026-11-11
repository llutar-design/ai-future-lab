import { COLORS, type Creature } from './creatures';

export function CreatureView({ c, size = 220, className }: { c: Creature; size?: number; className?: string }) {
  const s = 0.6 + c.size * 0.55; // 몸 크기
  const col = COLORS[c.color].hex;
  const clip = `cl-${c.id}`;
  const body =
    c.shape === 0 ? (
      <circle cx="100" cy="110" r={60 * s} />
    ) : c.shape === 1 ? (
      <rect x={100 - 58 * s} y={110 - 58 * s} width={116 * s} height={116 * s} rx={14 * s} />
    ) : (
      <polygon points={`100,${110 - 68 * s} ${100 + 68 * s},${110 + 52 * s} ${100 - 68 * s},${110 + 52 * s}`} />
    );
  const top = c.shape === 2 ? 110 - 68 * s : 110 - 60 * s;
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} className={className}>
      <defs>
        <clipPath id={clip}>{body}</clipPath>
      </defs>
      {/* 안테나 */}
      {Array.from({ length: c.antennas }, (_, i) => {
        const x = c.antennas === 1 ? 100 : 82 + i * 36;
        return (
          <g key={i}>
            <line x1={x} y1={top + 6} x2={x + (i ? 6 : -6)} y2={top - 26} stroke="#cbd5e1" strokeWidth="5" strokeLinecap="round" />
            <circle cx={x + (i ? 6 : -6)} cy={top - 30} r="7" fill="#7df9ff" />
          </g>
        );
      })}
      <g fill={col} stroke="rgba(0,0,0,0.35)" strokeWidth="4">
        {body}
      </g>
      <g clipPath={`url(#${clip})`} opacity="0.45">
        {c.pattern === 1 && [0, 1, 2, 3, 4, 5, 6].map((i) => <rect key={i} x="20" y={40 + i * 24} width="160" height="10" fill="#0f172a" />)}
        {c.pattern === 2 &&
          [0, 1, 2, 3, 4].flatMap((y) => [0, 1, 2, 3, 4].map((x) => <circle key={`${x}${y}`} cx={45 + x * 28 + (y % 2) * 14} cy={55 + y * 26} r="7" fill="#0f172a" />))}
      </g>
      {/* 얼굴 */}
      <ellipse cx="100" cy="106" rx={30 * s} ry={18 * s} fill="#0f172a" />
      <circle cx={100 - 12 * s} cy="104" r={6 * s} fill="#7df9ff" />
      <circle cx={100 + 12 * s} cy="104" r={6 * s} fill="#7df9ff" />
    </svg>
  );
}
