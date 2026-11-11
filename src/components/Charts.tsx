/** 가벼운 SVG 차트. 실제 학습 값만 받아서 그립니다. */

export interface Series {
  name: string;
  color: string;
  values: number[];
  dashed?: boolean;
}

export function LineChart({
  series,
  width = 520,
  height = 220,
  yMin,
  yMax,
  yLabel,
  xLabel,
  percent = false,
}: {
  series: Series[];
  width?: number;
  height?: number;
  yMin?: number;
  yMax?: number;
  yLabel?: string;
  xLabel?: string;
  percent?: boolean;
}) {
  const pad = { l: 58, r: 14, t: 16, b: 34 };
  const all = series.flatMap((s) => s.values).filter(Number.isFinite);
  let lo = yMin ?? (all.length ? Math.min(...all) : 0);
  let hi = yMax ?? (all.length ? Math.max(...all) : 1);
  if (hi - lo < 1e-9) {
    hi += 1;
    lo -= yMin === undefined ? 1 : 0;
  }
  const n = Math.max(2, ...series.map((s) => s.values.length));
  const X = (i: number) => pad.l + (i / (n - 1)) * (width - pad.l - pad.r);
  const Y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (height - pad.t - pad.b);
  const fmt = (v: number) => (percent ? `${Math.round(v * 100)}%` : Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(2));
  const ticks = [lo, (lo + hi) / 2, hi];
  return (
    <svg className="chart" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={pad.l} x2={width - pad.r} y1={Y(t)} y2={Y(t)} stroke="rgba(148,163,184,0.25)" />
          <text x={pad.l - 8} y={Y(t) + 6} fontSize="16" textAnchor="end" fill="#a5b4cf">
            {fmt(t)}
          </text>
        </g>
      ))}
      {series.map((s) =>
        s.values.length > 0 ? (
          <polyline
            key={s.name}
            fill="none"
            stroke={s.color}
            strokeWidth="3.5"
            strokeDasharray={s.dashed ? '8 6' : undefined}
            strokeLinejoin="round"
            points={s.values.map((v, i) => `${X(i)},${Y(Math.min(hi, Math.max(lo, v)))}`).join(' ')}
          />
        ) : null,
      )}
      {yLabel && (
        <text x={6} y={14} fontSize="15" fill="#a5b4cf">
          {yLabel}
        </text>
      )}
      {xLabel && (
        <text x={width - pad.r} y={height - 6} fontSize="15" textAnchor="end" fill="#a5b4cf">
          {xLabel}
        </text>
      )}
      <g>
        {series.map((s, i) => (
          <g key={s.name} transform={`translate(${pad.l + 10 + i * 170}, ${height - 12})`}>
            <rect width="18" height="5" y="-4" fill={s.color} />
            <text x="24" y="2" fontSize="15" fill="#dbe4f5">
              {s.name}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

export interface Bar {
  label: string;
  value: number;
  color: string;
  text?: string;
}

export function BarChart({ bars, max, width = 520, rowH = 44 }: { bars: Bar[]; max?: number; width?: number; rowH?: number }) {
  const m = max ?? Math.max(1e-9, ...bars.map((b) => b.value));
  const labelW = 190;
  return (
    <svg className="chart" width={width} height={bars.length * rowH + 8} viewBox={`0 0 ${width} ${bars.length * rowH + 8}`}>
      {bars.map((b, i) => {
        const w = Math.max(0, (b.value / m) * (width - labelW - 90));
        return (
          <g key={b.label} transform={`translate(0, ${i * rowH + 4})`}>
            <text x={labelW - 12} y={rowH / 2 + 6} fontSize="19" textAnchor="end" fill="#dbe4f5">
              {b.label}
            </text>
            <rect x={labelW} y={8} width={width - labelW - 90} height={rowH - 16} rx="8" fill="rgba(148,163,184,0.15)" />
            <rect x={labelW} y={8} width={w} height={rowH - 16} rx="8" fill={b.color} />
            <text x={labelW + w + 10} y={rowH / 2 + 7} fontSize="19" fill="#fff" fontWeight="700">
              {b.text ?? b.value}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function ProgressBar({ value, color = '#38bdf8', label }: { value: number; color?: string; label?: string }) {
  return (
    <div className="progress">
      <div className="progress-fill" style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`, background: color }} />
      {label && <span className="progress-label">{label}</span>}
    </div>
  );
}
