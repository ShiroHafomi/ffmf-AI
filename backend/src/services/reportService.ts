import { pool } from '../db';

// All amounts come back from mysql2 as strings/Numbers; normalize to number.
function num(v: any): number {
  return parseFloat(v ?? 0);
}

export type TrendType = 'income' | 'expense' | 'net';
export type TrendPeriod = 'daily' | 'monthly' | 'yearly';

const PERIOD_FORMAT: Record<TrendPeriod, string> = {
  daily: '%Y-%m-%d',
  monthly: '%Y-%m',
  yearly: '%Y',
};

// Validate a YYYY-MM-DD date string.
export function isDateStr(s: any): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// ── Monthly summary (dashboard) ──────────────────────────────────────────────
export interface MonthSummary {
  totalIncome: number;
  totalExpense: number;
  balance: number;
  month: number;
  year: number;
}

export async function summaryByMonth(
  householdId: number,
  month: number,
  year: number,
): Promise<MonthSummary> {
  const [inc] = await pool.execute<any[]>(
    `SELECT COALESCE(SUM(amount), 0) AS t
     FROM incomes WHERE household_id = ? AND YEAR(income_date) = ? AND MONTH(income_date) = ?`,
    [householdId, year, month],
  );
  const [exp] = await pool.execute<any[]>(
    `SELECT COALESCE(SUM(amount), 0) AS t
     FROM expenses WHERE household_id = ? AND YEAR(expense_date) = ? AND MONTH(expense_date) = ?`,
    [householdId, year, month],
  );
  const totalIncome = num(inc[0]?.t);
  const totalExpense = num(exp[0]?.t);
  return {
    totalIncome,
    totalExpense,
    balance: Math.round((totalIncome - totalExpense) * 100) / 100,
    month,
    year,
  };
}

// ── Income vs Expense over a date range ───────────────────────────────────────
export interface RangeTotals {
  income: number;
  expense: number;
  balance: number;
}

async function totalBetween(
  table: 'incomes' | 'expenses',
  dateCol: string,
  householdId: number,
  from: string,
  to: string,
): Promise<number> {
  const [rows] = await pool.execute<any[]>(
    `SELECT COALESCE(SUM(amount), 0) AS t
     FROM ${table} WHERE household_id = ? AND ${dateCol} BETWEEN ? AND ?`,
    [householdId, from, to],
  );
  return num(rows[0]?.t);
}

export async function compareByRange(
  householdId: number,
  from: string,
  to: string,
): Promise<RangeTotals> {
  const income = await totalBetween('incomes', 'income_date', householdId, from, to);
  const expense = await totalBetween('expenses', 'expense_date', householdId, from, to);
  return {
    income,
    expense,
    balance: Math.round((income - expense) * 100) / 100,
  };
}

// ── Expense by category over a date range ─────────────────────────────────────
export interface CategoryTotal {
  category: string;
  total: number;
}

export async function expenseByCategoryBetween(
  householdId: number,
  from: string,
  to: string,
): Promise<CategoryTotal[]> {
  const [rows] = await pool.execute<any[]>(
    `SELECT COALESCE(c.name, 'Uncategorized') AS category,
            COALESCE(SUM(e.amount), 0) AS total
     FROM expenses e
     LEFT JOIN categories c ON e.category_id = c.id
     WHERE e.household_id = ? AND e.expense_date BETWEEN ? AND ?
     GROUP BY category
     ORDER BY total DESC`,
    [householdId, from, to],
  );
  return rows.map((r) => ({ category: r.category, total: num(r.total) }));
}

// ── Financial report (income, expense, balance) over a date range ────────────
export async function financialByRange(
  householdId: number,
  from: string,
  to: string,
): Promise<RangeTotals> {
  return compareByRange(householdId, from, to);
}

// ── Trend data (grouped by period) ────────────────────────────────────────────
export interface TrendPoint {
  date: string;
  value: number;
}

// Default range when the caller does not supply from/to.
export function defaultRangeForPeriod(period: TrendPeriod): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  if (period === 'daily') from.setDate(from.getDate() - 29);
  else if (period === 'monthly') from.setMonth(from.getMonth() - 11);
  else from.setFullYear(from.getFullYear() - 4);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(from), to: fmt(to) };
}

async function groupedSeries(
  table: 'incomes' | 'expenses',
  dateCol: string,
  fmt: string,
  householdId: number,
  from: string,
  to: string,
): Promise<Map<string, number>> {
  const [rows] = await pool.execute<any[]>(
    `SELECT DATE_FORMAT(${dateCol}, ?) AS bucket, COALESCE(SUM(amount), 0) AS t
     FROM ${table} WHERE household_id = ? AND ${dateCol} BETWEEN ? AND ?
     GROUP BY bucket ORDER BY bucket`,
    [fmt, householdId, from, to],
  );
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.bucket, num(r.t));
  return m;
}

export async function trend(
  householdId: number,
  type: TrendType,
  period: TrendPeriod,
  from?: string,
  to?: string,
): Promise<TrendPoint[]> {
  const fmt = PERIOD_FORMAT[period];
  const range = from && to ? { from, to } : defaultRangeForPeriod(period);

  let income = new Map<string, number>();
  let expense = new Map<string, number>();
  if (type === 'income' || type === 'net') {
    income = await groupedSeries('incomes', 'income_date', fmt, householdId, range.from, range.to);
  }
  if (type === 'expense' || type === 'net') {
    expense = await groupedSeries('expenses', 'expense_date', fmt, householdId, range.from, range.to);
  }

  const buckets = new Set<string>([...income.keys(), ...expense.keys()]);
  const points: TrendPoint[] = [];
  for (const b of [...buckets].sort()) {
    const inc = income.get(b) ?? 0;
    const exp = expense.get(b) ?? 0;
    const value =
      type === 'income' ? inc : type === 'expense' ? exp : Math.round((inc - exp) * 100) / 100;
    points.push({ date: b, value });
  }
  return points;
}

// ── Detailed report (itemised list) ───────────────────────────────────────────
export type DetailType = 'income' | 'expense';

export interface DetailRow {
  id: number;
  date: string;
  amount: number;
  description: string | null;
  category: string | null; // expense: category name; income: source
}

export async function detail(
  householdId: number,
  type: DetailType,
  from: string,
  to: string,
): Promise<DetailRow[]> {
  if (type === 'expense') {
    const [rows] = await pool.execute<any[]>(
      `SELECT e.id, e.expense_date AS date, e.amount, e.description,
              c.name AS category
       FROM expenses e
       LEFT JOIN categories c ON e.category_id = c.id
       WHERE e.household_id = ? AND e.expense_date BETWEEN ? AND ?
       ORDER BY e.expense_date DESC, e.id DESC`,
      [householdId, from, to],
    );
    return rows.map((r) => ({
      id: r.id,
      date: r.date,
      amount: num(r.amount),
      description: r.description,
      category: r.category,
    }));
  }
  const [rows] = await pool.execute<any[]>(
    `SELECT id, income_date AS date, amount, source AS category
     FROM incomes
     WHERE household_id = ? AND income_date BETWEEN ? AND ?
     ORDER BY income_date DESC, id DESC`,
    [householdId, from, to],
  );
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    amount: num(r.amount),
    description: null,
    category: r.category,
  }));
}
