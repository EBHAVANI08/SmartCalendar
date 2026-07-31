import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

/**
 * POST /api/schools/update-credentials
 * Update login email/password for a school (used when client provides final credentials).
 * Body: { schoolId | code, email?, password?, name? }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { schoolId, code, email, password, name } = body as {
      schoolId?: string;
      code?: string;
      email?: string;
      password?: string;
      name?: string;
    };

    if (!schoolId && !code) {
      return NextResponse.json({ error: 'schoolId or code is required' }, { status: 400 });
    }
    if (!email && !password && !name) {
      return NextResponse.json({ error: 'Provide email, password, and/or name to update' }, { status: 400 });
    }

    const school = schoolId
      ? await db.school.findUnique({ where: { id: schoolId } })
      : await db.school.findUnique({ where: { code: code! } });

    if (!school) {
      return NextResponse.json({ error: 'School not found' }, { status: 404 });
    }

    const updated = await db.school.update({
      where: { id: school.id },
      data: {
        ...(email ? { email } : {}),
        ...(password ? { password } : {}),
        ...(name ? { name } : {}),
      },
      select: { id: true, name: true, code: true, email: true },
    });

    return NextResponse.json({
      success: true,
      message: 'School credentials updated',
      school: updated,
      passwordUpdated: Boolean(password),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Update failed';
    // Unique email conflict
    if (message.includes('Unique constraint')) {
      return NextResponse.json({ error: 'Email already in use by another school' }, { status: 409 });
    }
    console.error('[update-credentials]', error);
    return NextResponse.json({ error: 'Failed to update credentials' }, { status: 500 });
  }
}

export async function GET() {
  const school = await db.school.findUnique({
    where: { id: 'sch_client_pilot_001' },
    select: {
      id: true,
      name: true,
      code: true,
      email: true,
      _count: { select: { teachers: true, schedules: true } },
    },
  });
  if (!school) {
    return NextResponse.json({ error: 'Client pilot school not provisioned yet' }, { status: 404 });
  }
  return NextResponse.json({
    school,
    access: {
      role: 'School Admin — full access to this school only',
      includes: [
        '24 teachers (17 class teachers + 7 specialists)',
        '17 classes (Grades 3–8)',
        'Full weekly timetable (Mon–Fri, 8 periods)',
        'Lesson plans ready for teaching & substitutes',
        'Sample substitution workflow',
        'School-scoped dashboard, calendar, teachers, substitutions',
      ],
      teacherDefaultPassword: 'teacher123',
    },
  });
}
