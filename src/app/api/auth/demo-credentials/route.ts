export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

/**
 * Returns available demo login credentials dynamically from MongoDB Atlas.
 * Never hardcodes any school names, emails, or credentials.
 */
export async function GET() {
  try {
    const school = await db.school.findFirst({
      select: {
        id: true,
        name: true,
        email: true,
        code: true,
      },
    });

    if (!school) {
      return NextResponse.json({ enabled: false });
    }

    const teacher = await db.teacher.findFirst({
      where: { schoolId: school.id, role: { not: 'inactive' } },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    return NextResponse.json({
      enabled: true,
      admin: {
        name: school.name,
        email: school.email,
        code: school.code,
      },
      teacher: teacher
        ? {
            name: teacher.name,
            email: teacher.email,
          }
        : null,
    });
  } catch (error) {
    console.error('Failed to fetch demo credentials:', error);
    return NextResponse.json({ enabled: false });
  }
}
