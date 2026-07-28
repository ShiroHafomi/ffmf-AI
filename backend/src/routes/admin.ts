import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireCapability } from '../authz/authorize';
import {
  listAllHouseholds,
  setUserRole,
} from '../services/roleService';
import { ROLE_ID } from '../authz/roles';
import {
  getSystemSummary,
  listUsers,
  deleteUser,
  deleteHousehold,
  getSystemHealth,
  getSystemMetrics,
  readSystemLogs,
} from '../services/adminService';
import { callAdmin } from '../services/aiClient';

// Admin-only (global superuser) endpoints. All require system.admin capability.
const router = Router();

function parseIdParam(raw: string | undefined): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function statusFor(err: any): number {
  const msg = err?.message ?? '';
  if (/not found/i.test(msg)) return 404;
  if (/cannot (delete|remove)/i.test(msg)) return 400;
  return 500;
}

// --- System summary ---------------------------------------------------------
router.get('/summary', requireCapability('system.admin'), async (_req: Request, res: Response) => {
  try {
    const summary = await getSystemSummary();
    return res.json(summary);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// --- Users ------------------------------------------------------------------
router.get('/users', requireCapability('system.admin'), async (req: Request, res: Response) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const page = typeof req.query.page === 'string' ? Number(req.query.page) : undefined;
    const result = await listUsers({ search, page });
    return res.json(result);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

router.delete('/users/:id', requireCapability('system.admin'), async (req: Request, res: Response) => {
  try {
    const id = parseIdParam(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: 'invalid id' });
    }
    await deleteUser(id, req.userId!);
    return res.json({ id });
  } catch (e: any) {
    return res.status(statusFor(e)).json({ error: e.message });
  }
});

// Spec role update: PUT /users/:id/role with body { role }.
// Accepts 1 / 'admin' / 'member' / 3 and normalizes to a ROLE_ID.
const roleNameSchema = z.enum(['admin', 'member']);
const putRoleBody = z.object({
  role: z.union([z.literal(ROLE_ID.ADMIN), z.literal(ROLE_ID.MEMBER), roleNameSchema]),
});

router.put('/users/:id/role', requireCapability('system.admin'), async (req: Request, res: Response) => {
  try {
    const id = parseIdParam(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: 'invalid id' });
    }
    const body = putRoleBody.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ error: "role must be 1 ('admin') or 3 ('member')" });
    }
    const roleId = body.data.role === 'admin' ? ROLE_ID.ADMIN : body.data.role === 'member'
      ? ROLE_ID.MEMBER
      : body.data.role;
    await setUserRole(id, roleId);
    return res.json({ id, roleId });
  } catch (e: any) {
    return res.status(statusFor(e)).json({ error: e.message });
  }
});

// Backward-compatible role update (kept for existing clients).
const roleBody = z.object({
  roleId: z.union([z.literal(ROLE_ID.ADMIN), z.literal(ROLE_ID.MEMBER)]),
});

router.patch('/users/:userId/role', requireCapability('system.admin'), async (req: Request, res: Response) => {
  try {
    const parsedUserId = Number(req.params.userId);
    if (!Number.isInteger(parsedUserId)) {
      return res.status(400).json({ error: 'invalid userId' });
    }
    const body = roleBody.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ error: 'roleId must be 1 (admin) or 3 (member)' });
    }
    await setUserRole(parsedUserId, body.data.roleId);
    return res.json({ id: parsedUserId, roleId: body.data.roleId });
  } catch (e: any) {
    return res.status(statusFor(e)).json({ error: e.message });
  }
});

