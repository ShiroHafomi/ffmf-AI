import { pool } from '../db';

export interface HouseholdInfo {
  id: number;
  name: string | null;
  description: string | null;
  owner_id: number | null;
  owner_email: string | null;
}

export interface MemberRow {
  id: number;
  email: string;
  name: string | null;
  role: string | null;
  joined_at: string;
}

export async function getHouseholdWithMembers(
  householdId: number,
): Promise<{ household: HouseholdInfo | null; members: MemberRow[] }> {
  const [h] = await pool.execute<any[]>(
    `SELECT h.id, h.name, h.description, h.owner_id, u.email AS owner_email
     FROM households h
     LEFT JOIN users u ON h.owner_id = u.id
     WHERE h.id = ? AND h.is_deleted = 0`,
    [householdId],
  );
  const [members] = await pool.execute<any[]>(
    `SELECT u.id, u.email, u.name, hm.role, hm.joined_at
     FROM household_members hm
     JOIN users u ON hm.user_id = u.id
     WHERE hm.household_id = ?
     ORDER BY hm.joined_at ASC`,
    [householdId],
  );
  return { household: (h[0] as HouseholdInfo) ?? null, members: members as MemberRow[] };
}

export async function createHousehold(
  name: string,
  ownerId: number,
): Promise<number> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.execute<any>(
      'INSERT INTO households (name, owner_id) VALUES (?, ?)',
      [name, ownerId],
    );
    const householdId = r.insertId as number;
    await conn.execute(
      'INSERT INTO household_members (household_id, user_id, role) VALUES (?, ?, ?)',
      [householdId, ownerId, 'owner'],
    );
    await conn.execute('UPDATE users SET household_id = ? WHERE id = ?', [
      householdId,
      ownerId,
    ]);
    await conn.commit();
    return householdId;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}
