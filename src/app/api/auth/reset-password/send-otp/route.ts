export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createPasswordResetOtp, resetRequestsSince, type ResetAccount } from '@/lib/otp-store';
import { sendPasswordResetOtpEmail } from '@/lib/mailer';
import { SCHOOL_PUBLIC_SELECT } from '@/lib/safe-fields';
import { clientIp, pausedFor, record } from '@/lib/rate-limit';
import { RESET_REQUEST_WINDOW_MS, RESET_REQUESTS_PER_EMAIL, RESET_REQUESTS_PER_IP } from '@/lib/security-constants';

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

/**
 * The same answer for every email, so nobody can find out which addresses
 * have accounts (or whose names and schools they are).
 */
const GENERIC_MESSAGE =
  'If an account uses this email, a 6-digit code has been sent to it. It is valid for 15 minutes. '
  + 'If you work at more than one school, enter your school code too.';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawEmail = String(body.email || '').trim();
    if (!rawEmail || !rawEmail.includes('@')) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }
    const cleanEmail = rawEmail.toLowerCase();
    const ip = clientIp(request);

    // Too many requests from one network address: pause (protects inboxes from flooding).
    const ipKey = `reset-send:ip:${ip}`;
    const ipPause = pausedFor(ipKey, RESET_REQUESTS_PER_IP);
    if (ipPause) {
      return NextResponse.json({ error: `Too many requests. Please try again in ${Math.ceil(ipPause / 60)} minute(s).` }, { status: 429, headers: { 'Retry-After': String(ipPause) } });
    }
    record(ipKey, RESET_REQUEST_WINDOW_MS);

    const generic = NextResponse.json({ success: true, message: GENERIC_MESSAGE });

    // Too many codes for this email recently: answer the same, send nothing.
    if ((await resetRequestsSince(cleanEmail, new Date(Date.now() - RESET_REQUEST_WINDOW_MS))) >= RESET_REQUESTS_PER_EMAIL) {
      return generic;
    }

    // The single account this email (and school code, if given) belongs to.
    const schoolCode = String(body.schoolCode || '').trim().toUpperCase();
    let account: ResetAccount | null = null;
    let accountName = '';
    let schoolName = 'Smart Calendar';

    const teachers = await db.teacher.findMany({
      where: {
        OR: [{ email: cleanEmail }, { email: rawEmail }],
        role: { not: 'inactive' },
        ...(schoolCode ? { school: { code: schoolCode } } : {}),
      },
      include: { school: { select: SCHOOL_PUBLIC_SELECT } },
      take: 2,
    });
    // Same email at several schools and no school code: send nothing (the reply
    // already tells such users to add their school code).
    if (teachers.length > 1) return generic;
    if (teachers[0]) {
      account = { type: 'teacher', id: teachers[0].id };
      accountName = teachers[0].name;
      schoolName = teachers[0].school?.name || schoolName;
    } else {
      const school = await db.school.findFirst({ where: { OR: [{ email: cleanEmail }, { email: rawEmail }] } });
      if (school) {
        account = { type: 'school', id: school.id };
        accountName = school.contactName || school.name;
        schoolName = school.name;
      } else {
        const member = await db.workspaceMember.findFirst({
          where: { OR: [{ email: cleanEmail }, { email: rawEmail }], status: 'active' },
          include: { school: { select: SCHOOL_PUBLIC_SELECT } },
        });
        if (member) {
          account = { type: 'member', id: member.id };
          accountName = member.name;
          schoolName = member.school?.name || schoolName;
        } else {
          const admin = await db.admin.findFirst({ where: { OR: [{ email: cleanEmail }, { email: rawEmail }] } });
          if (admin) {
            account = { type: 'admin', id: admin.id };
            accountName = admin.name || 'Administrator';
            schoolName = 'Administration';
          }
        }
      }
    }
    if (!account) return generic;

    const { otp } = await createPasswordResetOtp(cleanEmail, account, ip);
    const emailResult = await sendPasswordResetOtpEmail({ email: cleanEmail, name: accountName || 'there', otp, schoolName });

    // The code goes only to the inbox. Local development without SMTP may opt in to see it.
    if (emailResult.simulated && devOtpAllowed()) {
      return NextResponse.json({ success: true, message: GENERIC_MESSAGE, devOtp: otp });
    }
    return generic;
  } catch (error) {
    console.error('Error sending reset OTP:', error);
    return NextResponse.json({ error: 'Could not send the code right now. Please try again.' }, { status: 500 });
  }
}
