import { Router, Request, Response } from 'express';
import { authGuard } from '../middleware/auth';
import { config } from '../config';

const router = Router();

// Server-side proxy to the FastAPI AI microservice (no CORS needed).
router.get('/:householdId', authGuard, async (req: Request, res: Response) => {
  const { householdId } = req.params;
  if (!/^\d+$/.test(householdId)) {
    return res.status(400).json({ error: 'householdId must be numeric' });
  }
  try {
    const url = `${config.aiServiceUrl}/predict/${householdId}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    const data = await resp.json();
    return res.status(resp.status).json(data);
  } catch (e: any) {
    return res.status(502).json({ error: 'AI service unavailable', detail: e.message });
  }
});

export default router;
