import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export async function GET(req: NextRequest) {
  try {
    const requestId = req.nextUrl.searchParams.get('requestId');
    if (!requestId) return NextResponse.json({ success: false, error: 'requestId required' }, { status: 400 });

    const request = await db.substitution.findUnique({ where: { id: requestId } });
    if (!request) return NextResponse.json({ success: false, error: 'Request not found' }, { status: 404 });

    const dayOfWeek = new Date(request.date + 'T00:00:00').getDay();
    const scheduleDay = dayOfWeek >= 1 && dayOfWeek <= 5 ? dayOfWeek : 1;
    const dayName = DAY_NAMES[scheduleDay];

    const weekStart = getWeekStart(request.date);
    const weekEndDate = new Date(weekStart + 'T00:00:00');
    weekEndDate.setDate(weekEndDate.getDate() + 4);
    const weekEnd = weekEndDate.toISOString().split('T')[0];

    // Teachers busy at this exact period today
    const busyTeacherIds = await db.schedule.findMany({
      where: { day: dayName, period: request.period },
      select: { teacherId: true },
    });
    const busySet = new Set(busyTeacherIds.map(s => s.teacherId).filter((id): id is string => !!id));
    busySet.add(request.absentTeacherId);

    // Teachers on approved leave today
    const leaves = await db.leaveApplication.findMany({
      where: { status: 'approved', startDate: { lte: request.date }, endDate: { gte: request.date } },
      select: { teacherId: true },
    });
    leaves.forEach(l => busySet.add(l.teacherId));

    const allTeachers = await db.teacher.findMany({
      where: { id: { notIn: Array.from(busySet) } },
    });

    // Batch-fetch instead of N+1 per-teacher queries.
    const allDaySchedules = await db.schedule.findMany({ where: { day: dayName }, select: { teacherId: true } });
    const classesTodayByTeacher = new Map<string, number>();
    for (const s of allDaySchedules) {
      if (!s.teacherId) continue;
      classesTodayByTeacher.set(s.teacherId, (classesTodayByTeacher.get(s.teacherId) || 0) + 1);
    }
    const weekSubs = await db.substitution.findMany({
      where: { date: { gte: weekStart, lte: weekEnd }, status: { in: ['assigned', 'completed'] } },
      select: { substituteId: true },
    });
    const weeklySubsByTeacher = new Map<string, number>();
    for (const s of weekSubs) {
      if (!s.substituteId) continue;
      weeklySubsByTeacher.set(s.substituteId, (weeklySubsByTeacher.get(s.substituteId) || 0) + 1);
    }

    const candidates: any[] = [];

    for (const teacher of allTeachers) {
      const teacherGrades: string[] = JSON.parse(teacher.grades || '[]');
      const teachesSameSubject = teacher.subject === request.subject;
      const teachesThisGrade = teacherGrades.includes(request.grade);

      const classesToday = classesTodayByTeacher.get(teacher.id) || 0;
      const freePeriods = Math.max(0, 8 - classesToday);
      const weeklySubs = weeklySubsByTeacher.get(teacher.id) || 0;

      let score = teachesSameSubject ? (teachesThisGrade ? 95 : 80) : 30;
      const reasons: string[] = [];
      if (teachesSameSubject) {
        reasons.push(teachesThisGrade ? 'Primary teacher for this subject & grade' : 'Teaches the same subject');
      } else {
        reasons.push('Available (cross-subject - can supervise)');
      }

      if (weeklySubs === 0) {
        score += 15;
        reasons.push('No substitutions this week');
      } else if (weeklySubs <= 2) {
        score += 8;
        reasons.push('Minimal substitution load');
      } else if (weeklySubs <= 4) {
        score -= 5;
        reasons.push('Moderate substitution load');
      } else {
        score -= weeklySubs * 5;
        reasons.push(`Heavy load: ${weeklySubs} subs this week`);
      }

      if (classesToday <= 3) {
        score += 10;
        reasons.push(`Light schedule today (${classesToday}/8 classes)`);
      } else if (classesToday <= 5) {
        score += 5;
        reasons.push(`Moderate schedule today (${classesToday}/8 classes)`);
      }

      if (freePeriods >= 4) {
        score += 5;
        reasons.push('Many free periods');
      }

      candidates.push({
        teacherId: teacher.id,
        teacherName: teacher.name,
        department: teacher.subject,
        score,
        reasons,
        teachesSameSubject,
        isPrimaryMatch: teachesSameSubject && teachesThisGrade,
        currentLoad: classesToday,
        freePeriods,
        weeklySubCount: weeklySubs,
      });
    }

    candidates.sort((a, b) => {
      if (a.teachesSameSubject !== b.teachesSameSubject) return a.teachesSameSubject ? -1 : 1;
      if (a.isPrimaryMatch !== b.isPrimaryMatch) return a.isPrimaryMatch ? -1 : 1;
      return b.score - a.score;
    });

    return NextResponse.json({ success: true, data: candidates.slice(0, 20) });
  } catch (error) {
    console.error('[CANDIDATES ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}

function getWeekStart(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const day = date.getDay();
  const diff = day === 0 ? 6 : day - 1;
  date.setDate(date.getDate() - diff);
  return date.toISOString().split('T')[0];
}
