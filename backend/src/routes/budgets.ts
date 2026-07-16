import { Router, Request, Response } from 'express';
import { authGuard } from '../middleware/auth';
import { findUserById } from '../services/userService';
import { getCurrentBudgets, setMonthlyBudget } from '../services/budgetService';
import { monthlyTotal } from '../services/expenseService';

const router = Router();

router.get('/', authGuard, async (req: Request, res: Response) => {
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

router.post('/', authGuard, async (req: Request, res: Response) => {
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

export default router;
