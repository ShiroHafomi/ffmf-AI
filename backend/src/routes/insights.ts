import { Router, Request, Response } from 'express';
import { requireCapability, canAccessHousehold } from '../authz/authorize';
import { callAi } from '../services/aiClient';

const router = Router();

// Server-side proxy to the FastAPI /insights endpoint (no CORS needed).
// Mirrors /api/predict: auth-guarded, numeric id, 8s timeout.
router.get('/:householdId', requireCapability('insight.view'), async (req: Request, res: Response) => {
  const { householdId } = req.params;
  if (!/^\d+$/.test(householdId)) {
    return res.status(400).json({ error: 'householdId must be numeric' });
  }
  // Object-level check: a member may only read their own household's insights.
  const hid = Number(householdId);
  if (!canAccessHousehold(req, hid)) {
    return res.status(403).json({
      error: 'Forbidden',
      reason: 'you are not a member of this household',
    });
  }
  const result = await callAi(`/insights/${householdId}`);
  return res.status(result.status).json(result.data);
});

export default router;
