"use client";

import { cn } from "@/lib/utils";

export function ProgressBar({
  value,
  max,
  tone = "brand",
  size = "md",
  showLabel = false,
  labelFormatter,
  className,
}: {
  value: number;
  max: number;
  tone?: "brand" | "success" | "warning" | "danger" | "info";
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  labelFormatter?: (value: number) => string;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const over = max > 0 && value > max;

  const sizeClasses = {
    sm: "h-1",
    md: "h-2",
    lg: "h-3",
  };

  const toneClasses = {
    brand: "bg-brand",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    info: "bg-info",
  };

  return (
    <div className={cn("w-full overflow-hidden rounded-full", sizeClasses[size], className)}>
      <div
        className={cn(
          "h-full rounded-full transition-all duration-500 ease-out",
          over ? "bg-danger" : toneClasses[tone]
        )}
        style={{ width: `${Math.max(pct > 0 ? 2 : 0, pct)}%` }}
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${labelFormatter ? labelFormatter(value) : `${Math.round(pct)}% complete`}`}
      />
      {showLabel && (
        <div className="mt-1 text-xs font-medium text-muted text-end">
          {labelFormatter ? labelFormatter(value) : `${Math.round(pct)}%`}
        </div>
      )}
    </div>
  );
}

export function CircularProgress({
  value,
  max = 100,
  tone = "brand",
  size = "md",
  strokeWidth = 4,
  className,
  children,
}: {
  value: number;
  max?: number;
  tone?: "brand" | "success" | "warning" | "danger" | "info";
  size?: "sm" | "md" | "lg" | "xl";
  strokeWidth?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const radius = size === "sm" ? 16 : size === "md" ? 24 : size === "lg" ? 32 : 40;
  const circumference = 2 * Math.PI * (radius - strokeWidth);
  const offset = circumference - (pct / 100) * circumference;

  const sizeClasses = {
    sm: "h-8 w-8",
    md: "h-12 w-12",
    lg: "h-16 w-16",
    xl: "h-20 w-20",
  };

  const toneClasses = {
    brand: "text-brand",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
    info: "text-info",
  };

  return (
    <div className={cn("relative inline-flex items-center justify-center", sizeClasses[size], className)}>
      <svg className="transform -rotate-90" width={radius * 2} height={radius * 2}>
        <circle
          className="text-muted opacity-20"
          strokeWidth={strokeWidth}
          stroke="currentColor"
          fill="transparent"
          r={radius - strokeWidth}
          cx={radius}
          cy={radius}
        />
        <circle
          className={cn(
            "transition-all duration-700 ease-out",
            toneClasses[tone]
          )}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r={radius - strokeWidth}
          cx={radius}
          cy={radius}
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: offset,
          }}
        />
      </svg>
      {children || (
        <span className="absolute text-sm font-semibold text-text">
          {Math.round(pct)}%
        </span>
      )}
    </div>
  );
}