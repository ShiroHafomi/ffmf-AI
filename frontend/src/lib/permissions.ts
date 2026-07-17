"use client";

import { useAuth } from "@/context/AuthContext";
import type { User } from "@/lib/api";

// Client-side mirror of the backend RBAC matrix (backend/src/authz/roles.ts).
// Keep these two in sync.
export type Capability =
  | "insight.view"
  | "budget.view"
  | "budget.manage"
  | "expense.view"
  | "expense.create"
  | "category.view"
  | "category.manage"
  | "household.view"
  | "household.manage"
  | "household.create"
  | "system.admin";

const HOUSEHOLD_RANK: Record<string, number> = {
  child: 0,
  parent: 1,
  owner: 2,
};

const HOUSEHOLD_MIN: Record<Exclude<Capability, "system.admin" | "household.create">, string> = {
  "insight.view": "child",
  "budget.view": "child",
  "expense.view": "child",
  "category.view": "child",
  "household.view": "child",
  "expense.create": "parent",
  "budget.manage": "parent",
  "category.manage": "parent",
  "household.manage": "owner",
};

export function isAdmin(user: User | null): boolean {
  return !!user && user.role_id === 1;
}

function householdRank(role: string | null): number {
  return role ? HOUSEHOLD_RANK[role] ?? -1 : -1;
}

/** Does the given user satisfy the capability? */
export function can(user: User | null, cap: Capability): boolean {
  if (!user) return false;
  if (cap === "system.admin") return isAdmin(user);
  if (cap === "household.create") return true; // any authenticated user
  if (isAdmin(user)) return true; // admin acts everywhere
  const required = HOUSEHOLD_MIN[cap];
  return householdRank(user.household_role) >= householdRank(required);
}

/** Hook: returns a bound `can(cap)` for the current user. */
export function useCan(): (cap: Capability) => boolean {
  const { user } = useAuth();
  return (cap: Capability) => can(user, cap);
}

export function roleLabel(
  t: (key: string) => string,
  user: User | null,
): string {
  if (isAdmin(user)) return t("role.admin");
  switch (user?.household_role) {
    case "owner":
      return t("role.owner");
    case "parent":
      return t("role.parent");
    case "child":
      return t("role.child");
    default:
      return "";
  }
}
