import { Router, Request, Response } from 'express';
import { authGuard } from '../middleware/auth';
import { requireCapability } from '../authz/authorize';
import { findUserById } from '../services/userService';
import { getHouseholdWithMembers, createHousehold } from '../services/householdService';
import {
  listMembers,
  addMember,
  setMemberRole,
  removeMember,
} from '../services/roleService';
import { HOUSEHOLD_ROLE, type HouseholdRole } from '../authz/roles';

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

// List members of the caller's household (any member, including child).
router.get('/members', requireCapability('household.view'), async (req: Request, res: Response) => {
  try {
    const householdId = req.auth!.householdId!;
    const members = await listMembers(householdId);
    return res.json({ members });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Add an existing user to this household as a parent or child (owner/admin only).
router.post('/members', requireCapability('household.manage'), async (req: Request, res: Response) => {
  try {
    const householdId = req.auth!.householdId!;
    const { email, role } = req.body ?? {};
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'email is required' });
    }
    if (role !== HOUSEHOLD_ROLE.PARENT && role !== HOUSEHOLD_ROLE.CHILD) {
      return res.status(400).json({ error: "role must be 'parent' or 'child'" });
    }
    const id = await addMember(householdId, email, role as HouseholdRole);
    return res.status(201).json({ id, email, role });
  } catch (e: any) {
    const status = /already belongs|no user/.test(e.message) ? 400 : 500;
    return res.status(status).json({ error: e.message });
  }
});

// Change a member's role (owner/admin only). Owner role is fixed at creation.
router.patch('/members/:userId', requireCapability('household.manage'), async (req: Request, res: Response) => {
  try {
    const householdId = req.auth!.householdId!;
    const targetUserId = Number(req.params.userId);
    const { role } = req.body ?? {};
    if (!Number.isInteger(targetUserId)) {
      return res.status(400).json({ error: 'invalid userId' });
    }
    if (role !== HOUSEHOLD_ROLE.PARENT && role !== HOUSEHOLD_ROLE.CHILD) {
      return res.status(400).json({ error: "role must be 'parent' or 'child'" });
    }
    await setMemberRole(householdId, targetUserId, role as HouseholdRole);
    return res.json({ id: targetUserId, role });
  } catch (e: any) {
    const status = /not found/.test(e.message) ? 404 : 500;
    return res.status(status).json({ error: e.message });
  }
});

// Remove a member (owner/admin only). Owner cannot be removed.
router.delete('/members/:userId', requireCapability('household.manage'), async (req: Request, res: Response) => {
  try {
    const householdId = req.auth!.householdId!;
    const targetUserId = Number(req.params.userId);
    if (!Number.isInteger(targetUserId)) {
      return res.status(400).json({ error: 'invalid userId' });
    }
    await removeMember(householdId, targetUserId);
    return res.json({ id: targetUserId, removed: true });
  } catch (e: any) {
    const status = /owner|not found/.test(e.message) ? 400 : 500;
    return res.status(status).json({ error: e.message });
  }
});

export default router;
