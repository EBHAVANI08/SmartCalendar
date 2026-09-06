export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { generateLessonPack } from '@/lib/services/lesson-pack';

/**
 * GET /api/substitutions/lesson-pack?assignmentId=xxx
 *
 * Lesson context for one substitution. Scoped to the caller's school - the
 * assignment was previously fetched by id alone, so any signed-in user could
 * read another school's lesson material.
 *
 * A teacher may only read the context for cover they are personally assigned.
 */
export async function GET(request: NextRequest) {
  try {
    const assignmentId = request.nextUrl.searchParams.get('assignmentId');
    if (!assignmentId) {
      return NextResponse.json({ success: false, error: 'assignmentId is required' }, { status: 400 });
    }

    const schoolId = await getTenantSchoolId(request);
    if (!schoolId) {
      return NextResponse.json({ success: false, error: 'No school in session' }, { status: 401 });
    }

    const pack = await generateLessonPack(assignmentId, schoolId);
    if (!pack) {
      return NextResponse.json({ success: false, error: 'Assignment not found' }, { status: 404 });
    }

    // Teachers see only their own cover; admins see any in their school.
    if (request.headers.get('x-user-role') === 'teacher') {
      const userId = request.headers.get('x-user-id');
      const email = request.headers.get('x-user-email');
      const me = userId
        ? await db.teacher.findFirst({ where: { id: userId, schoolId }, select: { id: true } })
        : email
        ? await db.teacher.findFirst({ where: { email, schoolId }, select: { id: true } })
        : null;

      if (!me || pack.substituteTeacher?.id !== me.id) {
        return NextResponse.json(
          { success: false, error: 'You can only view lesson context for cover assigned to you.' },
          { status: 403 }
        );
      }
    }

    return NextResponse.json({ success: true, data: pack });
  } catch (error) {
    console.error('Lesson context error:', error);
    return NextResponse.json({ success: false, error: 'Could not build the lesson context.' }, { status: 500 });
  }
}
