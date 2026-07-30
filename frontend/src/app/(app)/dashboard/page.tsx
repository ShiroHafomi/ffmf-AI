"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useHouseholdData, type Goal } from "@/context/HouseholdDataContext";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { useCan } from "@/lib/permissions";
import { useToast } from "@/components/feedback/Toast";
import { PageSkeleton } from "@/components/feedback/Skeleton";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  StatCard,
  TrendArrow,
  TrendChart,
  StatusBadge,
  ProgressBar,
  EmptyState,
  Icon,
  type IconName,
  Button,
  Input,
  Select,
  Badge,
} from "@/components/ui";
import { aggregateByMonth, fmtMoney, fmtDate } from "@/lib/format";
import { AISuggestionPanel } from "@/components/ai/AISuggestionPanel";
import { AIChat } from "@/components/ai/AIChat";

type GoalsAdd = (name: string, target: number, current?: number) => Promise<void>;

function QuickActionBtn({
  icon,
  label,
  onClick,
  tone = "brand",
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  tone?: "brand" | "emerald" | "amber" | "purple";
}) {
  const toneMap: Record<string, string> = {
    brand: "text-brand-600 hover:bg-brand-50/80 dark:text-brand-400 dark:hover:bg-brand-500/10",
    emerald: "text-emerald-600 hover:bg-emerald-50/80 dark:text-emerald-400 dark:hover:bg-emerald-500/10",
    amber: "text-amber-600 hover:bg-amber-50/80 dark:text-amber-400 dark:hover:bg-amber-500/10",
    purple: "text-purple-600 hover:bg-purple-50/80 dark:text-purple-400 dark:hover:bg-purple-500/10",
  };
  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center gap-2 rounded-xl border border-border bg-surface/50 px-3 py-2 text-sm font-medium
        transition-all duration-200 hover:shadow-sm hover:border-brand-200 dark:hover:border-brand-800
        ${toneMap[tone] ?? toneMap.brand}
      `}
    >
      <Icon name={icon} className="h-4 w-4" />
      {label}
    </button>
  );
}

export default function DashboardPage() {
  const {
    household,
    members,
    budget,
    goals,
    expenses,
    insights,
    loading,
    busy,
    error,
    createHousehold,
    addGoal,
    loadAll,
    clearError,
  } = useHouseholdData();
  const { user, authFetch } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const toast = useToast();
  const canFn = useCan();
  const canManage = canFn("household.manage");
  const membersRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error) {
      toast.error(error);
      clearError();
    }
  }, [error, toast, clearError]);

  if (loading) return <PageSkeleton />;

  if (!household) {
    return <CreateHousehold busy={busy} onCreate={createHousehold} />;
  }

  const pred = insights?.predictions?.expense;
  const months = aggregateByMonth(expenses);
  const forecast = pred?.predicted
    ? { label: t("common.forecast"), value: Number(pred.predicted) }
    : undefined;
  const predictionSuggestions = insights?.predictions?.expense?.suggestions ?? [];
  const alerts = insights?.alert_thresholds?.result?.alerts ?? [];
  const savings = insights?.savings;
  const hasData = expenses.length > 0;

  const recent = [...expenses]
    .sort((a, b) => (b.expense_date ?? "").localeCompare(a.expense_date ?? ""))
    .slice(0, 5);

  const remaining = budget?.remaining ?? 0;
  const budgetProgress = budget?.total_budget
    ? Math.min(100, Math.round((budget.spent_this_month / budget.total_budget) * 100))
    : 0;
  const budgetOver = remaining < 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 sm:px-6">
      {/* Welcome header */}
      <div className="glass-panel rounded-2xl p-4 sm:p-6 fade-in-up">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text tracking-tight">
              {t("dash.welcome", { name: user?.name?.split(" ")[0] ?? t("common.friend") })}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {t("dash.householdDashboard", { name: household.name ?? t("common.unnamed") })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={budgetOver ? "danger" : "success"} className="text-xs">
              {budgetOver ? t("dash.overBudget") : t("dash.onTrack")}
            </Badge>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-lg bg-brand-50/80 px-3 py-1.5 text-xs font-medium text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
              <Icon name="calendar" className="h-3.5 w-3.5" />
              {fmtDate(new Date().toISOString().slice(0, 10))}
            </span>
          </div>
        </div>
      </div>

      {/* Summary stats - glass cards with stagger animation */}
      <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          hero
          style={{ "--i": 0 } as React.CSSProperties}
          label={t("dash.predictedNextMonth")}
          value={fmtMoney(pred?.predicted)}
          icon={<Icon name="spark" className="h-5 w-5" />}
          sub={<span className="text-sm text-muted">{t("dash.vsLastMonth")}</span>}
          trend={<TrendArrow percent={pred?.increase_percent} goodWhenUp={false} />}
        />
        <StatCard
          style={{ "--i": 1 } as React.CSSProperties}
          label={t("dash.lastMonth")}
          value={fmtMoney(pred?.last_month)}
          icon={<Icon name="wallet" className="h-5 w-5" />}
          sub={<span className="text-sm text-muted">{t("dash.actualSpend")}</span>}
        />
        <StatCard
          style={{ "--i": 2 } as React.CSSProperties}
          label={t("dash.monthlyBudget")}
          value={fmtMoney(budget?.total_budget)}
          icon={<Icon name="target" className="h-5 w-5" />}
          sub={
            <>
              <span className="text-sm text-muted">{fmtMoney(budget?.spent_this_month)} {t("dash.spent")}</span>
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-brand-50/80 px-2 py-0.5 text-[10px] font-medium text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
                {budgetProgress}% {t("dash.used")}
              </span>
            </>
          }
        />
        <StatCard
          style={{ "--i": 3 } as React.CSSProperties}
          label={t("dash.remaining")}
          value={fmtMoney(remaining)}
          accent={remaining < 0 ? "danger" : "success"}
          icon={<Icon name="trendUp" className="h-5 w-5" />}
          sub={
            <span className="text-sm text-muted">
              {remaining < 0 ? t("dash.overBudget") : t("dash.leftThisMonth")}
            </span>
          }
        />
      </div>

      {/* Budget progress bar */}
      {budget?.total_budget && (
        <div className="glass-panel rounded-2xl p-4 fade-in-up" style={{ "--staggerIndex": 4 } as React.CSSProperties}>
          <div className="flex items-center justify-between gap-4 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-text">{t("dash.budgetProgress")}</span>
                <span className="text-muted">{fmtMoney(budget.spent_this_month)} / {fmtMoney(budget.total_budget)}</span>
              </div>
            </div>
            <Badge tone={budgetOver ? "danger" : budgetProgress > 80 ? "warning" : "success"} className="text-xs shrink-0">
              {budgetOver ? t("dash.overBudget") : budgetProgress > 80 ? t("dash.nearLimit") : t("dash.onTrack")}
            </Badge>
          </div>
          <ProgressBar
            value={budget.spent_this_month}
            max={budget.total_budget}
            tone={budgetOver ? "danger" : budgetProgress > 80 ? "warning" : "success"}
            size="md"
            showLabel
            labelFormatter={(v) => `${Math.round((v / budget.total_budget) * 100)}%`}
          />
        </div>
      )}

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <QuickActionBtn
          icon="userPlus"
          label={t("dash.addMember")}
          onClick={() => membersRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          tone="brand"
        />
        <QuickActionBtn
          icon="receipt"
          label={t("dash.addExpense")}
          onClick={() => router.push("/expenses")}
          tone="emerald"
        />
        <QuickActionBtn
          icon="target"
          label={t("dash.setBudget")}
          onClick={() => router.push("/expenses")}
          tone="amber"
        />
        <QuickActionBtn
          icon="flag"
          label={t("dash.addGoal")}
          onClick={() => router.push("/dashboard")}
          tone="purple"
        />
      </div>

      {/* Main content grid */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left column - 8/12 on desktop */}
        <div className="lg:col-span-8 space-y-6">
          {/* Spending trend chart */}
          <Card variant="glass" padding="lg">
            <CardHeader
              title={t("dash.spendingTrend")}
              subtitle={t("dash.spendingTrendSub")}
              action={
                <Link href="/insights" className="btn-ghost btn-sm">
                  <Icon name="arrowUpRight" className="h-3.5 w-3.5 mr-1" />
                  {t("common.viewInsights")}
                </Link>
              }
            />
            <CardContent className="pt-0">
              <TrendChart
                points={months.map((m) => ({ label: m.label, value: m.total, ym: m.ym }))}
                forecast={forecast}
              />
              {!insights && (
                <p className="mt-4 text-sm text-center text-muted">{t("dash.add3Months")}</p>
              )}
            </CardContent>
          </Card>

          {/* AI Suggestion Panel */}
          <AISuggestionPanel householdId={household?.id} onRefresh={loadAll} />

          {/* AI Financial Coach Chat */}
          <AIChat householdId={household?.id} />

          {/* Recent expenses */}
          <Card variant="glass" padding="lg" className="hover:shadow-lg transition-shadow duration-300">
            <CardHeader
              title={t("dash.recentExpenses")}
              action={
                <Link href="/expenses" className="btn-ghost btn-sm">
                  <Icon name="arrowUpRight" className="h-3.5 w-3.5 mr-1" />
                  {t("common.manage")}
                </Link>
              }
            />
            <CardContent className="pt-0">
              {recent.length === 0 ? (
                <EmptyState
                  title={t("dash.noExpensesYet")}
                  hint={t("dash.noExpensesHint")}
                  action={
                    <Button variant="primary" size="sm" onClick={() => router.push("/expenses")}>
                      <Icon name="plus" className="h-3.5 w-3.5 mr-1.5" />
                      {t("dash.addExpense")}
                    </Button>
                  }
                />
              ) : (
                <div className="space-y-3">
                  {recent.map((x) => (
                    <div
                      key={x.id}
                      className="flex items-center justify-between gap-4 rounded-xl p-3 hover:bg-neutral-100/50 dark:hover:bg-ink-800/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="shrink-0 grid h-10 w-10 place-items-center rounded-xl bg-brand-50/80 dark:bg-brand-900/30">
                          <Icon name="receipt" className="h-5 w-5 text-brand-600 dark:text-brand-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-text">{fmtMoney(x.amount)}</p>
                          <p className="truncate text-xs text-muted">
                            {x.category_name ?? t("common.uncategorized")}
                            {x.description ? ` · ${x.description}` : ""}
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 text-xs text-muted whitespace-nowrap">
                        {fmtDate(x.expense_date)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column - 4/12 on desktop */}
        <div className="lg:col-span-4 space-y-6">
          {/* AI Summary Card */}
          <Card variant="glass" padding="lg" className="sticky top-24">
            <CardHeader title={t("dash.aiSummary")} />
            <CardContent className="pt-0 space-y-4">
              {!insights ? (
                <EmptyState
                  title={t("dash.notEnoughHistory")}
                  hint={t("dash.notEnoughHistoryHint")}
                  icon={<Icon name="spark" className="h-6 w-6" />}
                />
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted">{t("dash.status")}</span>
                    <StatusBadge status={pred?.status} />
                  </div>
                  <p className="text-sm text-text">{insights.analysis?.message}</p>
                  {insights.savings?.tip && (
                    <div className="rounded-xl border-l-4 border-emerald-500 bg-emerald-50/80 p-3 text-sm text-emerald-800 dark:border-emerald-400 dark:bg-emerald-500/10 dark:text-emerald-300 flex gap-2.5">
                      <Icon name="bulb" className="h-5 w-5 shrink-0 text-emerald-500 dark:text-emerald-400 mt-0.5" />
                      <span>{insights.savings.tip}</span>
                    </div>
                  )}
                  <Link href="/insights" className="btn-primary w-full">
                    <Icon name="arrowUpRight" className="h-3.5 w-3.5 mr-1" />
                    {t("dash.seeFullInsights")}
                  </Link>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Members Panel */}
      <div ref={membersRef}>
        <MembersPanel
          members={members}
          currentUserId={user?.id}
          canManage={canManage}
          onChanged={loadAll}
          authFetch={authFetch}
        />
      </div>

      {/* Goals Card */}
      <GoalsCard goals={goals} canManage={canManage} onAdd={addGoal} busy={busy} />

      {/* Prediction-based suggestions */}
      {predictionSuggestions.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
            {t("dash.suggestions.tip")}
          </h4>
          {predictionSuggestions.map((s: string, i: number) => (
            <div
              key={i}
              className="flex items-start gap-2.5 rounded-xl bg-brand-50/80 p-3 text-sm dark:bg-brand-900/20"
            >
              <Icon name="bulb" className="h-5 w-5 shrink-0 text-brand-500 dark:text-brand-400" />
              <span className="text-text">{s}</span>
            </div>
          ))}
        </div>
      )}

      {/* Budget alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
            {t("dash.suggestions.alert")}
          </h4>
          {alerts.map((a, i) => (
            <div
              key={i}
              className="flex items-start gap-2.5 rounded-xl bg-amber-50/80 p-3 text-sm dark:bg-amber-500/10"
            >
              <Icon name="alert" className="h-5 w-5 shrink-0 text-amber-500 dark:text-amber-400" />
              <span className="text-text">{a.message}</span>
            </div>
          ))}
        </div>
      )}

      {savings?.tip && !hasData && (
        <div className="rounded-xl border-l-4 border-emerald-500 bg-emerald-50/80 p-3 text-sm text-emerald-800 dark:border-emerald-400 dark:bg-emerald-500/10 dark:text-emerald-300">
          {savings.tip}
        </div>
      )}
    </div>
  );
}

/* ---------- Sub-components ---------- */

function CreateHousehold({
  busy,
  onCreate,
}: {
  busy: boolean;
  onCreate: (name: string) => Promise<void>;
}) {
  const { t } = useLanguage();
  const toast = useToast();
  return (
    <div className="mx-auto max-w-md">
      <Card variant="glass" padding="lg" className="fade-in-up">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl brand-gradient text-white shadow-pop">
            <Icon name="home" className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-semibold text-text">{t("dash.createHousehold")}</h2>
          <p className="mt-2 text-sm text-muted">{t("dash.createHouseholdSub")}</p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const name = (new FormData(e.currentTarget).get("name") as string)?.trim();
            if (name) onCreate(name).then(() => toast.success(t("toast.householdCreated")));
          }}
          className="space-y-4"
        >
          <div>
            <label className="label">{t("dash.householdName")}</label>
            <Input
              name="name"
              required
              placeholder={t("dash.householdNamePlaceholder")}
              className="mt-1"
            />
          </div>
          <Button disabled={busy} className="w-full" size="lg">
            {busy ? t("dash.creating") : t("dash.createHouseholdBtn")}
          </Button>
        </form>
      </Card>
    </div>
  );
}

type AuthFetch = (
  path: string,
  opts?: { method?: string; body?: unknown },
) => Promise<{ ok: boolean; status: number; data: unknown }>;

function MembersPanel({
  members,
  currentUserId,
  canManage,
  onChanged,
  authFetch,
}: {
  members: { id: number; email: string; name: string | null; role: string | null }[];
  currentUserId?: number;
  canManage: boolean;
  onChanged: () => Promise<void>;
  authFetch: AuthFetch;
}) {
  const { t } = useLanguage();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"parent" | "child">("child");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function roleText(r: string | null): string {
    switch (r) {
      case "owner":
        return t("role.owner");
      case "parent":
        return t("role.parent");
      case "child":
        return t("role.child");
      default:
        return t("role.readonly");
    }
  }

  async function doAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError("");
    try {
      const r = await authFetch("/api/households/members", {
        method: "POST",
        body: { email: email.trim(), role },
      });
      if (!r.ok) {
        setError((r.data as { error?: string })?.error ?? "Failed to add member");
        return;
      }
      setEmail("");
      toast.success(t("toast.memberAdded"));
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function doSetRole(id: number, nextRole: "parent" | "child") {
    setBusy(true);
    setError("");
    try {
      const r = await authFetch(`/api/households/members/${id}`, {
        method: "PATCH",
        body: { role: nextRole },
      });
      if (!r.ok) {
        setError((r.data as { error?: string })?.error ?? "Failed to update role");
        return;
      }
      toast.success(t("toast.roleUpdated"));
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function doRemove(id: number) {
    setBusy(true);
    setError("");
    try {
      const r = await authFetch(`/api/households/members/${id}`, {
        method: "DELETE",
      });
      if (!r.ok) {
        setError((r.data as { error?: string })?.error ?? "Failed to remove member");
        return;
      }
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card variant="glass" padding="lg" className="fade-in-up">
      <CardHeader
        title={t("members.title")}
        subtitle={t("members.subtitle")}
        action={
          canManage ? (
            <Badge tone="brand" className="text-xs">
              {t("members.manageNote")}
            </Badge>
          ) : (
            <Badge tone="neutral" className="text-xs">
              {t("members.readonlyNote")}
            </Badge>
          )
        }
      />
      {error && (
        <div className="mb-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </div>
      )}

      <ul className="divide-y divide-border" role="list" aria-label={t("members.listLabel")}>
        {members.map((m) => (
          <li
            key={m.id}
            className="flex flex-wrap items-center justify-between gap-3 py-3"
          >
            <div className="min-w-0 flex items-center gap-3">
              <div className="shrink-0 grid h-10 w-10 place-items-center rounded-xl bg-brand-50/80 dark:bg-brand-900/30">
                <span className="font-semibold text-brand-600 dark:text-brand-400 text-sm">
                  {m.email[0].toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium text-text">{m.email}</p>
                <p className="truncate text-xs text-muted flex items-center gap-1.5">
                  {roleText(m.role)}
                  {m.id === currentUserId && (
                    <Badge tone="brand" className="text-[10px] py-0">
                      {t("members.you")}
                    </Badge>
                  )}
                </p>
              </div>
            </div>
            {canManage && m.role !== "owner" && (
              <div className="flex items-center gap-2">
                <Select
                  value={m.role === "parent" ? "parent" : "child"}
                  onChange={(e) => doSetRole(m.id, e.target.value as "parent" | "child")}
                  disabled={busy}
                  className="w-auto py-1.5 text-xs"
                  options={[
                    { value: "parent", label: t("members.roleParent") },
                    { value: "child", label: t("members.roleChild") },
                  ]}
                  aria-label={t("members.setRole")}
                />
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => doRemove(m.id)}
                  disabled={busy}
                  className="h-8"
                >
                  <Icon name="trash2" className="h-4 w-4" />
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {canManage && (
        <form onSubmit={doAdd} className="mt-6 flex flex-wrap items-end gap-3 border-t border-border pt-4">
          <div className="flex-1 min-w-[160px]">
            <label className="label">{t("members.email")}</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="member@example.com"
              className="mt-1"
              required
            />
          </div>
          <div>
            <label className="label">{t("members.role")}</label>
            <Select
              value={role}
              onChange={(e) => setRole(e.target.value as "parent" | "child")}
              className="mt-1 w-32"
              options={[
                { value: "parent", label: t("members.roleParent") },
                { value: "child", label: t("members.roleChild") },
              ]}
            />
          </div>
          <Button disabled={busy} size="md">
            {busy ? t("common.loading") : t("members.addBtn")}
          </Button>
        </form>
      )}
    </Card>
  );
}

function GoalsCard({
  goals,
  canManage,
  onAdd,
  busy,
}: {
  goals: Goal[];
  canManage: boolean;
  onAdd: GoalsAdd;
  busy: boolean;
}) {
  const { t } = useLanguage();
  const toast = useToast();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [current, setCurrent] = useState("");

  async function doAdd(e: React.FormEvent) {
    e.preventDefault();
    const tgt = Number(target);
    if (!name.trim() || !Number.isFinite(tgt) || tgt <= 0) return;
    await onAdd(name.trim(), tgt, Number(current) || 0);
    toast.success(t("toast.goalAdded"));
    setName("");
    setTarget("");
    setCurrent("");
  }

  return (
    <Card variant="glass" padding="lg" className="fade-in-up">
      <CardHeader title={t("goals.title")} subtitle={t("goals.subtitle")} />
      <CardContent className="pt-0">
        {goals.length === 0 ? (
          <EmptyState
            title={t("goals.none")}
            hint={t("goals.noneHint")}
            icon={<Icon name="flag" className="h-6 w-6" />}
            action={
              canManage && (
                <Button variant="primary" size="sm" onClick={() => setName("New Goal")}>
                  <Icon name="plus" className="h-3.5 w-3.5 mr-1.5" />
                  {t("goals.addBtn")}
                </Button>
              )
            }
          />
        ) : (
          <ul className="space-y-4" role="list" aria-label={t("goals.listLabel")}>
            {goals.map((g) => {
              const pct =
                g.target_amount > 0
                  ? Math.min(100, Math.round((g.current_amount / g.target_amount) * 100))
                  : 0;
              const reached = g.current_amount >= g.target_amount;
              return (
                <li key={g.id}>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-medium text-text">{g.name}</span>
                    <span className="text-muted">
                      {fmtMoney(g.current_amount)} / {fmtMoney(g.target_amount)}
                    </span>
                  </div>
                  <ProgressBar
                    value={Number(g.current_amount)}
                    max={Number(g.target_amount)}
                    tone={reached ? "success" : "brand"}
                    size="md"
                    showLabel
                    labelFormatter={(v) => `${Math.round((v / Number(g.target_amount)) * 100)}%`}
                  />
                  <p className="mt-1 text-xs text-muted">
                    {pct}% {reached ? t("goals.reached") : t("goals.ofTarget")}
                  </p>
                </li>
              );
            })}
          </ul>
        )}

        {canManage && (
          <form
            onSubmit={doAdd}
            className="mt-6 flex flex-wrap items-end gap-3 border-t border-border pt-4"
          >
            <div className="min-w-[140px] flex-1">
              <label className="label">{t("goals.name")}</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("goals.namePlaceholder")}
                className="mt-1"
                required
              />
            </div>
            <div>
              <label className="label">{t("goals.target")}</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="0.00"
                className="mt-1 w-28"
                required
              />
            </div>
            <div>
              <label className="label">{t("goals.current")}</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                placeholder="0"
                className="mt-1 w-28"
              />
            </div>
            <Button disabled={busy} size="md">
              {busy ? t("common.loading") : t("goals.addBtn")}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}