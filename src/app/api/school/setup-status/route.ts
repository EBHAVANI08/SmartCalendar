export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { requireCapability } from '@/lib/authz';
import { NextResponse } from 'next/server';

/**
 * How far a school is through setting itself up.
 *
 * Derived entirely from data the school already has - there is no onboarding
 * table and no stored "completed" flag, so nothing can claim a step is done
 * when the underlying data is missing.
 *
 * This matters for existing tenants as much as new ones. A school that has been
 * running on the legacy timetable for a year must show as set up, so publishing
 * a versioned timetable is never a prerequisite for the checklist to complete.
 * Step 10 is therefore reported but excluded from the required count.
 */

interface Step {
  id: string;
  label: string;
  done: boolean;
  href: string;
  detail: string;
  /** Counts toward "X of Y". Optional steps and the publish step do not. */
  required: boolean;
  /** Present but not applicable to this school, e.g. rooms when unused. */
  skipped?: boolean;
}

export async function GET(request: Request) {
  const denied = requireCapability(request, 'school.settings.read');
  if (denied) return denied;

  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }

  const [school, dayConfig, subjectConfigs, teachers, rooms, scheduleCount, publishedVersion] =
    await Promise.all([
      db.school.findUnique({
        where: { id: schoolId },
        select: { name: true, phone: true, board: true, address: true },
      }),
      db.schoolDayPeriodConfig.findUnique({ where: { schoolId } }).catch(() => null),
      db.gradeSubjectConfig
        .findMany({ where: { schoolId }, select: { grade: true, subjectName: true, weeklyPeriods: true, active: true } })
        .catch(() => []),
      db.teacher
        .findMany({ where: { schoolId }, select: { role: true, subjects: true, subject: true, grades: true } })
        .catch(() => []),
      db.room.count({ where: { schoolId, active: true } }).catch(() => 0),
      db.schedule.count({ where: { schoolId } }),
      db.timetableVersion.findFirst({ where: { schoolId, status: 'published' }, select: { id: true } }).catch(() => null),
    ]);

  if (!school) {
    return NextResponse.json({ error: 'School not found.' }, { status: 404 });
  }

  // A legacy school proves its grades and sections through its existing
  // timetable, not only through subject configuration.
  const scheduleGrades = scheduleCount
    ? await db.schedule.findMany({ where: { schoolId }, select: { grade: true, section: true, subject: true }, take: 3000 })
    : [];
  const classSet = new Set(scheduleGrades.map((r) => `${r.grade}|${r.section}`));
  for (const c of subjectConfigs) classSet.add(`${c.grade}|`);

  const activeTeachers = teachers.filter((t) => t.role !== 'inactive');

  const teacherSubjects = (t: (typeof teachers)[number]) => {
    const raw = t.subjects || t.subject || '';
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x).toLowerCase());
    } catch {
      /* legacy single value */
    }
    return raw ? [String(raw).toLowerCase()] : [];
  };
  const coveredSubjects = new Set(activeTeachers.flatMap(teacherSubjects));

  const activeSubjects = subjectConfigs.filter((c) => c.active !== false && (c.weeklyPeriods ?? 0) > 0);
  const unmappedSubjects = activeSubjects.filter((c) => !coveredSubjects.has(c.subjectName.toLowerCase()));

  // Rooms only count when the school has started using them at all.
  const roomsInUse = rooms > 0;

  const steps: Step[] = [
    {
      id: 'profile',
      label: 'School profile',
      done: Boolean(school.name && school.phone && school.board && school.address),
      href: '/settings?tab=profile',
      detail: [
        school.name ? null : 'name',
        school.phone ? null : 'phone',
        school.board ? null : 'board',
        school.address ? null : 'address',
      ].filter(Boolean).length
        ? `Missing: ${[school.phone ? null : 'phone', school.board ? null : 'board', school.address ? null : 'address'].filter(Boolean).join(', ')}`
        : 'Complete',
      required: true,
    },
    {
      id: 'dayconfig',
      label: 'Day & period setup',
      done: Boolean(dayConfig),
      href: '/settings?tab=timetable&sub=days',
      detail: dayConfig
        ? `${dayConfig.workingDays} working days configured`
        : 'Not configured — generation cannot run without it',
      required: true,
    },
    {
      id: 'classes',
      label: 'Grades & sections',
      done: classSet.size > 0,
      href: '/settings?tab=timetable&sub=structure',
      detail: classSet.size ? `${classSet.size} class(es) known` : 'No grades or sections yet',
      required: true,
    },
    {
      id: 'subjects',
      label: 'Subject configuration',
      done: activeSubjects.length > 0,
      href: '/settings?tab=timetable&sub=subjects',
      detail: activeSubjects.length
        ? `${activeSubjects.length} subject(s) configured`
        : 'No subjects with a weekly requirement',
      required: true,
    },
    {
      id: 'faculty',
      label: 'Faculty directory',
      done: activeTeachers.length > 0,
      href: '/teachers',
      detail: activeTeachers.length ? `${activeTeachers.length} active teacher(s)` : 'No faculty added yet',
      required: true,
    },
    {
      id: 'mapping',
      label: 'Teachers mapped to subjects',
      done: activeSubjects.length > 0 && unmappedSubjects.length === 0,
      href: '/settings?tab=timetable&sub=subjects',
      detail: activeSubjects.length === 0
        ? 'Configure subjects first'
        : unmappedSubjects.length
          ? `${unmappedSubjects.length} subject(s) have no qualified teacher`
          : 'Every configured subject has a teacher',
      required: true,
    },
    {
      id: 'rooms',
      label: 'Rooms & facilities',
      done: roomsInUse,
      href: '/settings?tab=timetable&sub=rooms',
      detail: roomsInUse ? `${rooms} active room(s)` : 'Optional — add rooms if you schedule labs or halls',
      required: false,
      skipped: !roomsInUse,
    },
    {
      id: 'timetable',
      label: 'First timetable generated',
      done: scheduleCount > 0,
      href: '/timetable',
      detail: scheduleCount ? `${scheduleCount} scheduled periods` : 'No timetable yet',
      required: true,
    },
    {
      id: 'publish',
      label: 'Timetable published',
      done: Boolean(publishedVersion),
      href: '/timetable-versions',
      detail: publishedVersion
        ? 'A published version is live'
        : scheduleCount > 0
          ? 'Running on an unversioned timetable — publishing is optional'
          : 'Nothing to publish yet',
      // Not required: existing tenants run a perfectly valid legacy timetable
      // and must not be told their setup is incomplete because of it.
      required: false,
    },
  ];

  const required = steps.filter((s) => s.required);
  const completed = required.filter((s) => s.done).length;

  return NextResponse.json({
    success: true,
    schoolId,
    steps,
    completed,
    total: required.length,
    complete: completed === required.length,
    nextStep: required.find((s) => !s.done)?.id ?? null,
    // Useful context for the Timetable Studio empty state.
    legacyMode: scheduleCount > 0 && !publishedVersion,
  });
}
