import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const email = req.nextUrl.searchParams.get('email');
    if (!email) return NextResponse.json({ success: false, error: 'Email required' }, { status: 400 });

    const teacher = await db.teacher.findUnique({
      where: { email },
      select: {
        id: true, name: true, email: true, employeeId: true,
        department: true, designation: true, role: true, phone: true, avatar: true,
        teacherSubjects: { include: { subject: true } },
      },
    });

    if (!teacher) return NextResponse.json({ success: false, error: 'Teacher not found' }, { status: 404 });

    return NextResponse.json({ success: true, data: teacher });
  } catch (error) {
    console.error('[TEACHER ME ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}
