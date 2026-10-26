import crypto from 'crypto';
import { UserRole } from '../realtime/types';

export interface StoredUser {
  username: string;
  role: UserRole;
  passwordHash: string; // salt:hash format
}

/**
 * Hash a password using PBKDF2 with SHA-512 and a random salt
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verify a plaintext password against a stored salt:hash string
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, originalHash] = storedHash.split(':');
    if (!salt || !originalHash) return false;
    const computedHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(originalHash, 'hex'), Buffer.from(computedHash, 'hex'));
  } catch {
    return false;
  }
}

// Development seeded users (passwords are stored as salted hashes, never plaintext in client code)
// Default host: atharv / atharv123
// Default controller: test / test123
const DEFAULT_HOST_USERNAME = process.env.HOST_USERNAME || 'atharv';
const DEFAULT_HOST_PASSWORD = process.env.HOST_PASSWORD || 'atharv123';
const DEFAULT_CONTROLLER_USERNAME = process.env.CONTROLLER_USERNAME || 'test';
const DEFAULT_CONTROLLER_PASSWORD = process.env.CONTROLLER_PASSWORD || 'test123';

export function getSeedUsers(): Record<string, StoredUser> {
  const hostHash = hashPassword(DEFAULT_HOST_PASSWORD);
  const controllerHash = hashPassword(DEFAULT_CONTROLLER_PASSWORD);

  return {
    [DEFAULT_HOST_USERNAME.toLowerCase()]: {
      username: DEFAULT_HOST_USERNAME,
      role: 'host',
      passwordHash: hostHash,
    },
    [DEFAULT_CONTROLLER_USERNAME.toLowerCase()]: {
      username: DEFAULT_CONTROLLER_USERNAME,
      role: 'controller',
      passwordHash: controllerHash,
    },
  };
}

let userDatabase: Record<string, StoredUser> | null = null;

export function getUser(username: string): StoredUser | null {
  if (!userDatabase) {
    userDatabase = getSeedUsers();
  }
  return userDatabase[username.toLowerCase().trim()] || null;
}
