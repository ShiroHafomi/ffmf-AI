"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useToast } from "@/components/feedback/Toast";
import { Button, Card } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import type { ActionRow, CutbackLever, AlertRow } from "@/context/HouseholdDataContext";

interface AISuggestion {
  id: string;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  category: "saving" | "budget" | "spending" | "goal" | "tip";
}

const categoryIcons = {
  saving: "trendDown",
  budget: "target",
  spending: "receipt",
  goal: "spark",
  tip: "bulb",
} as const;

export function AISuggestionPanel({
  householdId,
  onRefresh,
}: {
  householdId?: number;
  onRefresh?: () => Promise<void>;
}) {
  const { t } = useLanguage();
  const { authFetch } = useAuth();
  const toast = useToast();
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function generateSuggestions() {
    if (!householdId) {
      toast.info(t("dash.suggestions.noInsights"));
      return;
    }
    setLoading(true);
    try {
      const res = await authFetch(`/api/insights/${householdId}`, {
        method: "GET",
      });
      if (!res.ok) throw new Error("Failed to fetch insights");
      const data = (res.data ?? {}) as {
        cutback_suggestions?: { levers?: CutbackLever[] };
        recommended_actions?: ActionRow[];
        predictions?: {
          expense?: { suggestions?: string[] };
        };
        alert_thresholds?: { result?: { alerts?: AlertRow[] } };
        savings?: { tip?: string };
      };

      const levers = data.cutback_suggestions?.levers ?? [];
      const actions = data.recommended_actions ?? [];
      const predSuggestions = data.predictions?.expense?.suggestions ?? [];
      const alerts = data.alert_thresholds?.result?.alerts ?? [];

      const mapped: AISuggestion[] = [
        ...levers.map((l) => ({
          id: `cutback-${l.id ?? l.lever}`,
          title: `Reduce ${l.lever} spending`,
          description: l.message ?? `Cut ${l.excess ?? l.suggested_cutback ?? 0} from ${l.lever}`,
          priority: "high" as const,
          category: "spending" as const,
        })),
        ...actions.map((a) => ({
          id: `action-${a.id ?? a.type ?? Math.random()}`,
          title: a.text ?? "Action item",
          description: a.text ?? "",
          priority: (a.priority ?? "medium") as "high" | "medium" | "low",
          category: "budget" as const,
        })),
        ...predSuggestions.map((s, i) => ({
          id: `pred-${i}`,
          title: "Forecast tip",
          description: s,
          priority: "medium" as const,
          category: "tip" as const,
        })),
        ...alerts.map((a) => ({
          id: `alert-${a.id ?? a.lever}`,
          title: `Budget alert: ${a.lever}`,
          description: a.message ?? `${a.budget_usage}% of budget used`,
          priority: a.severity === "high" ? ("high" as const) : ("medium" as const),
          category: "budget" as const,
        })),
      ];

      setSuggestions(mapped);
      if (onRefresh) await onRefresh();
      toast.success(t("toast.insightsRefreshed") || "Suggestions refreshed");
    } catch {
      toast.error(t("common.loading") || "Failed to generate suggestions");
    } finally {
      setLoading(false);
    }
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => (prev === id ? null : id));
  }

  return (
    <Card className="card-pad card-hover border-l-4 border-l-brand-500 bg-gradient-to-br from-brand-50/50 to-surface dark:from-brand-soft/10 dark:to-surface">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl brand-gradient text-white shadow-pop">
            <Icon name="spark" className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-base font-semibold text-ink-900 dark:text-ink-50">
              {t("dash.aiSuggestions")}
            </h3>
            <p className="text-xs text-ink-500 dark:text-ink-400">
              {t("dash.aiSuggestionsSub")}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={generateSuggestions}
          disabled={loading}
          className="gap-2"
        >
          {loading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-300 border-t-brand-600" />
              {t("dash.suggestions.loading")}
            </>
          ) : (
            <>
              <Icon name="refreshCw" className="h-4 w-4" />
              {t("dash.suggestions.refresh")}
            </>
          )}
        </Button>
      </div>

      <div className="mt-4 space-y-3">
        {suggestions.length === 0 && !loading && (
          <p className="text-sm text-ink-400 dark:text-ink-500">
            {t("dash.suggestions.noData")}
          </p>
        )}

        {suggestions.map((suggestion) => (
          <div
            key={suggestion.id}
            className="rounded-xl border border-ink-200 dark:border-ink-700 bg-surface/60 p-4 transition hover:bg-surface"
          >
            <div
              className="flex items-start justify-between gap-3 cursor-pointer"
              onClick={() => toggleExpand(suggestion.id)}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Icon
                    name={categoryIcons[suggestion.category]}
                    className="h-4 w-4 text-brand-600 dark:text-brand-400"
                  />
                  <h4 className="text-sm font-semibold text-ink-800 dark:text-ink-100">
                    {suggestion.title}
                  </h4>
                </div>
                <p className="mt-1 text-xs text-ink-500 dark:text-ink-400 line-clamp-2">
                  {suggestion.description}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                  suggestion.priority === "high"
                    ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"
                    : suggestion.priority === "medium"
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                    : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                }`}
              >
                {suggestion.priority}
              </span>
            </div>

            {expanded === suggestion.id && (
              <div className="mt-3 pt-3 border-t border-ink-100 dark:border-ink-800">
                <p className="text-sm text-ink-600 dark:text-ink-300">
                  {suggestion.description}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() =>
                      toast.success(
                        "Action saved — we&apos;ll track your progress!"
                      )
                    }
                  >
                    {t("dash.suggestions.action")}
                  </Button>
                  <Button variant="ghost" size="sm">
                    Dismiss
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
