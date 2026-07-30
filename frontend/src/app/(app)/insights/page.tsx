"use client";

import { useState, useMemo } from "react";
import { useHouseholdData } from "@/context/HouseholdDataContext";
import { useLanguage } from "@/context/LanguageContext";
import { fmtMoney } from "@/lib/format";
import {
  Card,
  CardHeader,
  CardContent,
  StatCard,
  TrendArrow,
  TrendChart,
  Donut,
  Badge,
  EmptyState,
  Icon,
  Button,
  Select,
} from "@/components/ui";
import type { TrendPoint } from "@/components/ui/Chart";
import type { DonutSlice } from "@/components/ui/Donut";

const PERIODS = [3, 6, 12] as const;
type Period = 3 | 6 | 12;

export default function InsightsPage() {
  const { t } = useLanguage();
  const { household, expenses, insights, loading } = useHouseholdData();
  const [period, setPeriod] = useState<Period>(6);

  const months = useMemo(() => {
    const now = new Date();
    const arr: Array<{ label: string; total: number; ym: string }> = [];
    for (let i = period - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      arr.push({ label: d.toLocaleDateString(undefined, { month: "short", year: "numeric" }), total: 0, ym });
    }
    return arr;
  }, [period]);

  // Sum expenses per month for the selected period
  const monthsWithTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const e of expenses) {
      const ym = (e.expense_date ?? "").slice(0, 7);
      if (months.some((m) => m.ym === ym)) {
        totals.set(ym, (totals.get(ym) ?? 0) + Number(e.amount || 0));
      }
    }
    return months.map((m) => ({ ...m, total: totals.get(m.ym) ?? 0 }));
  }, [expenses, months]);

  const chartPoints: TrendPoint[] = useMemo(
    () => monthsWithTotals.map((m) => ({ label: m.label, value: m.total, ym: m.ym })),
    [monthsWithTotals]
  );

  // Forecast point (next month)
  const forecastPoint = useMemo(() => {
    if (!insights?.predictions?.expense?.predicted) return undefined;
    return {
      label: t("ins.forecast"),
      value: insights.predictions.expense.predicted,
      ym: "",
    };
  }, [insights, t]);

  const pred = insights?.predictions?.expense;
  const income = insights?.predictions?.income;
  const savings = insights?.savings;
  const anomalies = insights?.anomalies;
  const actions = insights?.recommended_actions;
  const categoryData = insights?.category_analysis?.categories;

  const donutSlices = useMemo(() => {
    if (!categoryData?.length) return [];
    return categoryData.map((c, i) => ({
      name: c.name,
      value: c.spent,
      color: `hsl(${(i * 360) / categoryData.length} 70% 50%)`,
    }));
  }, [categoryData]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="stagger-grid" style={{ "--item-count": 4 } as React.CSSProperties}>
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} variant="glass" className="skeleton">
              <CardContent className="h-24" />
            </Card>
          ))}
        </div>
        <Card variant="glass" className="skeleton">
          <CardContent className="h-80" />
        </Card>
        <div className="grid gap-6 lg:grid-cols-3">
          <Card variant="glass" className="skeleton lg:col-span-2">
            <CardContent className="h-80" />
          </Card>
          <Card variant="glass" className="skeleton">
            <CardContent className="h-48" />
          </Card>
          <Card variant="glass" className="skeleton">
            <CardContent className="h-60" />
          </Card>
        </div>
      </div>
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

  return (
    <div className="mx-auto max-w-6xl space-y-6 fade-in">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-display font-bold gradient-text">{t("ins.title")}</h1>
          <p className="text-muted mt-1">{t("ins.subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={period}
            onChange={(e) => setPeriod(Number(e.target.value) as Period)}
            options={[
              { value: "3", label: t("ins.period3") },
              { value: "6", label: t("ins.period6") },
              { value: "12", label: t("ins.period12") },
            ]}
            placeholder={t("ins.period")}
            className="w-40"
          />
          <Button variant="ghost" size="sm" onClick={() => window.location.reload()}>
            <Icon name="refreshCw" className="h-4 w-4 mr-2" />
            {t("common.refresh")}
          </Button>
        </div>
      </div>

      {/* Not enough data state */}
      {!pred?.predicted && (
        <div className="card card-padded text-center py-12 animate-slide-up">
          <Icon name="barChart2" className="mx-auto h-16 w-16 text-muted/50 mb-4" />
          <h2 className="text-lg font-semibold text-text mb-2">{t("ins.notEnoughHistory")}</h2>
          <p className="text-muted mb-6 max-w-md mx-auto">{t("ins.notEnoughHistoryHint")}</p>
        </div>
      )}

      {/* Prediction Stats Grid */}
      <div className="stagger-grid" style={{ "--item-count": 4 } as React.CSSProperties}>
        {/* Predicted Spend */}
        <Card variant="glass" className="card-hover">
          <CardHeader
            title={t("ins.predictedSpend")}
            icon={<Icon name="spark" className="h-5 w-5" />}
            action={
              <div className="flex items-center gap-2">
                {pred?.method === "rag" ? (
                  <Badge tone="brand" size="sm">{t("ins.methodClaude")}</Badge>
                ) : (
                  <Badge tone="neutral" size="sm">{t("ins.methodLinear")}</Badge>
                )}
                {pred?.confidence != null && (
                  <Badge tone="neutral" size="sm">
                    {t("ins.conf", { value: Math.round(Number(pred.confidence) * 100) })}
                  </Badge>
                )}
              </div>
            }
          />
          <CardContent>
            <StatCard
              label={t("ins.nextMonth")}
              hero
              value={fmtMoney(pred?.predicted ?? 0)}
              trend={pred?.increase_percent != null ? (
                <TrendArrow percent={pred.increase_percent} goodWhenUp={false} />
              ) : null}
              sub={pred?.last_month != null ? `${t("ins.lastMonth")}: ${fmtMoney(pred.last_month)}` : t("ins.noData")}
            />
          </CardContent>
        </Card>

        {/* Budget */}
        <Card variant="glass" className="card-hover">
          <CardHeader title={t("ins.budget")} icon={<Icon name="target" className="h-5 w-5" />} />
          <CardContent>
            <StatCard
              label={t("ins.budget")}
              value={fmtMoney(insights?.predictions?.budget ?? 0)}
              sub={
                pred?.status === "warning" ? (
                  <span className="text-xs text-warning">{t("status.overBudget")}</span>
                ) : (
                  <span className="text-xs text-success">{t("status.onTrack")}</span>
                )
              }
            />
          </CardContent>
        </Card>

        {/* Last Month */}
        <Card variant="glass" className="card-hover">
          <CardHeader title={t("ins.lastMonth")} icon={<Icon name="wallet" className="h-5 w-5" />} />
          <CardContent>
            <StatCard label={t("ins.lastMonth")} value={fmtMoney(pred?.last_month ?? 0)} sub={t("ins.actualSpend")} />
          </CardContent>
        </Card>

        {/* Income Forecast */}
        <Card variant="glass" className="card-hover">
          <CardHeader title={t("ins.incomeForecast")} icon={<Icon name="trendUp" className="h-5 w-5" />} />
          <CardContent>
            <StatCard
              label={t("ins.incomeForecast")}
              value={income?.predicted != null ? fmtMoney(income.predicted) : "—"}
              trend={income?.increase_percent != null ? (
                <TrendArrow percent={income.increase_percent} goodWhenUp />
              ) : null}
              sub={income?.predicted != null ? t("ins.projected") : t("ins.noData")}
            />
          </CardContent>
        </Card>
      </div>

      {/* Trend Chart + AI Reasoning */}
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Expense Forecast Chart */}
        <Card variant="glass">
          <CardHeader
            title={t("ins.expenseForecast")}
            subtitle={t("ins.expenseForecastSub")}
            action={
              <div className="inline-flex items-center rounded-lg border border-border bg-surface p-0.5 text-xs font-medium" role="group" aria-label={t("ins.period")}>
                {PERIODS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`rounded-md px-2.5 py-1 transition ${
                      period === p
                        ? "bg-brand-600 text-white"
                        : "text-muted hover:text-text dark:hover:text-text"
                    }`}
                  >
                    {t(`ins.period${p}`)}
                  </button>
                ))}
              </div>
            }
          />
          <CardContent className="h-80">
            {chartPoints.length > 0 ? (
              <TrendChart points={chartPoints} forecast={forecastPoint} />
            ) : (
              <EmptyState title={t("ins.noData")} hint={t("ins.notEnoughHistoryHint")} className="h-full" />
            )}
          </CardContent>
        </Card>

        {/* AI Reasoning Panel */}
        {pred?.explanation && (
          <Card variant="glass" className="border-l-4 border-l-brand-500/50">
            <CardHeader
              title={t("ins.aiReasoning")}
              subtitle={t("ins.aiReasoningSub")}
              action={
                <div className="flex gap-1.5">
                  <Badge tone={pred.method === "rag" ? "brand" : "neutral"} size="sm">
                    {pred.method === "rag" ? t("ins.methodClaude") : t("ins.methodLinear")}
                  </Badge>
                  {pred.confidence && (
                    <Badge tone="neutral" size="sm">
                      {t("ins.conf", { value: Math.round(Number(pred.confidence) * 100) })}
                    </Badge>
                  )}
                </div>
              }
            />
            <CardContent>
              <p className="text-sm text-text/80 mb-3">{pred.explanation}</p>
              {pred.suggestions && pred.suggestions.length > 0 && (
                <ul className="space-y-1.5" role="list">
                  {pred.suggestions.map((s: string, i: number) => (
                    <li key={i} className="flex gap-2 text-sm text-text/70">
                      <span className="mt-0.5 text-brand-500" aria-hidden="true">•</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Category Mix + Right Column */}
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Spending by Category */}
        <Card variant="glass">
          <CardHeader title={t("ins.categoryMix")} subtitle={t("ins.categoryMixSub")} />
          <CardContent className="h-72">
            {donutSlices.length > 0 ? (
              <Donut slices={donutSlices} />
            ) : (
              <EmptyState
                title={t("ins.noCategoryData")}
                hint={t("ins.noCategoryDataHint")}
                className="h-full"
              />
            )}
          </CardContent>
        </Card>

        {/* Right Column: Savings + Anomalies */}
        <div className="space-y-6">
          {/* Savings Outlook */}
          <Card variant="glass">
            <CardHeader title={t("ins.savingsOutlook")} icon={<Icon name="wallet" className="h-5 w-5" />} />
            <CardContent className="space-y-4">
              {savings?.surplus != null && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted">{t("ins.status")}</span>
                    <Badge
                      tone={
                        savings.status === "positive" ? "success" : savings.status === "negative" ? "danger" : "neutral"
                      }
                    >
                      {t(`status.${savings.status}`)}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted">{t("ins.netProjection")}</p>
                    <p className={`text-2xl font-bold ${savings.surplus < 0 ? "text-danger" : "text-success"}`}>
                      {fmtMoney(savings.surplus)}
                    </p>
                  </div>
                </>
              )}
              {savings?.tip && (
                <div className="rounded-xl bg-muted/30 p-3 text-sm text-text/80 border border-border/50">
                  {savings.tip}
                </div>
              )}
              {savings?.surplus == null && (
                <EmptyState title={t("ins.noData")} hint={t("ins.setBudgetToSee")} className="py-4" />
              )}
            </CardContent>
          </Card>

          {/* Anomalies */}
          <Card variant="glass">
            <CardHeader title={t("ins.anomalies")} icon={<Icon name="alert" className="h-5 w-5" />} />
            <CardContent>
              {anomalies && anomalies.length > 0 ? (
                <ul className="space-y-2" role="list">
                  {anomalies.map((a, i) => (
                    <li key={i} className="flex items-center justify-between text-sm">
                      <span className="font-medium text-text">{a.month}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted">{fmtMoney(a.amount)}</span>
                        <Badge tone={a.direction === "high" ? "danger" : "success"} size="sm">
                          {(a.deviation_percent ?? 0) > 0 ? "+" : ""}
                          {a.deviation_percent}%
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted text-center py-4">{t("ins.noAnomalies")}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recommended Actions */}
      <Card variant="glass">
        <CardHeader title={t("ins.recommendedActions")} subtitle={t("ins.recommendedActionsSub")} />
        <CardContent>
          {actions && actions.length > 0 ? (
            <ul className="space-y-2" role="list">
              {actions.map((a, i) => (
                <li key={i} className="flex items-start gap-3 rounded-xl bg-muted/30 px-3 py-2.5 border border-border/50">
                  <Badge
                    tone={
                      a.priority === "high" ? "danger" : a.priority === "medium" ? "warning" : "success"
                    }
                    size="sm"
                    className="shrink-0 mt-0.5"
                  >
                    {t(`priority.${a.priority}`)}
                  </Badge>
                  <span className="text-sm text-text/80 flex-1">{a.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted text-center py-4">{t("ins.allSet")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}