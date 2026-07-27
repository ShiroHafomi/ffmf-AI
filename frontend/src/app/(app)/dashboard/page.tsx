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
  StatCard,
  TrendArrow,
  TrendChart,
  StatusBadge,
  ProgressBar,
  EmptyState,
  Icon,
} from "@/components/ui";
import { aggregateByMonth, fmtMoney, fmtDate } from "@/lib/format";
import { AISuggestionPanel } from "@/components/ai/AISuggestionPanel";

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

  // Surface load/action errors as toasts instead of inline banners.
  useEffect(() => {
    if (error) {
      toast.error(error);
      clearError();
    }
  }, [error, toast, clearError]);

  if (loading) return <PageSkeleton />;

  /* No household yet */
  if (!household) {
    return <CreateHousehold busy={busy} onCreate={createHousehold} />;
  }

  const pred = insights?.predictions?.expense;
  const months = aggregateByMonth(expenses);
  const forecast = pred?.predicted
    ? { label: t("common.forecast"), value: Number(pred.predicted) }
    : undefined;

  const recent = [...expenses]
    .sort((a, b) => (b.expense_date ?? "").localeCompare(a.expense_date ?? ""))
    .slice(0, 5);

  const remaining = budget?.remaining ?? 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Summary stats */}
      <div className="stagger grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          hero
          style={{ "--i": 0 } as React.CSSProperties}
          label={t("dash.predictedNextMonth")}
          value={fmtMoney(pred?.predicted)}
          icon={<Icon name="spark" className="h-5 w-5" />}
          sub={<span>{t("dash.vsLastMonth")}</span>}
          trend={<TrendArrow percent={pred?.increase_percent} goodWhenUp={false} />}
        />
        <StatCard
          style={{ "--i": 1 } as React.CSSProperties}
          label={t("dash.lastMonth")}
          value={fmtMoney(pred?.last_month)}
          icon={<Icon name="wallet" className="h-5 w-5" />}
          sub={<span>{t("dash.actualSpend")}</span>}
        />
        <StatCard
          style={{ "--i": 2 } as React.CSSProperties}
          label={t("dash.monthlyBudget")}
          value={fmtMoney(budget?.total_budget)}
          icon={<Icon name="target" className="h-5 w-5" />}
          sub={<span>{fmtMoney(budget?.spent_this_month)} {t("dash.spent")}</span>}
        />
        <StatCard
          style={{ "--i": 3 } as React.CSSProperties}
          label={t("dash.remaining")}
          value={fmtMoney(remaining)}
          accent={remaining < 0 ? "red" : "emerald"}
          icon={<Icon name="trendUp" className="h-5 w-5" />}
          sub={<span>{remaining < 0 ? t("dash.overBudget") : t("dash.leftThisMonth")}</span>}
        />
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <QuickActionBtn
          icon="plus"
          label={t("dash.addMember")}
          onClick={() => membersRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          accent="brand"
        />
        <QuickActionBtn
          icon="receipt"
          label={t("dash.addExpense")}
          onClick={() => router.push("/expenses")}
          accent="brand"
        />
        <QuickActionBtn
          icon="target"
          label={t("dash.setBudget")}
          onClick={() => router.push("/expenses")}
          accent="brand"
        />
        <QuickActionBtn
          icon="spark"
          label={t("dash.addGoal")}
          onClick={() => router.push("/dashboard")}
          accent="brand"
        />
      </div>

      {/* Trend chart */}
      <Card className="card-pad">
        <CardHeader
          title={t("dash.spendingTrend")}
          subtitle={t("dash.spendingTrendSub")}
          action={
            <Link href="/insights" className="btn-ghost btn-sm">
              {t("common.viewInsights")}
            </Link>
          }
        />
        <TrendChart
          points={months.map((m) => ({ label: m.label, value: m.total, ym: m.ym }))}
          forecast={forecast}
        />
        {!insights && (
          <p className="mt-3 text-sm text-ink-400 dark:text-ink-500">{t("dash.add3Months")}</p>
        )}
      </Card>

      {/* AI Suggestion Panel — distinct, standalone AI-powered feature */}
      <AISuggestionPanel householdId={household?.id} onRefresh={loadAll} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent expenses */}
        <Card className="card-pad card-hover lg:col-span-2">
          <CardHeader
            title={t("dash.recentExpenses")}
            action={
              <Link href="/expenses" className="btn-ghost btn-sm">
                {t("common.manage")}
              </Link>
            }
          />
          {recent.length === 0 ? (
            <EmptyState title={t("dash.noExpensesYet")} hint={t("dash.noExpensesHint")} />
          ) : (
            <ul className="divide-y divide-ink-100 dark:divide-ink-800">
              {recent.map((x) => (
                <li key={x.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink-800 dark:text-ink-100">{fmtMoney(x.amount)}</p>
                    <p className="truncate text-xs text-ink-400 dark:text-ink-500">
                      {x.category_name ?? t("common.uncategorized")}
                      {x.description ? ` · ${x.description}` : ""}
                    </p>
                  </div>
                  <span className="ml-3 shrink-0 text-xs text-ink-400 dark:text-ink-500">
                    {fmtDate(x.expense_date)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* AI summary */}
        <Card className="card-pad">
          <CardHeader title={t("dash.aiSummary")} />
          {!insights ? (
            <EmptyState title={t("dash.notEnoughHistory")} hint={t("dash.notEnoughHistoryHint")} />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-500 dark:text-ink-400">{t("dash.status")}</span>
                <StatusBadge status={pred?.status} />
              </div>
              <p className="text-sm text-ink-700 dark:text-ink-300">{insights.analysis?.message}</p>
              {insights.savings?.tip && (
                <div className="flex gap-2.5 rounded-xl border-l-4 border-emerald-500 bg-emerald-50/80 p-3 text-sm text-emerald-800 dark:border-emerald-400 dark:bg-emerald-500/10 dark:text-emerald-300">
                  <Icon name="bulb" className="h-5 w-5 shrink-0 text-emerald-500 dark:text-emerald-400" />
                  <span>{insights.savings.tip}</span>
                </div>
              )}
              <Link href="/insights" className="btn-primary w-full">
                {t("dash.seeFullInsights")}
              </Link>
            </div>
          )}
        </Card>
      </div>

      <div ref={membersRef}>
        <MembersPanel
          members={members}
          currentUserId={user?.id}
          canManage={canManage}
          onChanged={loadAll}
          authFetch={authFetch}
        />
      </div>

      <GoalsCard goals={goals} canManage={canManage} onAdd={addGoal} busy={busy} />
    </div>
  );
}

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
      <Card className="card-pad">
        <div className="mb-4 text-center">
          <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl brand-gradient text-white shadow-pop">
            <Icon name="home" className="h-6 w-6" />
          </span>
          <h2 className="text-lg font-semibold text-ink-900 dark:text-ink-50">{t("dash.createHousehold")}</h2>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{t("dash.createHouseholdSub")}</p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const name = (new FormData(e.currentTarget).get("name") as string)?.trim();
            if (name) onCreate(name).then(() => toast.success(t("toast.householdCreated")));
          }}
          className="space-y-3"
        >
          <div>
            <label className="label">{t("dash.householdName")}</label>
            <input name="name" required placeholder={t("dash.householdNamePlaceholder")} className="input" />
          </div>
          <button disabled={busy} className="btn-primary w-full">
            {busy ? t("dash.creating") : t("dash.createHouseholdBtn")}
          </button>
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
    <Card className="card-pad">
      <CardHeader
        title={t("members.title")}
        subtitle={t("members.subtitle")}
        action={
          canManage ? (
            <span className="badge-brand">{t("members.manageNote")}</span>
          ) : (
            <span className="badge-neutral">{t("members.readonlyNote")}</span>
          )
        }
      />
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <ul className="divide-y divide-ink-100 dark:divide-ink-800">
        {members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="font-medium text-ink-800 dark:text-ink-100">
                {m.email}
                {m.id === currentUserId && (
                  <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-soft dark:text-brand-200">
                    {t("members.you")}
                  </span>
                )}
              </p>
              <p className="text-xs text-ink-400 dark:text-ink-500">{roleText(m.role)}</p>
            </div>
            {canManage && m.role !== "owner" && (
              <div className="flex items-center gap-2">
                <select
                  value={m.role === "parent" ? "parent" : "child"}
                  disabled={busy}
                  onChange={(e) => doSetRole(m.id, e.target.value as "parent" | "child")}
                  className="select w-auto py-1.5 text-xs"
                  aria-label={t("members.setRole")}
                >
                  <option value="parent">{t("members.roleParent")}</option>
                  <option value="child">{t("members.roleChild")}</option>
                </select>
                <button
                  onClick={() => doRemove(m.id)}
                  disabled={busy}
                  className="btn-ghost btn-sm text-red-600 hover:bg-red-50"
                >
                  {t("members.remove")}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {canManage && (
        <form onSubmit={doAdd} className="mt-4 flex flex-wrap items-end gap-3 border-t border-ink-100 dark:border-ink-800 pt-4">
          <div className="flex-1">
            <label className="label">{t("members.email")}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="member@example.com"
              className="input"
              required
            />
          </div>
          <div>
            <label className="label">{t("members.role")}</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "parent" | "child")}
              className="select"
            >
              <option value="parent">{t("members.roleParent")}</option>
              <option value="child">{t("members.roleChild")}</option>
            </select>
          </div>
          <button disabled={busy} className="btn-primary">
            {busy ? t("common.loading") : t("members.addBtn")}
          </button>
        </form>
      )}
    </Card>
  );
}

type GoalsAdd = (name: string, target: number, current?: number) => Promise<void>;

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
    <Card className="card-pad">
      <CardHeader title={t("goals.title")} subtitle={t("goals.subtitle")} />
      {goals.length === 0 ? (
        <EmptyState title={t("goals.none")} hint={t("goals.noneHint")} />
      ) : (
        <ul className="space-y-4">
          {goals.map((g) => {
            const pct =
              g.target_amount > 0
                ? Math.min(100, Math.round((g.current_amount / g.target_amount) * 100))
                : 0;
            const reached = g.current_amount >= g.target_amount;
            return (
              <li key={g.id}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-ink-800 dark:text-ink-100">{g.name}</span>
                  <span className="text-ink-500 dark:text-ink-400">
                    {fmtMoney(g.current_amount)} / {fmtMoney(g.target_amount)}
                  </span>
                </div>
                <ProgressBar
                  value={Number(g.current_amount)}
                  max={Number(g.target_amount)}
                  tone={reached ? "emerald" : "brand"}
                />
                <p className="mt-1 text-xs text-ink-400 dark:text-ink-500">
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
          className="mt-4 flex flex-wrap items-end gap-3 border-t border-ink-100 dark:border-ink-800 pt-4"
        >
          <div className="min-w-[140px] flex-1">
            <label className="label">{t("goals.name")}</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("goals.namePlaceholder")}
              className="input"
              required
            />
          </div>
          <div>
            <label className="label">{t("goals.target")}</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="0.00"
              className="input w-32"
              required
            />
          </div>
          <div>
            <label className="label">{t("goals.current")}</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder="0"
              className="input w-32"
            />
          </div>
          <button disabled={busy} className="btn-primary">
            {busy ? t("common.loading") : t("goals.addBtn")}
          </button>
        </form>
      )}
    </Card>
  );
}

function QuickActionBtn({
  icon,
  label,
  onClick,
  accent = "brand",
}: {
  icon: string;
  label: string;
  onClick: () => void;
  accent?: string;
}) {
  const accentMap: Record<string, string> = {
    brand: "text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-soft",
    emerald: "text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-500/10",
    amber: "text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-500/10",
  };
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-surface px-3 py-2 text-sm font-medium transition hover:shadow-sm dark:border-ink-700 ${accentMap[accent] ?? accentMap.brand}`}
    >
      <Icon name={icon as "plus" | "receipt" | "target" | "spark"} className="h-4 w-4" />
      {label}
    </button>
  );
}

function AISuggestions({
  insights,
  householdId,
  onRefresh,
}: {
  insights: any;
  householdId?: number;
  onRefresh: () => Promise<void>;
}) {
  const { t } = useLanguage();
  const toast = useToast();
  const { authFetch } = useAuth();
  const [busy, setBusy] = useState(false);

  const cutbacks = insights?.cutback_suggestions?.levers ?? [];
  const actions = insights?.recommended_actions ?? [];
  const savings = insights?.savings;
  const predictionSuggestions = insights?.predictions?.expense?.suggestions ?? [];
  const alerts = insights?.alert_thresholds?.result?.alerts ?? [];

  const hasData =
    cutbacks.length > 0 ||
    actions.length > 0 ||
    savings != null ||
    predictionSuggestions.length > 0 ||
    alerts.length > 0;

  async function refresh() {
    if (!householdId) return;
    setBusy(true);
    try {
      await authFetch(`/api/insights/${householdId}`, { method: "GET" });
      await onRefresh();
      toast.success(t("toast.insightsRefreshed") || "Insights refreshed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="card-pad border-l-4 border-l-brand-500 bg-gradient-to-br from-brand-50/60 to-surface dark:from-brand-soft/10 dark:to-surface">
      <CardHeader
        title={t("dash.aiSuggestions")}
        subtitle={t("dash.aiSuggestionsSub")}
        action={
          <button
            onClick={refresh}
            disabled={busy}
            className="btn-ghost btn-sm"
          >
            {busy ? t("common.loading") : t("dash.suggestions.refresh")}
          </button>
        }
      />

      {!hasData && !busy && (
        <EmptyState
          title={t("dash.suggestions.noData")}
          hint={t("dash.suggestions.noInsights")}
        />
      )}

      {busy && (
        <div className="flex items-center gap-2 text-sm text-ink-400 dark:text-ink-500">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-ink-300 border-t-brand-600" />
          {t("dash.suggestions.loading")}
        </div>
      )}

      {/* Cutback suggestions */}
      {cutbacks.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-400 dark:text-ink-500">
            {t("dash.suggestions.cutback")}
          </h4>
          {cutbacks.map((c: { lever: string; excess: number; suggested_cutback: number; projected_spent: number; message: string }) => (
            <div
              key={c.lever}
              className="flex items-start gap-2.5 rounded-xl bg-red-50 p-3 text-sm dark:bg-red-500/10"
            >
              <Icon name="trendDown" className="h-5 w-5 shrink-0 text-red-500 dark:text-red-400" />
              <span className="text-ink-700 dark:text-ink-300">{c.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Recommended actions */}
      {actions.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-400 dark:text-ink-500">
            {t("dash.suggestions.action")}
          </h4>
          {actions.map((a: { type?: string; priority?: string; text?: string }, i: number) => (
            <div
              key={i}
              className={`flex items-start gap-2.5 rounded-xl p-3 text-sm ${
                a.priority === "high"
                  ? "bg-red-50 dark:bg-red-500/10"
                  : a.priority === "medium"
                  ? "bg-amber-50 dark:bg-amber-500/10"
                  : "bg-emerald-50 dark:bg-emerald-500/10"
              }`}
            >
              <Icon
                name={a.priority === "high" ? "alert" : a.priority === "medium" ? "bolt" : "check"}
                className={`h-5 w-5 shrink-0 ${
                  a.priority === "high"
                    ? "text-red-500 dark:text-red-400"
                    : a.priority === "medium"
                    ? "text-amber-500 dark:text-amber-400"
                    : "text-emerald-500 dark:text-emerald-400"
                }`}
              />
              <span className="text-ink-700 dark:text-ink-300">{a.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Prediction-based suggestions */}
      {predictionSuggestions.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-400 dark:text-ink-500">
            {t("dash.suggestions.tip")}
          </h4>
          {predictionSuggestions.map((s: string, i: number) => (
            <div
              key={i}
              className="flex items-start gap-2.5 rounded-xl bg-brand-50 p-3 text-sm dark:bg-brand-soft/20"
            >
              <Icon name="bulb" className="h-5 w-5 shrink-0 text-brand-500 dark:text-brand-400" />
              <span className="text-ink-700 dark:text-ink-300">{s}</span>
            </div>
          ))}
        </div>
      )}

      {/* Budget alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-400 dark:text-ink-500">
            {t("dash.suggestions.alert")}
          </h4>
          {alerts.map((a: { lever: string; budget_usage: number; threshold: number; message: string }, i: number) => (
            <div
              key={i}
              className="flex items-start gap-2.5 rounded-xl bg-amber-50 p-3 text-sm dark:bg-amber-500/10"
            >
              <Icon name="alert" className="h-5 w-5 shrink-0 text-amber-500 dark:text-amber-400" />
              <span className="text-ink-700 dark:text-ink-300">{a.message}</span>
            </div>
          ))}
        </div>
      )}

      {savings?.tip && !hasData && (
        <div className="rounded-xl border-l-4 border-emerald-500 bg-emerald-50/80 p-3 text-sm text-emerald-800 dark:border-emerald-400 dark:bg-emerald-500/10 dark:text-emerald-300">
          {savings.tip}
        </div>
      )}
    </Card>
  );
}
