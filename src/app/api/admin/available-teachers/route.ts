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

    // Batch-fetch everything up front instead of N+1 per-teacher queries
    // (182 teachers x 4 queries each would exhaust the DB connection pool).
    const allTeachers = await db.teacher.findMany({ orderBy: { name: 'asc' } });
    const leavesToday = await db.leaveApplication.findMany({
      where: { status: 'approved', startDate: { lte: date }, endDate: { gte: date } },
      select: { teacherId: true },
    });
    const onLeaveSet = new Set(leavesToday.map(l => l.teacherId));

    const daySchedules = await db.schedule.findMany({ where: { day: dayName } });
    const conflictByTeacher = new Map<string, typeof daySchedules[number]>();
    const loadByTeacher = new Map<string, number>();
    for (const s of daySchedules) {
      if (!s.teacherId) continue;
      loadByTeacher.set(s.teacherId, (loadByTeacher.get(s.teacherId) || 0) + 1);
      if (s.period === periodNum) conflictByTeacher.set(s.teacherId, s);
    }

    const weekSubs = await db.substitution.findMany({
      where: { status: { in: ['assigned', 'completed'] }, date: { gte: weekAgo } },
      select: { substituteId: true },
    });
    const weeklySubCountByTeacher = new Map<string, number>();
    for (const s of weekSubs) {
      if (!s.substituteId) continue;
      weeklySubCountByTeacher.set(s.substituteId, (weeklySubCountByTeacher.get(s.substituteId) || 0) + 1);
    }

    const prioritizedCandidates = allTeachers.map((teacher) => {
      const isOnLeave = onLeaveSet.has(teacher.id);
      const scheduleConflict = conflictByTeacher.get(teacher.id);
      const available = !isOnLeave && !scheduleConflict;
      const conflicts: string[] = [];
      if (isOnLeave) conflicts.push('On approved leave');
      if (scheduleConflict) conflicts.push(`Teaching ${scheduleConflict.subject}`);

      const currentLoad = loadByTeacher.get(teacher.id) || 0;
      const weeklySubCount = weeklySubCountByTeacher.get(teacher.id) || 0;

      const teachesSameSubject = !!subject && teacher.subject === subject;
      let score = teachesSameSubject ? 50 : 10;
      if (teachesSameSubject) {
        const teacherGrades: string[] = JSON.parse(teacher.grades || '[]');
        if (teacherGrades.length > 0) score += 30;
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
    });

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
