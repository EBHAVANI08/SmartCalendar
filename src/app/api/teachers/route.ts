export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const schoolId = await getTenantSchoolId(request);
    const whereClause = schoolId ? { schoolId } : {};

    const teachers = await db.teacher.findMany({
      where: whereClause,
      include: {
        schedules: true,
        school: true,
      },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(teachers);
  } catch (error) {
    console.error('Error fetching teachers:', error);
    return NextResponse.json({ error: 'Failed to fetch teachers' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, phone, subject, grades, role = 'teacher' } = body;
    const schoolId = (await getTenantSchoolId(request)) || '6a8bf21c3359da9c7c8a7b02';

    if (!name || !email || !subject) {
      return NextResponse.json({ error: 'Name, email, and subject are required.' }, { status: 400 });
    }

    const teacher = await db.teacher.create({
      data: {
        name,
        email,
        phone: phone || '',
        subject,
        grades: typeof grades === 'string' ? grades : JSON.stringify(grades || []),
        role,
        schoolId,
      },
    });

    return NextResponse.json({ success: true, teacher });
  } catch (error) {
    console.error('Error creating teacher:', error);
    return NextResponse.json({ error: 'Failed to create teacher' }, { status: 500 });
  }
}
