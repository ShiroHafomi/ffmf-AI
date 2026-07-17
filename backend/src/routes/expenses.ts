import { Router, Request, Response } from 'express';
import { requireCapability } from '../authz/authorize';
import { findUserById } from '../services/userService';
import { categoryExists } from '../services/categoryService';
import { listExpenses, createExpense } from '../services/expenseService';

const router = Router();

router.get('/', requireCapability('expense.view'), async (req: Request, res: Response) => {
  try {
    const user = await findUserById(req.userId!);
    if (!user || !user.household_id) {
      return res.status(400).json({ error: 'You need a household first' });
    }
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const expenses = await listExpenses(user.household_id, limit);
    return res.json({ expenses });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/', requireCapability('expense.create'), async (req: Request, res: Response) => {
  try {
    const user = await findUserById(req.userId!);
    if (!user || !user.household_id) {
      return res.status(400).json({ error: 'You need a household first' });
    }
    const { amount, description, category_id, expense_date } = req.body ?? {};
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number' });
    }

    let categoryId: number | null = null;
    if (category_id != null) {
      const n = Number(category_id);
      if (Number.isFinite(n) && n > 0) categoryId = n;
    }

    // Prevent referencing a category from another household (authz check).
    if (categoryId != null) {
      const ok = await categoryExists(user.household_id, categoryId);
      if (!ok) {
        return res
          .status(400)
          .json({ error: 'category does not belong to your household' });
      }
    }

    let expenseDate: string | undefined;
    if (typeof expense_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(expense_date)) {
      expenseDate = expense_date;
    }

    const id = await createExpense({
      householdId: user.household_id,
      userId: user.id,
      amount: amt,
      description: description ?? null,
      categoryId,
      expenseDate,
    });
    return res.status(201).json({ id });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// CSV export of the household's expenses (read-only, respects capability).
router.get('/export', requireCapability('expense.view'), async (req: Request, res: Response) => {
  try {
    const user = await findUserById(req.userId!);
    if (!user || !user.household_id) {
      return res.status(400).json({ error: 'You need a household first' });
    }
    const expenses = await listExpenses(user.household_id, 1000);
    const header = 'id,date,category,description,amount\n';
    const rows = expenses
      .map((e) =>
        [
          e.id,
          e.expense_date,
          (e.category_name ?? '').replace(/[,\n]/g, ' '),
          (e.description ?? '').replace(/[,\n]/g, ' '),
          e.amount,
        ].join(','),
      )
      .join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="expenses.csv"');
    return res.status(200).send(header + rows + '\n');
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
