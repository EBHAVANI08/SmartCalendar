import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const subject = searchParams.get('subject');
    const date = searchParams.get('date');
    const period = searchParams.get('period');

    if (!subject || !date || !period) {
      return NextResponse.json({ success: false, error: 'subject, date, period required' }, { status: 400 });
    }

    const dayOfWeek = new Date(date + 'T00:00:00').getDay();
    const scheduleDay = dayOfWeek >= 1 && dayOfWeek <= 5 ? dayOfWeek : 1;
    const dayName = DAY_NAMES[scheduleDay];
    const periodNum = parseInt(period);

    const qualifiedTeachers = await db.teacher.findMany({ where: { subject } });

    const availableTeachers = [];
    const unavailableTeachers = [];

    for (const teacher of qualifiedTeachers) {
      const unavailabilityReasons: string[] = [];

      const isOnLeave = await db.leaveApplication.count({
        where: { teacherId: teacher.id, status: 'approved', startDate: { lte: date }, endDate: { gte: date } },
      }) > 0;
      if (isOnLeave) unavailabilityReasons.push('On approved leave');

      const scheduleConflict = await db.schedule.findFirst({ where: { teacherId: teacher.id, day: dayName, period: periodNum } });
      if (scheduleConflict) {
        unavailabilityReasons.push(`Teaching ${scheduleConflict.subject} for ${scheduleConflict.grade} Section ${scheduleConflict.section}`);
      }

      const currentLoad = await db.schedule.count({ where: { teacherId: teacher.id, day: dayName } });
      const recentSubstitutions = await db.substitution.count({ where: { substituteId: teacher.id, status: { in: ['assigned', 'completed'] } } });
      const teacherGrades: string[] = JSON.parse(teacher.grades || '[]');

      const teacherData = {
        teacherId: teacher.id,
        teacherName: teacher.name,
        department: teacher.subject,
        isPrimary: teacherGrades.length > 0,
        currentLoad,
        recentSubstitutions,
        isAvailable: unavailabilityReasons.length === 0,
        unavailabilityReasons,
      };

      if (unavailabilityReasons.length === 0) availableTeachers.push(teacherData);
      else unavailableTeachers.push(teacherData);
    }

    availableTeachers.sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      if (a.currentLoad !== b.currentLoad) return a.currentLoad - b.currentLoad;
      return a.recentSubstitutions - b.recentSubstitutions;
    });

    return NextResponse.json({
      success: true,
      data: { subject, date, period: periodNum, availableCount: availableTeachers.length, unavailableCount: unavailableTeachers.length, availableTeachers, unavailableTeachers },
    });
  } catch (error) {
    console.error('[TEACHERS AVAILABLE ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}
