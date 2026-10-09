import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/authz';
import { readList } from '@/lib/faculty';
import { TEACHER_PUBLIC_SELECT } from '@/lib/safe-fields';
import { getTenantSchoolId } from '@/lib/school-helper';
import { isScheduleRowEditable } from '@/lib/timetable-lifecycle';
import { capViolations, effectiveWorkloads, teacherLoad } from '@/lib/workload';


export async function POST(request: Request) {
  const denied = requireCapability(request, 'faculty.write');
  if (denied) return denied;

  try {
    const { teacherId, scheduleId } = await request.json();

    if (!teacherId || !scheduleId) {
      return NextResponse.json({ error: 'teacherId and scheduleId are required' }, { status: 400 });
    }

    // Both must belong to the caller's school; ids alone were trusted before.
    const schoolId = await getTenantSchoolId(request);
    if (!schoolId) return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
    const teacher = await db.teacher.findFirst({ where: { id: teacherId, schoolId } });
    if (!teacher) {
      return NextResponse.json({ error: 'Teacher not found' }, { status: 404 });
    }

    const schedule = await db.schedule.findFirst({ where: { id: scheduleId, schoolId } });
    if (!schedule) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
    }
    if (!(await isScheduleRowEditable(schoolId, schedule.timetableVersionId))) {
      return NextResponse.json({ error: 'This lesson belongs to an approved or published timetable, which cannot be edited. Create a revision and edit the draft.', code: 'VERSION_READ_ONLY' }, { status: 409 });
    }

    // CRITICAL: Check if teacher is already assigned to another grade/section at the same day+period
    const conflictingSchedule = await db.schedule.findFirst({
      where: {
        schoolId,
        // Same timetable version only: other versions hold copies of the same slot.
        ...(schedule.timetableVersionId
          ? { timetableVersionId: schedule.timetableVersionId }
          : { OR: [{ timetableVersionId: null }, { timetableVersionId: { isSet: false } }] }),
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

    // The teacher's own limits (personal rule, else school defaults), counted
    // within this timetable version. With none set, nothing is assumed.
    const limits = (await effectiveWorkloads(schoolId, [teacherId])).get(teacherId)!;
    if (limits.unavailable.some((u) => u.day === schedule.day && u.period === schedule.period)) {
      return NextResponse.json({ error: `UNAVAILABLE: ${teacher.name} is marked unavailable on ${schedule.day} P${schedule.period}.` }, { status: 409 });
    }
    const otherLessons = await db.schedule.findMany({
      where: {
        schoolId,
        ...(schedule.timetableVersionId
          ? { timetableVersionId: schedule.timetableVersionId }
          : { OR: [{ timetableVersionId: null }, { timetableVersionId: { isSet: false } }] }),
        teacherId,
        id: { not: scheduleId },
      },
      select: { day: true, period: true },
    });
    const problems = capViolations(teacherLoad([...otherLessons, { day: schedule.day, period: schedule.period }]), limits);
    if (problems.length) {
      return NextResponse.json({ error: `WORKLOAD LIMIT: ${teacher.name} would have ${problems.join('; ')}.`, problems }, { status: 409 });
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
      include: { teacher: { select: TEACHER_PUBLIC_SELECT } },
    });

    return NextResponse.json({
      ...updated,
      warning: limits.source === 'missing'
        ? `${teacher.name} has no workload limits (personal or school defaults), so none were checked.`
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
