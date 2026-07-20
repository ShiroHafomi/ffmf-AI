"use client";

import { useMemo, useState } from "react";
import { useHouseholdData } from "@/context/HouseholdDataContext";
import { useLanguage } from "@/context/LanguageContext";
import { PageSkeleton } from "@/components/feedback/Skeleton";
import {
  Card,
  CardHeader,
  StatCard,
  TrendArrow,
  TrendChart,
  StatusBadge,
  PriorityBadge,
  EmptyState,
  Donut,
  Icon,
  type TrendPoint,
} from "@/components/ui";
import { aggregateByMonth, fmtMoney } from "@/lib/format";

const PERIODS = [3, 6, 12] as const;

export default function InsightsPage() {
  const { household, expenses, insights, loading } = useHouseholdData();
  const { t } = useLanguage();
  const [period, setPeriod] = useState<number>(6);

  const months = useMemo(() => aggregateByMonth(expenses), [expenses]);
  const monthsForPeriod = months.slice(-period);

  const donutSlices = useMemo(() => {
    const yms = new Set(monthsForPeriod.map((m) => m.ym));
    const totals: Record<string, number> = {};
    for (const e of expenses) {
      const ym = (e.expense_date ?? "").slice(0, 7);
      if (!yms.has(ym)) continue;
      const name = e.category_name ?? t("common.uncategorized");
      totals[name] = (totals[name] ?? 0) + Number(e.amount || 0);
    }
    return Object.entries(totals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [expenses, monthsForPeriod, t]);

  if (loading) return <PageSkeleton />;

  if (!household) {
    return (
      <EmptyState
        title={t("household.noneYet")}
        hint={t("household.createFromDashboardTrack")}
      />
    );
  }

  if (!insights) {
    return (
      <EmptyState
        title={t("ins.notEnoughHistory")}
        hint={t("ins.notEnoughHistoryHint")}
      />
    );
  }

  const pred = insights.predictions?.expense;
  const income = insights.predictions?.income;
  const forecast = pred?.predicted
    ? { label: t("common.forecast"), value: Number(pred.predicted) }
    : undefined;
  const actions = insights.recommended_actions ?? [];
  const anomalies = insights.anomalies ?? [];
  const savings = insights.savings;

  const chartPoints: TrendPoint[] = monthsForPeriod.map((m) => ({
    label: m.label,
    value: m.total,
    ym: m.ym,
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Prediction stats */}
      <div className="stagger grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          hero
          style={{ "--i": 0 } as React.CSSProperties}
          label={t("ins.predictedSpend")}
          value={fmtMoney(pred?.predicted)}
          icon={<Icon name="spark" className="h-5 w-5" />}
          trend={<TrendArrow percent={pred?.increase_percent} goodWhenUp={false} />}
        />
        <StatCard style={{ "--i": 1 } as React.CSSProperties} label={t("ins.lastMonth")} value={fmtMoney(pred?.last_month)} icon={<Icon name="wallet" className="h-5 w-5" />} />
        <StatCard
          style={{ "--i": 2 } as React.CSSProperties}
          label={t("ins.budget")}
          value={fmtMoney(insights.predictions?.budget)}
          accent={pred?.status === "warning" ? "red" : "brand"}
          icon={<Icon name="target" className="h-5 w-5" />}
        />
        <StatCard
          style={{ "--i": 3 } as React.CSSProperties}
          label={t("ins.incomeForecast")}
          value={income?.predicted != null ? fmtMoney(income.predicted) : "—"}
          accent="emerald"
          icon={<Icon name="trendUp" className="h-5 w-5" />}
          sub={
            income?.predicted != null ? (
              <span>{t("ins.projected")}</span>
            ) : (
              <span>{t("ins.noData")}</span>
            )
          }
          trend={
            income?.increase_percent != null ? (
              <TrendArrow percent={income.increase_percent} goodWhenUp />
            ) : null
          }
        />
      </div>

      {/* Trend chart */}
      <Card className="card-pad">
        <CardHeader
          title={t("ins.expenseForecast")}
          subtitle={t("ins.expenseForecastSub")}
          action={
            <div className="inline-flex items-center rounded-lg border border-ink-200 dark:border-ink-700 bg-surface p-0.5 text-xs font-medium">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`rounded-md px-2.5 py-1 transition ${
                    period === p
                      ? "bg-brand-600 text-white"
                      : "text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-ink-100"
                  }`}
                >
                  {t(`ins.period${p}`)}
                </button>
              ))}
            </div>
          }
        />
        <TrendChart points={chartPoints} forecast={forecast} />
      </Card>

      {/* AI reasoning (RAG explanation) */}
      {pred?.explanation && (
        <Card className="card-pad border-l-4 border-l-brand-500">
          <CardHeader
            title={t("ins.aiReasoning")}
            subtitle={t("ins.aiReasoningSub")}
            action={
              <div className="flex gap-1.5">
                <span className={pred.method === "rag" ? "badge-brand" : "badge-neutral"}>
                  {pred.method === "rag" ? t("ins.methodClaude") : t("ins.methodLinear")}
                </span>
                {pred.confidence && (
                  <span className="badge-neutral">{t("ins.conf", { value: pred.confidence })}</span>
                )}
              </div>
            }
          />
          <p className="text-sm text-ink-700 dark:text-ink-300">{pred.explanation}</p>
          {pred.suggestions && pred.suggestions.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {pred.suggestions.map((s: string, i: number) => (
                <li key={i} className="flex gap-2 text-sm text-ink-600 dark:text-ink-300">
                  <span className="mt-0.5 text-brand-500">•</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Category breakdown + donut */}
        <Card className="card-pad lg:col-span-2">
          <CardHeader
            title={t("ins.categoryMix")}
            subtitle={t("ins.categoryMixSub")}
          />
          {donutSlices.length === 0 ? (
            <EmptyState title={t("ins.noCategoryData")} hint={t("ins.noCategoryDataHint")} />
          ) : (
            <Donut slices={donutSlices} />
          )}
        </Card>

        {/* Right column */}
        <div className="space-y-6">
          {/* Savings outlook */}
          <Card className="card-pad">
            <CardHeader title={t("ins.savingsOutlook")} />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-500 dark:text-ink-400">{t("dash.status")}</span>
                <StatusBadge status={savings?.status} />
              </div>
              {savings?.surplus != null && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-ink-400 dark:text-ink-500">{t("ins.netProjection")}</p>
                  <p
                    className={`text-xl font-bold ${
                      savings.surplus < 0 ? "text-red-600" : "text-emerald-600"
                    }`}
                  >
                    {fmtMoney(savings.surplus)}
                  </p>
                </div>
              )}
              {savings?.tip && (
                <p className="rounded-xl bg-ink-100 p-3 text-sm text-ink-700 dark:bg-ink-100 dark:text-ink-200">{savings.tip}</p>
              )}
            </div>
          </Card>

          {/* Anomalies */}
          <Card className="card-pad">
            <CardHeader title={t("ins.anomalies")} />
            {anomalies.length === 0 ? (
              <p className="text-sm text-ink-400 dark:text-ink-500">{t("ins.noAnomalies")}</p>
            ) : (
              <ul className="space-y-2">
                {anomalies.map((a: { month?: string; amount?: number; deviation_percent?: number; direction?: string }, i: number) => (
                  <li key={i} className="flex items-center justify-between text-sm">
                    <span className="font-medium text-ink-700 dark:text-ink-200">{a.month}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-ink-500 dark:text-ink-400">{fmtMoney(a.amount)}</span>
                      <span
                        className={`badge ${
                          a.direction === "high" ? "badge-danger" : "badge-success"
                        }`}
                      >
                        {(a.deviation_percent ?? 0) > 0 ? "+" : ""}
                        {a.deviation_percent}%
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {/* Recommended actions */}
      <Card className="card-pad">
        <CardHeader title={t("ins.recommendedActions")} subtitle={t("ins.recommendedActionsSub")} />
        {actions.length === 0 ? (
          <p className="text-sm text-ink-400 dark:text-ink-500">{t("ins.allSet")}</p>
        ) : (
          <ul className="space-y-2">
            {actions.map((a: { type?: string; priority?: string; text?: string }, i: number) => (
              <li key={i} className="flex items-start gap-3 rounded-xl bg-ink-100 px-3 py-2.5 dark:bg-ink-100">
                <PriorityBadge priority={a.priority} />
                <span className="text-sm text-ink-700 dark:text-ink-200">{a.text}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
