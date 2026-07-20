import { Router, Request, Response } from 'express';
import { requireCapability } from '../authz/authorize';
import { findUserById } from '../services/userService';
import {
  expenseByCategoryBetween,
  financialByRange,
  trend,
  detail,
  isDateStr,
  type TrendType,
  type TrendPeriod,
  type DetailType,
} from '../services/reportService';

const router = Router();

async function requireHousehold(req: Request, res: Response): Promise<number | null> {
  const user = await findUserById(req.userId!);
  if (!user || !user.household_id) {
    res.status(400).json({ error: 'You need a household first' });
    return null;
  }
  return user.household_id;
}

const TREND_TYPES: TrendType[] = ['income', 'expense', 'net'];
const TREND_PERIODS: TrendPeriod[] = ['daily', 'monthly', 'yearly'];
const DETAIL_TYPES: DetailType[] = ['income', 'expense'];

// GET /api/reports/expense-category?fromDate=&toDate= -> [ { category, total } ]
router.get('/expense-category', requireCapability('report.view'), async (req: Request, res: Response) => {
  try {
    const householdId = await requireHousehold(req, res);
    if (householdId === null) return;
    const from = req.query.fromDate as string | undefined;
    const to = req.query.toDate as string | undefined;
    if (!isDateStr(from) || !isDateStr(to)) {
      return res.status(400).json({ error: 'fromDate and toDate must be YYYY-MM-DD' });
    }
    const rows = await expenseByCategoryBetween(householdId, from, to);
    return res.json(rows);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// GET /api/reports/financial?fromDate=&toDate= -> { income, expense, balance }
router.get('/financial', requireCapability('report.view'), async (req: Request, res: Response) => {
  try {
    const householdId = await requireHousehold(req, res);
    if (householdId === null) return;
    const from = req.query.fromDate as string | undefined;
    const to = req.query.toDate as string | undefined;
    if (!isDateStr(from) || !isDateStr(to)) {
      return res.status(400).json({ error: 'fromDate and toDate must be YYYY-MM-DD' });
    }
    const result = await financialByRange(householdId, from, to);
    return res.json(result);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// GET /api/reports/trend?type=income|expense|net&period=daily|monthly|yearly
//   optional &fromDate=&toDate= -> [ { date, value } ]
router.get('/trend', requireCapability('report.view'), async (req: Request, res: Response) => {
  try {
    const householdId = await requireHousehold(req, res);
    if (householdId === null) return;
    const type = (req.query.type as string | undefined) ?? 'net';
    const period = (req.query.period as string | undefined) ?? 'monthly';
    if (!TREND_TYPES.includes(type as TrendType)) {
      return res.status(400).json({ error: 'type must be income, expense, or net' });
    }
    if (!TREND_PERIODS.includes(period as TrendPeriod)) {
      return res.status(400).json({ error: 'period must be daily, monthly, or yearly' });
    }
    const from = req.query.fromDate as string | undefined;
    const to = req.query.toDate as string | undefined;
    if ((from || to) && !(isDateStr(from) && isDateStr(to))) {
      return res.status(400).json({ error: 'fromDate and toDate must both be YYYY-MM-DD' });
    }
    const points = await trend(
      householdId,
      type as TrendType,
      period as TrendPeriod,
      isDateStr(from) ? from : undefined,
      isDateStr(to) ? to : undefined,
    );
    return res.json(points);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// GET /api/reports/detail?type=income|expense&fromDate=&toDate= -> [ rows ]
router.get('/detail', requireCapability('report.view'), async (req: Request, res: Response) => {
  try {
    const householdId = await requireHousehold(req, res);
    if (householdId === null) return;
    const type = (req.query.type as string | undefined) ?? 'expense';
    if (!DETAIL_TYPES.includes(type as DetailType)) {
      return res.status(400).json({ error: 'type must be income or expense' });
    }
    const from = req.query.fromDate as string | undefined;
    const to = req.query.toDate as string | undefined;
    if (!isDateStr(from) || !isDateStr(to)) {
      return res.status(400).json({ error: 'fromDate and toDate must be YYYY-MM-DD' });
    }
    const rows = await detail(householdId, type as DetailType, from, to);
    return res.json(rows);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
