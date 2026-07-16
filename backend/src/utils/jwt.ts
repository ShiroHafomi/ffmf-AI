import jwt from 'jsonwebtoken';
import { config } from '../config';

export function signAccessToken(payload: object): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: `${config.jwtExpiresMin}m` });
}

export function verifyAccessToken(token: string): any {
  return jwt.verify(token, config.jwtSecret);
}
