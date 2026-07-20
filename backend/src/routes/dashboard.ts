import { Router, Request, Response } from 'express';
import { requireCapability } from '../authz/authorize';
import { findUserById } from '../services/userService';
import { summaryByMonth, compareByRange, isDateStr } from '../services/reportService';

const router = Router();

// Resolve the caller's household; expenses/incomes/dashboard are all
// household-scoped, so a missing household is a hard 400 (mirrors expenses.ts).
async function requireHousehold(req: Request, res: Response): Promise<number | null> {
  const user = await findUserById(req.userId!);
  if (!user || !user.household_id) {
    res.status(400).json({ error: 'You need a household first' });
    return null;
  }
  return user.household_id;
}

function currentMonthYear(): { month: number; year: number } {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

// Household cashflow summary for a month. Defaults to the current month.
// GET /api/dashboard/summary  -> { totalIncome, totalExpense, balance }
router.get('/summary', requireCapability('dashboard.view'), async (req: Request, res: Response) => {
  try {
    const householdId = await requireHousehold(req, res);
    if (householdId === null) return;
    const { month, year } = currentMonthYear();
    const m = Number(req.query.month ?? month);
    const y = Number(req.query.year ?? year);
    const summary = await summaryByMonth(householdId, m, y);
    return res.json(summary);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// `/` is an alias for the summary endpoint.
router.get('/', requireCapability('dashboard.view'), async (req: Request, res: Response) => {
  try {
    const householdId = await requireHousehold(req, res);
    if (householdId === null) return;
    const { month, year } = currentMonthYear();
    const m = Number(req.query.month ?? month);
    const y = Number(req.query.year ?? year);
    const summary = await summaryByMonth(householdId, m, y);
    return res.json(summary);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Income vs expense over a date range.
// GET /api/dashboard/compare?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD
router.get('/compare', requireCapability('dashboard.view'), async (req: Request, res: Response) => {
  try {
    const householdId = await requireHousehold(req, res);
    if (householdId === null) return;
    const from = req.query.fromDate as string | undefined;
    const to = req.query.toDate as string | undefined;
    if (!isDateStr(from) || !isDateStr(to)) {
      return res.status(400).json({ error: 'fromDate and toDate must be YYYY-MM-DD' });
    }
    const result = await compareByRange(householdId, from, to);
    return res.json(result);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
