"use client";

import { useEffect, useMemo, useState } from "react";
import { useHouseholdData } from "@/context/HouseholdDataContext";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { useCan } from "@/lib/permissions";
import { useToast } from "@/components/feedback/Toast";
import { PageSkeleton } from "@/components/feedback/Skeleton";
import { apiGetText } from "@/lib/api";
import {
  Card,
  CardHeader,
  ProgressBar,
  EmptyState,
  Icon,
} from "@/components/ui";
import { fmtMoney, fmtDate, todayISO } from "@/lib/format";

export default function ExpensesPage() {
  const {
    household,
    categories,
    expenses,
    budget,
    insights,
    loading,
    busy,
    error,
    addExpense,
    setBudget,
    clearError,
  } = useHouseholdData();
  const { token } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const canFn = useCan();
  const canExpense = canFn("expense.create");
  const canBudget = canFn("budget.manage");

  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [cat, setCat] = useState("");
  const [date, setDate] = useState(todayISO());
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  const [budAmount, setBudAmount] = useState("");

  async function onExport() {
    setExporting(true);
    try {
      const csv = await apiGetText("/api/expenses/export", token);
      if (!csv) return;
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "expenses.csv";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const sorted = useMemo(
    () =>
      [...expenses].sort((a, b) =>
        (b.expense_date ?? "").localeCompare(a.expense_date ?? ""),
      ),
    [expenses],
  );
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sorted.filter((e) => {
      if (filter && String(e.category_id) !== filter) return false;
      if (q) {
        const hay = `${e.category_name ?? ""} ${e.description ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [sorted, filter, search]);

  // Surface load/action errors as toasts instead of inline banners.
  useEffect(() => {
    if (error) {
      toast.error(error);
      clearError();
    }
  }, [error, toast, clearError]);

  if (loading) return <PageSkeleton />;

  if (!household) {
    return (
      <EmptyState
        title={t("household.noneYet")}
        hint={t("household.createFromDashboard")}
      />
    );
  }

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    await addExpense({
      amount: amt,
      description: desc.trim() || undefined,
      category_id: cat ? Number(cat) : null,
      expense_date: date,
    });
    toast.success(t("toast.expenseAdded"));
    setAmount("");
    setDesc("");
  }

  async function onBudget(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(budAmount);
    if (!Number.isFinite(amt) || amt < 0) return;
    await setBudget(amt);
    toast.success(t("toast.budgetSaved"));
    setBudAmount("");
  }

  const spent = budget?.spent_this_month ?? 0;
  const total = budget?.total_budget ?? 0;
  const catBudgets = (insights?.category_analysis?.categories ?? []).filter(
    (c: { budget?: number | null }) => c.budget && Number(c.budget) > 0,
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Budget summary */}
      <Card className="card-pad card-glow card-hover">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400 dark:text-ink-500">
              {t("exp.thisMonth")}
            </p>
            <p className="mt-1 text-2xl font-bold gradient-text">{fmtMoney(spent)}</p>
            <p className="text-sm text-ink-500 dark:text-ink-400">{t("exp.ofBudget", { total: fmtMoney(total) })}</p>
          </div>
          <div className="min-w-[200px] flex-1">
            <ProgressBar value={spent} max={total} />
            <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
              {total > 0 ? (
                <>
                  {t("exp.remaining", { amount: fmtMoney(total - spent) })} ·{" "}
                  <span className={total - spent < 0 ? "font-medium text-red-600" : ""}>
                    {t("exp.used", { pct: Math.round((spent / total) * 100) })}
                  </span>
                </>
              ) : (
                t("exp.noBudget")
              )}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Expenses + add */}
        <div className="space-y-6 lg:col-span-2">
          {canExpense ? (
            <Card className="card-pad card-hover">
              <CardHeader title={t("exp.addExpense")} />
              <form onSubmit={onAdd} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">{t("exp.amount")}</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      required
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">{t("exp.date")}</label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="input"
                    />
                  </div>
                </div>
                <div>
                  <label className="label">{t("exp.description")}</label>
                  <input
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    placeholder={t("exp.descriptionOptional")}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">{t("exp.category")}</label>
                  <select value={cat} onChange={(e) => setCat(e.target.value)} className="select">
                    <option value="">{t("exp.uncategorized")}</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button disabled={busy} className="btn-primary w-full">
                  {busy ? t("exp.adding") : t("exp.addExpenseBtn")}
                </button>
              </form>
            </Card>
          ) : (
            <Card className="card-pad">
              <p className="text-sm text-ink-500 dark:text-ink-400">{t("members.readonlyNote")}</p>
            </Card>
          )}

          <Card className="card-pad card-hover">
            <CardHeader
              title={t("exp.allExpenses")}
              subtitle={t("exp.shown", { count: visible.length })}
              action={
                <div className="flex items-center gap-2">
                  <button
                    onClick={onExport}
                    disabled={exporting || visible.length === 0}
                    className="btn-ghost btn-sm"
                    title={t("exp.exportCsv")}
                  >
                    {exporting ? t("common.loading") : t("exp.exportCsv")}
                  </button>
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="select w-auto py-1.5 text-xs"
                  >
                    <option value="">{t("exp.allCategories")}</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              }
            />
            <div className="mb-3">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 dark:text-ink-300">
                  <Icon name="search" className="h-4 w-4" />
                </span>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("common.searchPlaceholder")}
                  className="input pl-9 placeholder:text-ink-400 dark:placeholder:text-ink-500"
                />
              </div>
            </div>
            {visible.length === 0 ? (
              <EmptyState title={t("exp.noExpenses")} hint={t("exp.noExpensesHint")} />
            ) : (
              <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                {visible.map((x) => (
                  <li key={x.id} className="flex items-center justify-between rounded-lg px-2 py-3 transition hover:bg-ink-50 dark:hover:bg-ink-100/40">
                    <div className="min-w-0">
                      <p className="font-medium text-ink-800 dark:text-ink-100">{fmtMoney(x.amount)}</p>
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
        </div>

        {/* Budget sidebar */}
        <div className="space-y-6">
          {canBudget ? (
            <Card className="card-pad">
              <CardHeader title={t("exp.monthlyBudget")} />
              <form onSubmit={onBudget} className="space-y-3">
                <div>
                  <label className="label">{t("exp.totalBudget")}</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={budAmount}
                    onChange={(e) => setBudAmount(e.target.value)}
                    placeholder={total ? String(total) : "0.00"}
                    className="input"
                  />
                </div>
                <button disabled={busy} className="btn-primary w-full">
                  {busy ? t("exp.saving") : t("exp.saveBudget")}
                </button>
              </form>
            </Card>
          ) : (
            <Card className="card-pad">
              <CardHeader title={t("exp.monthlyBudget")} />
              <p className="text-sm text-ink-500 dark:text-ink-400">{t("members.readonlyNote")}</p>
            </Card>
          )}

          <Card className="card-pad">
            <CardHeader title={t("exp.budgetByCategory")} />
            {catBudgets.length === 0 ? (
              <p className="text-sm text-ink-400 dark:text-ink-500">{t("exp.noCategoryBudgets")}</p>
            ) : (
              <ul className="space-y-3">
                {catBudgets.map((c: { name: string; spent: number; budget?: number | null }) => (
                  <li key={c.name}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-ink-800 dark:text-ink-100">{c.name}</span>
                      <span className="text-ink-500 dark:text-ink-400">
                        {fmtMoney(c.spent)} / {fmtMoney(c.budget)}
                      </span>
                    </div>
                    <ProgressBar value={Number(c.spent)} max={Number(c.budget)} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
