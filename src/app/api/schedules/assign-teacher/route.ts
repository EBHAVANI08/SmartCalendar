import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/authz';
import { readList, teacherTeachesSection } from '@/lib/faculty';

const MAX_PERIODS_PER_DAY = 8;

export async function POST(request: Request) {
  const denied = requireCapability(request, 'timetable.write');
  if (denied) return denied;

  try {
    const { scheduleId, teacherId } = await request.json();

    if (!scheduleId || !teacherId) {
      return NextResponse.json({ error: 'scheduleId and teacherId are required' }, { status: 400 });
    }

    const teacher = await db.teacher.findUnique({
      where: { id: teacherId },
      include: { schedules: true },
    });
    if (!teacher) {
      return NextResponse.json({ error: 'Teacher not found' }, { status: 404 });
    }

    const schedule = await db.schedule.findUnique({ where: { id: scheduleId } });
    if (!schedule) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
    }

    // Faculty Directory strict validation
    const subjects = readList(teacher.subjects ?? teacher.subject);
    const grades = readList(teacher.grades);
    const sections = readList(teacher.sections);

    const teachesSubject = subjects.some((s) => {
      const clean = s.trim().toLowerCase();
      const target = schedule.subject.trim().toLowerCase();
      return clean === target || clean.replace(/\s+/g, '') === target.replace(/\s+/g, '');
    });
    const teachesGrade = grades.length > 0 && grades.some((g) => {
      const clean = g.trim().toLowerCase();
      const target = schedule.grade.trim().toLowerCase();
      if (clean === target) return true;
      const gNum = clean.replace(/[^0-9]/g, '');
      const tNum = target.replace(/[^0-9]/g, '');
      return gNum && tNum && gNum === tNum;
    });
    const teachesSection = teacherTeachesSection(teacher.sections, schedule.grade, schedule.section);

    if (!teachesSubject || !teachesGrade || !teachesSection) {
      const issues: string[] = [];
      if (!teachesSubject) issues.push(`subject '${schedule.subject}'`);
      if (!teachesGrade) issues.push(`grade '${schedule.grade}'`);
      if (!teachesSection) issues.push(`section '${schedule.section}'`);
      return NextResponse.json({
        error: `FACULTY MISMATCH: ${teacher.name} is not mapped in Faculty Directory for ${issues.join(', ')}.`,
      }, { status: 409 });
    }

    // CRITICAL: Check if teacher is already assigned to another grade/section at the same day+period
    const conflictingSchedule = await db.schedule.findFirst({
      where: {
        teacherId,
        day: schedule.day,
        period: schedule.period,
        id: { not: scheduleId }, // Exclude the current schedule being updated
      },
    });

    if (conflictingSchedule) {
      return NextResponse.json({
        error: `TIME CONFLICT: ${teacher.name} is already assigned to ${conflictingSchedule.grade} ${conflictingSchedule.section} - ${conflictingSchedule.subject} (Period ${conflictingSchedule.period}, ${conflictingSchedule.day}). A teacher cannot be in two places at the same time.`,
        conflict: {
          grade: conflictingSchedule.grade,
          section: conflictingSchedule.section,
          subject: conflictingSchedule.subject,
          period: conflictingSchedule.period,
          day: conflictingSchedule.day,
        },
      }, { status: 409 });
    }

    // Check if teacher already has max periods that day
    const dayScheduleCount = await db.schedule.count({
      where: {
        teacherId,
        day: schedule.day,
        id: { not: scheduleId },
      },
    });

    const dayLimit = schedule.day === 'Saturday' ? 4 : MAX_PERIODS_PER_DAY;
    if (dayScheduleCount >= dayLimit) {
      return NextResponse.json({
        error: `WORKLOAD LIMIT: ${teacher.name} already has ${dayScheduleCount} periods on ${schedule.day}. Maximum is ${dayLimit} periods on this day.`,
        dayWorkload: dayScheduleCount,
      }, { status: 409 });
    }

    const loadByDay = teacher.schedules.filter((item) => item.id !== scheduleId).reduce<Record<string, number>>((counts, item) => { counts[item.day] = (counts[item.day] || 0) + 1; return counts; }, {});
    const anotherFullLoadDay = Object.entries(loadByDay).find(([day, count]) => day !== schedule.day && day !== 'Saturday' && count > 5);
    if (schedule.day !== 'Saturday' && dayScheduleCount + 1 > 5 && anotherFullLoadDay) {
      return NextResponse.json({ error: `WEEKLY BALANCE: ${teacher.name} already has a full-load day on ${anotherFullLoadDay[0]}. Only one day per week may exceed 5 periods. Choose another teacher or a different day.` }, { status: 409 });
    }

    const updated = await db.schedule.update({
      where: { id: scheduleId },
      data: { teacherId },
      include: { teacher: true },
    });

    return NextResponse.json({
      ...updated,
      warning: dayScheduleCount >= 5
        ? `Warning: ${teacher.name} now has ${dayScheduleCount + 1} periods on ${schedule.day}. Consider workload balancing.`
        : undefined,
    });
  } catch (error) {
    console.error('Error assigning teacher to period:', error);
    return NextResponse.json({ error: 'Failed to assign teacher' }, { status: 500 });
  }
}
