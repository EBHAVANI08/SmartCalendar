export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPasswordSetupToken } from '@/lib/mailer';
import { hashPassword } from '@/lib/password';
import { signJwt } from '@/lib/jwt-auth';
import { SCHOOL_PUBLIC_SELECT } from '@/lib/safe-fields';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { token, password } = body;

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Setup token is required.' }, { status: 400 });
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters long.' },
        { status: 400 }
      );
    }

    const payload = await verifyPasswordSetupToken(token);
    if (!payload || !payload.teacherId) {
      return NextResponse.json(
        {
          error: 'This password setup link is invalid, expired or already used. Please request a new setup link from your administrator.',
        },
        { status: 400 }
      );
    }

    const teacher = await db.teacher.findUnique({
      where: { id: payload.teacherId },
      include: { school: { select: SCHOOL_PUBLIC_SELECT } },
    });

    if (!teacher) {
      return NextResponse.json({ error: 'Teacher account not found.' }, { status: 404 });
    }

    const hashedPassword = await hashPassword(password.trim());

    // Conditional on the password the link was verified against: the link is
    // single-use, and of two simultaneous submissions only one can succeed.
    // The teacher chose this password, so no forced change is pending.
    const claimed = await db.teacher.updateMany({
      where: { id: teacher.id, password: payload.storedPassword },
      data: { password: hashedPassword, mustChangePassword: false },
    });
    if (claimed.count !== 1) {
      return NextResponse.json(
        { error: 'This password setup link has already been used. Sign in, or ask your administrator for a new link.' },
        { status: 400 }
      );
    }
    const updatedTeacher = {
      id: teacher.id,
      name: teacher.name,
      email: teacher.email,
      schoolId: teacher.schoolId,
      subject: teacher.subject,
      grades: teacher.grades,
      phone: teacher.phone,
    };

    // Create session token so the teacher is logged in immediately
    const userSession = {
      id: updatedTeacher.id,
      name: updatedTeacher.name,
      email: updatedTeacher.email,
      role: 'teacher' as const,
      schoolId: updatedTeacher.schoolId,
      schoolCode: teacher.school?.code,
      schoolName: teacher.school?.name || 'School',
      subject: updatedTeacher.subject,
      grades: updatedTeacher.grades,
      phone: updatedTeacher.phone,
    };

    const authToken = await signJwt({
      userId: updatedTeacher.id,
      email: updatedTeacher.email,
      role: 'teacher',
      schoolId: updatedTeacher.schoolId || null,
      schoolCode: teacher.school?.code || null,
      name: updatedTeacher.name,
      accountType: 'teacher',
    });

    const response = NextResponse.json({
      success: true,
      message: 'Password created successfully! Welcome to your faculty portal.',
      user: userSession,
      token: authToken,
    });

    response.cookies.set('smart_calendar_token', authToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return response;
  } catch (error: any) {
    console.error('Error in setup-password:', error);
    return NextResponse.json(
      { error: 'Failed to set password: ' + (error?.message || String(error)) },
      { status: 500 }
    );
  }
}
