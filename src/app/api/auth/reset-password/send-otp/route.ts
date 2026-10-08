export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createPasswordResetOtp, type ResetAccount } from '@/lib/otp-store';
import { sendPasswordResetOtpEmail } from '@/lib/mailer';
import { SCHOOL_PUBLIC_SELECT } from '@/lib/safe-fields';

/**
 * The code may be returned to the requester only for local development without
 * SMTP. Both conditions are required: an explicit opt-in, and not a production
 * build. Otherwise anyone could reset any account knowing only its email.
 */
function devOtpAllowed(): boolean {
  const allowed = process.env.ALLOW_DEV_OTP === 'true' && process.env.NODE_ENV !== 'production';
  if (process.env.ALLOW_DEV_OTP === 'true') {
    console.warn(`[send-otp] ALLOW_DEV_OTP is set; returning codes in responses is ${allowed ? 'ENABLED (development)' : 'ignored (production build)'}.`);
  }
  return allowed;
}

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
    let account: ResetAccount | null = null;

    // Teacher email is unique per school only. With several matches the caller
    // must name the school; the matching schools are not listed, because this
    // caller has not authenticated.
    const schoolCode = String(body.schoolCode || '').trim().toUpperCase();
    const teachers = await db.teacher.findMany({
      where: {
        OR: [{ email: cleanEmail }, { email: rawEmail }],
        ...(schoolCode ? { school: { code: schoolCode } } : {}),
      },
      include: { school: { select: SCHOOL_PUBLIC_SELECT } },
      take: 2,
    });
    if (teachers.length > 1) {
      return NextResponse.json(
        { error: 'This email is used at more than one school. Enter your school code to continue.', code: 'SCHOOL_CODE_REQUIRED' },
        { status: 409 }
      );
    }
    const teacher = teachers[0];

    if (teacher) {
      accountName = teacher.name;
      schoolName = teacher.school?.name || 'School';
      accountType = 'teacher';
      account = { type: 'teacher', id: teacher.id };
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
        account = { type: 'school', id: school.id };
      } else {
        // 3. Check Workspace Member
        const member = await db.workspaceMember.findFirst({
          where: {
            OR: [{ email: cleanEmail }, { email: rawEmail }],
          },
          include: { school: { select: SCHOOL_PUBLIC_SELECT } },
        });

        if (member) {
          accountName = member.name;
          schoolName = member.school?.name || 'School';
          accountType = 'member';
          account = { type: 'member', id: member.id };
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
            account = { type: 'admin', id: admin.id };
          }
        }
      }
    }

    if (!accountType || !account) {
      return NextResponse.json(
        {
          error: `No account is registered with "${rawEmail}". Please check your email address or contact your school administrator.`,
        },
        { status: 404 }
      );
    }

    // Generate 6-digit OTP and signed token
    const { otp, otpToken, expiresInMinutes } = await createPasswordResetOtp(cleanEmail, account);

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
      devOtp: emailResult.simulated && devOtpAllowed() ? otp : undefined,
    });
  } catch (error: any) {
    console.error('Error sending reset OTP:', error);
    return NextResponse.json(
      { error: 'Failed to send OTP code: ' + (error?.message || String(error)) },
      { status: 500 }
    );
  }
}
