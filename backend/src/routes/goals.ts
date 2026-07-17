import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireCapability } from '../authz/authorize';
import { findUserById } from '../services/userService';
import {
  listGoals,
  createGoal,
  updateGoal,
  deleteGoal,
} from '../services/goalService';

const router = Router();

async function householdIdOf(req: Request): Promise<number | null> {
  const user = await findUserById(req.userId!);
  return user && user.household_id ? user.household_id : null;
}

const createBody = z.object({
  name: z.string().min(1).max(120),
  target_amount: z.number().positive(),
  current_amount: z.number().min(0).optional(),
});

const patchBody = z
  .object({
    name: z.string().min(1).max(120).optional(),
    target_amount: z.number().positive().optional(),
    current_amount: z.number().min(0).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'nothing to update' });

router.get('/', requireCapability('budget.view'), async (req: Request, res: Response) => {
  try {
    const householdId = await householdIdOf(req);
    if (!householdId) return res.status(400).json({ error: 'You need a household first' });
    const goals = await listGoals(householdId);
    return res.json({ goals });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/', requireCapability('budget.manage'), async (req: Request, res: Response) => {
  try {
    const householdId = await householdIdOf(req);
    if (!householdId) return res.status(400).json({ error: 'You need a household first' });
    const body = createBody.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ error: 'invalid goal', details: body.error.issues });
    }
    const id = await createGoal(
      householdId,
      body.data.name,
      body.data.target_amount,
      body.data.current_amount ?? 0,
    );
    return res.status(201).json({ id, ...body.data });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

router.patch('/:id', requireCapability('budget.manage'), async (req: Request, res: Response) => {
  try {
    const householdId = await householdIdOf(req);
    if (!householdId) return res.status(400).json({ error: 'You need a household first' });
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });
    const body = patchBody.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ error: 'invalid update', details: body.error.issues });
    }
    await updateGoal(id, householdId, body.data);
    return res.json({ id, ...body.data });
  } catch (e: any) {
    const status = /not found/.test(e.message) ? 404 : 500;
    return res.status(status).json({ error: e.message });
  }
});

router.delete('/:id', requireCapability('budget.manage'), async (req: Request, res: Response) => {
  try {
    const householdId = await householdIdOf(req);
    if (!householdId) return res.status(400).json({ error: 'You need a household first' });
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });
    await deleteGoal(id, householdId);
    return res.json({ id, deleted: true });
  } catch (e: any) {
    const status = /not found/.test(e.message) ? 404 : 500;
    return res.status(status).json({ error: e.message });
  }
});

export default router;
