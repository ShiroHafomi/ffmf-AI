"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useToast } from "@/components/feedback/Toast";
import { Button, Card, CardHeader, CardContent, Icon, Badge } from "@/components/ui";
import type { ActionRow, CutbackLever, AlertRow } from "@/context/HouseholdDataContext";

interface AISuggestion {
  id: string;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  category: "saving" | "budget" | "spending" | "goal" | "tip";
}

const CATEGORY_ICONS = {
  saving: "trendDown" as const,
  budget: "target" as const,
  spending: "receipt" as const,
  goal: "spark" as const,
  tip: "bulb" as const,
};

/**
 * AI-powered suggestions panel.
 *
 * Fetches `GET /api/insights/:householdId` (Node proxy → FastAPI) via
 * `authFetch` and maps four data sources into a unified suggestion list.
 * Manual refresh — does NOT auto-load.
 */
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
      const res = await authFetch(`/api/insights/${householdId}`, { method: "GET" });
      if (!res.ok) throw new Error("Failed to fetch insights");
      const data = (res.data ?? {}) as {
        cutback_suggestions?: { levers?: CutbackLever[] };
        recommended_actions?: ActionRow[];
        predictions?: { expense?: { suggestions?: string[] } };
        alert_thresholds?: { result?: { alerts?: AlertRow[] } };
      };

      const levers = data.cutback_suggestions?.levers ?? [];
      const actions = data.recommended_actions ?? [];
      const predSuggestions = data.predictions?.expense?.suggestions ?? [];
      const alerts = data.alert_thresholds?.result?.alerts ?? [];

      setSuggestions([
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
          title: t("dash.suggestions.tip"),
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
      ]);

      if (onRefresh) await onRefresh();
      toast.success(t("toast.insightsRefreshed"));
    } catch {
      toast.error(t("aiChat.error"));
    } finally {
      setLoading(false);
    }
  }

  function dismiss(id: string) {
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
    setExpanded((prev) => (prev === id ? null : prev));
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => (prev === id ? null : id));
  }

  return (
    <Card variant="glass" className="fade-in-up">
      <CardHeader
        title={t("dash.aiSuggestions")}
        subtitle={t("dash.aiSuggestionsSub")}
        icon={<Icon name="bulb" className="h-5 w-5" />}
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={generateSuggestions}
            isLoading={loading}
          >
            {!loading && <Icon name="refreshCw" className="h-4 w-4" />}
            {t("dash.suggestions.refresh")}
          </Button>
        }
      />

      <CardContent className="space-y-3 stagger">
        {suggestions.length === 0 && !loading && (
          <p className="text-sm text-muted">{t("dash.suggestions.noData")}</p>
        )}

        {suggestions.map((suggestion) => (
          <div
            key={suggestion.id}
            className="rounded-xl border border-border bg-surface/60 p-4 transition hover:bg-surface"
          >
            <div
              className="flex cursor-pointer items-start justify-between gap-3"
              onClick={() => toggleExpand(suggestion.id)}
              role="button"
              aria-expanded={expanded === suggestion.id}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleExpand(suggestion.id);
                }
              }}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Icon
                    name={CATEGORY_ICONS[suggestion.category]}
                    className="h-4 w-4 text-brand-600 dark:text-brand-400"
                  />
                  <h4 className="text-sm font-semibold text-text">{suggestion.title}</h4>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted">{suggestion.description}</p>
              </div>
              <Badge
                tone={
                  suggestion.priority === "high"
                    ? "danger"
                    : suggestion.priority === "medium"
                      ? "warning"
                      : "success"
                }
                size="sm"
              >
                {suggestion.priority}
              </Badge>
            </div>

            {expanded === suggestion.id && (
              <div className="mt-3 border-t border-border pt-3">
                <p className="text-sm text-muted">{suggestion.description}</p>
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => toast.success(t("dash.suggestions.action"))}
                  >
                    {t("dash.suggestions.action")}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => dismiss(suggestion.id)}>
                    {t("common.dismiss")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}