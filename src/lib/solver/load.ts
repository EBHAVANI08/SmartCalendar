import { db } from '@/lib/db';
import { teacherTeachesSection } from '@/lib/faculty';
import { gradeKey, subjectKey } from '@/lib/name-normalize';
import { NOT_ARCHIVED } from '@/lib/soft-delete';
import { teacherQualifiedFor } from '@/lib/staffing';
import { getDayConfig } from '@/lib/timetable-config';
import { DAY_NAMES, periodsForDay, workingDayNames } from '@/lib/timetable-constraints';
import type { SolverClass, SolverInput, SolverLesson, SolverRequirement, SolverTeacher } from '@/lib/solver/types';

/**
 * Builds the solver input for one school from its own settings. Read only.
 * Nothing is assumed: a section without a configured week is skipped with a
 * reason, a teacher without a workload rule or school defaults has no caps
 * (the solver then reports "rule missing" instead of guessing).
 */

export interface LoadOptions {
  /** Version whose version-specific workload rules, availability and locked rows apply. */
  versionId?: string | null;
  /**
   * Caps to use for teachers with neither a personal rule nor school defaults.
   * For "what if" simulations only; never used by generation.
   */
  assumeDefaults?: { maxWeekly: number; maxDaily: number; maxConsecutive: number } | null;
}

export interface LoadedInput {
  input: SolverInput;
  /** Sections that could not be scheduled at all, with the reason. */
  skipped: { grade: string; section: string; reason: string }[];
  /** Teachers whose caps were assumed (assumeDefaults) rather than configured. */
  assumedTeachers: string[];
}

const DAY_BY_NUMBER: Record<number, string> = Object.fromEntries(DAY_NAMES.map((day, index) => [index + 1, day]));

const parseSlots = (value: unknown): { day: string; period: number }[] =>
  Array.isArray(value)
    ? (value as { day?: unknown; period?: unknown }[])
      .filter((u) => u && typeof u.day === 'string' && Number(u.period) > 0)
      .map((u) => ({ day: String(u.day), period: Number(u.period) }))
    : [];