// --- Households -------------------------------------------------------------
router.get('/households', requireCapability('system.admin'), async (_req: Request, res: Response) => {
  try {
    const households = await listAllHouseholds();
    return res.json({ households });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

router.delete('/households/:id', requireCapability('system.admin'), async (req: Request, res: Response) => {
  try {
    const id = parseIdParam(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: 'invalid id' });
    }
    await deleteHousehold(id);
    return res.json({ id });
  } catch (e: any) {
    return res.status(statusFor(e)).json({ error: e.message });
  }
});

// --- System group -----------------------------------------------------------
router.get('/system/health', requireCapability('system.admin'), (_req: Request, res: Response) => {
  return res.json(getSystemHealth());
});

router.get('/system/metrics', requireCapability('system.admin'), (_req: Request, res: Response) => {
  return res.json(getSystemMetrics());
});

router.get('/system/logs', requireCapability('system.admin'), async (req: Request, res: Response) => {
  try {
    const level = typeof req.query.level === 'string' ? req.query.level : undefined;
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    const logs = await readSystemLogs({ level, date, limit });
    return res.json({ logs });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ── FastAPI admin proxy (global data tables + cache + health) ───────────────
// These forward the caller's request to the FastAPI /admin/* service, injecting
// X-Admin-Key server-side via services/aiClient.ts#callAdmin. The admin key
// never reaches the browser. Every route still requires the system.admin
// capability, so a non-admin JWT is rejected (403) before the proxy runs.

// Clamp + validate an integer query param; falls back to `def` when absent/invalid.
function numParam(v: unknown, def: number, min: number, max: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

// Normalize a FastAPI paginated envelope ({<rows>, page, page_size, total,
// total_pages}) into the Node camelCase shape the frontend expects.
function normalizePage(upstream: any, rowsKey: string) {
  const u = upstream ?? {};
  return {
    rows: Array.isArray(u[rowsKey]) ? u[rowsKey] : [],
    page: Number(u.page ?? 1),
    pageSize: Number(u.page_size ?? 50),
    total: Number(u.total ?? 0),
    totalPages: Number(u.total_pages ?? 1),
  };
}

// Generic handler for the four global list endpoints (expenses/budgets/
// categories/incomes): validate pagination + optional household filter, build a
// safe upstream query string, proxy, and normalize the envelope.
function adminListHandler(rowsKey: string) {
  return async (req: Request, res: Response) => {
    const page = numParam(req.query.page, 1, 1, 100000);
    const pageSize = numParam(req.query.page_size, 50, 1, 200);
    const qs = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
    });
    const hidRaw = Number(req.query.household_id);
    if (Number.isInteger(hidRaw) && hidRaw > 0) qs.set('household_id', String(hidRaw));

    const result = await callAdmin(`/admin/${rowsKey}?${qs.toString()}`);
    if (result.status >= 400) {
      return res.status(result.status).json(result.data ?? { error: 'admin service error' });
    }
    return res.json(normalizePage(result.data, rowsKey));
  };
}

router.get('/expenses', requireCapability('system.admin'), adminListHandler('expenses'));
router.get('/budgets', requireCapability('system.admin'), adminListHandler('budgets'));
router.get('/categories', requireCapability('system.admin'), adminListHandler('categories'));
router.get('/incomes', requireCapability('system.admin'), adminListHandler('incomes'));

// Cache statistics — FastAPI-only (the prediction/insights cache lives in its
// process memory, reachable only via the admin service).
router.get('/cache', requireCapability('system.admin'), async (_req: Request, res: Response) => {
  const result = await callAdmin('/admin/cache');
  return res.status(result.status).json(result.data);
});

// Clear the whole cache or a single household's entries.
router.post(
  '/cache/clear',
  requireCapability('system.admin'),
  async (req: Request, res: Response) => {
    const body: { household_id?: number } = {};
    const hid = Number(req.body?.household_id);
    if (Number.isInteger(hid) && hid > 0) body.household_id = hid;
    const result = await callAdmin('/admin/cache/clear', { method: 'POST', body });
    return res.status(result.status).json(result.data);
  },
);

// Richer system health from FastAPI (DB pool, cache stats, uptime, rate limit).
// The native /system/health + /system/metrics stay for the Node process view.
router.get('/health', requireCapability('system.admin'), async (_req: Request, res: Response) => {
  const result = await callAdmin('/admin/health');
  return res.status(result.status).json(result.data);
});

export default router;
