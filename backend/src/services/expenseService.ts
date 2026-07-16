import { pool } from '../db';

export interface ExpenseRow {
  id: number;
  amount: number;
  description: string | null;
  expense_date: string;
  category_id: number | null;
  category_name: string | null;
  user_id: number | null;
}

export interface NewExpense {
  householdId: number;
  userId: number;
  amount: number;
  description?: string | null;
  categoryId?: number | null;
  expenseDate?: string; // YYYY-MM-DD
}

export async function listExpenses(
  householdId: number,
  limit = 50,
): Promise<ExpenseRow[]> {
  // NOTE: `LIMIT ?` fails on this MySQL/mysql2 combo ("Incorrect arguments to
  // mysqld_stmt_execute"), so the limit is interpolated as a validated integer
  // instead. household_id stays parameterized. limit is always clamped, so
  // there is no injection surface here.
  const lim = Math.floor(Number(limit));
  const safeLimit = Number.isFinite(lim) && lim > 0 ? Math.min(lim, 200) : 50;
  const [rows] = await pool.execute<any[]>(
    `SELECT e.id, e.amount, e.description, e.expense_date, e.category_id,
            c.name AS category_name, e.user_id
     FROM expenses e
     LEFT JOIN categories c ON e.category_id = c.id
     WHERE e.household_id = ?
     ORDER BY e.expense_date DESC, e.id DESC
     LIMIT ${safeLimit}`,
    [householdId],
  );
  return rows as ExpenseRow[];
}

export async function createExpense(data: NewExpense): Promise<number> {
  const [result] = await pool.execute<any>(
    `INSERT INTO expenses (household_id, category_id, amount, description, user_id, expense_date)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      data.householdId,
      data.categoryId ?? null,
      data.amount,
      data.description ?? null,
      data.userId,
      data.expenseDate ?? new Date(),
    ],
  );
  return result.insertId as number;
}

// Total spent by the household in a given month/year (mirrors the AI service's
// monthly grouping so the dashboard can show spend-vs-budget live).
export async function monthlyTotal(
  householdId: number,
  year: number,
  month: number,
): Promise<number> {
  const [rows] = await pool.execute<any[]>(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM expenses
     WHERE household_id = ? AND YEAR(expense_date) = ? AND MONTH(expense_date) = ?`,
    [householdId, year, month],
  );
  return parseFloat(rows[0]?.total ?? 0);
}
