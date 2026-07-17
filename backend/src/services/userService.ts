import crypto from 'crypto';
import { pool } from '../db';
import { hashPassword } from '../utils/hash';

export interface UserRow {
  id: number;
  email: string;
  full_name: string | null;
  name: string | null;
  role_id: number;
  household_id: number | null;
  status: number;
  password_hash: string;
  household_role?: string | null;
}

export type PublicUser = Omit<UserRow, 'password_hash'>;

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const [rows] = await pool.execute<any[]>(
    'SELECT id, email, full_name, name, role_id, household_id, status, password_hash ' +
      'FROM users WHERE email = ?',
    [email],
  );
  return (rows[0] as UserRow) ?? null;
}

export async function findUserById(id: number): Promise<PublicUser | null> {
  const [rows] = await pool.execute<any[]>(
    `SELECT u.id, u.email, u.full_name, u.name, u.role_id, u.household_id, u.status,
            hm.role AS household_role
     FROM users u
     LEFT JOIN household_members hm
       ON hm.user_id = u.id AND hm.household_id = u.household_id
     WHERE u.id = ?`,
    [id],
  );
  return (rows[0] as PublicUser) ?? null;
}

export async function emailExists(email: string): Promise<boolean> {
  return (await findUserByEmail(email)) !== null;
}

function genDisplayId(): string {
  return 'U' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

export async function createUser(data: {
  email: string;
  password: string;
  name?: string;
}): Promise<number> {
  const password_hash = await hashPassword(data.password);
  const display_id = genDisplayId();
  const role_id = 3; // Member (default for self-signup)
  const [result] = await pool.execute<any>(
    'INSERT INTO users (display_id, email, name, password_hash, role_id, status) ' +
      'VALUES (?, ?, ?, ?, ?, 1)',
    [display_id, data.email, data.name ?? null, password_hash, role_id],
  );
  return result.insertId as number;
}
