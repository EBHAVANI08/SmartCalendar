import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';

export async function GET(request: Request) {
  try {
    const schoolId = await getTenantSchoolId(request);
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const teacherWhere = schoolId ? { schoolId } : {};
    const subWhere = schoolId ? { absentTeacher: { schoolId } } : {};
    const notifWhere = schoolId ? { teacher: { schoolId } } : {};
    const leaveWhere = schoolId
      ? { teacher: { schoolId }, status: 'approved', startDate: { lte: todayStr }, endDate: { gte: todayStr } }
      : { status: 'approved', startDate: { lte: todayStr }, endDate: { gte: todayStr } };

    const [
      totalTeachers,
      totalStudents,
      absentToday,
      pendingSubs,
      resolvedToday,
      activeNotifications,
      teachers,
      totalSchedules,
      scheduleGrades,
    ] = await Promise.all([
      db.teacher.count({ where: teacherWhere }),
      db.student.count(),
      db.leaveApplication.count({ where: leaveWhere }),
      db.substitution.count({ where: { ...subWhere, status: 'pending' } }),
      db.substitution.count({ where: { ...subWhere, date: todayStr, status: 'completed' } }),
      db.teacherNotification.count({ where: { ...notifWhere, isRead: false } }),
      db.teacher.findMany({ where: teacherWhere, select: { id: true, name: true, email: true, subject: true, role: true }, orderBy: { name: 'asc' } }),
      db.schedule.count({ where: schoolId ? { schoolId } : {} }),
      db.schedule.findMany({ where: schoolId ? { schoolId } : {}, select: { grade: true }, distinct: ['grade'] }),
    ]);

    const distinctGrades = scheduleGrades.map((g) => g.grade).filter(Boolean);

    return NextResponse.json({
      success: true,
      data: {
        totalTeachers,
        totalStudents,
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
