"use client";

import { type ReactNode } from "react";
import { fmtPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

interface TrendArrowProps {
  percent: number | null | undefined;
  goodWhenUp?: boolean;
  size?: "sm" | "md" | "lg";
}

export function TrendArrow({ percent, goodWhenUp = false, size = "md" }: TrendArrowProps) {
  if (percent == null || isNaN(Number(percent))) return null;
  const up = Number(percent) > 0;
  const flat = Number(percent) === 0;
  const good = goodWhenUp ? up : !up;

  const sizeClasses = {
    sm: "text-xs gap-1",
    md: "text-sm gap-1.5",
    lg: "text-base gap-2",
  };

  const trendClass = flat
    ? "text-muted"
    : good
      ? "text-success"
      : "text-danger";

  const arrow = flat ? "→" : up ? "↑" : "↓";

  return (
    <span className={cn("inline-flex items-center font-semibold", sizeClasses[size], trendClass)}>
      <span aria-hidden="true">{arrow}</span>
      {fmtPercent(percent)}
    </span>
  );
}

interface StatCardProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  trend?: ReactNode;
  icon?: ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "info";
  accent?: string; // Legacy prop for backward compat
  hero?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function StatCard({
  label,
  value,
  sub,
  trend,
  icon,
  variant = "default",
  accent,
  hero = false,
  className,
  style,
}: StatCardProps) {
  const mappedVariant = accent
    ? ({
        red: "danger",
        emerald: "success",
        brand: "default",
        warning: "warning",
        danger: "danger",
        info: "info",
      } as const)[accent] ?? variant
    : variant;

  const variantClasses = {
    default: "bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400",
    success: "bg-success-soft text-success-text",
    warning: "bg-warning-soft text-warning-text",
    danger: "bg-danger-soft text-danger-text",
    info: "bg-info-soft text-info-text",
  };

  const ringClass = variantClasses[mappedVariant];

  return (
    <div className={cn("card card-padded card-hover fade-in", hero && "card-glow", className)} style={style}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {label}
        </p>
        {icon && (
          <span className={cn("shrink-0 grid h-9 w-9 place-items-center rounded-xl", ringClass)}>
            {icon}
          </span>
        )}
      </div>
      <p
        className={cn(
          "mt-2 font-bold tracking-tight text-text",
          hero && "text-display text-3xl gradient-text",
          !hero && "text-2xl"
        )}
      >
        {value}
      </p>
      <div className="mt-1 flex items-center gap-2 text-sm text-muted">
        {sub}
        {trend}
      </div>
    </div>
  );
}