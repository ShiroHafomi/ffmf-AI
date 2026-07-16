import { Router } from 'express';
import {
  register,
  login,
  refresh,
  logout,
  me,
} from '../controllers/authController';
import { authGuard } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';

const router = Router();

// Brute-force / abuse protection on credential endpoints.
const loginLimiter = rateLimit(50, 10 * 60 * 1000); // 50 logins / 10 min per IP
const registerLimiter = rateLimit(30, 60 * 60 * 1000); // 30 signups / hour per IP

router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', authGuard, me);

export default router;
