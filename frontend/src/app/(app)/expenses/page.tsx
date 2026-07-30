"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useHouseholdData } from "@/context/HouseholdDataContext";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { useCan } from "@/lib/permissions";
import { useToast } from "@/components/feedback/Toast";
import { apiGetText, API_BASE } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
  ProgressBar,
  Badge,
  StatusBadge,
  EmptyState,
  Icon,
  StatCard,
  Input,
  Select,
  SelectOption,
  Button,
  Avatar,
  AvatarGroup,
} from "@/components/ui";
import { fmtMoney, fmtDate, todayISO } from "@/lib/format";

type Category = { id: number; name: string };
type Expense = {
  id: number;
  amount: number;
  expense_date: string;
  category_id: number | null;
  category_name: string | null;
  description: string | null;
  user_id: number | null;
  user_name: string | null;
};

type BudgetInfo = {
  spent_this_month?: number;
  total_budget?: number;
};

type Insights =
  | {
      category_analysis?: {
        categories?: Array<{
          name: string;
          spent: number;
          budget?: number | null;
        }>;
      };
    }
  | null;

type Member = {
  id: number;
  name: string;
  email: string;
  role: string;
};

export default function ExpensesPage() {
  const router = useRouter();
  const { user, token } = useAuth();
  const {
    household,
    categories,
    expenses,
    budget,
    insights,
    loading,
    busy,
    loadAll,
    addExpense,
    setBudget: setBudgetAmount,
    members,
  } = useHouseholdData();
  const { t } = useLanguage();
  const toast = useToast();
  const canFn = useCan();
  const canExpense = canFn("expense.create");
  const canBudget = canFn("budget.manage");
  const canManage = user?.household_role === "admin" || user?.role_id === 1;

  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [budAmount, setBudAmount] = useState("");

  // Add expense form state
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [desc, setDesc] = useState("");
  const [cat, setCat] = useState("");

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const visible = useMemo(() => {
    let arr = expenses;
    if (filter && String(filter) !== "") arr = arr.filter((x) => x.category_id === Number(filter));
    if (search) {
      const q = search.toLowerCase();
      arr = arr.filter(
        (x) =>
          x.description?.toLowerCase().includes(q) ||
          x.category_name?.toLowerCase().includes(q) ||
          String(x.amount).includes(q)
      );
    }
    return arr.sort((a, b) => new Date(b.expense_date).getTime() - new Date(a.expense_date).getTime());
  }, [expenses, filter, search]);

  const spent = budget?.spent_this_month ?? 0;
  const total = budget?.total_budget ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((spent / total) * 100)) : 0;
  const remaining = total - spent;
  const isOverBudget = total > 0 && spent > total;

  const catBudgets = useMemo(() => {
    return (
      insights?.category_analysis?.categories?.filter(
        (c) => c.budget && Number(c.budget) > 0
      ) ?? []
    );
  }, [insights]);

  // Handlers
  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !cat) return;
    try {
      await addExpense({
        amount: Number(amount),
        description: desc.trim() || undefined,
        category_id: cat ? Number(cat) : null,
        expense_date: date,
      });
      toast.success(t("toast.expenseAdded"));
      setAmount("");
      setDesc("");
      setShowAddForm(false);
    } catch {
      toast.error(t("toast.addFailed"));
    }
  };

  const onBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!budAmount) return;
    try {
      await setBudgetAmount(Number(budAmount));
      toast.success(t("toast.budgetSaved"));
      setBudAmount("");
    } catch {
      toast.error(t("toast.saveFailed"));
    }
  };

  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_BASE}/api/expenses/import`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? t("exp.importFailed"));
        return;
      }
      toast.success(
        t("exp.importSuccess", {
          count: String(data.imported ?? 0),
          skipped: String(data.skipped ?? 0),
        })
      );
      loadAll();
    } catch {
      toast.error(t("exp.importFailed"));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const triggerImport = () => fileInputRef.current?.click();

  const onExport = async () => {
    setExporting(true);
    try {
      const csv = await apiGetText("/api/expenses/export", token);
      if (!csv) return;
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `expenses-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("toast.exportSuccess"));
    } catch {
      toast.error(t("toast.exportFailed"));
    } finally {
      setExporting(false);
    }
  };

  const onExportExcel = async () => {
    setExporting(true);
    try {
      const res = await fetch(`${API_BASE}/api/expenses/export/excel`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (!res.ok) {
        toast.error(t("toast.exportFailed"));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `expenses-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("toast.exportSuccess"));
    } catch {
      toast.error(t("toast.exportFailed"));
    } finally {
      setExporting(false);
    }
  };

  if (!household) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Icon name="refreshCw" className="h-8 w-8 animate-spin text-brand" />
      </div>
    );
  }

  // Stagger animation delay helper
  const staggerDelay = (index: number, base = 0) => ({
    style: {
      animationDelay: `${base + index * 50}ms`,
    } as React.CSSProperties,
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      {/* Page Header */}
      <div
        className={cn(
          "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
          mounted ? "fade-in-up" : "opacity-0"
        )}
      >
        <div>
          <h1 className="text-3xl font-bold text-text">{t("exp.title")}</h1>
          <p className="mt-1 text-muted">
            {t("exp.subtitle", { household: user?.name ?? t("common.household") })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canExpense && (
            <Button variant="cta" size="md" onClick={() => setShowAddForm(true)}>
              <Icon name="plus" className="h-4 w-4 mr-2" />
              {t("exp.addExpenseBtn")}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={loadAll}
            disabled={busy}
          >
            <Icon name="refreshCw" className="h-4 w-4 mr-2" />
            {t("common.refresh")}
          </Button>
        </div>
      </div>

      {/* Budget Overview Card */}
      <div {...staggerDelay(0, 100)}>
        <Card variant="elevated" className="overflow-hidden">
          <CardContent className="p-0">
            <div className="grid grid-cols-1 gap-0 md:grid-cols-4">
              {/* Total Spent */}
              <div className="relative p-6 border-r border-border-light dark:border-border-dark md:border-r md:border-b-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {t("exp.thisMonth")}
                </p>
                <p className="mt-2 text-3xl font-bold text-text">
                  {fmtMoney(spent)}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {t("exp.ofBudget", { total: fmtMoney(total) })}
                </p>
              </div>

              {/* Remaining */}
              <div className="relative p-6 border-r border-border-light dark:border-border-dark md:border-r md:border-b-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {t("exp.remaining")}
                </p>
                <p
                  className={cn(
                    "mt-2 text-3xl font-bold",
                    isOverBudget ? "text-danger" : remaining >= 0 ? "text-success" : "text-text"
                  )}
                >
                  {fmtMoney(Math.abs(remaining))}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {isOverBudget ? t("exp.overBudget") : t("exp.underBudget")}
                </p>
              </div>

              {/* Budget Progress */}
              <div className="relative p-6 border-r border-border-light dark:border-border-dark md:border-r md:border-b-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {t("exp.budgetProgress")}
                </p>
                <div className="mt-2">
                  <ProgressBar
                    value={spent}
                    max={total}
                    tone={isOverBudget ? "danger" : total > 0 && pct > 80 ? "warning" : "success"}
                    size="lg"
                    showLabel
                    labelFormatter={() => `${pct}%`}
                  />
                </div>
                <p className="mt-1 text-sm text-muted">
                  {t("exp.used", { pct })}
                </p>
              </div>

              {/* Budget Status Badge */}
              <div className="relative p-6 flex items-center justify-center">
                {total > 0 ? (
                  <Badge
                    tone={
                      isOverBudget
                        ? "danger"
                        : pct > 80
                        ? "warning"
                        : pct > 50
                        ? "info"
                        : "success"
                    }
                    size="lg"
                  >
                    {isOverBudget
                      ? t("exp.statusOver")
                      : pct > 80
                      ? t("exp.statusWarning")
                      : pct > 50
                      ? t("exp.statusOnTrack")
                      : t("exp.statusHealthy")}
                  </Badge>
                ) : (
                  <Badge tone="info" size="lg">
                    {t("exp.noBudgetSet")}
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Expenses Column */}
        <div className="space-y-6 lg:col-span-2">
          {/* Add Expense Form */}
          {showAddForm && (
            <div {...staggerDelay(1, 100)} className="fade-in-up">
              <Card variant="glass">
                <CardHeader
                  title={t("exp.addExpense")}
                  action={
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAddForm(false)}
                      aria-label={t("common.close")}
                    >
                      <Icon name="x" className="h-4 w-4" />
                    </Button>
                  }
                />
                <CardContent>
                  <form onSubmit={onAdd} className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Input
                        label={t("exp.amount")}
                        type="number"
                        step="0.01"
                        min="0"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.00"
                        required
                        error={amount && Number(amount) < 0 ? t("exp.amountPositive") : undefined}
                      />
                      <Input
                        label={t("exp.date")}
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        required
                        max={new Date().toISOString().slice(0, 10)}
                      />
                    </div>
                    <Input
                      label={t("exp.description")}
                      value={desc}
                      onChange={(e) => setDesc(e.target.value)}
                      placeholder={t("exp.descriptionOptional")}
                    />
                    <Select
                      label={t("exp.category")}
                      value={cat}
                      onChange={(e) => setCat(e.target.value)}
                      placeholder={t("exp.uncategorized")}
                      options={[
                        { value: "", label: t("exp.uncategorized") },
                        ...categories.map((c) => ({ value: String(c.id), label: c.name })),
                      ]}
                    />
                    <div className="flex gap-3 pt-2">
                      <Button type="submit" variant="cta" size="md" disabled={busy} className="flex-1">
                        {busy ? t("exp.adding") : t("exp.addExpenseBtn")}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="md"
                        onClick={() => setShowAddForm(false)}
                        className="flex-1"
                      >
                        {t("common.cancel")}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Expenses List Card */}
          <div {...staggerDelay(showAddForm ? 2 : 1, 100)}>
            <Card variant="elevated">
              <CardHeader
                title={t("exp.allExpenses")}
                subtitle={t("exp.shown", { count: visible.length })}
                action={
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative hidden sm:block">
                      <Icon
                        name="search"
                        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none"
                      />
                      <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t("common.searchPlaceholder")}
                        className="pl-9 w-64"
                      />
                    </div>
                    <Select
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      placeholder={t("exp.allCategories")}
                      options={[
                        { value: "", label: t("exp.allCategories") },
                        ...categories.map((c) => ({ value: String(c.id), label: c.name })),
                      ]}
                      className="w-auto min-w-[180px]"
                      size="sm"
                    />
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={onImport}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={triggerImport}
                      disabled={importing}
                      title={t("exp.importExcel")}
                    >
                      <Icon name="upload" className="h-4 w-4 mr-2" />
                      {importing ? t("exp.importing") : t("exp.importExcel")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onExport}
                      disabled={exporting || visible.length === 0}
                      title={t("exp.exportCsv")}
                    >
                      <Icon name="download" className="h-4 w-4 mr-2" />
                      {t("exp.exportCsv")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onExportExcel}
                      disabled={exporting || visible.length === 0}
                      title={t("exp.exportExcel")}
                    >
                      <Icon name="file" className="h-4 w-4 mr-2" />
                      {t("exp.exportExcel")}
                    </Button>
                  </div>
                }
              />
              <CardContent className="p-0">
                {visible.length === 0 ? (
                  <EmptyState
                    icon={<Icon name="receipt" className="h-12 w-12 text-muted" />}
                    title={t("exp.noExpenses")}
                    hint={t("exp.noExpensesHint")}
                    action={
                      canExpense ? (
                        <Button variant="cta" size="md" onClick={() => setShowAddForm(true)}>
                          <Icon name="plus" className="h-4 w-4 mr-2" />
                          {t("exp.addExpenseBtn")}
                        </Button>
                      ) : undefined
                    }
                    className="py-12"
                  />
                ) : (
                  <ul className="divide-y divide-border-light dark:divide-border-dark" role="list">
                    {visible.map((x, idx) => (
                      <li
                        key={x.id}
                        {...staggerDelay(idx, 50)}
                        className="flex items-center justify-between p-4 hover:bg-muted/30 dark:hover:bg-muted/20 transition-colors fade-in"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={cn(
                              "flex h-10 w-10 items-center justify-center rounded-xl shrink-0",
                              x.category_name
                                ? "bg-brand/10 text-brand"
                                : "bg-muted/50 text-muted"
                            )}
                          >
                            <Icon name="tag" className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-text truncate pr-4">
                              {fmtMoney(x.amount)}
                            </p>
                            <p className="text-sm text-muted truncate">
                              {x.category_name ?? t("common.uncategorized")}
                              {x.description ? ` · ${x.description}` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <time className="text-sm text-muted whitespace-nowrap hidden md:block">
                            {fmtDate(x.expense_date)}
                          </time>
                          <time className="text-xs text-muted whitespace-nowrap md:hidden">
                            {fmtDate(x.expense_date)}
                          </time>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6" aria-label="Sidebar">
          {/* Monthly Budget */}
          <div {...staggerDelay(1, 100)}>
            <Card variant="glass">
              <CardHeader title={t("exp.monthlyBudget")} />
              <CardContent className="space-y-4">
                {canBudget ? (
                  <form onSubmit={onBudget} className="space-y-4">
                    <Input
                      label={t("exp.totalBudget")}
                      type="number"
                      step="0.01"
                      min="0"
                      value={budAmount}
                      onChange={(e) => setBudAmount(e.target.value)}
                      placeholder={total ? fmtMoney(total) : "0.00"}
                      hint={total ? t("exp.currentBudget", { amount: fmtMoney(total) }) : undefined}
                    />
                    <Button type="submit" variant="cta" className="w-full" disabled={busy}>
                      {busy ? t("exp.saving") : t("exp.saveBudget")}
                    </Button>
                  </form>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-muted">{t("members.readonlyNote")}</p>
                    {total > 0 && (
                      <div className="p-3 bg-muted/50 rounded-xl border border-border-light dark:border-border-dark">
                        <p className="text-sm text-muted">{t("exp.currentBudget")}</p>
                        <p className="text-2xl font-bold text-text mt-1">{fmtMoney(total)}</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Category Budgets */}
          <div {...staggerDelay(2, 100)}>
            <Card variant="glass">
              <CardHeader title={t("exp.budgetByCategory")} />
              <CardContent>
                {catBudgets.length === 0 ? (
                  <EmptyState
                    icon={<Icon name="target" className="h-12 w-12 text-muted" />}
                    title={t("exp.noCategoryBudgets")}
                    hint={t("exp.noCategoryBudgetsHint")}
                    className="py-8"
                  />
                ) : (
                  <ul className="space-y-4" role="list" aria-label={t("exp.categoryBudgets")}>
                    {catBudgets.map((c, idx) => (
                      <li
                        key={c.name}
                        {...staggerDelay(idx, 50)}
                        className="fade-in-up"
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span className="font-medium text-text">{c.name}</span>
                          <span className="text-sm text-muted">
                            {fmtMoney(c.spent)} / {fmtMoney(c.budget!)}
                          </span>
                        </div>
                        <ProgressBar
                          value={Number(c.spent)}
                          max={Number(c.budget!)}
                          tone={c.spent > Number(c.budget!) ? "danger" : c.spent > Number(c.budget!) * 0.8 ? "warning" : "success"}
                          size="sm"
                          showLabel
                          labelFormatter={(v) =>
                            `${Math.round((v / Number(c.budget!)) * 100)}%`
                          }
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Members Summary */}
          {canManage && members.length > 0 && (
            <div {...staggerDelay(3, 100)}>
              <Card variant="glass">
                <CardHeader
                  title={t("exp.members")}
                  action={
                    <Button variant="ghost" size="sm" onClick={() => router.push("/settings?tab=members")}>
                      <Icon name="user" className="h-4 w-4 mr-2" />
                      {t("common.manage")}
                    </Button>
                  }
                />
                <CardContent>
                  <AvatarGroup max={4} size="md">
                    {members.slice(0, 4).map((m) => (
                      <Avatar key={m.id} name={m.name ?? "User"} size="md" />
                    ))}
                    {members.length > 4 && (
                      <Avatar size="md" fallback={`${members.length - 4}+`} />
                    )}
                  </AvatarGroup>
                  <p className="mt-3 text-sm text-muted text-center">
                    {members.length} {t("exp.membersCount")}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Quick Stats */}
          <div {...staggerDelay(4, 100)}>
            <Card variant="glass">
              <CardHeader title={t("exp.quickStats")} />
              <CardContent className="grid grid-cols-2 gap-4">
                <StatCard
                  label={t("exp.totalExpenses")}
                  value={expenses.length}
                  sub={<span className="text-xs text-muted">{t("exp.thisMonth")}</span>}
                  className="py-3"
                />
                <StatCard
                  label={t("exp.categoriesUsed")}
                  value={categories.length}
                  className="py-3"
                />
                <StatCard
                  label={t("exp.avgExpense")}
                  value={
                    expenses.length > 0
                      ? fmtMoney(expenses.reduce((a, b) => a + b.amount, 0) / expenses.length)
                      : fmtMoney(0)
                  }
                  className="py-3"
                />
                <StatCard
                  label={t("exp.topCategory")}
                  value={
                    categories.length > 0
                      ? categories[0]?.name ?? t("common.none")
                      : t("common.none")
                  }
                  className="py-3"
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Mobile Search Bar */}
      <div className="lg:hidden fixed bottom-4 left-4 right-4 z-50 animate-slide-up">
        <div className="max-w-md mx-auto glass-panel rounded-2xl p-3 shadow-xl">
          <div className="relative">
            <Icon
              name="search"
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("common.searchPlaceholder")}
              className="pl-9"
            />
          </div>
        </div>
      </div>
    </div>
  );
}