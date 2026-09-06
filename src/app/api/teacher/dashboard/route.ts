export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { requireCapability, ownTeacherId } from '@/lib/authz';
import { operationalScheduleFilter } from '@/lib/timetable-lifecycle';
import { NextResponse } from 'next/server';

/**
 * A teacher's own day.
 *
 * Deliberately separate from `/api/dashboard/stats`, which reports school-wide
 * staffing to an administrator. A teacher needs to know what they are teaching
 * today, what cover they are standing in for, and where their leave stands -
 * not how many colleagues are absent.
 *
 * Everything below is scoped to the calling teacher. An admin calling this gets
 * a 400 telling them to use the admin dashboard, rather than a silently
 * unscoped answer.
 */

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export async function GET(request: Request) {
  const denied = requireCapability(request, 'profile.own');
  if (denied) return denied;

  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }

  const teacherId = await ownTeacherId(request, schoolId);
  if (!teacherId) {
    return NextResponse.json(
      { error: 'This view is for teacher accounts. Use the school dashboard instead.', code: 'NOT_A_TEACHER' },
      { status: 400 }
    );
  }
  if (teacherId === '__unresolved__') {
    return NextResponse.json(
      { error: 'Your teacher record could not be found in this school.' },
      { status: 404 }
    );
  }

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const todayName = DAY_NAMES[now.getDay()];

  const versionScope = await operationalScheduleFilter(schoolId);

  const [me, todaySchedule, weekSchedule, myCover, myLeave] = await Promise.all([
    db.teacher.findFirst({
      where: { id: teacherId, schoolId },
      select: { id: true, name: true, email: true, subject: true, subjects: true, grades: true },
    }),
    db.schedule.findMany({
      where: { ...versionScope, teacherId, day: todayName },
      select: { id: true, period: true, grade: true, section: true, subject: true, startTime: true, endTime: true, roomId: true },
      orderBy: { period: 'asc' },
    }),
    db.schedule.findMany({
      where: { ...versionScope, teacherId },
      select: { id: true, day: true, period: true, grade: true, section: true, subject: true, startTime: true, endTime: true, roomId: true },
      orderBy: [{ day: 'asc' }, { period: 'asc' }],
    }),
    db.substitution.findMany({
      where: { schoolId, substituteId: teacherId },
      include: { absentTeacher: { select: { id: true, name: true } } },
      orderBy: [{ date: 'desc' }, { period: 'asc' }],
      take: 50,
    }),
    db.leaveApplication.findMany({
      where: { teacherId },
      orderBy: { appliedAt: 'desc' },
      take: 20,
    }),
  ]);

  if (!me) {
    return NextResponse.json({ error: 'Teacher record not found.' }, { status: 404 });
  }

  const coverToday = myCover.filter((c) => c.date === todayStr);
  const upcomingCover = myCover.filter((c) => c.date > todayStr);
  const pendingLeave = myLeave.filter((l) => l.status === 'pending');
  const approvedLeave = myLeave.filter((l) => l.status === 'approved');

  // The next period still to come today, by start time.
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const nextPeriod = todaySchedule.find((p) => (p.startTime ?? '') > hhmm) ?? null;

  return NextResponse.json({
    success: true,
    teacher: { id: me.id, name: me.name, email: me.email },
    today: { date: todayStr, day: todayName },
    // Personal counts only. No school-wide staffing figures.
    counts: {
      classesToday: todaySchedule.length,
      coverPeriodsToday: coverToday.length,
      pendingLeaveRequests: pendingLeave.length,
      approvedLeave: approvedLeave.length,
      periodsThisWeek: weekSchedule.length,
      upcomingCover: upcomingCover.length,
    },
    todaySchedule,
    weekSchedule,
    nextPeriod,
    myCover: myCover.slice(0, 20),
    myLeave,
  });
}
