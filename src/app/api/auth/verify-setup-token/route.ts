export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPasswordSetupToken } from '@/lib/mailer';
import { readList } from '@/lib/faculty';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ valid: false, error: 'Password setup token is missing.' }, { status: 400 });
    }

    const payload = await verifyPasswordSetupToken(token);
    if (!payload || !payload.teacherId) {
      return NextResponse.json(
        {
          valid: false,
          error: 'This password setup link is invalid or has expired (valid for 7 days). Please request a new link from your school administrator.',
        },
        { status: 400 }
      );
    }

    const teacher = await db.teacher.findUnique({
      where: { id: payload.teacherId },
      include: { school: true },
    });

    if (!teacher) {
      return NextResponse.json(
        { valid: false, error: 'Faculty record was not found. Please contact your school administrator.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      valid: true,
      teacher: {
        id: teacher.id,
        name: teacher.name,
        email: teacher.email,
        schoolName: teacher.school?.name || 'School',
        subjects: readList(teacher.subjects || teacher.subject),
      },
    });
  } catch (error: any) {
    console.error('Error verifying setup token:', error);
    return NextResponse.json(
      { valid: false, error: 'An unexpected error occurred while verifying the link.' },
      { status: 500 }
    );
  }
}
