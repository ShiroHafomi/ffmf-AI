// Role model for FFMS function decentralization.
//
// Two axes:
//   - Global:  users.role_id   (1 = ADMIN superuser, 3 = MEMBER default)
//   - Household: household_members.role ('owner' | 'parent' | 'child')
//
// A user's effective authority for a request is a function of (isAdmin,
// householdRole). Admin bypasses household scoping entirely.

export const ROLE_ID = {
  ADMIN: 1,
  MEMBER: 3,
} as const;

export const HOUSEHOLD_ROLE = {
  OWNER: 'owner',
  PARENT: 'parent',
  CHILD: 'child',
} as const;

export type HouseholdRole =
  | (typeof HOUSEHOLD_ROLE)[keyof typeof HOUSEHOLD_ROLE]
  | null;

// Capabilities a request can require.
export type Capability =
  | 'insight.view'
  | 'budget.view'
  | 'budget.manage'
  | 'income.view'
  | 'income.create'
  | 'expense.view'
  | 'expense.create'
  | 'category.view'
  | 'category.manage'
  | 'household.view'
  | 'household.manage'
  | 'household.create'
  | 'dashboard.view'
  | 'report.view'
  | 'notification.view'
  | 'notification.send'
  | 'utility.view'
  | 'utility.create'
  | 'system.admin';

// Authority ranking within a household (higher = more powerful).
// Used to compare a member's role against a capability's minimum.
const HOUSEHOLD_RANK: Record<string, number> = {
  child: 0,
  parent: 1,
  owner: 2,
};

interface SystemPermission {
  systemOnly: true;
}
interface HouseholdPermission {
  minHouseholdRole: HouseholdRole;
}
type Permission = SystemPermission | HouseholdPermission;

export const PERMISSIONS: Record<Capability, Permission> = {
  // Read-only capabilities: any member of the (own) household, including child.
  'insight.view': { minHouseholdRole: HOUSEHOLD_ROLE.CHILD },
  'budget.view': { minHouseholdRole: HOUSEHOLD_ROLE.CHILD },
  'expense.view': { minHouseholdRole: HOUSEHOLD_ROLE.CHILD },
  'income.view': { minHouseholdRole: HOUSEHOLD_ROLE.CHILD },
  'income.create': { minHouseholdRole: HOUSEHOLD_ROLE.PARENT },
  'category.view': { minHouseholdRole: HOUSEHOLD_ROLE.CHILD },
  'household.view': { minHouseholdRole: HOUSEHOLD_ROLE.CHILD },

  // Dashboard & reports: any household member may view their own household.
  'dashboard.view': { minHouseholdRole: HOUSEHOLD_ROLE.CHILD },
  'report.view': { minHouseholdRole: HOUSEHOLD_ROLE.CHILD },

  // Notifications: any member may read their own; only a global admin may send.
  'notification.view': { minHouseholdRole: HOUSEHOLD_ROLE.CHILD },
  'notification.send': { systemOnly: true },

  // Utilities: any member may view; parents (and above) may add meter readings.
  'utility.view': { minHouseholdRole: HOUSEHOLD_ROLE.CHILD },
  'utility.create': { minHouseholdRole: HOUSEHOLD_ROLE.PARENT },

  // Write/manage capabilities: parent and above (child is read-only).
  'expense.create': { minHouseholdRole: HOUSEHOLD_ROLE.PARENT },
  'budget.manage': { minHouseholdRole: HOUSEHOLD_ROLE.PARENT },
  'category.manage': { minHouseholdRole: HOUSEHOLD_ROLE.PARENT },

  // Household administration: owner only (parent cannot manage members).
  'household.manage': { minHouseholdRole: HOUSEHOLD_ROLE.OWNER },

  // Any authenticated member may create their own household.
  'household.create': { minHouseholdRole: HOUSEHOLD_ROLE.CHILD },

  // Global superuser only.
  'system.admin': { systemOnly: true },
};

export function isAdmin(roleId: number | null | undefined): boolean {
  return roleId === ROLE_ID.ADMIN;
}

export function householdRank(role: HouseholdRole): number {
  return role ? HOUSEHOLD_RANK[role] ?? -1 : -1;
}

/** Does the given household role satisfy the required minimum? */
export function meetsHouseholdLevel(
  role: HouseholdRole,
  required: HouseholdRole,
): boolean {
  if (required === null) return true;
  return householdRank(role) >= householdRank(required);
}

/**
 * Resolve whether an actor may perform `cap`.
 * `admin` bypasses household scoping for every non-system capability.
 */
export function authorize(
  cap: Capability,
  ctx: { roleId: number | null | undefined; householdRole: HouseholdRole },
): boolean {
  // Any authenticated user may create their own household.
  if (cap === 'household.create') return true;

  const perm = PERMISSIONS[cap];
  if ('systemOnly' in perm) {
    return isAdmin(ctx.roleId);
  }
  if (isAdmin(ctx.roleId)) return true; // admin can act in any household
  if (!ctx.householdRole) return false; // must belong to a household
  return meetsHouseholdLevel(ctx.householdRole, perm.minHouseholdRole);
}
