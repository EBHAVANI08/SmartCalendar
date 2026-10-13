import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { requireCapability, roleOf } from '@/lib/authz';
import { operationalScheduleFilter } from '@/lib/timetable-lifecycle';

export async function GET(request: Request) {
  // School-wide staffing figures are an administrator's view. Teachers have
  // their own endpoint at /api/teacher/dashboard.
  if (roleOf(request) === 'teacher') {
    return NextResponse.json(
      {
        error: 'Use /api/teacher/dashboard for your own classes and cover.',
        code: 'USE_TEACHER_DASHBOARD',
      },
      { status: 403 }
    );
  }
  const denied = requireCapability(request, 'faculty.read');
  if (denied) return denied;

  try {
    const schoolId = await getTenantSchoolId(request);
    if (!schoolId) {
      return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
    }
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const teacherWhere = { schoolId };
    const subWhere = { schoolId, absentTeacher: { schoolId } };
    const notifWhere = { teacher: { schoolId } };
    const leaveWhere = { teacher: { schoolId }, status: 'approved', startDate: { lte: todayStr }, endDate: { gte: todayStr } };
    // The timetable in use (published version, or the live legacy timetable).
    // Counting every version added up each copy of every lesson.
    const inUse = await operationalScheduleFilter(schoolId);

    const [
      school,
      totalTeachers,
      absentToday,
      pendingSubs,
      resolvedToday,
      activeNotifications,
      teachers,
      totalSchedules,
      scheduleGrades,
    ] = await Promise.all([
      db.school.findUnique({ where: { id: schoolId }, select: { name: true, code: true } }).catch(() => null),
      db.teacher.count({ where: teacherWhere }),
      db.leaveApplication.count({ where: leaveWhere }),
      // Still to be covered: today and later. Old pending rows are not open work.
      db.substitution.count({ where: { ...subWhere, status: 'pending', date: { gte: todayStr } } }),
      db.substitution.count({ where: { ...subWhere, date: todayStr, status: 'completed' } }),
      db.teacherNotification.count({ where: { ...notifWhere, isRead: false } }),
      db.teacher.findMany({ where: teacherWhere, select: { id: true, name: true, email: true, subject: true, role: true }, orderBy: { name: 'asc' } }),
      db.schedule.count({ where: inUse }),
      db.schedule.findMany({ where: inUse, select: { grade: true }, distinct: ['grade'] }),
    ]);

    const distinctGrades = scheduleGrades.map((g) => g.grade).filter(Boolean);

    return NextResponse.json({
      success: true,
      data: {
        schoolName: school?.name || 'School Workspace',
        schoolCode: school?.code || '',
        totalTeachers,
        absentToday,
        onLeaveToday: absentToday,
        pendingSubstitutions: pendingSubs,
        resolvedToday,
        todaySchedules: totalSchedules,
        aiAutoAssigned: resolvedToday,
        activeNotifications,
        grades: distinctGrades,
        teachers,
        timeSlots: [],
      },
    });
  } catch (error) {
    console.error('[DASHBOARD STATS ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed to load stats' }, { status: 500 });
  }
}
