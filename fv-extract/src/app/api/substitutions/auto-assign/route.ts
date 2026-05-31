import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

const MAX_PERIODS_PER_DAY = 8;

export async function POST(request: Request) {
  try {
    const { substitutionId } = await request.json();

    if (!substitutionId) {
      return NextResponse.json({ error: 'substitutionId is required' }, { status: 400 });
    }

    // Find the substitution
    const substitution = await db.substitution.findUnique({
      where: { id: substitutionId },
      include: {
        absentTeacher: true,
        substitute: true,
      },
    });

    if (!substitution) {
      return NextResponse.json({ error: 'Substitution not found' }, { status: 404 });
    }

    if (substitution.status === 'assigned' && substitution.substituteId) {
      return NextResponse.json({ error: 'Substitution already has a substitute assigned' }, { status: 400 });
    }

    // Get the grade, section, subject, period, and date
    const { grade, section, subject, period, date, absentTeacherId } = substitution;

    // Find the day of the week from the date
    const dateObj = new Date(date + 'T00:00:00');
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const day = dayNames[dateObj.getDay()];

    // Find available teachers who:
    // 1. Are not the absent teacher
    // 2. Are not busy at this period on this day
    // 3. Have < MAX_PERIODS_PER_DAY periods that day
    // 4. Can teach this subject (subject match preferred)
    // 5. Can teach this grade
    const allTeachers = await db.teacher.findMany({
      include: {
        schedules: {
          where: { day },
        },
      },
    });

    const eligibleTeachers = allTeachers
      .filter((t) => {
        // Not the absent teacher
        if (t.id === absentTeacherId) return false;

        // Not busy at this period
        const isBusyAtPeriod = t.schedules.some((s) => s.period === period);
        if (isBusyAtPeriod) return false;

        // Has < MAX_PERIODS_PER_DAY periods that day
        const dayWorkload = t.schedules.length;
        if (dayWorkload >= MAX_PERIODS_PER_DAY) return false;

        // Can teach this subject OR this grade
        const grades = JSON.parse(t.grades || '[]') as string[];
        const teachesSubject = t.subject === subject;
        const teachesGrade = grades.includes(grade);

        return teachesSubject || teachesGrade;
      })
      .map((t) => {
        const grades = JSON.parse(t.grades || '[]') as string[];
        const teachesSubject = t.subject === subject;
        const teachesGrade = grades.includes(grade);
        const dayWorkload = t.schedules.length;
        const gradeFamiliarity = t.schedules.filter((s) => s.grade === grade).length;

        return {
          teacher: t,
          teachesSubject,
          teachesGrade,
          dayWorkload,
          gradeFamiliarity,
        };
      });

    // Sort by: subject match > least workload > grade familiarity
    eligibleTeachers.sort((a, b) => {
      if (a.teachesSubject && !b.teachesSubject) return -1;
      if (!a.teachesSubject && b.teachesSubject) return 1;
      if (a.dayWorkload !== b.dayWorkload) return a.dayWorkload - b.dayWorkload;
      return b.gradeFamiliarity - a.gradeFamiliarity;
    });

    let bestTeacher = null;

    if (eligibleTeachers.length > 0) {
      bestTeacher = eligibleTeachers[0].teacher;
    } else {
      // Broaden: find any teacher not busy at this period with < MAX_PERIODS_PER_DAY that day
      const broadened = allTeachers.filter((t) => {
        if (t.id === absentTeacherId) return false;
        const isBusyAtPeriod = t.schedules.some((s) => s.period === period);
        if (isBusyAtPeriod) return false;
        return t.schedules.length < MAX_PERIODS_PER_DAY;
      });

      broadened.sort((a, b) => a.schedules.length - b.schedules.length);

      if (broadened.length > 0) {
        bestTeacher = broadened[0];
      }
    }

    if (!bestTeacher) {
      return NextResponse.json({ error: 'No available substitute teacher found' }, { status: 404 });
    }

    // Assign the best teacher as substitute and update status to "assigned"
    const updated = await db.substitution.update({
      where: { id: substitutionId },
      data: {
        substituteId: bestTeacher.id,
        status: 'assigned',
      },
      include: {
        absentTeacher: true,
        substitute: true,
      },
    });

    return NextResponse.json({
      success: true,
      substitution: updated,
      message: `AI assigned ${bestTeacher.name} as substitute (${bestTeacher.subject} specialist, ${eligibleTeachers[0]?.dayWorkload || 0}/${MAX_PERIODS_PER_DAY} periods today)`,
    });
  } catch (error) {
    console.error('Error auto-assigning substitute:', error);
    return NextResponse.json({ error: 'Failed to auto-assign substitute' }, { status: 500 });
  }
}
