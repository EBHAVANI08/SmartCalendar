import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const period = searchParams.get('period');
    const subject = searchParams.get('subject');

    if (!date || !period) {
      return NextResponse.json({ success: false, error: 'date and period required' }, { status: 400 });
    }

    const dayOfWeek = new Date(date + 'T00:00:00').getDay();
    const scheduleDay = dayOfWeek >= 1 && dayOfWeek <= 5 ? dayOfWeek : 1;
    const dayName = DAY_NAMES[scheduleDay];
    const periodNum = parseInt(period);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const allTeachers = await db.teacher.findMany({ orderBy: { name: 'asc' } });

    const prioritizedCandidates = await Promise.all(allTeachers.map(async (teacher) => {
      const isOnLeave = await db.leaveApplication.count({
        where: { teacherId: teacher.id, status: 'approved', startDate: { lte: date }, endDate: { gte: date } },
      }) > 0;

      const scheduleConflict = await db.schedule.findFirst({
        where: { teacherId: teacher.id, day: dayName, period: periodNum },
      });
      const available = !isOnLeave && !scheduleConflict;
      const conflicts: string[] = [];
      if (isOnLeave) conflicts.push('On approved leave');
      if (scheduleConflict) conflicts.push(`Teaching ${scheduleConflict.subject}`);

      const currentLoad = await db.schedule.count({ where: { teacherId: teacher.id, day: dayName } });
      const weeklySubCount = await db.substitution.count({
        where: { substituteId: teacher.id, status: { in: ['assigned', 'completed'] }, date: { gte: weekAgo } },
      });

      const teachesSameSubject = !!subject && teacher.subject === subject;
      let score = teachesSameSubject ? 50 : 10;
      if (teachesSameSubject) {
        const teacherGrades: string[] = JSON.parse(teacher.grades || '[]');
        if (teacherGrades.length > 0) score += 30; // has defined grade coverage
      }

      return {
        teacherId: teacher.id,
        teacherName: teacher.name,
        department: teacher.subject,
        subjects: [teacher.subject],
        isAvailable: available,
        conflicts,
        score,
        teachesSameSubject,
        isPrimary: teachesSameSubject,
        currentLoad,
        weeklySubCount,
      };
    }));

    prioritizedCandidates.sort((a, b) => {
      if (a.isAvailable !== b.isAvailable) return a.isAvailable ? -1 : 1;
      if (a.teachesSameSubject !== b.teachesSameSubject) return a.teachesSameSubject ? -1 : 1;
      return b.score - a.score;
    });

    return NextResponse.json({ success: true, data: prioritizedCandidates });
  } catch (error) {
    console.error('[ADMIN AVAILABLE TEACHERS ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}
