import { Router, Request, Response } from 'express';
import { authGuard } from '../middleware/auth';
import { findUserById } from '../services/userService';
import { listCategories, createCategory } from '../services/categoryService';

const router = Router();

router.get('/', authGuard, async (req: Request, res: Response) => {
  try {
    const user = await findUserById(req.userId!);
    if (!user || !user.household_id) {
      return res.status(400).json({ error: 'You need a household first' });
    }
    const categories = await listCategories(user.household_id);
    return res.json({ categories });
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
    const { name, type } = req.body ?? {};
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' });
    }
    const id = await createCategory(user.household_id, name, type ?? 'expense');
    return res
      .status(201)
      .json({ id, name, type: type ?? 'expense', household_id: user.household_id });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
