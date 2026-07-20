import { Router, Request, Response } from 'express';
import { requireCapability } from '../authz/authorize';
import { findUserById } from '../services/userService';
import {
  listIncomes,
  createIncome,
  getIncome,
  updateIncome,
  deleteIncome,
} from '../services/incomeService';

const router = Router();

function parseIdParam(raw: string | undefined): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function statusFor(err: any): number {
  return /not found/i.test(err?.message ?? '') ? 404 : 500;
}

router.get('/', requireCapability('income.view'), async (req: Request, res: Response) => {
  try {
    const user = await findUserById(req.userId!);
    if (!user || !user.household_id) {
      return res.status(400).json({ error: 'You need a household first' });
    }
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const incomes = await listIncomes(user.household_id, limit);
    return res.json({ incomes });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/', requireCapability('income.create'), async (req: Request, res: Response) => {
  try {
    const user = await findUserById(req.userId!);
    if (!user || !user.household_id) {
      return res.status(400).json({ error: 'You need a household first' });
    }
    const { amount, source, income_date, date } = req.body ?? {};
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number' });
    }

    let incomeDate: string | undefined;
    const rawDate = income_date ?? date;
    if (typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      incomeDate = rawDate;
    }

    const src = typeof source === 'string' && source.trim() ? source.trim() : null;

    const id = await createIncome({
      householdId: user.household_id,
      userId: user.id,
      amount: amt,
      source: src,
      incomeDate,
    });
    return res.status(201).json({ id });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

router.get('/:id', requireCapability('income.view'), async (req: Request, res: Response) => {
  try {
    const user = await findUserById(req.userId!);
    if (!user || !user.household_id) {
      return res.status(400).json({ error: 'You need a household first' });
    }
    const id = parseIdParam(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: 'invalid id' });
    }
    const income = await getIncome(id, user.household_id);
    if (!income) {
      return res.status(404).json({ error: 'income not found' });
    }
    return res.json({ income });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

router.put('/:id', requireCapability('income.create'), async (req: Request, res: Response) => {
  try {
    const user = await findUserById(req.userId!);
    if (!user || !user.household_id) {
      return res.status(400).json({ error: 'You need a household first' });
    }
    const id = parseIdParam(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: 'invalid id' });
    }

    const { amount, source, income_date, date } = req.body ?? {};
    const patch: { amount?: number; source?: string | null; incomeDate?: string } = {};

    if (amount !== undefined) {
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) {
        return res.status(400).json({ error: 'amount must be a positive number' });
      }
      patch.amount = amt;
    }
    if (source !== undefined) {
      patch.source = typeof source === 'string' && source.trim() ? source.trim() : null;
    }
    const rawDate = income_date ?? date;
    if (rawDate !== undefined) {
      if (typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
        patch.incomeDate = rawDate;
      } else {
        return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
      }
    }

    await updateIncome(id, user.household_id, patch);
    return res.json({ id });
  } catch (e: any) {
    return res.status(statusFor(e)).json({ error: e.message });
  }
});

router.delete('/:id', requireCapability('income.create'), async (req: Request, res: Response) => {
  try {
    const user = await findUserById(req.userId!);
    if (!user || !user.household_id) {
      return res.status(400).json({ error: 'You need a household first' });
    }
    const id = parseIdParam(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: 'invalid id' });
    }
    await deleteIncome(id, user.household_id);
    return res.json({ id });
  } catch (e: any) {
    return res.status(statusFor(e)).json({ error: e.message });
  }
});

export default router;
