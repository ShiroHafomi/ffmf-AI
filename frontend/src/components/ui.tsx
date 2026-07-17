"use client";

import { type ReactNode } from "react";
import { fmtMoney, fmtPercent } from "@/lib/format";
import { useLanguage } from "@/context/LanguageContext";

/* ───────────────────────── Card ───────────────────────── */
export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="card-title">{title}</h2>
        {subtitle && <p className="card-sub mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* ──────────────────── Stat card w/ trend ──────────────── */
export function TrendArrow({
  percent,
  goodWhenUp = false,
}: {
  percent: number | null | undefined;
  goodWhenUp?: boolean;
}) {
  if (percent == null || isNaN(Number(percent))) return null;
  const up = Number(percent) > 0;
  const flat = Number(percent) === 0;
  // Color logic: green if movement matches the "good" direction.
  const good = goodWhenUp ? up : !up;
  const cls = flat
    ? "text-ink-400"
    : good
      ? "text-emerald-600"
      : "text-red-600";
  const arrow = flat ? "→" : up ? "↑" : "↓";
  return (
    <span className={`inline-flex items-center gap-0.5 text-sm font-semibold ${cls}`}>
      <span aria-hidden>{arrow}</span>
      {fmtPercent(percent)}
    </span>
  );
}

export function StatCard({
  label,
  value,
  sub,
  trend,
  icon,
  accent = "brand",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  trend?: ReactNode;
  icon?: ReactNode;
  accent?: "brand" | "emerald" | "amber" | "red";
}) {
  const ring =
    accent === "emerald"
      ? "bg-emerald-50 text-emerald-600"
      : accent === "amber"
        ? "bg-amber-50 text-amber-600"
        : accent === "red"
          ? "bg-red-50 text-red-600"
          : "bg-brand-50 text-brand-600";
  return (
    <div className="card card-pad">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
          {label}
        </p>
        {icon && (
          <span className={`grid h-9 w-9 place-items-center rounded-xl ${ring}`}>
            {icon}
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-ink-900">{value}</p>
      <div className="mt-1 flex items-center gap-2 text-sm text-ink-500">
        {sub}
        {trend}
      </div>
    </div>
  );
}

/* ───────────────────── Progress bar ───────────────────── */
export function ProgressBar({
  value,
  max,
  tone = "brand",
}: {
  value: number;
  max: number;
  tone?: "brand" | "emerald" | "amber" | "red";
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const over = max > 0 && value > max;
  const bar =
    over
      ? "bg-red-500"
      : tone === "emerald"
        ? "bg-emerald-500"
        : tone === "amber"
          ? "bg-amber-500"
          : "bg-brand-500";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
      <div
        className={`h-full rounded-full transition-all ${bar}`}
        style={{ width: `${Math.max(2, pct)}%` }}
      />
    </div>
  );
}

/* ───────────────────── Status badge ───────────────────── */
const STATUS_MAP: Record<string, { cls: string; key: string }> = {
  normal: { cls: "badge-neutral", key: "status.normal" },
  warning: { cls: "badge-warning", key: "status.warning" },
  abnormal: { cls: "badge-danger", key: "status.abnormal" },
  positive: { cls: "badge-success", key: "status.positive" },
  surplus: { cls: "badge-success", key: "status.surplus" },
  deficit: { cls: "badge-danger", key: "status.deficit" },
  break_even: { cls: "badge-neutral", key: "status.breakEven" },
  no_budget: { cls: "badge-neutral", key: "status.noBudget" },
  over_budget: { cls: "badge-danger", key: "status.overBudget" },
};

export function StatusBadge({ status }: { status?: string | null }) {
  const { t } = useLanguage();
  const s = STATUS_MAP[status ?? ""];
  if (!s) return <span className="badge-neutral">{status ?? "—"}</span>;
  return <span className={s.cls}>{t(s.key)}</span>;
}

export function PriorityBadge({ priority }: { priority?: string | null }) {
  const { t } = useLanguage();
  const cls =
    priority === "high"
      ? "badge-danger"
      : priority === "medium"
        ? "badge-warning"
        : "badge-neutral";
  const label =
    priority === "high" || priority === "medium" || priority === "low"
      ? t(`priority.${priority}`)
      : (priority ?? "—");
  return <span className={cls}>{label}</span>;
}

/* ───────────────────── Empty state ────────────────────── */
export function EmptyState({
  title,
  hint,
  icon,
}: {
  title: string;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-ink-200 bg-ink-50/50 px-6 py-10 text-center">
      {icon && <div className="mb-2 text-ink-300">{icon}</div>}
      <p className="text-sm font-medium text-ink-600">{title}</p>
      {hint && <p className="mt-1 text-sm text-ink-400">{hint}</p>}
    </div>
  );
}

/* ───────────────── Trend line chart (SVG) ─────────────── */
export interface TrendPoint {
  label: string;
  value: number;
}

export function TrendChart({
  points,
  forecast,
  height = 260,
  formatValue = fmtMoney,
}: {
  points: TrendPoint[];
  forecast?: TrendPoint;
  height?: number;
  formatValue?: (n: number) => string;
}) {
  const { t } = useLanguage();
  const series = forecast ? [...points, forecast] : points;
  if (series.length === 0) {
    return (
      <div className="grid h-40 place-items-center text-sm text-ink-400">
        {t("chart.notEnough")}
      </div>
    );
  }

  const W = 720;
  const H = height;
  const left = 48;
  const right = 16;
  const top = 16;
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

  const linePath = series
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L ${x(n - 1).toFixed(1)} ${(top + plotH).toFixed(1)} L ${x(0).toFixed(1)} ${(top + plotH).toFixed(1)} Z`;

  const gridCount = 4;
  const ticks = Array.from({ length: gridCount + 1 }, (_, i) => lo + (range * i) / gridCount);

  const lastHistIdx = points.length - 1;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={t("chart.ariaLabel")}
    >
      <defs>
        <linearGradient id="ffmsArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#4f46e5" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Gridlines + y labels */}
      {ticks.map((t, i) => (
        <g key={i}>
          <line
            x1={left}
            x2={W - right}
            y1={y(t)}
            y2={y(t)}
            stroke="#e2e8f0"
            strokeWidth={1}
          />
          <text x={left - 8} y={y(t) + 3} textAnchor="end" fontSize="10" fill="#94a3b8">
            {formatValue(Math.round(t))}
          </text>
        </g>
      ))}

      {/* Area + line */}
      <path d={areaPath} fill="url(#ffmsArea)" />
      <path
        d={linePath}
        fill="none"
        stroke="#4f46e5"
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Historical dots */}
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.value)} r={3.5} fill="#4f46e5">
          <title>{`${p.label}: ${formatValue(p.value)}`}</title>
        </circle>
      ))}

      {/* Forecast: dashed connector + highlighted dot */}
      {forecast && lastHistIdx >= 0 && (
        <>
          <line
            x1={x(lastHistIdx)}
            x2={x(n - 1)}
            y1={y(points[lastHistIdx].value)}
            y2={y(forecast.value)}
            stroke="#6d28d9"
            strokeWidth={2}
            strokeDasharray="5 4"
          />
          <circle
            cx={x(n - 1)}
            cy={y(forecast.value)}
            r={5.5}
            fill="#fff"
            stroke="#6d28d9"
            strokeWidth={2.5}
          >
            <title>{`${forecast.label} (forecast): ${formatValue(forecast.value)}`}</title>
          </circle>
        </>
      )}

      {/* X labels */}
      {series.map((p, i) => (
        <text
          key={`x${i}`}
          x={x(i)}
          y={H - 8}
          textAnchor="middle"
          fontSize="10"
          fill={forecast && i === n - 1 ? "#6d28d9" : "#94a3b8"}
          fontWeight={forecast && i === n - 1 ? 700 : 400}
        >
          {p.label}
        </text>
      ))}
    </svg>
  );
}

/* ───────────────────── Misc icons ─────────────────────── */
export function Icon({ path, className = "h-5 w-5" }: { path: string; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={path} />
    </svg>
  );
}
