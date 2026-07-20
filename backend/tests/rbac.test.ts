/**
 * RBAC authorization tests for the FFMS backend.
 *
 * Exercises the pure authorization matrix in `src/authz/roles.ts`:
 *   - global (admin) vs household-role scoping
 *   - capability -> minimum household role / system-only resolution
 *   - admin bypass of household scoping for non-system capabilities
 *
 * Run via `npx tsx tests/rbac.test.ts` (see CI `backend` job).
 * Uses the built-in `node:test` runner; exits non-zero on any failure.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ROLE_ID,
  HOUSEHOLD_ROLE,
  PERMISSIONS,
  isAdmin,
  householdRank,
  meetsHouseholdLevel,
  authorize,
  type Capability,
} from '../src/authz/roles';

const ADMIN = ROLE_ID.ADMIN;
const MEMBER = ROLE_ID.MEMBER;

type Ctx = { roleId: number | null | undefined; householdRole: ReturnType<typeof asRole> };
const asRole = (r: 'owner' | 'parent' | 'child' | null) => r;

test('isAdmin reflects the global ADMIN role id', () => {
  assert.equal(isAdmin(ADMIN), true);
  assert.equal(isAdmin(MEMBER), false);
  assert.equal(isAdmin(null), false);
  assert.equal(isAdmin(undefined), false);
});

test('householdRank orders owner > parent > child', () => {
  assert.equal(householdRank(HOUSEHOLD_ROLE.OWNER), 2);
  assert.equal(householdRank(HOUSEHOLD_ROLE.PARENT), 1);
  assert.equal(householdRank(HOUSEHOLD_ROLE.CHILD), 0);
  assert.equal(householdRank(null), -1);
});

test('meetsHouseholdLevel compares against the minimum role', () => {
  assert.equal(meetsHouseholdLevel(HOUSEHOLD_ROLE.CHILD, null), true); // null requirement -> any role
  assert.equal(meetsHouseholdLevel(HOUSEHOLD_ROLE.OWNER, HOUSEHOLD_ROLE.OWNER), true);
  assert.equal(meetsHouseholdLevel(HOUSEHOLD_ROLE.PARENT, HOUSEHOLD_ROLE.OWNER), false);
  assert.equal(meetsHouseholdLevel(HOUSEHOLD_ROLE.PARENT, HOUSEHOLD_ROLE.CHILD), true);
  assert.equal(meetsHouseholdLevel(HOUSEHOLD_ROLE.CHILD, HOUSEHOLD_ROLE.PARENT), false);
  assert.equal(meetsHouseholdLevel(null, HOUSEHOLD_ROLE.CHILD), false);
});

test('household.create is allowed for any authenticated user', () => {
  assert.equal(authorize('household.create', { roleId: MEMBER, householdRole: null }), true);
  assert.equal(authorize('household.create', { roleId: ADMIN, householdRole: null }), true);
  assert.equal(
    authorize('household.create', { roleId: MEMBER, householdRole: HOUSEHOLD_ROLE.CHILD }),
    true,
  );
});

test('system-only capabilities require a global admin', () => {
  assert.equal(authorize('system.admin', { roleId: ADMIN, householdRole: null }), true);
  assert.equal(authorize('system.admin', { roleId: MEMBER, householdRole: null }), false);
  assert.equal(
    authorize('system.admin', { roleId: MEMBER, householdRole: HOUSEHOLD_ROLE.OWNER }),
    false,
  );
  assert.equal(authorize('notification.send', { roleId: ADMIN, householdRole: null }), true);
  assert.equal(
    authorize('notification.send', { roleId: MEMBER, householdRole: HOUSEHOLD_ROLE.OWNER }),
    false,
  );
});

test('admin bypasses household scoping for non-system capabilities', () => {
  // Admin with NO household membership can still act (bypass).
  assert.equal(authorize('expense.create', { roleId: ADMIN, householdRole: null }), true);
  assert.equal(authorize('household.manage', { roleId: ADMIN, householdRole: null }), true);
});

test('non-admin must belong to a household to be authorized', () => {
  assert.equal(authorize('expense.view', { roleId: MEMBER, householdRole: null }), false);
  assert.equal(authorize('expense.view', { roleId: MEMBER, householdRole: HOUSEHOLD_ROLE.CHILD }), true);
});

test('household capabilities respect the minimum role', () => {
  // PARENT-and-above write capabilities.
  assert.equal(authorize('expense.create', { roleId: MEMBER, householdRole: HOUSEHOLD_ROLE.PARENT }), true);
  assert.equal(authorize('expense.create', { roleId: MEMBER, householdRole: HOUSEHOLD_ROLE.CHILD }), false);
  assert.equal(authorize('budget.manage', { roleId: MEMBER, householdRole: HOUSEHOLD_ROLE.OWNER }), true);
  assert.equal(authorize('budget.manage', { roleId: MEMBER, householdRole: HOUSEHOLD_ROLE.PARENT }), true);
  assert.equal(authorize('budget.manage', { roleId: MEMBER, householdRole: HOUSEHOLD_ROLE.CHILD }), false);

  // OWNER-only household administration.
  assert.equal(authorize('household.manage', { roleId: MEMBER, householdRole: HOUSEHOLD_ROLE.OWNER }), true);
  assert.equal(authorize('household.manage', { roleId: MEMBER, householdRole: HOUSEHOLD_ROLE.PARENT }), false);

  // Read-only capabilities are granted to any household member (incl. child).
  assert.equal(authorize('expense.view', { roleId: MEMBER, householdRole: HOUSEHOLD_ROLE.CHILD }), true);
  assert.equal(authorize('insight.view', { roleId: MEMBER, householdRole: HOUSEHOLD_ROLE.CHILD }), true);
  assert.equal(authorize('dashboard.view', { roleId: MEMBER, householdRole: HOUSEHOLD_ROLE.CHILD }), true);
});

test('every declared capability resolves to a permission entry', () => {
  const caps = Object.keys(PERMISSIONS) as Capability[];
  assert.ok(caps.length > 0, 'expected at least one capability');
  for (const cap of caps) {
    const perm = PERMISSIONS[cap];
    const isSystemOnly = 'systemOnly' in perm;
    const hasMinRole = 'minHouseholdRole' in perm;
    assert.ok(isSystemOnly || hasMinRole, `capability ${cap} must be system-only or have a min role`);
  }
});
