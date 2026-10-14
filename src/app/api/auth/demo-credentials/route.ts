export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

/**
 * Demo sign-in hints for local development only.
 *
 * This route is public (no session), so on a real deployment it must not
 * reveal anything: it used to return the first school's admin email and code
 * and a teacher's email to anyone. Now it answers only when the build is not
 * production AND ALLOW_DEMO_CREDENTIALS=true is set explicitly.
 */
export async function GET() {
  const allowed = process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEMO_CREDENTIALS === 'true';
  if (!allowed) return NextResponse.json({ enabled: false });

  try {
    const school = await db.school.findFirst({ select: { id: true, name: true, email: true, code: true } });
    if (!school) return NextResponse.json({ enabled: false });
    const teacher = await db.teacher.findFirst({
      where: { schoolId: school.id, role: { not: 'inactive' } },
      select: { name: true, email: true },
    });
    return NextResponse.json({
      enabled: true,
      admin: { name: school.name, email: school.email, code: school.code },
      teacher: teacher ? { name: teacher.name, email: teacher.email } : null,
    });
  } catch (error) {
    console.error('Failed to fetch demo credentials:', error);
    return NextResponse.json({ enabled: false });
  }
}
