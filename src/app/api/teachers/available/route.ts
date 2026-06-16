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
    const qualifiedIds = qualifiedTeachers.map(t => t.id);

    // Batch-fetch instead of N+1 per-teacher queries.
    const leavesToday = await db.leaveApplication.findMany({
      where: { teacherId: { in: qualifiedIds }, status: 'approved', startDate: { lte: date }, endDate: { gte: date } },
      select: { teacherId: true },
    });
    const onLeaveSet = new Set(leavesToday.map(l => l.teacherId));

    const daySchedules = await db.schedule.findMany({ where: { teacherId: { in: qualifiedIds }, day: dayName } });
    const conflictByTeacher = new Map<string, typeof daySchedules[number]>();
    const loadByTeacher = new Map<string, number>();
    for (const s of daySchedules) {
      if (!s.teacherId) continue;
      loadByTeacher.set(s.teacherId, (loadByTeacher.get(s.teacherId) || 0) + 1);
      if (s.period === periodNum) conflictByTeacher.set(s.teacherId, s);
    }

    const subs = await db.substitution.findMany({
      where: { substituteId: { in: qualifiedIds }, status: { in: ['assigned', 'completed'] } },
      select: { substituteId: true },
    });
    const subCountByTeacher = new Map<string, number>();
    for (const s of subs) {
      if (!s.substituteId) continue;
      subCountByTeacher.set(s.substituteId, (subCountByTeacher.get(s.substituteId) || 0) + 1);
    }

    const availableTeachers: any[] = [];
    const unavailableTeachers: any[] = [];

    for (const teacher of qualifiedTeachers) {
      const unavailabilityReasons: string[] = [];

      if (onLeaveSet.has(teacher.id)) unavailabilityReasons.push('On approved leave');

      const scheduleConflict = conflictByTeacher.get(teacher.id);
      if (scheduleConflict) {
        unavailabilityReasons.push(`Teaching ${scheduleConflict.subject} for ${scheduleConflict.grade} Section ${scheduleConflict.section}`);
      }

      const currentLoad = loadByTeacher.get(teacher.id) || 0;
      const recentSubstitutions = subCountByTeacher.get(teacher.id) || 0;
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
