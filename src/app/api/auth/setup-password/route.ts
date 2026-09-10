export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPasswordSetupToken } from '@/lib/mailer';
import bcrypt from 'bcryptjs';
import { signJwt } from '@/lib/jwt-auth';

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
          error: 'This password setup link is invalid or has expired. Please request a new setup link from your administrator.',
        },
        { status: 400 }
      );
    }

    const teacher = await db.teacher.findUnique({
      where: { id: payload.teacherId },
      include: { school: true },
    });

    if (!teacher) {
      return NextResponse.json({ error: 'Teacher account not found.' }, { status: 404 });
    }

    const hashedPassword = await bcrypt.hash(password.trim(), 10);

    const updatedTeacher = await db.teacher.update({
      where: { id: teacher.id },
      data: {
        password: hashedPassword,
      },
    });

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
