import { pool } from '../db';

export interface UtilityReading {
  id: number;
  household_id: number;
  type: string;
  value: number;
  reading_date: string;
  created_at: string;
}

export interface NewReading {
  householdId: number;
  type: string;
  value: number;
  readingDate: string; // YYYY-MM-DD
}

// Per-unit cost by utility type. These are configurable placeholders standing
// in for a real tariff table — swap for a DB-driven rate lookup when available.
export const UTILITY_RATES: Record<string, number> = {
  electricity: 0.15,
  water: 0.005,
  gas: 0.05,
};

function num(v: any): number {
  return parseFloat(v ?? 0);
}

function rateFor(type: string): number {
  return UTILITY_RATES[type.toLowerCase()] ?? 0;
}

export async function listReadings(
  householdId: number,
  opts: { type?: string; month?: string },
): Promise<UtilityReading[]> {
  const where: string[] = ['household_id = ?'];
  const params: any[] = [householdId];
  if (opts.type) {
    where.push('type = ?');
    params.push(opts.type);
  }
  if (opts.month && /^\d{4}-\d{2}$/.test(opts.month)) {
    where.push('reading_date LIKE ?');
    params.push(`${opts.month}%`);
  }
  const [rows] = await pool.execute<any[]>(
    `SELECT id, household_id, type, value, reading_date, created_at
     FROM utility_readings
     WHERE ${where.join(' AND ')}
     ORDER BY reading_date DESC, id DESC`,
    params,
  );
  return rows.map((r) => ({
    id: r.id,
    household_id: r.household_id,
    type: r.type,
    value: num(r.value),
    reading_date: r.reading_date,
    created_at: r.created_at,
  }));
}

export async function createReading(data: NewReading): Promise<number> {
  const [result] = await pool.execute<any>(
    `INSERT INTO utility_readings (household_id, type, value, reading_date)
     VALUES (?, ?, ?, ?)`,
    [data.householdId, data.type, data.value, data.readingDate],
  );
  return result.insertId as number;
}

export interface UsageSummary {
  totalUsage: number;
  totalCost: number;
  month: string;
}

// Aggregate usage + derived cost for a household month (YYYY-MM).
export async function usageSummary(
  householdId: number,
  month: string,
): Promise<UsageSummary> {
  const [rows] = await pool.execute<any[]>(
    `SELECT type, COALESCE(SUM(value), 0) AS total
     FROM utility_readings
     WHERE household_id = ? AND reading_date LIKE ?
     GROUP BY type`,
    [householdId, `${month}%`],
  );
  let totalUsage = 0;
  let totalCost = 0;
  for (const r of rows) {
    const usage = num(r.total);
    totalUsage += usage;
    totalCost += usage * rateFor(r.type);
  }
  return {
    totalUsage: Math.round(totalUsage * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
    month,
  };
}
