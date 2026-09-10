export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPasswordResetOtp, invalidatePasswordResetOtp } from '@/lib/otp-store';
import bcrypt from 'bcryptjs';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const otp = String(body.otp || '').trim();
    const otpToken = body.otpToken;
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

    // Verify OTP
    const otpVerification = await verifyPasswordResetOtp(email, otp, otpToken);
    if (!otpVerification.valid) {
      return NextResponse.json(
        { error: otpVerification.error || 'Invalid or expired OTP code.' },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    let updatedAny = false;

    // 1. Update Teacher
    const teacherUpdate = await db.teacher.updateMany({
      where: { email },
      data: { password: hashedPassword },
    });
    if (teacherUpdate.count > 0) updatedAny = true;

    // 2. Update School Tenant
    const schoolUpdate = await db.school.updateMany({
      where: { email },
      data: { password: hashedPassword },
    });
    if (schoolUpdate.count > 0) updatedAny = true;

    // 3. Update Workspace Member
    const memberUpdate = await db.workspaceMember.updateMany({
      where: { email },
      data: { password: hashedPassword },
    });
    if (memberUpdate.count > 0) updatedAny = true;

    // 4. Update Admin
    const adminUpdate = await db.admin.updateMany({
      where: { email },
      data: { password: hashedPassword },
    });
    if (adminUpdate.count > 0) updatedAny = true;

    if (!updatedAny) {
      return NextResponse.json(
        { error: 'Account record could not be updated. Please contact support.' },
        { status: 404 }
      );
    }

    // Invalidate OTP completely
    invalidatePasswordResetOtp(email);

    return NextResponse.json({
      success: true,
      message: 'Your password has been reset successfully! You can now sign in with your new password.',
    });
  } catch (error: any) {
    console.error('Error verifying reset OTP:', error);
    return NextResponse.json(
      { error: 'Failed to reset password: ' + (error?.message || String(error)) },
      { status: 500 }
    );
  }
}
