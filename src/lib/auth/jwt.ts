import jwt from 'jsonwebtoken';
import { UserRole, UserSession, DEFAULT_SESSION_ID } from '../realtime/types';

export const SESSION_COOKIE_NAME = 'dobot_session';

const AUTH_SECRET = process.env.AUTH_SECRET || process.env.JWT_SECRET || 'dobot-magician-secret-key-2024-secure-jwt';

export interface AuthJwtPayload {
  username: string;
  role: UserRole;
  sessionId: string;
  iat?: number;
  exp?: number;
}

export function signToken(user: UserSession): string {
  return jwt.sign(
    {
      username: user.username,
      role: user.role,
      sessionId: user.sessionId || DEFAULT_SESSION_ID,
    },
    AUTH_SECRET,
    { expiresIn: '7d' }
  );
}

export function verifyToken(token: string): AuthJwtPayload | null {
  try {
    const decoded = jwt.verify(token, AUTH_SECRET) as AuthJwtPayload;
    if (decoded && decoded.username && decoded.role) {
      return decoded;
    }
    return null;
  } catch {
    return null;
  }
}
