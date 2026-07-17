/**
 * Unit tests for the RBAC permission matrix (backend/src/authz/roles.ts).
 * These are pure-function checks — no database or running server required.
 * Run with:  npx tsx tests/rbac.test.ts
 */

import { authorize, ROLE_ID, HOUSEHOLD_ROLE, type Capability } from '../src/authz/roles';
import { canAccessHousehold } from '../src/authz/authorize';

let failures = 0;
function check(cond: boolean, msg: string) {
  if (cond) console.log('  PASS', msg);
  else {
    console.log('  FAIL', msg);
    failures++;
  }
}

// ctx helper: { roleId, householdRole }
const admin = { roleId: ROLE_ID.ADMIN, householdRole: null };
const owner = { roleId: ROLE_ID.MEMBER, householdRole: HOUSEHOLD_ROLE.OWNER };
const parent = { roleId: ROLE_ID.MEMBER, householdRole: HOUSEHOLD_ROLE.PARENT };
const child = { roleId: ROLE_ID.MEMBER, householdRole: HOUSEHOLD_ROLE.CHILD };
const noHousehold = { roleId: ROLE_ID.MEMBER, householdRole: null };

const viewCaps: Capability[] = ['insight.view', 'budget.view', 'expense.view', 'category.view', 'household.view'];
const manageCaps: Capability[] = ['expense.create', 'budget.manage', 'category.manage'];

console.log('Admin (global superuser)');
check(authorize('system.admin', admin), 'admin -> system.admin');
for (const c of [...viewCaps, ...manageCaps, 'household.manage', 'household.create']) {
  check(authorize(c, admin), `admin -> ${c}`);
}

console.log('Owner (household head)');
check(!authorize('system.admin', owner), 'owner -> NOT system.admin');
for (const c of [...viewCaps, ...manageCaps, 'household.manage', 'household.create']) {
  check(authorize(c, owner), `owner -> ${c}`);
}

console.log('Parent');
check(!authorize('system.admin', parent), 'parent -> NOT system.admin');
check(!authorize('household.manage', parent), 'parent -> NOT household.manage');
for (const c of viewCaps) check(authorize(c, parent), `parent -> ${c}`);
for (const c of manageCaps) check(authorize(c, parent), `parent -> ${c}`);

console.log('Child (read-only)');
check(!authorize('system.admin', child), 'child -> NOT system.admin');
check(!authorize('household.manage', child), 'child -> NOT household.manage');
for (const c of manageCaps) check(!authorize(c, child), `child -> NOT ${c}`);
for (const c of viewCaps) check(authorize(c, child), `child -> ${c}`);

console.log('Member with no household');
check(authorize('household.create', noHousehold), 'no-household -> household.create');
check(!authorize('system.admin', noHousehold), 'no-household -> NOT system.admin');
for (const c of [...viewCaps, ...manageCaps, 'household.manage']) {
  check(!authorize(c, noHousehold), `no-household -> NOT ${c}`);
}

console.log('Object-level household access (predict/insights)');
const adminReq = { auth: { userId: 1, roleId: ROLE_ID.ADMIN, householdId: 5, householdRole: null } } as any;
check(canAccessHousehold(adminReq, 999), 'admin -> can access any household');
const ownerReq = { auth: { userId: 2, roleId: ROLE_ID.MEMBER, householdId: 7, householdRole: HOUSEHOLD_ROLE.OWNER } } as any;
check(canAccessHousehold(ownerReq, 7), 'owner -> can access own household');
check(!canAccessHousehold(ownerReq, 8), 'owner -> cannot access other household');
const childReq = { auth: { userId: 3, roleId: ROLE_ID.MEMBER, householdId: 7, householdRole: HOUSEHOLD_ROLE.CHILD } } as any;
check(canAccessHousehold(childReq, 7), 'child -> can access own household');
check(!canAccessHousehold(childReq, 99), 'child -> cannot access other household');
const noHH = { auth: { userId: 4, roleId: ROLE_ID.MEMBER, householdId: null, householdRole: null } } as any;
check(!canAccessHousehold(noHH, 1), 'member without household -> cannot access any');

console.log(failures ? `\nRBAC TESTS FAILED (${failures} check(s))` : '\nRBAC TESTS PASSED');
process.exit(failures ? 1 : 0);
