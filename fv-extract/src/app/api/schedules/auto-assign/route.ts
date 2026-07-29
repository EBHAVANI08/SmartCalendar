import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

const MAX_PERIODS_PER_DAY = 6;

export async function POST(request: Request) {
  try {
    const { grade, section, day, period } = await request.json();

    if (!grade || !section || !day || !period) {
      return NextResponse.json({ error: 'grade, section, day, and period are required' }, { status: 400 });
    }

    // 1. Find the schedule entry for this grade/section/day/period
    const schedule = await db.schedule.findUnique({
      where: {
        grade_section_day_period: { grade, section, day, period },
      },
      include: { teacher: true },
    });

    if (!schedule) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
    }

    // 2. If already has teacher, return error
    if (schedule.teacherId) {
      return NextResponse.json({ error: 'This period already has a teacher assigned' }, { status: 400 });
    }

    // 3. Get ALL teachers with their schedules for the given DAY
    const allTeachers = await db.teacher.findMany({
      include: {
        schedules: {
          where: { day },
        },
      },
    });

    // 4-5. Filter teachers who:
    //   a. Are NOT busy at this specific day+period (no schedule entry for this day+period)
    //   b. Have < MAX_PERIODS_PER_DAY periods assigned for this day
    //   c. Can teach this subject (teacher.subject === schedule.subject OR teacher's grades include this grade)
    const eligibleTeachers = allTeachers
      .filter((t) => {
        // Not busy at this period
        const isBusyAtPeriod = t.schedules.some((s) => s.period === period);
        if (isBusyAtPeriod) return false;

        // Has < MAX_PERIODS_PER_DAY periods that day
        const dayWorkload = t.schedules.length;
        if (dayWorkload >= MAX_PERIODS_PER_DAY) return false;

        // Can teach this subject OR teaches this grade
        const grades = JSON.parse(t.grades || '[]') as string[];
        const teachesSubject = t.subject === schedule.subject;
        const teachesGrade = grades.includes(grade);

        return teachesSubject || teachesGrade;
      })
      .map((t) => {
        const grades = JSON.parse(t.grades || '[]') as string[];
        const teachesSubject = t.subject === schedule.subject;
        const teachesGrade = grades.includes(grade);
        const dayWorkload = t.schedules.length;

        // Calculate grade familiarity: how many schedules does this teacher already have for this grade?
        const gradeFamiliarity = t.schedules.filter((s) => s.grade === grade).length;

        return {
          teacher: t,
          teachesSubject,
          teachesGrade,
          dayWorkload,
          gradeFamiliarity,
        };
      });

    // 6. Sort eligible teachers by:
    //   a. Subject match (primary) — teachers whose subject matches get priority
    //   b. Least workload for the day (secondary)
    //   c. Grade familiarity (tertiary) — teachers who already teach this grade
    eligibleTeachers.sort((a, b) => {
      // Subject match first
      if (a.teachesSubject && !b.teachesSubject) return -1;
      if (!a.teachesSubject && b.teachesSubject) return 1;
      // Then least workload
      if (a.dayWorkload !== b.dayWorkload) return a.dayWorkload - b.dayWorkload;
      // Then grade familiarity
      return b.gradeFamiliarity - a.gradeFamiliarity;
    });

    if (eligibleTeachers.length > 0) {
      const bestTeacher = eligibleTeachers[0].teacher;
      const updated = await db.schedule.update({
        where: {
          grade_section_day_period: { grade, section, day, period },
        },
        data: { teacherId: bestTeacher.id },
        include: { teacher: true },
      });

      const matchType = eligibleTeachers[0].teachesSubject ? 'subject match' : 'grade match';
      return NextResponse.json({ updated, autoAssigned: true, message: `Auto-assigned ${bestTeacher.name} (${matchType})` });
    }

    // 7. If no exact match found, broaden: find any teacher not busy at this period with < MAX_PERIODS_PER_DAY that day
    const broadenedTeachers = allTeachers.filter((t) => {
      const isBusyAtPeriod = t.schedules.some((s) => s.period === period);
      if (isBusyAtPeriod) return false;
      const dayWorkload = t.schedules.length;
      return dayWorkload < MAX_PERIODS_PER_DAY;
    });

    // Sort broadened by least workload
    broadenedTeachers.sort((a, b) => a.schedules.length - b.schedules.length);

    if (broadenedTeachers.length > 0) {
      const assigned = broadenedTeachers[0];
      const updated = await db.schedule.update({
        where: {
          grade_section_day_period: { grade, section, day, period },
        },
        data: { teacherId: assigned.id },
        include: { teacher: true },
      });

      return NextResponse.json({ updated, autoAssigned: true, message: `Auto-assigned ${assigned.name} (best available)` });
    }

    return NextResponse.json({ error: 'No available teachers found. All teachers are either busy or at maximum capacity for the day.' }, { status: 404 });
  } catch (error) {
    console.error('Error auto-assigning teacher:', error);
    return NextResponse.json({ error: 'Failed to auto-assign teacher' }, { status: 500 });
  }
}
