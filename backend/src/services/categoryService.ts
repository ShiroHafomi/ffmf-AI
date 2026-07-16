import { pool } from '../db';

export interface CategoryRow {
  id: number;
  name: string;
  type: string | null;
}

export async function listCategories(householdId: number): Promise<CategoryRow[]> {
  const [rows] = await pool.execute<any[]>(
    'SELECT id, name, type FROM categories WHERE household_id = ? ORDER BY name',
    [householdId],
  );
  return rows as CategoryRow[];
}

export async function createCategory(
  householdId: number,
  name: string,
  type: string = 'expense',
): Promise<number> {
  const [result] = await pool.execute<any>(
    'INSERT INTO categories (household_id, name, type) VALUES (?, ?, ?)',
    [householdId, name, type],
  );
  return result.insertId as number;
}

export async function categoryExists(
  householdId: number,
  categoryId: number,
): Promise<boolean> {
  const [rows] = await pool.execute<any[]>(
    'SELECT id FROM categories WHERE id = ? AND household_id = ?',
    [categoryId, householdId],
  );
  return rows.length > 0;
}
