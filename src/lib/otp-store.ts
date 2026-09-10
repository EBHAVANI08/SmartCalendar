import { signJwt, verifyJwt } from '@/lib/jwt-auth';
import bcrypt from 'bcryptjs';

interface OtpEntry {
  email: string;
  otp: string;
  expiresAt: number; // Unix timestamp in ms
  attempts: number;
}

// In-memory store for single-use protection and attempt throttling
const activeOtps = new Map<string, OtpEntry>();

const OTP_EXPIRY_SECONDS = 15 * 60; // 15 minutes
const MAX_ATTEMPTS = 5;

/**
 * Generate a 6-digit OTP and signed token for password reset.
 */
export async function createPasswordResetOtp(email: string): Promise<{
  otp: string;
  otpToken: string;
  expiresInMinutes: number;
}> {
  const cleanEmail = email.trim().toLowerCase();
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const now = Date.now();
  const expiresAt = now + OTP_EXPIRY_SECONDS * 1000;

  // Store in memory
  activeOtps.set(cleanEmail, {
    email: cleanEmail,
    otp,
    expiresAt,
    attempts: 0,
  });

  // Also hash OTP into signed JWT for stateless durability
  const otpHashed = await bcrypt.hash(otp, 6);
  const otpToken = await signJwt(
    {
      userId: cleanEmail,
      email: cleanEmail,
      role: 'teacher', // dummy role required by UserSessionPayload
      schoolId: null,
      name: otpHashed, // embed hashed OTP inside signed token
      modules: 'password_reset_otp',
    },
    OTP_EXPIRY_SECONDS
  );

  return {
    otp,
    otpToken,
    expiresInMinutes: 15,
  };
}

/**
 * Verify OTP entered by user.
 */
export async function verifyPasswordResetOtp(
  email: string,
  enteredOtp: string,
  otpToken?: string
): Promise<{ valid: boolean; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanOtp = enteredOtp.trim();

  if (!cleanOtp || cleanOtp.length !== 6) {
    return { valid: false, error: 'Please enter a valid 6-digit code.' };
  }

  const memoryEntry = activeOtps.get(cleanEmail);

  // Check in-memory store first
  if (memoryEntry) {
    if (Date.now() > memoryEntry.expiresAt) {
      activeOtps.delete(cleanEmail);
      return { valid: false, error: 'This OTP has expired. Please request a new code.' };
    }

    if (memoryEntry.attempts >= MAX_ATTEMPTS) {
      activeOtps.delete(cleanEmail);
      return { valid: false, error: 'Too many incorrect attempts. This OTP has been invalidated. Please request a new code.' };
    }

    if (memoryEntry.otp === cleanOtp) {
      // Invalidate so it cannot be used again
      activeOtps.delete(cleanEmail);
      return { valid: true };
    }

    // Increment failed attempt
    memoryEntry.attempts += 1;
    return {
      valid: false,
      error: `Incorrect OTP. You have ${MAX_ATTEMPTS - memoryEntry.attempts} attempt(s) remaining.`,
    };
  }

  // Fallback: Verify via signed JWT token if present (e.g. server restarted)
  if (otpToken) {
    try {
      const verified = await verifyJwt(otpToken);
      if (
        verified &&
        verified.email.toLowerCase() === cleanEmail &&
        verified.modules === 'password_reset_otp' &&
        verified.name
      ) {
        const matches = await bcrypt.compare(cleanOtp, verified.name);
        if (matches) {
          return { valid: true };
        }
      }
    } catch {}
  }

  return { valid: false, error: 'Invalid or expired OTP. Please request a new code.' };
}

/**
 * Invalidate an active OTP (e.g. after successful password reset)
 */
export function invalidatePasswordResetOtp(email: string) {
  activeOtps.delete(email.trim().toLowerCase());
}
