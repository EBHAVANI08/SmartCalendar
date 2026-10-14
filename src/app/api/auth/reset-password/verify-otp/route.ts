export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPasswordResetOtp } from '@/lib/otp-store';
import { hashPassword } from '@/lib/password';
import { clientIp, pausedFor, record } from '@/lib/rate-limit';
import { LOGIN_FAILURE_WINDOW_MS, LOGIN_MAX_FAILURES_PER_IP } from '@/lib/security-constants';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const otp = String(body.otp || '').trim();
    const newPassword = String(body.password || body.newPassword || '').trim();

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required.' }, { status: 400 });
    }

    if (!otp || otp.length !== 6) {
      return NextResponse.json({ error: 'Please enter the 6-digit OTP code sent to your email.' }, { status: 400 });
    }

    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters long.' }, { status: 400 });
    }

    // Wrong codes from one network address across many emails: pause.
    const ipKey = `reset-verify:ip:${clientIp(request)}`;
    const pause = pausedFor(ipKey, LOGIN_MAX_FAILURES_PER_IP);
    if (pause) {
      return NextResponse.json({ error: `Too many attempts. Please try again in ${Math.ceil(pause / 60)} minute(s).` }, { status: 429, headers: { 'Retry-After': String(pause) } });
    }

    // Verify the code (stored on the server only; used once).
    const otpVerification = await verifyPasswordResetOtp(email, otp);
    if (!otpVerification.valid) {
      record(ipKey, LOGIN_FAILURE_WINDOW_MS);
      return NextResponse.json(
        { error: otpVerification.error || 'Invalid or expired OTP code.' },
        { status: 400 }
      );
    }

    const account = otpVerification.account;
    if (!account) {
      return NextResponse.json({ error: 'This code is no longer valid. Please request a new code.' }, { status: 400 });
    }

    // Update only the account the code was issued for (identified by id when
    // the code was sent), never every record that shares this email.
    const hashedPassword = await hashPassword(newPassword);
    const target = { id: account.id };
    // The account holder chose this password, so any forced change is satisfied.
    const data = { password: hashedPassword, mustChangePassword: false };
    const result =
      account.type === 'teacher' ? await db.teacher.updateMany({ where: target, data })
      : account.type === 'school' ? await db.school.updateMany({ where: target, data })
      : account.type === 'member' ? await db.workspaceMember.updateMany({ where: target, data })
      : await db.admin.updateMany({ where: target, data });

    if (result.count === 0) {
      return NextResponse.json(
        { error: 'Account record could not be updated. Please contact support.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Your password has been reset successfully! You can now sign in with your new password.',
    });
  } catch (error: any) {
    console.error('Error verifying reset OTP:', error);
    return NextResponse.json(
      { error: 'Could not reset the password right now. Please try again.' },
      { status: 500 }
    );
  }
}
