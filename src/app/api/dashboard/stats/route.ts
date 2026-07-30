import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const [
      totalTeachers,
      totalStudents,
      absentToday,
      pendingSubs,
      resolvedToday,
      activeNotifications,
      teachers,
    ] = await Promise.all([
      db.teacher.count(),
      db.student.count(),
      db.leaveApplication.count({ where: { status: 'approved', startDate: { lte: todayStr }, endDate: { gte: todayStr } } }),
      db.substitution.count({ where: { status: 'pending' } }),
      db.substitution.count({ where: { date: todayStr, status: 'completed' } }),
      db.teacherNotification.count({ where: { isRead: false } }),
      db.teacher.findMany({ select: { id: true, name: true, email: true, subject: true, role: true }, orderBy: { name: 'asc' } }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        totalTeachers,
        totalStudents,
        absentToday,
        onLeaveToday: absentToday,
        pendingSubstitutions: pendingSubs,
        resolvedToday,
        todaySchedules: 8,
        aiAutoAssigned: resolvedToday,
        activeNotifications,
        grades: [],
        teachers,
        timeSlots: [],
      },
    });
  } catch (error) {
    console.error('[DASHBOARD STATS ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed to load stats' }, { status: 500 });
  }
}
