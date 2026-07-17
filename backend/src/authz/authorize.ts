import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { getUserAuthContext } from '../services/roleService';
import { authorize as checkAuthz, type Capability } from './roles';

// Auth context attached to every request after capability checks pass.
export interface AuthContext {
  userId: number;
  roleId: number | null;
  householdId: number | null;
  householdRole: import('./roles').HouseholdRole;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/**
 * Middleware factory: require a specific capability. Validates the JWT,
 * resolves the actor's role context, and enforces the RBAC matrix.
 * On success sets `req.auth` and calls `next()`; otherwise 401/403.
 */
export function requireCapability(cap: Capability) {
  return async function (req: Request, res: Response, next: NextFunction) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }
    const token = header.slice('Bearer '.length);
    let userId: number;
    try {
      const payload = verifyAccessToken(token);
      userId = payload.sub as number;
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    let ctx;
    try {
      ctx = await getUserAuthContext(userId);
    } catch (e: any) {
      return res.status(500).json({ error: e.message ?? 'auth resolution failed' });
    }

    if (!checkAuthz(cap, ctx)) {
      return res.status(403).json({
        error: 'Forbidden',
        reason: `capability '${cap}' not allowed for your role`,
      });
    }

    // Keep req.userId for handlers that still read it (authGuard compat).
    req.userId = userId;
    req.auth = {
      userId,
      roleId: ctx.roleId,
      householdId: ctx.householdId,
      householdRole: ctx.householdRole,
    };
    next();
  };
}

/**
 * Object-level check for routes that act on a *target* household passed in the
 * URL (e.g. /api/insights/:householdId). A non-admin may only access their own
 * household; an admin may access any. Requires `requireCapability` to have run
 * first (so `req.auth` is populated).
 */
export function canAccessHousehold(req: Request, householdId: number): boolean {
  const auth = req.auth;
  if (!auth) return false;
  if (auth.roleId === 1) return true; // admin: global superuser
  return auth.householdId === householdId;
}
