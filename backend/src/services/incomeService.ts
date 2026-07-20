import { pool } from '../db';

export interface IncomeRow {
  id: number;
  household_id: number;
  user_id: number | null;
  amount: number;
  source: string | null;
  income_date: string;
  created_at: string;
}

export interface NewIncome {
  householdId: number;
  userId: number;
  amount: number;
  source?: string | null;
  incomeDate?: string; // YYYY-MM-DD
}

export interface IncomePatch {
  amount?: number;
  source?: string | null;
  incomeDate?: string;
}

export async function listIncomes(
  householdId: number,
  limit = 50,
): Promise<IncomeRow[]> {
  // NOTE: `LIMIT ?` fails on this MySQL/mysql2 combo (same quirk as
  // expenseService), so the limit is interpolated as a validated integer.
  // household_id stays parameterized. limit is always clamped => no injection.
  const lim = Math.floor(Number(limit));
  const safeLimit = Number.isFinite(lim) && lim > 0 ? Math.min(lim, 200) : 50;
  const [rows] = await pool.execute<any[]>(
    `SELECT id, household_id, user_id, amount, source, income_date, created_at
     FROM incomes
     WHERE household_id = ?
     ORDER BY income_date DESC, id DESC
     LIMIT ${safeLimit}`,
    [householdId],
  );
  return rows.map((r) => ({
    id: r.id,
    household_id: r.household_id,
    user_id: r.user_id,
    amount: parseFloat(r.amount),
    source: r.source,
    income_date: r.income_date,
    created_at: r.created_at,
  }));
}

export async function createIncome(data: NewIncome): Promise<number> {
  const [result] = await pool.execute<any>(
    `INSERT INTO incomes (household_id, user_id, amount, source, income_date)
     VALUES (?, ?, ?, ?, ?)`,
    [
      data.householdId,
      data.userId,
      data.amount,
      data.source ?? null,
      data.incomeDate ?? new Date(),
    ],
  );
  return result.insertId as number;
}

export async function getIncome(
  id: number,
  householdId: number,
): Promise<IncomeRow | null> {
  const [rows] = await pool.execute<any[]>(
    `SELECT id, household_id, user_id, amount, source, income_date, created_at
     FROM incomes
     WHERE id = ? AND household_id = ?`,
    [id, householdId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    household_id: r.household_id,
    user_id: r.user_id,
    amount: parseFloat(r.amount),
    source: r.source,
    income_date: r.income_date,
    created_at: r.created_at,
  };
}

export async function updateIncome(
  id: number,
  householdId: number,
  patch: IncomePatch,
): Promise<void> {
  const sets: string[] = [];
  const vals: any[] = [];
  if (patch.amount !== undefined) {
    sets.push('amount = ?');
    vals.push(patch.amount);
  }
  if (patch.source !== undefined) {
    sets.push('source = ?');
    vals.push(patch.source);
  }
  if (patch.incomeDate !== undefined) {
    sets.push('income_date = ?');
    vals.push(patch.incomeDate);
  }
  if (sets.length === 0) return;
  vals.push(id, householdId);
  const [r] = await pool.execute<any>(
    `UPDATE incomes SET ${sets.join(', ')} WHERE id = ? AND household_id = ?`,
    vals,
  );
  if ((r.affectedRows ?? 0) === 0) throw new Error('income not found');
}

export async function deleteIncome(
  id: number,
  householdId: number,
): Promise<void> {
  const [r] = await pool.execute<any>(
    'DELETE FROM incomes WHERE id = ? AND household_id = ?',
    [id, householdId],
  );
  if ((r.affectedRows ?? 0) === 0) throw new Error('income not found');
}

// Total income by the household in a given month/year (mirrors
// expenseService.monthlyTotal so the dashboard can show net flow).
export async function monthlyIncomeTotal(
  householdId: number,
  year: number,
  month: number,
): Promise<number> {
  const [rows] = await pool.execute<any[]>(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM incomes
     WHERE household_id = ? AND YEAR(income_date) = ? AND MONTH(income_date) = ?`,
    [householdId, year, month],
  );
  return parseFloat(rows[0]?.total ?? 0);
}
