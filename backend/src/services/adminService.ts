import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { pool } from '../db';
import { ROLE_ID } from '../authz/roles';

export interface SystemSummary {
  totalUsers: number;
  totalHouseholds: number;
  totalTransactions: number;
}

/** Aggregate counts across the system for the admin dashboard. */
export async function getSystemSummary(): Promise<SystemSummary> {
  const [users] = await pool.execute<any[]>('SELECT COUNT(*) AS n FROM users');
  const [households] = await pool.execute<any[]>(
    'SELECT COUNT(*) AS n FROM households WHERE is_deleted = 0',
  );
  const [txns] = await pool.execute<any[]>('SELECT COUNT(*) AS n FROM expenses');
  return {
    totalUsers: Number(users[0]?.n ?? 0),
    totalHouseholds: Number(households[0]?.n ?? 0),
    totalTransactions: Number(txns[0]?.n ?? 0),
  };
}

export interface ListUsersOptions {
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface ListUsersResult {
  users: any[];
  page: number;
  pageSize: number;
  total: number;
}

/**
 * List all users (admin only) with optional name/email search and pagination.
 * `LIMIT`/`OFFSET` are interpolated as validated integers because `LIMIT ?`
 * fails on this mysql2 build (see expenseService.ts); page/pageSize are clamped
 * so there is no injection surface.
 */
export async function listUsers(opts: ListUsersOptions = {}): Promise<ListUsersResult> {
  const page = Math.max(1, Math.floor(Number(opts.page ?? 1)) || 1);
  const pageSize = Math.min(200, Math.max(1, Math.floor(Number(opts.pageSize ?? 50)) || 50));
  const offset = (page - 1) * pageSize;

  const search = opts.search?.toString().trim();
  const params: any[] = [];
  let where = '';
  if (search) {
    where = 'WHERE u.name LIKE ? OR u.email LIKE ?';
    params.push(`%${search}%`, `%${search}%`);
  }

  const [countRows] = await pool.execute<any[]>(
    `SELECT COUNT(*) AS n FROM users u ${where}`,
    params,
  );
  const total = Number(countRows[0]?.n ?? 0);

  // Safe integers only (validated above); household-id param stays parameterized.
  const [rows] = await pool.execute<any[]>(
    `SELECT u.id, u.email, u.name, u.role_id, u.household_id, u.status, u.created_at
     FROM users u ${where}
     ORDER BY u.id ASC
     LIMIT ${pageSize} OFFSET ${offset}`,
    params,
  );

  return { users: rows as any[], page, pageSize, total };
}

/**
 * Permanently delete a user (admin only). Child rows that reference the user are
 * defensively nulled so the delete succeeds regardless of FK actions, and the
 * user's household membership is removed. Self-delete and last-admin removal are
 * rejected to avoid locking the system out of administration.
 */
export async function deleteUser(id: number, actingUserId: number): Promise<void> {
  if (id === actingUserId) {
    throw new Error('cannot delete your own account');
  }

  const [cur] = await pool.execute<any[]>(
    'SELECT role_id FROM users WHERE id = ?',
    [id],
  );
  if (!cur[0]) throw new Error('user not found');

  if (cur[0].role_id === ROLE_ID.ADMIN) {
    const [admins] = await pool.execute<any[]>(
      'SELECT COUNT(*) AS n FROM users WHERE role_id = ?',
      [ROLE_ID.ADMIN],
    );
    if ((admins[0]?.n ?? 0) <= 1) {
      throw new Error('cannot remove the last admin');
    }
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Null out user references that may have RESTRICT-style FKs.
    await conn.execute('UPDATE expenses SET user_id = NULL WHERE user_id = ?', [id]);
    await conn.execute('UPDATE incomes SET user_id = NULL WHERE user_id = ?', [id]);
    await conn.execute('DELETE FROM household_members WHERE user_id = ?', [id]);
    await conn.execute('UPDATE users SET household_id = NULL WHERE id = ?', [id]);
    const [result] = await conn.execute<any>('DELETE FROM users WHERE id = ?', [id]);
    if ((result.affectedRows ?? 0) === 0) {
      throw new Error('user not found');
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/** Soft-delete a household (keeps child rows intact, matches listAllHouseholds filter). */
export async function deleteHousehold(id: number): Promise<void> {
  const [result] = await pool.execute<any>(
    'UPDATE households SET is_deleted = 1 WHERE id = ?',
    [id],
  );
  if ((result.affectedRows ?? 0) === 0) {
    throw new Error('household not found');
  }
}

export interface SystemHealth {
  status: 'ok';
  uptime: number; // seconds
}

export function getSystemHealth(): SystemHealth {
  return { status: 'ok', uptime: Math.floor(process.uptime()) };
}

export interface SystemMetrics {
  cpuUsage: number; // 1-min load average
  memoryUsage: number; // percent used (1 decimal)
}

export function getSystemMetrics(): SystemMetrics {
  const cpuUsage = os.loadavg()[0];
  const memoryUsage = Number(
    ((1 - os.freemem() / os.totalmem()) * 100).toFixed(1),
  );
  return { cpuUsage, memoryUsage };
}

export interface LogEntry {
  timestamp?: string;
  level?: string;
  message: string;
}

/**
 * Read and parse the application log file. No logs table exists, so this tails
 * the configured log file (ADMIN_LOG_FILE env, else backend.log in cwd) and
 * extracts level + date from each line, filtering by the `level`/`date` params.
 */
export async function readSystemLogs(opts: {
  level?: string;
  date?: string;
  limit?: number;
} = {}): Promise<LogEntry[]> {
  const filePath = process.env.ADMIN_LOG_FILE ?? path.join(process.cwd(), 'backend.log');
  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch {
    return [];
  }

  const level = opts.level?.toString().trim().toLowerCase();
  const date = opts.date?.toString().trim();
  const limit = Math.min(2000, Math.max(1, Math.floor(Number(opts.limit ?? 500)) || 500));

  const levelRe = /(ERROR|WARN|WARNING|INFO|DEBUG|TRACE|FATAL)/i;
  const dateRe = /(\d{4}-\d{2}-\d{2})/;

  const all: LogEntry[] = [];
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const levelMatch = line.match(levelRe);
    const dateMatch = line.match(dateRe);

    // When a filter is set, a line must carry a matching level/date to pass;
    // lines lacking the field are excluded (not passed through).
    if (level && (!levelMatch || levelMatch[1].toLowerCase() !== level)) continue;
    if (date && (!dateMatch || dateMatch[1] !== date)) continue;

    all.push({
      timestamp: dateMatch?.[1],
      level: levelMatch?.[1]?.toUpperCase(),
      message: line,
    });
  }

  // Newest first; logs are typically appended, so reverse before clamping.
  return all.reverse().slice(0, limit);
}
