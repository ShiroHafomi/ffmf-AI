import { type ReactNode } from "react";
import { useLanguage } from "@/context/LanguageContext";

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

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "success" | "warning" | "danger";
}) {
  const cls =
    tone === "brand"
      ? "badge-brand"
      : tone === "success"
        ? "badge-success"
        : tone === "warning"
          ? "badge-warning"
          : tone === "danger"
            ? "badge-danger"
            : "badge-neutral";
  return <span className={cls}>{children}</span>;
}
