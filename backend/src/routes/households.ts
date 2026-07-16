import { Router, Request, Response } from 'express';
import { authGuard } from '../middleware/auth';
import { findUserById } from '../services/userService';
import { getHouseholdWithMembers, createHousehold } from '../services/householdService';

const router = Router();

router.get('/me', authGuard, async (req: Request, res: Response) => {
  try {
    const user = await findUserById(req.userId!);
    if (!user) return res.status(401).json({ error: 'user not found' });
    if (!user.household_id) return res.json({ household: null, members: [] });
    const { household, members } = await getHouseholdWithMembers(user.household_id);
    return res.json({ household, members });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/', authGuard, async (req: Request, res: Response) => {
  try {
    const user = await findUserById(req.userId!);
    if (!user) return res.status(401).json({ error: 'user not found' });
    if (user.household_id) {
      return res.status(409).json({ error: 'You already belong to a household' });
    }
    const { name } = req.body ?? {};
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' });
    }
    const id = await createHousehold(name, user.id);
    return res.status(201).json({ id, name, owner_id: user.id });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
