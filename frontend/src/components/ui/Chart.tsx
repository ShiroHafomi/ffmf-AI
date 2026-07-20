"use client";

import { useRef, useState } from "react";
import { fmtMoney } from "@/lib/format";
import { useLanguage } from "@/context/LanguageContext";

export interface TrendPoint {
  label: string;
  value: number;
  // Optional raw month key ("2026-07") for richer tooltip text.
  ym?: string;
}

// Catmull-Rom → cubic Bézier for a smooth line through all points.
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

export function TrendChart({
  points,
  forecast,
  height = 280,
  formatValue = fmtMoney,
}: {
  points: TrendPoint[];
  forecast?: TrendPoint;
  height?: number;
  formatValue?: (n: number) => string;
}) {
  const { t } = useLanguage();
  const series = forecast ? [...points, forecast] : points;
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [tip, setTip] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const [containerW, setContainerW] = useState(720);

  if (series.length === 0) {
    return (
      <div className="grid h-40 place-items-center text-sm text-ink-400 dark:text-ink-500">
        {t("chart.notEnough")}
      </div>
    );
  }

  const W = 720;
  const H = height;
  const left = 16;
  const right = 16;
  const top = 18;
  const bottom = 28;
  const plotW = W - left - right;
  const plotH = H - top - bottom;

  const values = series.map((p) => p.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const pad = (rawMax - rawMin) * 0.15 || rawMax * 0.1 || 1;
  const lo = rawMin >= 0 ? Math.max(0, rawMin - pad) : rawMin - pad;
  const hi = rawMax + pad;
  const range = hi - lo || 1;

  const n = series.length;
  const x = (i: number) => (n === 1 ? left + plotW / 2 : left + (i / (n - 1)) * plotW);
  const y = (v: number) => top + (1 - (v - lo) / range) * plotH;

  const linePts = series.map((p, i) => ({ x: x(i), y: y(p.value) }));
  const linePath = smoothPath(linePts);
  const areaPath = `${linePath} L ${x(n - 1).toFixed(1)} ${(top + plotH).toFixed(1)} L ${x(0).toFixed(1)} ${(top + plotH).toFixed(1)} Z`;

  const gridCount = 4;
  const ticks = Array.from({ length: gridCount + 1 }, (_, i) => lo + (range * i) / gridCount);

  const lastHistIdx = points.length - 1;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    const rect = svg?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    // nearest index
    let idx = 0;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(x(i) - svgX);
      if (d < best) {
        best = d;
        idx = i;
      }
    }
    setHover(idx);
    // Tooltip positioned in container coords (container == svg box here).
    const displayLeft = (x(idx) / W) * rect.width;
    const displayTop = (y(series[idx].value) / H) * rect.height;
    setContainerW(containerRef.current?.clientWidth ?? rect.width);
    setTip({ left: displayLeft, top: displayTop });
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none"
        role="img"
        aria-label={t("chart.ariaLabel")}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="ffmsArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-brand-500)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--color-brand-500)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Gridlines + y labels */}
        {ticks.map((tv, i) => (
          <g key={i}>
            <line
              x1={left}
              x2={W - right}
              y1={y(tv)}
              y2={y(tv)}
              stroke="var(--border)"
              strokeWidth={1}
            />
            <text x={left + 2} y={y(tv) - 4} fontSize="10" fill="var(--text-faint)">
              {formatValue(Math.round(tv))}
            </text>
          </g>
        ))}

        {/* Area + smooth line */}
        <path d={areaPath} fill="url(#ffmsArea)" />
        <path
          d={linePath}
          fill="none"
          stroke="var(--color-brand-600)"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Historical dots */}
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.value)} r={3} fill="var(--color-brand-600)" />
        ))}

        {/* Forecast: dashed connector + highlighted dot */}
        {forecast && lastHistIdx >= 0 && (
          <>
            <line
              x1={x(lastHistIdx)}
              x2={x(n - 1)}
              y1={y(points[lastHistIdx].value)}
              y2={y(forecast.value)}
              stroke="var(--color-brand-800)"
              strokeWidth={2}
              strokeDasharray="5 4"
            />
            <circle
              cx={x(n - 1)}
              cy={y(forecast.value)}
              r={5}
              fill="var(--surface)"
              stroke="var(--color-brand-800)"
              strokeWidth={2.5}
            />
          </>
        )}

        {/* Hover guide + dot */}
        {hover != null && (
          <>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={top}
              y2={top + plotH}
              stroke="var(--text-faint)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <circle
              cx={x(hover)}
              cy={y(series[hover].value)}
              r={5}
              fill="var(--color-brand-600)"
              stroke="var(--surface)"
              strokeWidth={2}
            />
          </>
        )}
      </svg>

      {/* Hover tooltip (HTML overlay) */}
      {hover != null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xl border border-ink-200 dark:border-ink-700 bg-surface px-3 py-2 text-center shadow-float"
          style={{
            left: Math.max(56, Math.min(containerW - 56, tip.left)),
            top: Math.max(8, tip.top - 10),
          }}
        >
          <p className="text-xs font-medium text-ink-500 dark:text-ink-400">
            {series[hover].ym ?? series[hover].label}
          </p>
          <p className="text-sm font-bold text-ink-900 dark:text-ink-50">
            {formatValue(series[hover].value)}
          </p>
        </div>
      )}

      {/* X labels */}
      <div className="mt-1 flex justify-between px-1 text-[10px] text-ink-400 dark:text-ink-500">
        {series.map((p, i) => (
          <span
            key={i}
            className={
              forecast && i === n - 1
                ? "font-semibold text-brand-600 dark:text-brand-400"
                : ""
            }
          >
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}
