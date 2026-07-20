import { Router, Request, Response } from 'express';
import { requireCapability } from '../authz/authorize';
import { findUserById } from '../services/userService';
import {
  listNotifications,
  createNotification,
  markRead,
} from '../services/notificationService';

const router = Router();

function parseId(raw: string | undefined): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// List the current user's notifications (optionally only unread).
// GET /api/notifications?unread=1
router.get('/', requireCapability('notification.view'), async (req: Request, res: Response) => {
  try {
    const onlyUnread = req.query.unread === '1' || req.query.unread === 'true';
    const notifications = await listNotifications(req.userId!, onlyUnread);
    return res.json({ notifications });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Mark a notification as read (only the recipient may do this).
// PUT /api/notifications/:id/read
router.put('/:id/read', requireCapability('notification.view'), async (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid id' });
    // Ownership is enforced by scoping the update to the caller's user_id.
    const ok = await markRead(id, req.userId!);
    if (!ok) return res.status(404).json({ error: 'notification not found' });
    return res.json({ id, is_read: true });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Admin: send a notification to a user.
// POST /api/notifications  { userId, message }
router.post('/', requireCapability('notification.send'), async (req: Request, res: Response) => {
  try {
    const { userId, message } = req.body ?? {};
    const uid = Number(userId);
    if (!Number.isInteger(uid) || uid <= 0) {
      return res.status(400).json({ error: 'userId must be a positive integer' });
    }
    const msg = typeof message === 'string' ? message.trim() : '';
    if (!msg) {
      return res.status(400).json({ error: 'message is required' });
    }
    const recipient = await findUserById(uid);
    if (!recipient) {
      return res.status(404).json({ error: 'recipient user not found' });
    }
    const id = await createNotification({ userId: uid, message: msg.slice(0, 500) });
    return res.status(201).json({ id });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
