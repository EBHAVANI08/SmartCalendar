export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createPasswordResetOtp } from '@/lib/otp-store';
import { sendPasswordResetOtpEmail } from '@/lib/mailer';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawEmail = String(body.email || '').trim();

    if (!rawEmail || !rawEmail.includes('@')) {
      return NextResponse.json(
        { error: 'Please enter a valid email address.' },
        { status: 400 }
      );
    }

    const cleanEmail = rawEmail.toLowerCase();

    // 1. Check Teacher
    let accountName = '';
    let schoolName = 'Smart Calendar';
    let accountType = '';

    const teacher = await db.teacher.findFirst({
      where: {
        OR: [{ email: cleanEmail }, { email: rawEmail }],
      },
      include: { school: true },
    });

    if (teacher) {
      accountName = teacher.name;
      schoolName = teacher.school?.name || 'School';
      accountType = 'teacher';
    } else {
      // 2. Check School Tenant Admin
      const school = await db.school.findFirst({
        where: {
          OR: [{ email: cleanEmail }, { email: rawEmail }],
        },
      });

      if (school) {
        accountName = school.contactName || school.name;
        schoolName = school.name;
        accountType = 'school';
      } else {
        // 3. Check Workspace Member
        const member = await db.workspaceMember.findFirst({
          where: {
            OR: [{ email: cleanEmail }, { email: rawEmail }],
          },
          include: { school: true },
        });

        if (member) {
          accountName = member.name;
          schoolName = member.school?.name || 'School';
          accountType = 'member';
        } else {
          // 4. Check System Admin
          const admin = await db.admin.findFirst({
            where: {
              OR: [{ email: cleanEmail }, { email: rawEmail }],
            },
          });

          if (admin) {
            accountName = admin.name || 'System Admin';
            schoolName = 'Administration';
            accountType = 'admin';
          }
        }
      }
    }

    if (!accountType) {
      return NextResponse.json(
        {
          error: `No account is registered with "${rawEmail}". Please check your email address or contact your school administrator.`,
        },
        { status: 404 }
      );
    }

    // Generate 6-digit OTP and signed token
    const { otp, otpToken, expiresInMinutes } = await createPasswordResetOtp(cleanEmail);

    // Send email
    const emailResult = await sendPasswordResetOtpEmail({
      email: cleanEmail,
      name: accountName || 'Faculty Member',
      otp,
      schoolName,
    });

    return NextResponse.json({
      success: true,
      message: `A 6-digit verification code has been sent to ${cleanEmail}. It is valid for ${expiresInMinutes} minutes.`,
      email: cleanEmail,
      accountName,
      schoolName,
      otpToken,
      simulated: emailResult.simulated,
      devOtp: emailResult.simulated ? otp : undefined,
    });
  } catch (error: any) {
    console.error('Error sending reset OTP:', error);
    return NextResponse.json(
      { error: 'Failed to send OTP code: ' + (error?.message || String(error)) },
      { status: 500 }
    );
  }
}
