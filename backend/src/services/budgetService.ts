import { pool } from '../db';

export interface BudgetRow {
  id: number;
  category_id: number | null;
  amount: number;
  month: number;
  year: number;
}

export async function getCurrentBudgets(
  householdId: number,
  month: number,
  year: number,
): Promise<BudgetRow[]> {
  const [rows] = await pool.execute<any[]>(
    `SELECT id, category_id, amount, month, year
     FROM budgets
     WHERE household_id = ? AND month = ? AND year = ?
     ORDER BY category_id IS NULL DESC, amount DESC`,
    [householdId, month, year],
  );
  return rows as BudgetRow[];
}

// Set (or update) the household's TOTAL monthly budget (category_id = NULL).
// Keeps a single total row per household/month/year.
export async function setMonthlyBudget(
  householdId: number,
  amount: number,
  month: number,
  year: number,
): Promise<number> {
  const [existing] = await pool.execute<any[]>(
    `SELECT id FROM budgets
     WHERE household_id = ? AND month = ? AND year = ? AND category_id IS NULL`,
    [householdId, month, year],
  );

  if (existing.length > 0) {
    const id = existing[0].id as number;
    await pool.execute(
      'UPDATE budgets SET amount = ?, updated_at = NOW() WHERE id = ?',
      [amount, id],
    );
    return id;
  }

  const [result] = await pool.execute<any>(
    `INSERT INTO budgets (household_id, category_id, month, year, amount)
     VALUES (?, NULL, ?, ?, ?)`,
    [householdId, month, year, amount],
  );
  return result.insertId as number;
}

// Per-category spent vs budget for a given month/year (mirrors the AI service's
// category breakdown so the cut-back / alert logic can run in Node too).
export interface CategoryBreakdownRow {
  category_name: string;
  spent: number;
  budget: number;
}

export async function getCategoryBreakdown(
  householdId: number,
  month: number,
  year: number,
): Promise<CategoryBreakdownRow[]> {
  const [rows] = await pool.execute<any[]>(
    `SELECT
        COALESCE(c.name, 'Uncategorized')      AS category_name,
        COALESCE(SUM(e.amount), 0)             AS spent,
        COALESCE(b.amount, 0)                  AS budget
     FROM categories c
     LEFT JOIN expenses e
       ON e.category_id = c.id
      AND e.household_id = ?
      AND YEAR(e.expense_date) = ?
      AND MONTH(e.expense_date) = ?
     LEFT JOIN budgets b
       ON b.category_id = c.id
      AND b.household_id = ?
      AND b.month = ?
      AND b.year = ?
     WHERE c.household_id = ?
     GROUP BY c.id, c.name, b.amount
     ORDER BY spent DESC`,
    [householdId, year, month, householdId, month, year, householdId],
  );
  return rows.map((r) => ({
    category_name: r.category_name,
    spent: parseFloat(r.spent ?? 0),
    budget: parseFloat(r.budget ?? 0),
  }));
}

// ── Pure analysis helpers (mirror services/ai_service.py) ──────────────────
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface CutbackLever {
  lever: string;
  current_spent: number;
  budget: number;
  excess: number;
  suggested_cutback: number;
  projected_spent: number;
  message: string;
}

export interface CutbackResult {
  levers: CutbackLever[];
  total_potential_saving: number;
  count: number;
}

// Suggest how much a customer can save by cutting back the excess (over-budget)
// part of each lever.
export function suggestCutbacks(
  categories: CategoryBreakdownRow[],
): CutbackResult {
  const levers: CutbackLever[] = [];
  let total = 0;
  for (const c of categories) {
    if (!c.budget || c.budget <= 0) continue;
    const excess = Math.max(0, c.spent - c.budget);
    if (excess <= 0) continue;
    total += excess;
    levers.push({
      lever: c.category_name,
      current_spent: round2(c.spent),
      budget: round2(c.budget),
      excess: round2(excess),
      suggested_cutback: round2(excess),
      projected_spent: round2(c.budget),
      message: `Cut ${excess.toFixed(0)} from '${c.category_name}' to bring spending back to its budget of ${c.budget.toFixed(0)}.`,
    });
  }
  levers.sort((a, b) => b.excess - a.excess);
  return { levers, total_potential_saving: round2(total), count: levers.length };
}

export interface AlertLever {
  lever: string;
  budget_usage: number;
  threshold: number;
  spent: number;
  budget: number;
  severity: 'warning' | 'high';
  message: string;
}

export interface AlertResult {
  alerts: AlertLever[];
  triggered_count: number;
  total_evaluated: number;
}

// Evaluate an alert threshold (default applied to all levers, per-lever overrides
// via `thresholds`) and fire when budget_usage >= threshold.
export function evaluateAlertThresholds(
  categories: CategoryBreakdownRow[],
  thresholds: Record<string, number>,
  defaultThreshold?: number,
): AlertResult {
  const alerts: AlertLever[] = [];
  let evaluated = 0;
  for (const c of categories) {
    if (!c.budget || c.budget <= 0) continue;
    const usage = (c.spent / c.budget) * 100;
    evaluated++;
    const thr = thresholds[c.category_name] ?? defaultThreshold;
    if (thr == null) continue;
    if (usage >= thr) {
      const severity: 'warning' | 'high' =
        usage >= Math.max(thr, 100) ? 'high' : 'warning';
      alerts.push({
        lever: c.category_name,
        budget_usage: round2(usage),
        threshold: thr,
        spent: round2(c.spent),
        budget: round2(c.budget),
        severity,
        message: `'${c.category_name}' is at ${usage.toFixed(1)}% of budget, above the ${thr}% alert threshold.`,
      });
    }
  }
  alerts.sort((a, b) => b.budget_usage - a.budget_usage);
  return { alerts, triggered_count: alerts.length, total_evaluated: evaluated };
}

// Parse 'Food:80,Groceries:90' -> { Food: 80, Groceries: 90 }.
export function parseCategoryThresholds(
  raw: string | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw) return out;
  for (const part of raw.split(',')) {
    if (!part.includes(':')) continue;
    const [name, val] = part.split(':');
    const n = parseFloat(val);
    if (!isNaN(n)) out[name.trim()] = n;
  }
  return out;
}
