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

    const teacherId = searchParams.get('teacherId');

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
    // timetable. Admins and owners can pass teacherId.
    const mine = schoolId ? await ownTeacherId(request, schoolId) : null;
    if (mine) {
      where.teacherId = mine;
    } else if (teacherId) {
      where.teacherId = teacherId;
    }

    let schedules = await db.schedule.findMany({
      where,
      include: { teacher: true },
      orderBy: [{ day: 'asc' }, { period: 'asc' }],
    });

    const targetTeacherId = mine || teacherId;

    // Fallback: If no versioned schedules found for this teacher, fetch any schedules for this teacher in the school
    if (schedules.length === 0 && targetTeacherId) {
      schedules = await db.schedule.findMany({
        where: {
          schoolId,
          teacherId: targetTeacherId,
          ...(day ? { day } : {}),
        },
        include: { teacher: true },
        orderBy: [{ day: 'asc' }, { period: 'asc' }],
      });
    }

    // Fallback 2: Check TimetableSlot if still 0
    if (schedules.length === 0 && targetTeacherId) {
      const dayMap: Record<number, string> = {
        1: 'Monday',
        2: 'Tuesday',
        3: 'Wednesday',
        4: 'Thursday',
        5: 'Friday',
        6: 'Saturday',
        7: 'Sunday',
      };

      const [slots, classes, subjects, teacher] = await Promise.all([
        db.timetableSlot.findMany({
          where: { schoolId, teacherId: targetTeacherId },
          orderBy: [{ dayOfWeek: 'asc' }, { period: 'asc' }],
        }),
        db.classSection.findMany({ where: { schoolId } }),
        db.subjectMaster.findMany({ where: { schoolId } }),
        db.teacher.findUnique({ where: { id: targetTeacherId } }),
      ]);

      const classById = new Map(classes.map((c) => [c.id, c]));
      const subjectById = new Map(subjects.map((s) => [s.id, s.name]));

      if (slots.length > 0) {
        const mapped = slots.map((s) => {
          const cls = classById.get(s.classSectionId);
          const subjName = (s.subjectId && subjectById.get(s.subjectId)) || s.topic || teacher?.subject || 'Class';
          return {
            id: s.id,
            grade: cls?.grade || 'Class',
            section: cls?.section || '',
            day: dayMap[s.dayOfWeek] || 'Monday',
            period: s.period,
            subject: subjName,
            teacherId: s.teacherId,
            schoolId: s.schoolId,
            topic: s.topic,
            roomId: s.roomId,
            startTime: '08:00',
            endTime: '08:45',
            timetableVersionId: s.timetableVersionId,
            teacher,
          };
        });

        return NextResponse.json(day ? mapped.filter((m) => m.day === day) : mapped);
      }
    }

    return NextResponse.json(schedules);
  } catch (error) {
    console.error('Error fetching schedules:', error);
    return NextResponse.json({ error: 'Failed to fetch schedules' }, { status: 500 });
  }
}
