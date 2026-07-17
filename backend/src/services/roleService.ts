import { pool } from '../db';
import { HOUSEHOLD_ROLE, ROLE_ID, type HouseholdRole } from '../authz/roles';

export interface UserAuthContext {
  roleId: number | null;
  householdId: number | null;
  householdRole: HouseholdRole;
}

const VALID_MEMBER_ROLES: HouseholdRole[] = [
  HOUSEHOLD_ROLE.OWNER,
  HOUSEHOLD_ROLE.PARENT,
  HOUSEHOLD_ROLE.CHILD,
];

function normalizeMemberRole(role: string | null): HouseholdRole {
  if (role === HOUSEHOLD_ROLE.OWNER || role === HOUSEHOLD_ROLE.PARENT || role === HOUSEHOLD_ROLE.CHILD) {
    return role;
  }
  return null;
}

/** Resolve a user's global role + their role within their household. */
export async function getUserAuthContext(userId: number): Promise<UserAuthContext> {
  const [rows] = await pool.execute<any[]>(
    `SELECT u.role_id, u.household_id,
            hm.role AS household_role
     FROM users u
     LEFT JOIN household_members hm
       ON hm.user_id = u.id AND hm.household_id = u.household_id
     WHERE u.id = ?`,
    [userId],
  );
  const row = rows[0];
  if (!row) {
    throw new Error('user not found');
  }
  return {
    roleId: row.role_id,
    householdId: row.household_id,
    householdRole: normalizeMemberRole(row.household_role),
  };
}

export async function getHouseholdRole(
  userId: number,
  householdId: number,
): Promise<HouseholdRole> {
  const [rows] = await pool.execute<any[]>(
    'SELECT role FROM household_members WHERE user_id = ? AND household_id = ?',
    [userId, householdId],
  );
  return normalizeMemberRole(rows[0]?.role ?? null);
}

/** Add an existing user (by email) to a household with a given role. */
export async function addMember(
  householdId: number,
  email: string,
  role: HouseholdRole,
): Promise<number> {
  if (!VALID_MEMBER_ROLES.includes(role)) {
    throw new Error(`invalid member role: ${role}`);
  }
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('invalid email');
  }
  const [u] = await pool.execute<any[]>(
    'SELECT id, household_id FROM users WHERE email = ?',
    [email],
  );
  const user = u[0];
  if (!user) throw new Error('no user with that email');
  if (user.household_id && user.household_id !== householdId) {
    throw new Error('user already belongs to another household');
  }
  const [result] = await pool.execute<any>(
    'INSERT INTO household_members (household_id, user_id, role) VALUES (?, ?, ?)',
    [householdId, user.id, role],
  );
  await pool.execute('UPDATE users SET household_id = ? WHERE id = ?', [
    householdId,
    user.id,
  ]);
  return result.insertId as number;
}

/**
 * Change a user's global role (admin=1 / member=3). Admin-only.
 * Guards against removing the last remaining admin so the system can't be
 * locked out of administration.
 */
export async function setUserRole(targetUserId: number, roleId: number): Promise<void> {
  if (roleId !== ROLE_ID.ADMIN && roleId !== ROLE_ID.MEMBER) {
    throw new Error('roleId must be 1 (admin) or 3 (member)');
  }
  const [cur] = await pool.execute<any[]>(
    'SELECT role_id FROM users WHERE id = ?',
    [targetUserId],
  );
  if (!cur[0]) throw new Error('user not found');

  if (cur[0].role_id === ROLE_ID.ADMIN && roleId !== ROLE_ID.ADMIN) {
    const [admins] = await pool.execute<any[]>(
      'SELECT COUNT(*) AS n FROM users WHERE role_id = ?',
      [ROLE_ID.ADMIN],
    );
    if ((admins[0]?.n ?? 0) <= 1) {
      throw new Error('cannot remove the last admin');
    }
  }

  await pool.execute('UPDATE users SET role_id = ? WHERE id = ?', [
    roleId,
    targetUserId,
  ]);
}

export async function setMemberRole(
  householdId: number,
  targetUserId: number,
  role: HouseholdRole,
): Promise<void> {
  if (!VALID_MEMBER_ROLES.includes(role)) {
    throw new Error(`invalid member role: ${role}`);
  }
  const [result] = await pool.execute<any>(
    'UPDATE household_members SET role = ? WHERE household_id = ? AND user_id = ?',
    [role, householdId, targetUserId],
  );
  if ((result.affectedRows ?? 0) === 0) {
    throw new Error('member not found in household');
  }
}

export async function removeMember(
  householdId: number,
  targetUserId: number,
): Promise<void> {
  // Never allow removing the household owner via this path.
  const [rows] = await pool.execute<any[]>(
    'SELECT role FROM household_members WHERE household_id = ? AND user_id = ?',
    [householdId, targetUserId],
  );
  const role = rows[0]?.role;
  if (role === HOUSEHOLD_ROLE.OWNER) {
    throw new Error('cannot remove the household owner');
  }
  const [result] = await pool.execute<any>(
    'DELETE FROM household_members WHERE household_id = ? AND user_id = ?',
    [householdId, targetUserId],
  );
  if ((result.affectedRows ?? 0) === 0) {
    throw new Error('member not found in household');
  }
  await pool.execute(
    'UPDATE users SET household_id = NULL WHERE id = ? AND household_id = ?',
    [targetUserId, householdId],
  );
}

export async function listMembers(householdId: number): Promise<any[]> {
  const [rows] = await pool.execute<any[]>(
    `SELECT u.id, u.email, u.name, hm.role, hm.joined_at
     FROM household_members hm
     JOIN users u ON hm.user_id = u.id
     WHERE hm.household_id = ?
     ORDER BY hm.joined_at ASC`,
    [householdId],
  );
  return rows as any[];
}

// --- Admin (global superuser) helpers ---

export async function listAllHouseholds(): Promise<any[]> {
  const [rows] = await pool.execute<any[]>(
    `SELECT h.id, h.name, h.description, h.owner_id, h.created_at,
            (SELECT COUNT(*) FROM household_members hm WHERE hm.household_id = h.id) AS member_count
     FROM households h
     WHERE h.is_deleted = 0
     ORDER BY h.id ASC`,
  );
  return rows as any[];
}

export async function listAllUsers(): Promise<any[]> {
  const [rows] = await pool.execute<any[]>(
    `SELECT u.id, u.email, u.name, u.role_id, u.household_id, u.status, u.created_at
     FROM users u
     ORDER BY u.id ASC`,
  );
  return rows as any[];
}

export { ROLE_ID };
