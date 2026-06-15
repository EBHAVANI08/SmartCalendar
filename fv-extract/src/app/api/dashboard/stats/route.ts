import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const dayOfWeek = today.getDay();
    const scheduleDay = dayOfWeek >= 1 && dayOfWeek <= 5 ? dayOfWeek : 1;

    const [
      totalTeachers,
      totalStudents,
      absentToday,
      onLeaveToday,
      pendingSubs,
      resolvedToday,
      todaySchedules,
      aiAutoAssigned,
      activeNotifications,
    ] = await Promise.all([
      db.teacher.count({ where: { isActive: true } }),
      db.student.count(),
      db.leave.count({ where: { status: 'APPROVED', startDate: { lte: todayStr }, endDate: { gte: todayStr } } }),
      db.leave.count({ where: { status: 'APPROVED', startDate: { lte: todayStr }, endDate: { gte: todayStr } } }),
      db.substitutionRequest.count({ where: { status: 'PENDING' } }),
      db.substitutionRequest.count({ where: { date: todayStr, status: 'RESOLVED' } }),
      db.schedule.count({ where: { dayOfWeek: scheduleDay } }),
      db.substitutionAssignment.count({ where: { assignedBy: 'AI_AGENT', status: 'ACCEPTED' } }),
      db.notification.count({ where: { targetRole: 'ADMIN', isRead: false } }),
    ]);

    const grades = await db.grade.findMany({
      include: { sections: { select: { id: true, name: true } } },
      orderBy: { level: 'asc' },
    });

    const teachers = await db.teacher.findMany({
      where: { isActive: true },
      select: { id: true, name: true, employeeId: true, email: true, department: true, designation: true, role: true },
      orderBy: { name: 'asc' },
    });

    const timeSlots = await db.timeSlot.findMany({
      where: { isBreak: false },
      select: { id: true, name: true, startTime: true, endTime: true },
      orderBy: { order: 'asc' },
    });

    return NextResponse.json({
      success: true,
      data: {
        totalTeachers,
        totalStudents,
        absentToday,
        onLeaveToday,
        pendingSubstitutions: pendingSubs,
        resolvedToday,
        todaySchedules,
        aiAutoAssigned,
        activeNotifications,
        grades,
        teachers,
        timeSlots,
      },
    });
  } catch (error) {
    console.error('[DASHBOARD STATS ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed to load stats' }, { status: 500 });
  }
}
