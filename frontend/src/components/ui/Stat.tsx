import { type ReactNode } from "react";
import { fmtPercent } from "@/lib/format";

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
  hero = false,
  style,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  trend?: ReactNode;
  icon?: ReactNode;
  accent?: "brand" | "emerald" | "amber" | "red";
  hero?: boolean;
  style?: React.CSSProperties;
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
    <div
      style={style}
      className={`card card-pad fade-in card-hover ${hero ? "card-glow" : ""}`}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-400 dark:text-ink-500">
          {label}
        </p>
        {icon && (
          <span className={`grid h-9 w-9 place-items-center rounded-xl ${ring}`}>
            {icon}
          </span>
        )}
      </div>
      <p
        className={`mt-2 font-bold tracking-tight text-ink-900 dark:text-ink-50 ${
          hero ? "gradient-text text-3xl" : "text-2xl"
        }`}
      >
        {value}
      </p>
      <div className="mt-1 flex items-center gap-2 text-sm text-ink-500 dark:text-ink-400">
        {sub}
        {trend}
      </div>
    </div>
  );
}
