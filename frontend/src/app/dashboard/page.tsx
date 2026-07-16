'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

interface Household {
  id: number;
  name: string | null;
  description: string | null;
  owner_id: number | null;
  owner_email: string | null;
}
interface Member {
  id: number;
  email: string;
  name: string | null;
  role: string | null;
  joined_at: string;
}
interface Category {
  id: number;
  name: string;
  type: string | null;
}
interface Expense {
  id: number;
  amount: number;
  description: string | null;
  expense_date: string;
  category_id: number | null;
  category_name: string | null;
  user_id: number | null;
}
interface BudgetInfo {
  month: number;
  year: number;
  budgets: any[];
  total_budget: number;
  spent_this_month: number;
  remaining: number;
}
interface Insights {
  predictions?: any;
  analysis?: any;
  anomalies?: any[];
  savings?: any;
  recommended_actions?: any[];
  category_analysis?: any;
}

function fmt(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return '—';
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function DashboardPage() {
  const { user, logout, authFetch, refreshUser } = useAuth();
  const router = useRouter();

  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [budget, setBudget] = useState<BudgetInfo | null>(null);
  const [insights, setInsights] = useState<Insights | null>(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Create-household form
  const [hhName, setHhName] = useState('');

  // Add-expense form
  const [exAmount, setExAmount] = useState('');
  const [exDesc, setExDesc] = useState('');
  const [exCat, setExCat] = useState('');
  const [exDate, setExDate] = useState(today());

  // Budget form
  const [budAmount, setBudAmount] = useState('');

  const loadDetails = useCallback(
    async (hhId: number) => {
      const [cats, exp, bud, ins] = await Promise.all([
        authFetch<{ categories: Category[] }>('/api/categories'),
        authFetch<{ expenses: Expense[] }>('/api/expenses'),
        authFetch<BudgetInfo>('/api/budgets'),
        authFetch<Insights>(`/api/insights/${hhId}`),
      ]);
      if (cats.ok) setCategories(cats.data.categories ?? []);
      if (exp.ok) setExpenses(exp.data.expenses ?? []);
      if (bud.ok) setBudget(bud.data);
      if (ins.ok) setInsights(ins.data);
      else if (ins.status === 400) setInsights(null); // not enough history yet
    },
    [authFetch],
  );

  const loadHousehold = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const r = await authFetch<{ household: Household | null; members: Member[] }>(
        '/api/households/me',
      );
      if (!r.ok) {
        setErr('Failed to load household');
        return;
      }
      setHousehold(r.data.household);
      setMembers(r.data.members ?? []);
      if (r.data.household) await loadDetails(r.data.household.id);
    } finally {
      setLoading(false);
    }
  }, [authFetch, loadDetails]);

  useEffect(() => {
    if (user) loadHousehold();
  }, [user, loadHousehold]);

  async function onCreateHousehold(e: React.FormEvent) {
    e.preventDefault();
    if (!hhName.trim()) return;
    setBusy(true);
    setErr('');
    try {
      const r = await authFetch<{ id: number }>('/api/households', {
        method: 'POST',
        body: { name: hhName.trim() },
      });
      if (!r.ok) {
        setErr((r.data as any)?.error ?? 'Failed to create household');
        return;
      }
      await refreshUser();
      await loadHousehold();
    } finally {
      setBusy(false);
    }
  }

  async function onAddExpense(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(exAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setErr('Enter a valid amount');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const r = await authFetch('/api/expenses', {
        method: 'POST',
        body: {
          amount: amt,
          description: exDesc.trim() || null,
          category_id: exCat ? Number(exCat) : null,
          expense_date: exDate,
        },
      });
      if (!r.ok) {
        setErr((r.data as any)?.error ?? 'Failed to add expense');
        return;
      }
      setExAmount('');
      setExDesc('');
      if (household) await loadDetails(household.id);
    } finally {
      setBusy(false);
    }
  }

  async function onSetBudget(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(budAmount);
    if (!Number.isFinite(amt) || amt < 0) {
      setErr('Enter a valid budget');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const r = await authFetch('/api/budgets', {
        method: 'POST',
        body: { amount: amt },
      });
      if (!r.ok) {
        setErr((r.data as any)?.error ?? 'Failed to set budget');
        return;
      }
      setBudAmount('');
      if (household) await loadDetails(household.id);
    } finally {
      setBusy(false);
    }
  }

  async function onLogout() {
    await logout();
    router.push('/login');
  }

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 p-6">
        <p className="text-sm text-slate-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-slate-500">
            {user?.email} · role {user?.role_id}
          </p>
        </div>
        <button
          onClick={onLogout}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
        >
          Log out
        </button>
      </header>

      {err && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>
      )}

      {/* No household yet */}
      {!household ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-2 text-lg font-medium">Create your household</h2>
          <p className="mb-4 text-sm text-slate-500">
            You need a household to start tracking expenses and get AI insights.
          </p>
          <form onSubmit={onCreateHousehold} className="flex gap-2">
            <input
              value={hhName}
              onChange={(e) => setHhName(e.target.value)}
              placeholder="e.g. The An Family"
              required
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            />
            <button
              disabled={busy}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
            >
              {busy ? '...' : 'Create'}
            </button>
          </form>
        </section>
      ) : (
        <>
          {/* Household + budget summary */}
          <section className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-400">Household</p>
              <p className="mt-1 text-lg font-semibold">{household.name}</p>
              <p className="text-xs text-slate-500">{members.length} member(s)</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-400">Budget this month</p>
              <p className="mt-1 text-lg font-semibold">{fmt(budget?.total_budget)}</p>
              <p className="text-xs text-slate-500">spent {fmt(budget?.spent_this_month)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-400">Remaining</p>
              <p
                className={`mt-1 text-lg font-semibold ${
                  (budget?.remaining ?? 0) < 0 ? 'text-red-600' : ''
                }`}
              >
                {fmt(budget?.remaining)}
              </p>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Add expense */}
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-medium">Add expense</h2>
              <form onSubmit={onAddExpense} className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={exAmount}
                    onChange={(e) => setExAmount(e.target.value)}
                    placeholder="0"
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Description</label>
                  <input
                    value={exDesc}
                    onChange={(e) => setExDesc(e.target.value)}
                    placeholder="optional"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
                  />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="mb-1 block text-sm font-medium">Category</label>
                    <select
                      value={exCat}
                      onChange={(e) => setExCat(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
                    >
                      <option value="">— none —</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="mb-1 block text-sm font-medium">Date</label>
                    <input
                      type="date"
                      value={exDate}
                      onChange={(e) => setExDate(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
                    />
                  </div>
                </div>
                <button
                  disabled={busy}
                  className="w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
                >
                  {busy ? '...' : 'Add expense'}
                </button>
              </form>
            </section>

            {/* Set budget */}
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-medium">Set monthly budget</h2>
              <form onSubmit={onSetBudget} className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">Total budget</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={budAmount}
                    onChange={(e) => setBudAmount(e.target.value)}
                    placeholder="0"
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
                  />
                </div>
                <button
                  disabled={busy}
                  className="w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
                >
                  {busy ? '...' : 'Save budget'}
                </button>
              </form>
              <div className="mt-4">
                <p className="mb-1 text-sm font-medium">Members</p>
                <ul className="space-y-1 text-sm text-slate-600">
                  {members.map((m) => (
                    <li key={m.id} className="flex justify-between">
                      <span>{m.email}</span>
                      <span className="text-slate-400">{m.role}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </div>

          {/* Expense list */}
          <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-medium">Recent expenses</h2>
            {expenses.length === 0 ? (
              <p className="text-sm text-slate-500">No expenses yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {expenses.map((x) => (
                  <li key={x.id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <p className="font-medium">{fmt(x.amount)}</p>
                      <p className="text-xs text-slate-500">
                        {x.category_name ?? 'Uncategorized'}
                        {x.description ? ` · ${x.description}` : ''}
                      </p>
                    </div>
                    <span className="text-xs text-slate-400">{x.expense_date}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* AI insights */}
          <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-medium">AI insights</h2>
            {!insights ? (
              <p className="text-sm text-slate-500">
                Add at least 3 months of expenses to unlock predictions and insights.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Stat label="Predicted" value={fmt(insights.predictions?.expense?.predicted)} />
                  <Stat label="Last month" value={fmt(insights.predictions?.expense?.last_month)} />
                  <Stat label="Budget" value={fmt(insights.predictions?.budget)} />
                  <Stat
                    label="Change"
                    value={`${insights.predictions?.expense?.increase_percent ?? 0}%`}
                  />
                </div>

                {insights.analysis?.message && (
                  <div className="rounded-lg bg-slate-50 p-4">
                    <p className="text-sm font-medium capitalize">
                      {insights.predictions?.expense?.status}
                    </p>
                    <p className="text-sm text-slate-600">{insights.analysis.message}</p>
                    {insights.analysis.suggestion && (
                      <p className="mt-1 text-sm text-slate-500">{insights.analysis.suggestion}</p>
                    )}
                  </div>
                )}

                {insights.savings?.tip && (
                  <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
                    {insights.savings.tip}
                  </div>
                )}

                {insights.anomalies && insights.anomalies.length > 0 && (
                  <div>
                    <p className="mb-1 text-sm font-medium">Anomalies</p>
                    <ul className="space-y-1 text-sm text-slate-600">
                      {insights.anomalies.map((a, i) => (
                        <li key={i}>
                          {a.month}: {a.direction} — {fmt(a.amount)} ({a.deviation_percent}%)
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {insights.recommended_actions && insights.recommended_actions.length > 0 && (
                  <div>
                    <p className="mb-1 text-sm font-medium">Recommended actions</p>
                    <ul className="space-y-1 text-sm text-slate-600">
                      {insights.recommended_actions.map((a, i) => (
                        <li key={i} className="flex gap-2">
                          <span
                            className={`rounded px-1.5 text-xs ${
                              a.priority === 'high'
                                ? 'bg-red-100 text-red-700'
                                : a.priority === 'medium'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {a.priority}
                          </span>
                          <span>{a.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-4">
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 text-lg font-semibold">{value}</dd>
    </div>
  );
}
