import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

const TIME_SLOTS = [
  { period: 1, name: 'Period 1', startTime: '08:00', endTime: '08:40' },
  { period: 2, name: 'Period 2', startTime: '08:40', endTime: '09:20' },
  { period: 3, name: 'Period 3', startTime: '09:20', endTime: '10:00' },
  { period: 4, name: 'Period 4', startTime: '10:20', endTime: '11:00' },
  { period: 5, name: 'Period 5', startTime: '11:00', endTime: '11:40' },
  { period: 6, name: 'Period 6', startTime: '11:40', endTime: '12:20' },
  { period: 7, name: 'Period 7', startTime: '13:00', endTime: '13:40' },
  { period: 8, name: 'Period 8', startTime: '13:40', endTime: '14:20' },
];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export async function GET() {
  try {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const dayOfWeek = today.getDay();
    const dayName = DAY_NAMES[dayOfWeek >= 1 && dayOfWeek <= 5 ? dayOfWeek : 1];

    // Run sequentially rather than Promise.all: Neon's free-tier direct
    // connection string has a low concurrent-connection limit, and issuing
    // 9+ queries in parallel from a single request can exhaust it.
    const totalTeachers = await db.teacher.count();
    const totalStudents = await db.student.count();
    const absentToday = await db.biometricAttendance.count({ where: { date: todayStr, status: 'absent' } });
    const onLeaveToday = await db.leaveApplication.count({ where: { status: 'approved', startDate: { lte: todayStr }, endDate: { gte: todayStr } } });
    const pendingSubs = await db.substitution.count({ where: { status: 'pending' } });
    const resolvedToday = await db.substitution.count({ where: { date: todayStr, status: 'completed' } });
    const todaySchedules = await db.schedule.count({ where: { day: dayName } });
    const aiAutoAssigned = await db.substitution.count({ where: { source: 'ai-agent', status: { in: ['assigned', 'completed'] } } });
    const activeNotifications = await db.teacherNotification.count({ where: { isRead: false } });

    const gradeRows = await db.schedule.findMany({ select: { grade: true }, distinct: ['grade'] });
    const gradeNames = gradeRows.length > 0
      ? gradeRows.map(g => g.grade).sort((a, b) => parseInt(a.replace('Grade ', '')) - parseInt(b.replace('Grade ', '')))
      : Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`);
    const grades = gradeNames.map(name => ({ name, level: parseInt(name.replace('Grade ', '')) || 0 }));

    const teachers = await db.teacher.findMany({
      select: { id: true, name: true, email: true, phone: true, subject: true, grades: true, role: true },
      orderBy: { name: 'asc' },
    });

    const timeSlots = TIME_SLOTS;

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
