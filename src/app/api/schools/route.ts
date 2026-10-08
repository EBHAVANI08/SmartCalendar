export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { isSuperAdminRequest } from '@/lib/superadmin';
import { getTenantSchoolId } from '@/lib/school-helper';

/**
 * The platform owner sees every school. Anyone else sees only their own, so a
 * signed-in user of one school cannot list other schools' codes and emails.
 */
export async function GET(request: Request) {
  try {
    if (!(await isSuperAdminRequest(request))) {
      const schoolId = await getTenantSchoolId(request);
      if (!schoolId) return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
      const own = await db.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true, code: true } });
      return NextResponse.json(own ? [own] : []);
    }

    const schools = await db.school.findMany({
      select: {
        id: true,
        name: true,
        code: true,
        email: true,
        _count: {
          select: {
            teachers: true,
            schedules: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(schools);
  } catch (error) {
    console.error('Error fetching schools:', error);
    return NextResponse.json({ error: 'Failed to fetch schools' }, { status: 500 });
  }
}