export async function loadSolverInput(schoolId: string, options: LoadOptions = {}): Promise<LoadedInput> {
  const versionId = options.versionId ?? null;
  const [sections, configs, teachers, rules, preferences, availability, rooms, lockedRows] = await Promise.all([
    db.classSection.findMany({ where: { schoolId, active: true, AND: [NOT_ARCHIVED] }, select: { grade: true, section: true, homeRoomId: true } }),
    db.gradeSubjectConfig.findMany({ where: { schoolId, active: true, AND: [NOT_ARCHIVED] } }),
    db.teacher.findMany({ where: { schoolId, role: { not: 'inactive' } }, select: { id: true, name: true, subject: true, subjects: true, grades: true, sections: true } }),
    db.teacherWorkloadRule.findMany({
      where: { schoolId, OR: [...(versionId ? [{ timetableVersionId: versionId }] : []), { timetableVersionId: null }, { timetableVersionId: { isSet: false } }] },
    }),
    db.schoolPreferences.findUnique({ where: { schoolId } }),
    versionId ? db.teacherAvailabilitySlot.findMany({ where: { schoolId, timetableVersionId: versionId } }) : Promise.resolve([]),
    db.room.findMany({ where: { schoolId, active: true }, select: { id: true, type: true } }),
    versionId
      ? db.schedule.findMany({ where: { schoolId, timetableVersionId: versionId, locked: true }, select: { grade: true, section: true, day: true, period: true, subject: true, teacherId: true, roomId: true } })
      : Promise.resolve([]),
  ]);

  const skipped: LoadedInput['skipped'] = [];
  const roomIds = new Set(rooms.map((r) => r.id));

  // ── Classes and their weeks ───────────────────────────────────────────────
  const classes: SolverClass[] = [];
  const weekByGrade = new Map<string, Awaited<ReturnType<typeof getDayConfig>>>();
  for (const section of sections) {
    if (!weekByGrade.has(section.grade)) weekByGrade.set(section.grade, await getDayConfig(schoolId, section.grade));
    const week = weekByGrade.get(section.grade)!;
    if (!week.configured) {
      skipped.push({ grade: section.grade, section: section.section, reason: 'The school day (periods per day) is not configured.' });
      continue;
    }
    const days = workingDayNames(week).map((day) => ({ day, periods: periodsForDay(day, week) })).filter((d) => d.periods > 0);
    if (!days.length) {
      skipped.push({ grade: section.grade, section: section.section, reason: 'The school day has no teaching periods.' });
      continue;
    }
    classes.push({
      key: `${section.grade}|${section.section}`,
      grade: section.grade,
      section: section.section,
      days,
      homeRoomId: section.homeRoomId && roomIds.has(section.homeRoomId) ? section.homeRoomId : null,
    });
  }

  // ── Requirements: one active rule per grade+subject (exact grade name wins) ─
  const rulesFor = (grade: string) => {
    const chosen = new Map<string, (typeof configs)[number]>();
    const matching = configs.filter((c) => gradeKey(c.grade) === gradeKey(grade));
    for (const rule of matching.sort((a, b) => Number(b.grade === grade) - Number(a.grade === grade))) {
      if (!chosen.has(subjectKey(rule.subjectName))) chosen.set(subjectKey(rule.subjectName), rule);
    }
    return [...chosen.values()].filter((r) => r.weeklyPeriods > 0);
  };
  const requirements: SolverRequirement[] = [];
  for (const cls of classes) {
    const own = rulesFor(cls.grade);
    if (!own.length) skipped.push({ grade: cls.grade, section: cls.section, reason: 'No active subject has a weekly quota for this grade.' });
    for (const rule of own) {
      requirements.push({
        classKey: cls.key,
        subject: rule.subjectName,
        weeklyPeriods: rule.weeklyPeriods,
        maxPerDay: rule.maxPeriodsPerDay ?? 1,
        allowConsecutive: Boolean(rule.allowConsecutive),
        requiredRoomType: rule.requiredRoomType ?? null,
        core: String(rule.priority ?? '').toLowerCase() === 'core',
        teacherIds: teachers
          .filter((t) => teacherQualifiedFor(t, rule.subjectName, cls.grade) && teacherTeachesSection(t.sections, cls.grade, cls.section, rule.subjectName))
          .map((t) => t.id),
      });
    }
  }

  // ── Teacher caps: version rule, else standing rule, else school defaults ──
  const defaults = {
    maxWeekly: preferences?.defaultMaxWeekly ?? null,
    maxDaily: preferences?.defaultMaxDaily ?? null,
    maxConsecutive: preferences?.defaultMaxConsecutive ?? null,
  };
  const schoolHasDefaults = defaults.maxWeekly !== null || defaults.maxDaily !== null || defaults.maxConsecutive !== null;
  const assumedTeachers: string[] = [];
  const solverTeachers: SolverTeacher[] = teachers.map((teacher) => {
    const own = (versionId ? rules.find((r) => r.teacherId === teacher.id && r.timetableVersionId === versionId) : undefined)
      ?? rules.find((r) => r.teacherId === teacher.id && !r.timetableVersionId);
    const unavailable = [
      ...parseSlots(own?.unavailableSlots),
      ...availability
        .filter((a) => a.teacherId === teacher.id && ['unavailable', 'restricted'].includes(String(a.status).toLowerCase()) && DAY_BY_NUMBER[a.dayOfWeek])
        .map((a) => ({ day: DAY_BY_NUMBER[a.dayOfWeek], period: a.period })),
    ];
    let caps = own ? { maxWeekly: own.maxWeekly, maxDaily: own.maxDaily, maxConsecutive: own.maxConsecutive } : defaults;
    if (!own && !schoolHasDefaults && options.assumeDefaults) {
      caps = options.assumeDefaults;
      assumedTeachers.push(teacher.id);
    }
    return { id: teacher.id, name: teacher.name, ...caps, unavailable };
  });

  // ── Locked rows of the version, kept exactly ──────────────────────────────
  const classKeys = new Set(classes.map((c) => c.key));
  const locked: SolverLesson[] = lockedRows
    .filter((row) => row.teacherId && classKeys.has(`${row.grade}|${row.section}`))
    .map((row) => {
      const classKey = `${row.grade}|${row.section}`;
      // Count the locked row against its quota even when spelled differently.
      const subject = requirements.find((r) => r.classKey === classKey && subjectKey(r.subject) === subjectKey(row.subject))?.subject ?? row.subject;
      return { classKey, day: row.day, period: row.period, subject, teacherId: row.teacherId!, roomId: row.roomId ?? null, locked: true };
    });

  return { input: { classes, requirements, teachers: solverTeachers, rooms, locked }, skipped, assumedTeachers };
}
