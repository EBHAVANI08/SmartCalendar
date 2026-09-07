export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { getTenantSchoolId, resolveSchoolId } from '@/lib/school-helper';
import { operationalScheduleFilter } from '@/lib/timetable-lifecycle';
import { NextResponse } from 'next/server';
import { ownTeacherId } from '@/lib/teacher-scope';

/**
 * Timetable rows for one class.
 *
 * Always scoped to the caller's school. It previously applied a school filter
 * only when the client passed ?schoolId, so a request without it returned rows
 * from every tenant — the timetable grid could then render another school's
 * lesson in a cell.
 *
 * Also scoped to a single timetable version, so a draft revision's copy of a
 * slot is never mixed with the published one.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const grade = searchParams.get('grade');
    const section = searchParams.get('section');
    const day = searchParams.get('day');
    const versionId = searchParams.get('versionId');

    const sessionSchoolId = await getTenantSchoolId(request);
    const requested = searchParams.get('schoolId');
    // A platform owner may inspect a specific tenant; everyone else is pinned
    // to their own school regardless of what the query string says.
    const isOwner = request.headers.get('x-user-role') === 'superadmin';
    const schoolId = isOwner && requested ? await resolveSchoolId(requested) : sessionSchoolId;

    if (!schoolId) {
      return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
    }

    const versionScope = versionId
      ? { schoolId, timetableVersionId: versionId }
      : await operationalScheduleFilter(schoolId);

    const where: Record<string, unknown> = { ...versionScope };
    if (grade) where.grade = grade;
    if (section) where.section = section;
    if (day) where.day = day;

    // A teacher reads their own teaching timetable, not the school's master
    // timetable. Admins and owners are unaffected.
    const mine = schoolId ? await ownTeacherId(request, schoolId) : null;
    if (mine) where.teacherId = mine;

    const schedules = await db.schedule.findMany({
      where,
      include: { teacher: true },
      orderBy: [{ day: 'asc' }, { period: 'asc' }],
    });

    return NextResponse.json(schedules);
  } catch (error) {
    console.error('Error fetching schedules:', error);
    return NextResponse.json({ error: 'Failed to fetch schedules' }, { status: 500 });
  }
}
