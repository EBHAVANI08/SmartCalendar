import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/db';
import { RESET_CODE_MAX_ATTEMPTS, RESET_CODE_TTL_MS } from '@/lib/security-constants';

/**
 * Password-reset codes, kept on the server only.
 *
 * Earlier versions sent the browser a signed token holding a hash of the
 * 6-digit code; with only 900,000 possible codes that hash could be cracked
 * offline in minutes. Now the code is stored as a salted HMAC in the database
 * (PasswordResetCode), never returned to the caller, checked with an attempt
 * limit, and usable once.
 */

/** The single account a reset code was issued for; a reset changes only this row. */
export interface ResetAccount {
  type: 'teacher' | 'school' | 'member' | 'admin';
  id: string;
}

const hashCode = (code: string, salt: string) => createHmac('sha256', salt).update(code).digest('hex');

// On MongoDB a field Prisma never wrote is "unset", which `usedAt: null` does not match.
const UNUSED = { OR: [{ usedAt: null }, { usedAt: { isSet: false } }] };

/** Codes requested for this email since `since` (to limit how often codes are sent). */
export async function resetRequestsSince(email: string, since: Date): Promise<number> {
  return db.passwordResetCode.count({ where: { email: email.trim().toLowerCase(), createdAt: { gte: since } } });
}

/** Creates a new code for the account (earlier unused codes for the email stop working). */
export async function createPasswordResetOtp(email: string, account: ResetAccount, requestIp?: string): Promise<{
  otp: string;
  expiresInMinutes: number;
}> {
  const cleanEmail = email.trim().toLowerCase();
  const otp = String(randomInt(100000, 1000000));
  const salt = randomBytes(16).toString('hex');
  await db.passwordResetCode.updateMany({ where: { email: cleanEmail, ...UNUSED }, data: { usedAt: new Date() } });
  await db.passwordResetCode.create({
    data: {
      email: cleanEmail,
      accountType: account.type,
      accountId: account.id,
      codeHash: hashCode(otp, salt),
      salt,
      expiresAt: new Date(Date.now() + RESET_CODE_TTL_MS),
      usedAt: null,
      requestIp: requestIp ?? null,
    },
  });
  return { otp, expiresInMinutes: Math.round(RESET_CODE_TTL_MS / 60000) };
}

/** Checks the code entered for the email; a correct code is used up immediately. */
export async function verifyPasswordResetOtp(
  email: string,
  enteredOtp: string,
): Promise<{ valid: boolean; error?: string; account?: ResetAccount }> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanOtp = enteredOtp.trim();
  if (!/^\d{6}$/.test(cleanOtp)) return { valid: false, error: 'Please enter a valid 6-digit code.' };

  const entry = await db.passwordResetCode.findFirst({
    where: { email: cleanEmail, ...UNUSED, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!entry) return { valid: false, error: 'Invalid or expired code. Please request a new code.' };
  if (entry.attempts >= RESET_CODE_MAX_ATTEMPTS) {
    await db.passwordResetCode.updateMany({ where: { id: entry.id, ...UNUSED }, data: { usedAt: new Date() } });
    return { valid: false, error: 'Too many incorrect attempts. Please request a new code.' };
  }

  const expected = Buffer.from(entry.codeHash, 'hex');
  const actual = Buffer.from(hashCode(cleanOtp, entry.salt), 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    const updated = await db.passwordResetCode.update({ where: { id: entry.id }, data: { attempts: { increment: 1 } } });
    const left = Math.max(0, RESET_CODE_MAX_ATTEMPTS - updated.attempts);
    return { valid: false, error: left ? `Incorrect code. You have ${left} attempt(s) left.` : 'Too many incorrect attempts. Please request a new code.' };
  }

  // Use the code exactly once, even if two requests race.
  const claimed = await db.passwordResetCode.updateMany({ where: { id: entry.id, ...UNUSED }, data: { usedAt: new Date() } });
  if (claimed.count === 0) return { valid: false, error: 'This code was already used. Please request a new code.' };
  if (!['teacher', 'school', 'member', 'admin'].includes(entry.accountType)) return { valid: false, error: 'This code is no longer valid.' };
  return { valid: true, account: { type: entry.accountType as ResetAccount['type'], id: entry.accountId } };
}
