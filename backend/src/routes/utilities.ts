import { Router, Request, Response } from 'express';
import { requireCapability } from '../authz/authorize';
import { findUserById } from '../services/userService';
import {
  listReadings,
  createReading,
  usageSummary,
} from '../services/utilityService';

const router = Router();

async function requireHousehold(req: Request, res: Response): Promise<number | null> {
  const user = await findUserById(req.userId!);
  if (!user || !user.household_id) {
    res.status(400).json({ error: 'You need a household first' });
    return null;
  }
  return user.household_id;
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// List meter readings (optionally filtered by type / month).
// GET /api/utilities?type=electricity&month=2026-07
router.get('/', requireCapability('utility.view'), async (req: Request, res: Response) => {
  try {
    const householdId = await requireHousehold(req, res);
    if (householdId === null) return;
    const type = typeof req.query.type === 'string' ? req.query.type : undefined;
    const month = typeof req.query.month === 'string' ? req.query.month : undefined;
    const readings = await listReadings(householdId, { type, month });
    return res.json({ readings });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Add a meter reading.
// POST /api/utilities { type, value, date }
router.post('/', requireCapability('utility.create'), async (req: Request, res: Response) => {
  try {
    const householdId = await requireHousehold(req, res);
    if (householdId === null) return;
    const { type, value, date } = req.body ?? {};
    const t = typeof type === 'string' ? type.trim().toLowerCase() : '';
    if (!t) {
      return res.status(400).json({ error: 'type is required' });
    }
    const val = Number(value);
    if (!Number.isFinite(val) || val <= 0) {
      return res.status(400).json({ error: 'value must be a positive number' });
    }
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    }
    const id = await createReading({ householdId, type: t, value: val, readingDate: date });
    return res.status(201).json({ id });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Usage + derived cost summary for a month.
// GET /api/utilities/summary?month=2026-07
router.get('/summary', requireCapability('utility.view'), async (req: Request, res: Response) => {
  try {
    const householdId = await requireHousehold(req, res);
    if (householdId === null) return;
    const month =
      typeof req.query.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month)
        ? req.query.month
        : currentMonth();
    const summary = await usageSummary(householdId, month);
    return res.json(summary);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
