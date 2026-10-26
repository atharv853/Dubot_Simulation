import { UserRole } from '../realtime/types';

export const SESSION_COOKIE_NAME = 'dobot_session';

export interface AuthJwtPayload {
  username: string;
  role: UserRole;
  sessionId: string;
  iat?: number;
  exp?: number;
}

/**
 * Edge-compatible JWT parser that extracts and validates the payload
 * without requiring Node.js internal modules in edge runtime.
 */
export function decodeJwtEdge(token: string): AuthJwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    // Decode base64url payload
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );

    const payload = JSON.parse(jsonPayload) as AuthJwtPayload;

    // Check expiration if present
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      return null;
    }

    if (!payload.username || !payload.role) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
