import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

const TEACHER_FIELDS = {
  id: true,
  name: true,
  email: true,
  subject: true,
  grades: true,
  role: true,
  phone: true,
  schoolId: true,
  availability: true,
} as const;

/**
 * The signed-in user's own context.
 *
 * Identity comes from the verified session (middleware sets these headers only
 * from a valid token). An `?email=` parameter is still accepted for callers
 * that pass one, but it is now constrained to the caller's own school — it
 * previously returned any teacher in any tenant.
 */
export async function GET(req: NextRequest) {
  try {
    const sessionEmail = req.headers.get('x-user-email');
    const sessionSchoolId = req.headers.get('x-school-id');
    const requestedEmail = req.nextUrl.searchParams.get('email');

    if (!sessionEmail && !sessionSchoolId) {
      return NextResponse.json({ success: false, error: 'Not signed in' }, { status: 401 });
    }

    const email = (requestedEmail || sessionEmail || '').trim().toLowerCase();

    const teacher = email
      ? await db.teacher.findFirst({
          where: {
            email,
            // Never cross the tenant boundary, even for an explicit email.
            ...(sessionSchoolId ? { schoolId: sessionSchoolId } : {}),
          },
          select: TEACHER_FIELDS,
        })
      : null;

    // A school admin has a school context but no Teacher row of their own.
    // Return the tenant context so callers can still resolve their school.
    if (!teacher) {
      if (sessionSchoolId) {
        return NextResponse.json({
          success: true,
          data: null,
          schoolId: sessionSchoolId,
          email: sessionEmail,
          role: req.headers.get('x-user-role'),
        });
      }
      return NextResponse.json({ success: false, error: 'Teacher not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: teacher,
      // Top-level duplicates so existing callers reading `schoolId` keep working.
      schoolId: teacher.schoolId,
      email: teacher.email,
      role: teacher.role,
    });
  } catch (error) {
    console.error('[TEACHER ME ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}
