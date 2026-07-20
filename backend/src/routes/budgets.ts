import { Router, Request, Response } from 'express';
import { requireCapability } from '../authz/authorize';
import { findUserById } from '../services/userService';
import { getCurrentBudgets, setMonthlyBudget, updateBudget, deleteBudget, getCategoryBreakdown, suggestCutbacks, evaluateAlertThresholds, parseCategoryThresholds } from '../services/budgetService';
import { monthlyTotal } from '../services/expenseService';

const router = Router();

router.get('/', requireCapability('budget.view'), async (req: Request, res: Response) => {
  try {
    const user = await findUserById(req.userId!);
    if (!user || !user.household_id) {
      return res.status(400).json({ error: 'You need a household first' });
    }
    const now = new Date();
    const month = Number(req.query.month ?? now.getMonth() + 1);
    const year = Number(req.query.year ?? now.getFullYear());

    const budgets = await getCurrentBudgets(user.household_id, month, year);
    const total_budget = budgets
      .filter((b) => b.category_id === null)
      .reduce((s, b) => s + Number(b.amount), 0);
    const spent_this_month = await monthlyTotal(user.household_id, year, month);

    return res.json({
      month,
      year,
      budgets,
      total_budget,
      spent_this_month,
      remaining: total_budget - spent_this_month,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/', requireCapability('budget.manage'), async (req: Request, res: Response) => {
  try {
    const user = await findUserById(req.userId!);
    if (!user || !user.household_id) {
      return res.status(400).json({ error: 'You need a household first' });
    }
    const { amount } = req.body ?? {};
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 0) {
      return res.status(400).json({ error: 'amount must be a non-negative number' });
    }
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const id = await setMonthlyBudget(user.household_id, amt, month, year);
    return res.status(201).json({ id, amount: amt, month, year });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Cut-back suggestions + per-lever alert thresholds (per-request params).
//   ?threshold=80             -> alert every lever above 80% of its budget
//   &category_thresholds=Food:80,Groceries:90  -> per-lever overrides
router.get('/suggestions', requireCapability('budget.view'), async (req: Request, res: Response) => {
  try {
    const user = await findUserById(req.userId!);
    if (!user || !user.household_id) {
      return res.status(400).json({ error: 'You need a household first' });
    }
    const now = new Date();
    const month = Number(req.query.month ?? now.getMonth() + 1);
    const year = Number(req.query.year ?? now.getFullYear());
    const threshold = Number(req.query.threshold ?? 80);
    const defaultThreshold = Number.isFinite(threshold) ? threshold : 80;

    const breakdown = await getCategoryBreakdown(user.household_id, month, year);
    const cutbacks = suggestCutbacks(breakdown);
    const perLever = parseCategoryThresholds(
      typeof req.query.category_thresholds === 'string'
        ? req.query.category_thresholds
        : undefined,
    );
    const alerts = evaluateAlertThresholds(breakdown, perLever, defaultThreshold);

    return res.json({
      month,
      year,
      cutback_suggestions: cutbacks,
      alert_thresholds: {
        default_threshold: defaultThreshold,
        per_lever_thresholds: perLever,
        result: alerts,
      },
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

function parseIdParam(raw: string | undefined): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function statusFor(err: any): number {
  return /not found/i.test(err?.message ?? '') ? 404 : 500;
}

router.put('/:id', requireCapability('budget.manage'), async (req: Request, res: Response) => {
  try {
    const user = await findUserById(req.userId!);
    if (!user || !user.household_id) {
      return res.status(400).json({ error: 'You need a household first' });
    }
    const id = parseIdParam(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: 'invalid id' });
    }
    const { amount } = req.body ?? {};
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 0) {
      return res.status(400).json({ error: 'amount must be a non-negative number' });
    }
    await updateBudget(id, user.household_id, amt);
    return res.json({ id, amount: amt });
  } catch (e: any) {
    return res.status(statusFor(e)).json({ error: e.message });
  }
});

router.delete('/:id', requireCapability('budget.manage'), async (req: Request, res: Response) => {
  try {
    const user = await findUserById(req.userId!);
    if (!user || !user.household_id) {
      return res.status(400).json({ error: 'You need a household first' });
    }
    const id = parseIdParam(req.params.id);
    if (id === null) {
      return res.status(400).json({ error: 'invalid id' });
    }
    await deleteBudget(id, user.household_id);
    return res.json({ id });
  } catch (e: any) {
    return res.status(statusFor(e)).json({ error: e.message });
  }
});

export default router;
