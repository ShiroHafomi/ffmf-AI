import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireCapability } from '../authz/authorize';
import {
  listAllHouseholds,
  listAllUsers,
  setUserRole,
} from '../services/roleService';
import { ROLE_ID } from '../authz/roles';

// Admin-only (global superuser) endpoints. All require system.admin capability.
const router = Router();

router.get('/households', requireCapability('system.admin'), async (_req: Request, res: Response) => {
  try {
    const households = await listAllHouseholds();
    return res.json({ households });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

router.get('/users', requireCapability('system.admin'), async (_req: Request, res: Response) => {
  try {
    const users = await listAllUsers();
    return res.json({ users });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

const roleBody = z.object({
  roleId: z.union([z.literal(ROLE_ID.ADMIN), z.literal(ROLE_ID.MEMBER)]),
});

// Promote/demote a user between admin (1) and member (3).
router.patch('/users/:userId/role', requireCapability('system.admin'), async (req: Request, res: Response) => {
  try {
    const parsedUserId = Number(req.params.userId);
    if (!Number.isInteger(parsedUserId)) {
      return res.status(400).json({ error: 'invalid userId' });
    }
    const body = roleBody.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ error: 'roleId must be 1 (admin) or 3 (member)' });
    }
    await setUserRole(parsedUserId, body.data.roleId);
    return res.json({ id: parsedUserId, roleId: body.data.roleId });
  } catch (e: any) {
    const status = /not found|invalid email|last admin/.test(e.message) ? 400 : 500;
    return res.status(status).json({ error: e.message });
  }
});

export default router;
