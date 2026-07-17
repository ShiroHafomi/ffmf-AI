"use client";

import Link from "next/link";
import { useState } from "react";
import { useHouseholdData, type Goal } from "@/context/HouseholdDataContext";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { useCan } from "@/lib/permissions";
import {
  Card,
  CardHeader,
  StatCard,
  TrendArrow,
  TrendChart,
  StatusBadge,
  ProgressBar,
  EmptyState,
} from "@/components/ui";
import { aggregateByMonth, fmtMoney, fmtDate } from "@/lib/format";

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
  } = useHouseholdData();
  const { user, authFetch } = useAuth();
  const { t } = useLanguage();
  const canFn = useCan();
  const canManage = canFn("household.manage");

  if (loading) {
    return (
      <div className="grid h-64 place-items-center text-sm text-ink-400">{t("common.loading")}</div>
    );
  }

  /* No household yet */
  if (!household) {
    return <CreateHousehold busy={busy} error={error} onCreate={createHousehold} />;
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
      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label={t("dash.predictedNextMonth")}
          value={fmtMoney(pred?.predicted)}
          sub={<span>{t("dash.vsLastMonth")}</span>}
          trend={<TrendArrow percent={pred?.increase_percent} goodWhenUp={false} />}
        />
        <StatCard
          label={t("dash.lastMonth")}
          value={fmtMoney(pred?.last_month)}
          sub={<span>{t("dash.actualSpend")}</span>}
        />
        <StatCard
          label={t("dash.monthlyBudget")}
          value={fmtMoney(budget?.total_budget)}
          sub={<span>{fmtMoney(budget?.spent_this_month)} {t("dash.spent")}</span>}
        />
        <StatCard
          label={t("dash.remaining")}
          value={fmtMoney(remaining)}
          accent={remaining < 0 ? "red" : "emerald"}
          sub={<span>{remaining < 0 ? t("dash.overBudget") : t("dash.leftThisMonth")}</span>}
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
          points={months.map((m) => ({ label: m.label, value: m.total }))}
          forecast={forecast}
        />
        {!insights && (
          <p className="mt-3 text-sm text-ink-400">{t("dash.add3Months")}</p>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent expenses */}
        <Card className="card-pad lg:col-span-2">
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
            <ul className="divide-y divide-ink-100">
              {recent.map((x) => (
                <li key={x.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink-800">{fmtMoney(x.amount)}</p>
                    <p className="truncate text-xs text-ink-400">
                      {x.category_name ?? t("common.uncategorized")}
                      {x.description ? ` · ${x.description}` : ""}
                    </p>
                  </div>
                  <span className="ml-3 shrink-0 text-xs text-ink-400">
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
                <span className="text-sm text-ink-500">{t("dash.status")}</span>
                <StatusBadge status={pred?.status} />
              </div>
              <p className="text-sm text-ink-700">{insights.analysis?.message}</p>
              {insights.savings?.tip && (
                <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
                  {insights.savings.tip}
                </div>
              )}
              <Link href="/insights" className="btn-primary w-full">
                {t("dash.seeFullInsights")}
              </Link>
            </div>
          )}
        </Card>
      </div>

      <MembersPanel
        members={members}
        currentUserId={user?.id}
        canManage={canManage}
        onChanged={loadAll}
        authFetch={authFetch}
      />

      <GoalsCard goals={goals} canManage={canManage} onAdd={addGoal} busy={busy} />
    </div>
  );
}

function CreateHousehold({
  busy,
  error,
  onCreate,
}: {
  busy: boolean;
  error: string;
  onCreate: (name: string) => Promise<void>;
}) {
  const { t } = useLanguage();
  return (
    <div className="mx-auto max-w-md">
      <Card className="card-pad">
        <div className="mb-4 text-center">
          <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl brand-gradient text-white shadow-[var(--shadow-pop)]">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 13h4v8H3zM10 8h4v13h-4zM17 3h4v18h-4z" />
            </svg>
          </span>
          <h2 className="text-lg font-semibold text-ink-900">{t("dash.createHousehold")}</h2>
          <p className="mt-1 text-sm text-ink-500">{t("dash.createHouseholdSub")}</p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const name = (new FormData(e.currentTarget).get("name") as string)?.trim();
            if (name) onCreate(name);
          }}
          className="space-y-3"
        >
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
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

      <ul className="divide-y divide-ink-100">
        {members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="font-medium text-ink-800">
                {m.email}
                {m.id === currentUserId && (
                  <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                    {t("members.you")}
                  </span>
                )}
              </p>
              <p className="text-xs text-ink-400">{roleText(m.role)}</p>
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
        <form onSubmit={doAdd} className="mt-4 flex flex-wrap items-end gap-3 border-t border-ink-100 pt-4">
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
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [current, setCurrent] = useState("");

  async function doAdd(e: React.FormEvent) {
    e.preventDefault();
    const tgt = Number(target);
    if (!name.trim() || !Number.isFinite(tgt) || tgt <= 0) return;
    await onAdd(name.trim(), tgt, Number(current) || 0);
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
                  <span className="font-medium text-ink-800">{g.name}</span>
                  <span className="text-ink-500">
                    {fmtMoney(g.current_amount)} / {fmtMoney(g.target_amount)}
                  </span>
                </div>
                <ProgressBar
                  value={Number(g.current_amount)}
                  max={Number(g.target_amount)}
                  tone={reached ? "emerald" : "brand"}
                />
                <p className="mt-1 text-xs text-ink-400">
                  {pct}%{" "}
                  {reached ? t("goals.reached") : t("goals.ofTarget")}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {canManage && (
        <form
          onSubmit={doAdd}
          className="mt-4 flex flex-wrap items-end gap-3 border-t border-ink-100 pt-4"
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
