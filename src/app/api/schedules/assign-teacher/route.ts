import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/authz';
import { readList, teacherTeachesSection } from '@/lib/faculty';
import { TEACHER_PUBLIC_SELECT } from '@/lib/safe-fields';
import { getTenantSchoolId } from '@/lib/school-helper';
import { isScheduleRowEditable } from '@/lib/timetable-lifecycle';
import { capViolations, effectiveWorkloads, teacherLoad } from '@/lib/workload';

export async function POST(request: Request) {
  const denied = requireCapability(request, 'timetable.write');
  if (denied) return denied;

  try {
    const { scheduleId, teacherId } = await request.json();

    if (!scheduleId || !teacherId) {
      return NextResponse.json({ error: 'scheduleId and teacherId are required' }, { status: 400 });
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
    // Clashes and load are counted within the same timetable version only.
    const sameVersion = schedule.timetableVersionId
      ? { timetableVersionId: schedule.timetableVersionId }
      : { OR: [{ timetableVersionId: null }, { timetableVersionId: { isSet: false } }] };

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
    const teachesSection = teacherTeachesSection(teacher.sections, schedule.grade, schedule.section, schedule.subject);

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
        schoolId,
        ...sameVersion,
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

    // The teacher's own limits (personal rule, else school defaults). With
    // none set, nothing is assumed: the timetable view reports the missing rule.
    const limits = (await effectiveWorkloads(schoolId, [teacherId])).get(teacherId)!;
    if (limits.unavailable.some((u) => u.day === schedule.day && u.period === schedule.period)) {
      return NextResponse.json({ error: `UNAVAILABLE: ${teacher.name} is marked unavailable on ${schedule.day} P${schedule.period}.` }, { status: 409 });
    }
    const otherLessons = await db.schedule.findMany({
      where: { schoolId, ...sameVersion, teacherId, id: { not: scheduleId } },
      select: { day: true, period: true },
    });
    const problems = capViolations(teacherLoad([...otherLessons, { day: schedule.day, period: schedule.period }]), limits);
    if (problems.length) {
      return NextResponse.json({ error: `WORKLOAD LIMIT: ${teacher.name} would have ${problems.join('; ')}.`, problems }, { status: 409 });
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
    });
  } catch (error) {
    console.error('Error assigning teacher to period:', error);
    return NextResponse.json({ error: 'Failed to assign teacher' }, { status: 500 });
  }
}
