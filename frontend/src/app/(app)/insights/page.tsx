"use client";

import { useHouseholdData } from "@/context/HouseholdDataContext";
import { useLanguage } from "@/context/LanguageContext";

type CatRow = {
  name: string;
  spent: number;
  budget?: number | null;
  budget_usage?: number;
  percent_of_total: number;
};
type ActionRow = { type?: string; priority?: string; text?: string };
type AnomalyRow = {
  month?: string;
  amount?: number;
  deviation_percent?: number;
  direction?: string;
};
import {
  Card,
  CardHeader,
  StatCard,
  TrendArrow,
  TrendChart,
  StatusBadge,
  PriorityBadge,
  ProgressBar,
  EmptyState,
} from "@/components/ui";
import { aggregateByMonth, fmtMoney, fmtNumber } from "@/lib/format";

export default function InsightsPage() {
  const { household, expenses, insights, loading } = useHouseholdData();
  const { t } = useLanguage();

  if (loading) {
    return (
      <div className="grid h-64 place-items-center text-sm text-ink-400">{t("common.loading")}</div>
    );
  }

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
  const months = aggregateByMonth(expenses);
  const forecast = pred?.predicted
    ? { label: t("common.forecast"), value: Number(pred.predicted) }
    : undefined;
  const cats = insights.category_analysis?.categories ?? [];
  const actions = insights.recommended_actions ?? [];
  const anomalies = insights.anomalies ?? [];
  const savings = insights.savings;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Prediction stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label={t("ins.predictedSpend")}
          value={fmtMoney(pred?.predicted)}
          trend={<TrendArrow percent={pred?.increase_percent} goodWhenUp={false} />}
        />
        <StatCard label={t("ins.lastMonth")} value={fmtMoney(pred?.last_month)} />
        <StatCard
          label={t("ins.budget")}
          value={fmtMoney(insights.predictions?.budget)}
          accent={pred?.status === "warning" ? "red" : "brand"}
        />
        <StatCard
          label={t("ins.incomeForecast")}
          value={income?.predicted != null ? fmtMoney(income.predicted) : "—"}
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
          accent="emerald"
        />
      </div>

      {/* Trend chart */}
      <Card className="card-pad">
        <CardHeader
          title={t("ins.expenseForecast")}
          subtitle={t("ins.expenseForecastSub")}
        />
        <TrendChart
          points={months.map((m) => ({ label: m.label, value: m.total }))}
          forecast={forecast}
        />
      </Card>

      {/* AI reasoning (RAG explanation) */}
      {pred?.explanation && (
        <Card className="card-pad">
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
          <p className="text-sm text-ink-700">{pred.explanation}</p>
          {pred.suggestions && pred.suggestions.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {pred.suggestions.map((s: string, i: number) => (
                <li key={i} className="flex gap-2 text-sm text-ink-600">
                  <span className="mt-0.5 text-brand-500">•</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Category breakdown */}
        <Card className="card-pad lg:col-span-2">
          <CardHeader
            title={t("ins.categoryBreakdown")}
            subtitle={t("ins.categoryBreakdownSub")}
          />
          {cats.length === 0 ? (
            <EmptyState title={t("ins.noCategoryData")} hint={t("ins.noCategoryDataHint")} />
          ) : (
            <ul className="space-y-4">
              {cats.map((c: CatRow) => (
                <li key={c.name}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-ink-800">{c.name}</span>
                    <span className="text-ink-500">
                      {fmtMoney(c.spent)}
                      {c.budget ? (
                        <span className="text-ink-400"> / {fmtMoney(c.budget)}</span>
                      ) : null}
                    </span>
                  </div>
                  {c.budget ? (
                    <>
                      <ProgressBar value={Number(c.spent)} max={Number(c.budget)} />
                      <p className="mt-1 text-xs text-ink-400">
                        {t("ins.pctOfCategoryBudget", { pct: fmtNumber(c.budget_usage) })} ·{" "}
                        {t("ins.pctOfTotalSpend", { pct: fmtNumber(c.percent_of_total) })}
                      </p>
                    </>
                  ) : (
                    <>
                      <ProgressBar
                        value={Number(c.percent_of_total)}
                        max={100}
                        tone="amber"
                      />
                      <p className="mt-1 text-xs text-ink-400">
                        {t("ins.pctOfTotalSpend", { pct: fmtNumber(c.percent_of_total) })}
                      </p>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Right column */}
        <div className="space-y-6">
          {/* Savings outlook */}
          <Card className="card-pad">
            <CardHeader title={t("ins.savingsOutlook")} />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-500">{t("dash.status")}</span>
                <StatusBadge status={savings?.status} />
              </div>
              {savings?.surplus != null && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-ink-400">{t("ins.netProjection")}</p>
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
                <p className="rounded-xl bg-ink-50 p-3 text-sm text-ink-600">{savings.tip}</p>
              )}
            </div>
          </Card>

          {/* Anomalies */}
          <Card className="card-pad">
            <CardHeader title={t("ins.anomalies")} />
            {anomalies.length === 0 ? (
              <p className="text-sm text-ink-400">{t("ins.noAnomalies")}</p>
            ) : (
              <ul className="space-y-2">
                {anomalies.map((a: AnomalyRow, i: number) => (
                  <li key={i} className="flex items-center justify-between text-sm">
                    <span className="font-medium text-ink-700">{a.month}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-ink-500">{fmtMoney(a.amount)}</span>
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
          <p className="text-sm text-ink-400">{t("ins.allSet")}</p>
        ) : (
          <ul className="space-y-2">
            {actions.map((a: ActionRow, i: number) => (
              <li key={i} className="flex items-start gap-3 rounded-xl bg-ink-50 px-3 py-2.5">
                <PriorityBadge priority={a.priority} />
                <span className="text-sm text-ink-700">{a.text}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
