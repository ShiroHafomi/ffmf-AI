"use client";

import { type ReactNode } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";

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

const PRIORITY_MAP: Record<string, { cls: string; key: string }> = {
  high: { cls: "badge-danger", key: "priority.high" },
  medium: { cls: "badge-warning", key: "priority.medium" },
  low: { cls: "badge-neutral", key: "priority.low" },
};

export function StatusBadge({
  status,
  size = "md",
}: {
  status?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const { t } = useLanguage();
  const s = STATUS_MAP[status ?? ""];
  const sizeClass = { sm: "badge-sm", md: "", lg: "badge-lg" }[size];

  if (!s) {
    return (
      <span className={cn("badge", sizeClass, "badge-neutral")}>
        {status ?? "—"}
      </span>
    );
  }
  return <span className={cn("badge", sizeClass, s.cls)}>{t(s.key)}</span>;
}

export function PriorityBadge({
  priority,
  size = "md",
}: {
  priority?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const { t } = useLanguage();
  const p = PRIORITY_MAP[priority ?? ""];
  const sizeClass = { sm: "badge-sm", md: "", lg: "badge-lg" }[size];

  if (!p) {
    return (
      <span className={cn("badge", sizeClass, "badge-neutral")}>
        {priority ?? "—"}
      </span>
    );
  }
  return <span className={cn("badge", sizeClass, p.cls)}>{t(p.key)}</span>;
}

export function Badge({
  children,
  tone = "neutral",
  size = "md",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "cta" | "success" | "warning" | "danger" | "info";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const toneClasses = {
    neutral: "badge-neutral",
    brand: "badge-brand",
    cta: "badge-cta",
    success: "badge-success",
    warning: "badge-warning",
    danger: "badge-danger",
    info: "badge-info",
  };
  const sizeClass = { sm: "badge-sm", md: "", lg: "badge-lg" }[size];

  return (
    <span className={cn("badge", toneClasses[tone], sizeClass, className)}>
      {children}
    </span>
  );
}