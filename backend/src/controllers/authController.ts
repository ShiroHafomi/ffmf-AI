import { Request, Response } from 'express';
import {
  findUserByEmail,
  findUserById,
  createUser,
  emailExists,
  PublicUser,
} from '../services/userService';
import { verifyPassword } from '../utils/hash';
import { signAccessToken, verifyAccessToken } from '../utils/jwt';
import {
  generateRefreshToken,
  storeRefreshToken,
  consumeRefreshToken,
  deleteRefreshToken,
} from '../services/tokenService';
import { config } from '../config';
import { logger } from '../utils/logger';

function setRefreshCookie(res: Response, token: string) {
  res.cookie('refresh_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: config.refreshExpiresDays * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function publicUser(u: PublicUser) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    full_name: u.full_name,
    role_id: u.role_id,
    household_id: u.household_id,
    household_role: u.household_role ?? null,
    status: u.status,
  };
}

export async function register(req: Request, res: Response) {
  try {
    const { email, password, name } = req.body ?? {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'password must be at least 6 characters' });
    }
    if (await emailExists(email)) {
      return res.status(409).json({ error: 'email already registered' });
    }
    const id = await createUser({ email, password, name });
    const user = await findUserById(id);
    const access = signAccessToken({ sub: id, email });
    const refresh = generateRefreshToken();
    await storeRefreshToken(id, refresh);
    setRefreshCookie(res, refresh);
    return res.status(201).json({ accessToken: access, user: publicUser(user!) });
  } catch (e: any) {
    logger.error('register failed:', e?.message ?? e);
    return res.status(500).json({ error: e.message ?? 'registration failed' });
  }
}

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    const user = await findUserByEmail(email);
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return res.status(401).json({ error: 'invalid email or password' });
    }
    const access = signAccessToken({ sub: user.id, email: user.email });
    const refresh = generateRefreshToken();
    await storeRefreshToken(user.id, refresh);
    setRefreshCookie(res, refresh);
    return res.json({ accessToken: access, user: publicUser(user) });
  } catch (e: any) {
    logger.error('login failed:', e?.message ?? e);
    return res.status(500).json({ error: e.message ?? 'login failed' });
  }
}

export async function refresh(req: Request, res: Response) {
  try {
    const raw = req.cookies?.refresh_token;
    if (!raw) return res.status(401).json({ error: 'no refresh token' });
    const userId = await consumeRefreshToken(raw);
    if (!userId) {
      res.clearCookie('refresh_token');
      return res.status(401).json({ error: 'invalid refresh token' });
    }
    await deleteRefreshToken(userId, raw); // rotate
    const user = await findUserById(userId);
    const access = signAccessToken({ sub: userId, email: user?.email });
    const newRefresh = generateRefreshToken();
    await storeRefreshToken(userId, newRefresh);
    setRefreshCookie(res, newRefresh);
    return res.json({ accessToken: access, user: publicUser(user!) });
  } catch (e: any) {
    return res.status(500).json({ error: e.message ?? 'refresh failed' });
  }
}

export async function logout(req: Request, res: Response) {
  try {
    const raw = req.cookies?.refresh_token;
    const header = req.headers.authorization;
    let userId: number | null = null;
    if (header && header.startsWith('Bearer ')) {
      try {
        userId = verifyAccessToken(header.slice('Bearer '.length)).sub ?? null;
      } catch {
        userId = null;
      }
    }
    if (raw && userId) await deleteRefreshToken(userId, raw);
    res.clearCookie('refresh_token');
    return res.json({ message: 'logged out' });
  } catch (e: any) {
    return res.status(500).json({ error: e.message ?? 'logout failed' });
  }
}

export async function me(req: Request, res: Response) {
  try {
    const userId = req.userId!;
    const user = await findUserById(userId);
    if (!user) return res.status(404).json({ error: 'user not found' });
    return res.json({ user: publicUser(user) });
  } catch (e: any) {
    return res.status(500).json({ error: e.message ?? 'failed' });
  }
}
