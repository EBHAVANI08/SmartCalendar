import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get('date');
    const period = req.nextUrl.searchParams.get('period');
    const grade = req.nextUrl.searchParams.get('grade');
    const section = req.nextUrl.searchParams.get('section');

    if (!date || !period) {
      return NextResponse.json({ success: false, error: 'date and period required' }, { status: 400 });
    }
    if (!grade) {
      return NextResponse.json({ success: false, error: 'Please select a grade first to find the schedule that needs substitution' }, { status: 400 });
    }

    const dayOfWeek = new Date(date + 'T00:00:00').getDay();
    const scheduleDay = dayOfWeek >= 1 && dayOfWeek <= 5 ? dayOfWeek : 1;
    const dayName = DAY_NAMES[scheduleDay];
    const periodNum = parseInt(period);

    const schedule = await db.schedule.findFirst({
      where: { grade, section: section || undefined, day: dayName, period: periodNum },
      include: { teacher: true },
    });

    if (!schedule) {
      return NextResponse.json({ success: false, error: 'No schedule found for this grade and time slot', data: { candidates: [], scheduleId: null } });
    }

    const weekStart = getWeekStart(date);
    const weekEndDate = new Date(weekStart + 'T00:00:00');
    weekEndDate.setDate(weekEndDate.getDate() + 4);
    const weekEnd = weekEndDate.toISOString().split('T')[0];

    // Teachers busy at this period today
    const busyTeacherIds = await db.schedule.findMany({
      where: { day: dayName, period: periodNum },
      select: { teacherId: true },
    });
    const busySet = new Set(busyTeacherIds.map(s => s.teacherId).filter((id): id is string => !!id));
    if (schedule.teacherId) busySet.add(schedule.teacherId);

    // Teachers on approved leave
    const leaves = await db.leaveApplication.findMany({
      where: { status: 'approved', startDate: { lte: date }, endDate: { gte: date } },
      select: { teacherId: true },
    });
    leaves.forEach(l => busySet.add(l.teacherId));

    // Teachers already assigned as substitutes for this exact period/date
    const existingSubs = await db.substitution.findMany({
      where: { date, period: periodNum, status: { in: ['assigned', 'completed'] } },
      select: { substituteId: true },
    });
    existingSubs.forEach(s => { if (s.substituteId) busySet.add(s.substituteId); });

    const available = await db.teacher.findMany({ where: { id: { notIn: Array.from(busySet) } } });

    const candidates = await Promise.all(available.map(async (t) => {
      const sameSubjectMatch = t.subject === schedule.subject;
      const teacherGrades: string[] = JSON.parse(t.grades || '[]');
      const primaryMatch = sameSubjectMatch && teacherGrades.includes(schedule.grade);

      const classesToday = await db.schedule.count({ where: { teacherId: t.id, day: dayName } });
      const freePeriods = Math.max(0, 8 - classesToday);
      const weeklySubs = await db.substitution.count({
        where: { substituteId: t.id, date: { gte: weekStart, lte: weekEnd }, status: { in: ['assigned', 'completed'] } },
      });

      let score = 0;
      const reasons: string[] = [];
      if (primaryMatch) {
        score += 50;
        reasons.push('Primary subject teacher for this grade');
      } else if (sameSubjectMatch) {
        score += 40;
        reasons.push('Teaches the same subject');
      }

      if (weeklySubs === 0) {
        score += 15;
        reasons.push('No substitutions this week');
      } else if (weeklySubs <= 2) {
        score += 8;
        reasons.push('Light substitution load');
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
      } else {
        score -= 5;
        reasons.push(`Heavy schedule today (${classesToday}/8 classes)`);
      }

      if (freePeriods >= 4) {
        score += 5;
        reasons.push('Many free periods');
      }

      return {
        teacherId: t.id,
        teacherName: t.name,
        department: t.subject,
        score,
        reasons,
        teachesSameSubject: sameSubjectMatch,
        isPrimaryMatch: primaryMatch,
        currentLoad: classesToday,
        freePeriods,
        weeklySubCount: weeklySubs,
      };
    }));

    candidates.sort((a, b) => {
      if (a.teachesSameSubject !== b.teachesSameSubject) return a.teachesSameSubject ? -1 : 1;
      if (a.isPrimaryMatch !== b.isPrimaryMatch) return a.isPrimaryMatch ? -1 : 1;
      return b.score - a.score;
    });

    return NextResponse.json({
      success: true,
      data: {
        candidates: candidates.slice(0, 10),
        scheduleId: schedule.id,
        scheduleInfo: {
          subject: schedule.subject,
          grade: schedule.grade,
          section: schedule.section,
          originalTeacher: schedule.teacher?.name,
          topic: schedule.topic,
        },
      },
    });
  } catch (error) {
    console.error('[MANUAL ASSIGN GET ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { scheduleId, teacherId, date, assignedBy } = await req.json();
    if (!scheduleId || !teacherId || !date) {
      return NextResponse.json({ success: false, error: 'scheduleId, teacherId, date required' }, { status: 400 });
    }

    const schedule = await db.schedule.findUnique({ where: { id: scheduleId }, include: { teacher: true } });
    if (!schedule) return NextResponse.json({ success: false, error: 'Schedule not found' }, { status: 404 });
    if (!schedule.teacherId) return NextResponse.json({ success: false, error: 'This schedule has no assigned teacher' }, { status: 400 });

    const substitution = await db.substitution.create({
      data: {
        date,
        period: schedule.period,
        absentTeacherId: schedule.teacherId,
        substituteId: teacherId,
        grade: schedule.grade,
        section: schedule.section,
        subject: schedule.subject,
        reason: 'Manual assignment',
        todayTopic: schedule.topic,
        source: 'manual',
        status: 'completed',
      },
    });

    await db.teacherNotification.create({
      data: {
        type: 'lesson_plan',
        referenceId: substitution.id,
        teacherId,
        sentBy: assignedBy || 'admin',
        title: `Substitution Assignment - ${schedule.subject}`,
        description: `You have been assigned as substitute for ${schedule.grade} Section ${schedule.section} ${schedule.subject} class on ${date} (${schedule.startTime}-${schedule.endTime}). Original teacher: ${schedule.teacher?.name}. Topic: ${schedule.topic || 'N/A'}`,
      },
    });

    return NextResponse.json({ success: true, data: { substitutionId: substitution.id } });
  } catch (error) {
    console.error('[MANUAL ASSIGN POST ERROR]', error);
    return NextResponse.json({ success: false, error: 'Assignment failed' }, { status: 500 });
  }
}

function getWeekStart(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const day = date.getDay();
  const diff = day === 0 ? 6 : day - 1;
  date.setDate(date.getDate() - diff);
  return date.toISOString().split('T')[0];
}
