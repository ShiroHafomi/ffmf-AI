import { pool } from '../db';

export interface GoalRow {
  id: number;
  household_id: number;
  name: string;
  target_amount: number;
  current_amount: number;
  created_at: string;
}

export async function listGoals(householdId: number): Promise<GoalRow[]> {
  const [rows] = await pool.execute<any[]>(
    `SELECT id, household_id, name, target_amount, current_amount, created_at
     FROM savings_goals
     WHERE household_id = ?
     ORDER BY created_at DESC`,
    [householdId],
  );
  return rows.map((r) => ({
    id: r.id,
    household_id: r.household_id,
    name: r.name,
    target_amount: parseFloat(r.target_amount),
    current_amount: parseFloat(r.current_amount),
    created_at: r.created_at,
  }));
}

export async function createGoal(
  householdId: number,
  name: string,
  target_amount: number,
  current_amount = 0,
): Promise<number> {
  const [result] = await pool.execute<any>(
    `INSERT INTO savings_goals (household_id, name, target_amount, current_amount)
     VALUES (?, ?, ?, ?)`,
    [householdId, name, target_amount, current_amount],
  );
  return result.insertId as number;
}

export interface GoalPatch {
  name?: string;
  target_amount?: number;
  current_amount?: number;
}

export async function updateGoal(
  id: number,
  householdId: number,
  patch: GoalPatch,
): Promise<void> {
  const sets: string[] = [];
  const vals: any[] = [];
  if (patch.name !== undefined) {
    sets.push('name = ?');
    vals.push(patch.name);
  }
  if (patch.target_amount !== undefined) {
    sets.push('target_amount = ?');
    vals.push(patch.target_amount);
  }
  if (patch.current_amount !== undefined) {
    sets.push('current_amount = ?');
    vals.push(patch.current_amount);
  }
  if (sets.length === 0) return;
  vals.push(id, householdId);
  const [r] = await pool.execute<any>(
    `UPDATE savings_goals SET ${sets.join(', ')} WHERE id = ? AND household_id = ?`,
    vals,
  );
  if ((r.affectedRows ?? 0) === 0) throw new Error('goal not found');
}

export async function deleteGoal(id: number, householdId: number): Promise<void> {
  const [r] = await pool.execute<any>(
    'DELETE FROM savings_goals WHERE id = ? AND household_id = ?',
    [id, householdId],
  );
  if ((r.affectedRows ?? 0) === 0) throw new Error('goal not found');
}
