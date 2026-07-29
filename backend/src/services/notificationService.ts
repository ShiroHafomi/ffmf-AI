import { pool } from '../db';

export interface NotificationRow {
  id: number;
  user_id: number;
  message: string;
  is_read: boolean;
  created_at: string;
  title?: string;
}

export interface NewNotification {
  userId: number;
  message: string;
}

export async function listNotifications(
  userId: number,
  onlyUnread = false,
): Promise<NotificationRow[]> {
  const sql =
    `SELECT id, user_id, message, read_status as is_read, created_at, title
     FROM notifications
     WHERE user_id = ?${onlyUnread ? ' AND read_status = 0' : ''}
     ORDER BY created_at DESC, id DESC`;
  const [rows] = await pool.execute<any[]>(sql, [userId]);
  return rows.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    message: r.message,
    is_read: !!r.is_read,
    created_at: r.created_at,
    title: r.title,
  }));
}

export async function getNotification(
  id: number,
  userId: number,
): Promise<NotificationRow | null> {
  const [rows] = await pool.execute<any[]>(
    `SELECT id, user_id, message, read_status as is_read, created_at, title
     FROM notifications WHERE id = ? AND user_id = ?`,
    [id, userId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    user_id: r.user_id,
    message: r.message,
    is_read: !!r.is_read,
    created_at: r.created_at,
    title: r.title,
  };
}

export async function createNotification(data: NewNotification): Promise<number> {
  const [result] = await pool.execute<any>(
    'INSERT INTO notifications (user_id, message, read_status) VALUES (?, ?, 0)',
    [data.userId, data.message],
  );
  return result.insertId as number;
}

// Mark a notification read. Returns true if a matching row was updated.
export async function markRead(id: number, userId: number): Promise<boolean> {
  const [r] = await pool.execute<any>(
    'UPDATE notifications SET read_status = 1 WHERE id = ? AND user_id = ?',
    [id, userId],
  );
  return (r.affectedRows ?? 0) > 0;
}
