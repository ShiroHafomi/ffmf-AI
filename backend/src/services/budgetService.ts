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
