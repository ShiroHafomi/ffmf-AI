import crypto from 'crypto';
import { pool } from '../db';
import { config } from '../config';

function sha256(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function storeRefreshToken(userId: number, token: string): Promise<void> {
  const expiresAt = new Date(
    Date.now() + config.refreshExpiresDays * 24 * 60 * 60 * 1000,
  );
  await pool.execute(
    'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
    [userId, sha256(token), expiresAt],
  );
}

// Returns the owning user id if the (opaque) token is valid & unexpired, else null.
export async function consumeRefreshToken(rawToken: string): Promise<number | null> {
  const [rows] = await pool.execute<any[]>(
    'SELECT user_id FROM refresh_tokens WHERE token = ? AND expires_at > NOW()',
    [sha256(rawToken)],
  );
  if (rows.length === 0) return null;
  return rows[0].user_id as number;
}

export async function deleteRefreshToken(userId: number, token: string): Promise<void> {
  await pool.execute(
    'DELETE FROM refresh_tokens WHERE user_id = ? AND token = ?',
    [userId, sha256(token)],
  );
}
