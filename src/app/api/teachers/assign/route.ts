import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/authz';
import { readList } from '@/lib/faculty';

const MAX_PERIODS_PER_DAY = 8;

export async function POST(request: Request) {
  const denied = requireCapability(request, 'faculty.write');
  if (denied) return denied;

  try {
    const { teacherId, scheduleId } = await request.json();

    if (!teacherId || !scheduleId) {
      return NextResponse.json({ error: 'teacherId and scheduleId are required' }, { status: 400 });
    }

    const teacher = await db.teacher.findUnique({ where: { id: teacherId } });
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
        id: { not: scheduleId },
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

    // Strictly verify teacher teaches the right subject, grade, and section for this schedule
    const subjects = readList(teacher.subjects ?? teacher.subject);
    const grades = readList(teacher.grades);
    const sections = readList(teacher.sections);

    const subjectMatch = subjects.some((s) => {
      const clean = s.trim().toLowerCase();
      const target = schedule.subject.trim().toLowerCase();
      return clean === target || clean.replace(/\s+/g, '') === target.replace(/\s+/g, '');
    });
    const gradeMatch = grades.length > 0 && grades.some((g) => {
      const clean = g.trim().toLowerCase();
      const target = schedule.grade.trim().toLowerCase();
      if (clean === target) return true;
      const gNum = clean.replace(/[^0-9]/g, '');
      const tNum = target.replace(/[^0-9]/g, '');
      return gNum && tNum && gNum === tNum;
    });
    const sectionMatch = sections.length === 0 || sections.some((sec) => {
      const clean = sec.trim().toUpperCase().replace(/^SECTION\s*/i, '');
      const target = schedule.section.trim().toUpperCase().replace(/^SECTION\s*/i, '');
      return clean === target;
    });

    if (!subjectMatch || !gradeMatch || !sectionMatch) {
      const issues: string[] = [];
      if (!subjectMatch) issues.push(`subject '${schedule.subject}'`);
      if (!gradeMatch) issues.push(`grade '${schedule.grade}'`);
      if (!sectionMatch) issues.push(`section '${schedule.section}'`);
      return NextResponse.json({
        error: `FACULTY MISMATCH: ${teacher.name} is not mapped in Faculty Directory for ${issues.join(', ')}.`,
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
      matchInfo: {
        subjectMatch,
        gradeMatch,
        sectionMatch,
        teacherSubjects: subjects,
        scheduleSubject: schedule.subject,
        teacherGrades: grades,
        scheduleGrade: schedule.grade,
        teacherSections: sections,
        scheduleSection: schedule.section,
      },
    });
  } catch (error) {
    console.error('Error assigning teacher:', error);
    return NextResponse.json({ error: 'Failed to assign teacher' }, { status: 500 });
  }
}
