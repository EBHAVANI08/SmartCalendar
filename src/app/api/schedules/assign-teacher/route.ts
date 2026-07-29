import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

const MAX_PERIODS_PER_DAY = 8;

export async function POST(request: Request) {
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

    if (dayScheduleCount >= MAX_PERIODS_PER_DAY) {
      return NextResponse.json({
        error: `WORKLOAD LIMIT: ${teacher.name} already has ${dayScheduleCount} periods on ${schedule.day}. Maximum is ${MAX_PERIODS_PER_DAY} periods per day.`,
        dayWorkload: dayScheduleCount,
      }, { status: 409 });
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
