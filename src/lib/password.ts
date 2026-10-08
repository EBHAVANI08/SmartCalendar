import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

/**
 * Single place that hashes and verifies stored credentials.
 *
 * Every stored password must be a bcrypt hash. Plain-text rows written before
 * this module existed are converted by `scripts/hash-passwords.ts`. Until that
 * script has been applied, `ALLOW_LEGACY_PLAINTEXT_LOGIN=true` can be set for
 * one deploy: a plain-text match is then accepted once and replaced by its hash.
 */

const BCRYPT_ROUNDS = 10;
const BCRYPT_PATTERN = /^\$2[aby]\$/;

export function isBcryptHash(value: unknown): value is string {
  return typeof value === 'string' && BCRYPT_PATTERN.test(value);
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

function legacyPlaintextAllowed(): boolean {
  return process.env.ALLOW_LEGACY_PLAINTEXT_LOGIN === 'true';
}

/**
 * True when `provided` matches the stored credential. An empty stored value
 * never authenticates. A non-bcrypt stored value is rejected unless the legacy
 * bridge is enabled, in which case a match is upgraded through `onUpgrade`.
 */
export async function verifyPassword(
  provided: string,
  stored: string | null | undefined,
  onUpgrade?: (newHash: string) => Promise<unknown>
): Promise<boolean> {
  if (!stored || !provided) return false;
  if (isBcryptHash(stored)) return bcrypt.compare(provided, stored);
  if (!legacyPlaintextAllowed() || provided !== stored) return false;
  if (onUpgrade) {
    try {
      await onUpgrade(await hashPassword(provided));
    } catch {
      // The login still succeeds; the row is upgraded on a later login or by the script.
    }
  }
  return true;
}

/**
 * A random password for accounts created by an Admin. It is shown to the Admin
 * once and only its hash is stored.
 */
export function generateTemporaryPassword(): string {
  return randomBytes(9).toString('base64url');
}
