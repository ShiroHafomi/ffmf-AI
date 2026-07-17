import { fmtMoney, fmtNumber } from "@/lib/format";

export interface DonutSlice {
  name: string;
  value: number;
  color: string;
}

const PALETTE = [
  "#6366f1",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#a855f7",
  "#14b8a6",
  "#ec4899",
  "#84cc16",
  "#f97316",
];

export function Donut({
  slices,
  size = 200,
  thickness = 26,
}: {
  slices: { name: string; value: number }[];
  size?: number;
  thickness?: number;
}) {
  const total = slices.reduce((s, d) => s + Math.max(0, d.value), 0);
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const withColor = slices.map((s, i) => ({
    ...s,
    color: PALETTE[i % PALETTE.length],
  }));

  if (total <= 0) {
    return (
      <div
        className="grid place-items-center rounded-full border-4 border-ink-100 dark:border-ink-800"
        style={{ width: size, height: size }}
      >
        <span className="text-xs text-ink-400 dark:text-ink-500">—</span>
      </div>
    );
  }

  let offset = 0;
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <g transform={`rotate(-90 ${c} ${c})`}>
          <circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke="var(--border)"
            strokeWidth={thickness}
          />
          {withColor.map((s) => {
            const frac = Math.max(0, s.value) / total;
            const len = frac * circ;
            const seg = (
              <circle
                key={s.name}
                cx={c}
                cy={c}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={`${len} ${circ - len}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              >
                <title>{`${s.name}: ${fmtMoney(s.value)} (${fmtNumber(Math.round(frac * 100))}%)`}</title>
              </circle>
            );
            offset += len;
            return seg;
          })}
        </g>
      </svg>

      <ul className="w-full space-y-2">
        {withColor.map((s) => {
          const pct = Math.round((Math.max(0, s.value) / total) * 100);
          return (
            <li key={s.name} className="flex items-center gap-2 text-sm">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: s.color }}
              />
              <span className="min-w-0 flex-1 truncate text-ink-700 dark:text-ink-200">
                {s.name}
              </span>
              <span className="shrink-0 font-medium text-ink-900 dark:text-ink-50">
                {fmtMoney(s.value)}
              </span>
              <span className="w-9 shrink-0 text-right text-xs text-ink-400 dark:text-ink-500">
                {pct}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
