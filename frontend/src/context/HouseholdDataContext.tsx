"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/context/AuthContext";
import { type User } from "@/lib/api";

export interface Household {
  id: number;
  name: string | null;
  description: string | null;
  owner_id: number | null;
  owner_email: string | null;
}
export interface Member {
  id: number;
  email: string;
  name: string | null;
  role: string | null;
  joined_at: string;
}
export interface Category {
  id: number;
  name: string;
  type: string | null;
}
export interface Expense {
  id: number;
  amount: number;
  description: string | null;
  expense_date: string;
  category_id: number | null;
  category_name: string | null;
  user_id: number | null;
}
export interface BudgetInfo {
  month: number;
  year: number;
  budgets: { id: number; category_id: number | null; amount: number; month: number; year: number }[];
  total_budget: number;
  spent_this_month: number;
  remaining: number;
}

export interface Goal {
  id: number;
  household_id: number;
  name: string;
  target_amount: number;
  current_amount: number;
  created_at: string;
}
export interface Insights {
  household_id?: number;
  predictions?: {
    expense?: PredictionBreakdown;
    income?: PredictionBreakdown | null;
    budget?: number | null;
  };
  analysis?: { message?: string; suggestion?: string };
  anomalies?: AnomalyRow[];
  savings?: { surplus?: number | null; status?: string; tip?: string };
  recommended_actions?: ActionRow[];
  category_analysis?: CategoryAnalysis;
}

type PredictionBreakdown = {
  predicted?: number | null;
  last_month?: number | null;
  increase_percent?: number | null;
  status?: string | null;
  method?: string | null;
  confidence?: string | null;
  explanation?: string | null;
  suggestions?: string[];
};

type AnomalyRow = {
  month?: string;
  amount?: number;
  deviation_percent?: number;
  direction?: string;
};

type ActionRow = { type?: string; priority?: string; text?: string };

type CategoryAnalysis = {
  categories?: {
    name: string;
    spent: number;
    budget?: number | null;
    budget_usage?: number;
    percent_of_total: number;
  }[];
  overspent_categories?: unknown[];
  suggestions?: unknown[];
  total_budget?: number;
};

interface HouseholdDataValue {
  user: User | null;
  household: Household | null;
  members: Member[];
  categories: Category[];
  expenses: Expense[];
  budget: BudgetInfo | null;
  goals: Goal[];
  insights: Insights | null;
  loading: boolean;
  busy: boolean;
  error: string;
  loadAll: () => Promise<void>;
  createHousehold: (name: string) => Promise<void>;
  addExpense: (p: {
    amount: number;
    description?: string;
    category_id?: number | null;
    expense_date: string;
  }) => Promise<void>;
  addGoal: (name: string, target: number, current?: number) => Promise<void>;
  setBudget: (amount: number) => Promise<void>;
  clearError: () => void;
}

const Ctx = createContext<HouseholdDataValue | null>(null);

export function HouseholdDataProvider({ children }: { children: ReactNode }) {
  const { user, authFetch, refreshUser } = useAuth();

  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [budget, setBudget] = useState<BudgetInfo | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const hh = await authFetch<{ household: Household | null; members: Member[] }>(
        "/api/households/me",
      );
      if (!hh.ok) {
        setError("Failed to load household");
        return;
      }
      setHousehold(hh.data.household);
      setMembers(hh.data.members ?? []);
      const hhId = hh.data.household?.id;
      if (!hhId) return;

      const [cats, exp, bud, ins, gl] = await Promise.all([
        authFetch<{ categories: Category[] }>("/api/categories"),
        authFetch<{ expenses: Expense[] }>("/api/expenses"),
        authFetch<BudgetInfo>("/api/budgets"),
        authFetch<Insights>(`/api/insights/${hhId}`),
        authFetch<{ goals: Goal[] }>("/api/goals"),
      ]);
      if (cats.ok) setCategories(cats.data.categories ?? []);
      if (exp.ok) setExpenses(exp.data.expenses ?? []);
      if (bud.ok) setBudget(bud.data);
      if (ins.ok) setInsights(ins.data);
      else if (ins.status === 400) setInsights(null);
      if (gl.ok) setGoals(gl.data.goals ?? []);
    } catch (e: unknown) {
      // Either a rejected fetch (now surfaced as status 0 by apiFetch) or some
      // other failure. Don't leave the UI stuck on an infinite spinner.
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg ? `Failed to load data: ${msg}` : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [user, authFetch]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (user) loadAll();
      else setLoading(false);
    });
    return () => cancelAnimationFrame(id);
  }, [user, loadAll]);

  const createHousehold = useCallback(
    async (name: string) => {
      setBusy(true);
      setError("");
      try {
        const r = await authFetch<{ id: number }>("/api/households", {
          method: "POST",
          body: { name },
        });
        if (!r.ok) {
          setError((r.data as { error?: string }).error ?? "Failed to create household");
          return;
        }
        await refreshUser();
        await loadAll();
      } finally {
        setBusy(false);
      }
    },
    [authFetch, refreshUser, loadAll],
  );

  const addExpense = useCallback(
    async (p: {
      amount: number;
      description?: string;
      category_id?: number | null;
      expense_date: string;
    }) => {
      setBusy(true);
      setError("");
      try {
        const r = await authFetch("/api/expenses", { method: "POST", body: p });
        if (!r.ok) {
          setError((r.data as { error?: string }).error ?? "Failed to add expense");
          return;
        }
        await loadAll();
      } finally {
        setBusy(false);
      }
    },
    [authFetch, loadAll],
  );

  const setBudgetAmount = useCallback(
    async (amount: number) => {
      setBusy(true);
      setError("");
      try {
        const r = await authFetch("/api/budgets", { method: "POST", body: { amount } });
        if (!r.ok) {
          setError((r.data as { error?: string }).error ?? "Failed to set budget");
          return;
        }
        await loadAll();
      } finally {
        setBusy(false);
      }
    },
    [authFetch, loadAll],
  );

  const addGoal = useCallback(
    async (name: string, target: number, current = 0) => {
      setBusy(true);
      setError("");
      try {
        const r = await authFetch<{ id: number }>("/api/goals", {
          method: "POST",
          body: { name, target_amount: target, current_amount: current },
        });
        if (!r.ok) {
          setError((r.data as { error?: string }).error ?? "Failed to add goal");
          return;
        }
        await loadAll();
      } finally {
        setBusy(false);
      }
    },
    [authFetch, loadAll],
  );

  return (
    <Ctx.Provider
      value={{
        user,
        household,
        members,
        categories,
        expenses,
        budget,
        goals,
        insights,
        loading,
        busy,
        error,
        loadAll,
        createHousehold,
        addExpense,
        addGoal,
        setBudget: setBudgetAmount,
        clearError: () => setError(""),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useHouseholdData() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useHouseholdData must be used within HouseholdDataProvider");
  return ctx;
}
