import { db } from '@/lib/db';
import { readList } from '@/lib/faculty';
import { DAY_NAMES, type DayName } from '@/lib/timetable-constraints';
import { operationalScheduleFilter } from '@/lib/timetable-lifecycle';

/**
 * Leave -> Timetable -> Substitution.
 *
 * All three modules address the same faculty record by `Teacher.id`, so an
 * approved leave can resolve the exact periods that need cover without an
 * Admin re-entering anything.
 *
 * A substitution is temporary cover for one date. It records who stands in and
 * never edits the underlying Schedule row: the published timetable continues
 * to name the regular teacher. Only a timetable revision changes that.
 */

/** "2026-09-10" -> "Thursday". Parsed as a local calendar date, not UTC. */
export function weekdayOf(dateStr: string): DayName | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr).trim());
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return null;
  // JS getDay(): 0 = Sunday. DAY_NAMES starts at Monday.
  const index = (date.getDay() + 6) % 7;
  return DAY_NAMES[index];
}

/** Every date in an inclusive YYYY-MM-DD range, capped for safety. */
export function datesInRange(startDate: string, endDate: string, maxDays = 60): string[] {
  const start = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(startDate).trim());
  const end = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(endDate || startDate).trim());
  if (!start) return [];

  const from = new Date(Number(start[1]), Number(start[2]) - 1, Number(start[3]));
  const to = end ? new Date(Number(end[1]), Number(end[2]) - 1, Number(end[3])) : from;
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) return [];

  const out: string[] = [];
  const cursor = new Date(from);
  while (cursor <= to && out.length < maxDays) {
    out.push(
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
    );
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export interface AffectedPeriod {
  date: string;
  day: DayName;
  scheduleId: string;
  grade: string;
  section: string;
  period: number;
  subject: string;
  startTime: string;
  endTime: string;
}

/**
 * The periods a teacher would miss across a leave.
 *
 * `periods` optionally narrows a partial-day leave to specific periods; when
 * absent the whole day is treated as affected.
 */
export async function affectedPeriodsForLeave(leaveId: string): Promise<{
  leave: Awaited<ReturnType<typeof db.leaveApplication.findUnique>>;
  schoolId: string | null;
  affected: AffectedPeriod[];
}> {
  const leave = await db.leaveApplication.findUnique({
    where: { id: leaveId },
    include: { teacher: { select: { id: true, name: true, schoolId: true } } },
  });
  if (!leave) return { leave: null, schoolId: null, affected: [] };

  const schoolId = leave.teacher?.schoolId ?? null;

  // Partial-day support: coveringInfo may carry {"periods":[1,3]}.
  let onlyPeriods: number[] | null = null;
  try {
    const info = leave.coveringInfo ? JSON.parse(leave.coveringInfo) : null;
    if (info && Array.isArray(info.periods) && info.periods.length) {
      onlyPeriods = info.periods.map((p: unknown) => Number(p)).filter((p: number) => Number.isFinite(p));
    }
  } catch {
    onlyPeriods = null;
  }

  const dates = datesInRange(leave.startDate, leave.endDate);
  if (!dates.length) return { leave, schoolId, affected: [] };

  const liveFilter = schoolId ? await operationalScheduleFilter(schoolId) : {};
  const rows = await db.schedule.findMany({
    where: { teacherId: leave.teacherId, ...liveFilter },
    select: {
      id: true, grade: true, section: true, day: true, period: true,
      subject: true, startTime: true, endTime: true,
    },
  });

  const byDay = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!byDay.has(row.day)) byDay.set(row.day, []);
    byDay.get(row.day)!.push(row);
  }

  const affected: AffectedPeriod[] = [];
  for (const date of dates) {
    const day = weekdayOf(date);
    if (!day) continue;
    for (const row of byDay.get(day) ?? []) {
      if (onlyPeriods && !onlyPeriods.includes(row.period)) continue;
      affected.push({
        date,
        day,
        scheduleId: row.id,
        grade: row.grade,
        section: row.section,
        period: row.period,
        subject: row.subject,
        startTime: row.startTime,
        endTime: row.endTime,
      });
    }
  }

  affected.sort((a, b) => a.date.localeCompare(b.date) || a.period - b.period);
  return { leave, schoolId, affected };
}

/**
 * Create a pending Substitution for each affected period. Idempotent: a period
 * that already has a substitution record is left alone, so re-approving or
 * re-syncing a leave never produces duplicates.
 */
export async function syncSubstitutionsForLeave(leaveId: string) {
  const { leave, schoolId, affected } = await affectedPeriodsForLeave(leaveId);
  if (!leave) return { created: 0, existing: 0, affected: [] as AffectedPeriod[] };

  let created = 0;
  let existing = 0;

  for (const slot of affected) {
    const already = await db.substitution.findFirst({
      where: {
        date: slot.date,
        period: slot.period,
        absentTeacherId: leave.teacherId,
        grade: slot.grade,
        section: slot.section,
      },
      select: { id: true },
    });

    if (already) {
      existing++;
      continue;
    }

    await db.substitution.create({
      data: {
        // Explicit tenant, resolved from the leave's teacher.
        schoolId,
        date: slot.date,
        period: slot.period,
        absentTeacherId: leave.teacherId,
        grade: slot.grade,
        section: slot.section,
        subject: slot.subject,
        reason: `${leave.leaveType} leave`,
        source: 'leave',
        status: 'pending',
        scheduleId: slot.scheduleId,
        leaveId: leave.id,
      },
    });
    created++;
  }

  return { created, existing, affected };
}

export interface SubstituteCandidate {
  id: string;
  name: string;
  subjects: string[];
  grades: string[];
  qualifiedSubject: boolean;
  qualifiedGrade: boolean;
  available: boolean;
  inactive: boolean;
  conflict: { grade: string; section: string; subject: string } | null;
  dailyWorkload: number;
  coversThisWeek: number;
  score: number;
  recommendation: string;
}

/**
 * Rank possible substitutes for one substitution.
 *
 * Everyone in the school is returned with the facts an Admin needs; occupied
 * and unqualified teachers are flagged rather than hidden, so the UI can grey
 * them out and explain why.
 */
export async function substituteCandidates(substitutionId: string): Promise<{
  substitution: Awaited<ReturnType<typeof db.substitution.findUnique>>;
  candidates: SubstituteCandidate[];
}> {
  const substitution = await db.substitution.findUnique({
    where: { id: substitutionId },
    include: { absentTeacher: { select: { id: true, schoolId: true, name: true } } },
  });
  if (!substitution) return { substitution: null, candidates: [] };

  const schoolId = substitution.absentTeacher?.schoolId ?? null;
  const day = weekdayOf(substitution.date);

  const [teachers, dayRows, sameDateSubs] = await Promise.all([
    db.teacher.findMany({
      where: { ...(schoolId ? { schoolId } : {}) },
      select: { id: true, name: true, subject: true, subjects: true, grades: true, role: true },
    }),
    day
      ? db.schedule.findMany({
          where: { ...(schoolId ? await operationalScheduleFilter(schoolId) : {}), day },
          select: { teacherId: true, period: true, grade: true, section: true, subject: true },
        })
      : Promise.resolve([] as { teacherId: string | null; period: number; grade: string; section: string; subject: string }[]),
    db.substitution.findMany({
      where: { date: substitution.date, substituteId: { not: null } },
      select: { substituteId: true, period: true, grade: true, section: true, subject: true },
    }),
  ]);

  const busyHere = new Map<string, { grade: string; section: string; subject: string }>();
  const dailyLoad = new Map<string, number>();

  for (const row of dayRows) {
    if (!row.teacherId) continue;
    dailyLoad.set(row.teacherId, (dailyLoad.get(row.teacherId) || 0) + 1);
    if (row.period === substitution.period) {
      busyHere.set(row.teacherId, { grade: row.grade, section: row.section, subject: row.subject });
    }
  }
  // Already covering another class in this period on this date.
  for (const cover of sameDateSubs) {
    if (!cover.substituteId) continue;
    if (cover.period === substitution.period) {
      busyHere.set(cover.substituteId, {
        grade: cover.grade,
        section: cover.section,
        subject: `${cover.subject} (cover)`,
      });
    }
  }

  const coversThisWeek = new Map<string, number>();
  for (const cover of sameDateSubs) {
    if (cover.substituteId) {
      coversThisWeek.set(cover.substituteId, (coversThisWeek.get(cover.substituteId) || 0) + 1);
    }
  }

  const candidates: SubstituteCandidate[] = teachers
    .filter((t) => t.id !== substitution.absentTeacherId)
    .map((t) => {
      const subjects = readList(t.subjects ?? t.subject);
      const grades = readList(t.grades);
      const conflict = busyHere.get(t.id) || null;
      const inactive = t.role === 'inactive';
      const qualifiedSubject = subjects.some(
        (s) => s.toLowerCase() === substitution.subject.toLowerCase()
      );
      const qualifiedGrade = grades.length === 0 || grades.includes(substitution.grade);
      const load = dailyLoad.get(t.id) || 0;

      const score =
        (qualifiedSubject ? 100 : 0) +
        (qualifiedGrade ? 25 : 0) +
        (conflict || inactive ? -1000 : 30) -
        load * 3 -
        (coversThisWeek.get(t.id) || 0) * 5;

      const recommendation = inactive
        ? 'Deactivated'
        : conflict
          ? `Already teaching ${conflict.grade} ${conflict.section}`
          : qualifiedSubject && qualifiedGrade
            ? 'Subject and grade match'
            : qualifiedSubject
              ? 'Subject match'
              : 'Free, but not mapped to this subject';

      return {
        id: t.id,
        name: t.name,
        subjects,
        grades,
        qualifiedSubject,
        qualifiedGrade,
        available: !conflict && !inactive,
        inactive,
        conflict,
        dailyWorkload: load,
        coversThisWeek: coversThisWeek.get(t.id) || 0,
        score,
        recommendation,
      };
    });

  candidates.sort((a, b) => b.score - a.score);
  return { substitution, candidates };
}

export interface AssignResult {
  ok: boolean;
  code?: 'NOT_FOUND' | 'TEACHER_NOT_IN_SCHOOL' | 'SUBSTITUTE_BUSY' | 'TEACHER_INACTIVE' | 'NOT_SUBJECT_QUALIFIED';
  message?: string;
  requiresOverride?: boolean;
  conflict?: { grade: string; section: string; subject: string } | null;
  manualOverride?: boolean;
}

/**
 * Assign a substitute for one date.
 *
 * Hard rule: a teacher already occupied in that period cannot be assigned,
 * with no override path. A teacher who is free but not mapped to the subject
 * requires an explicit override, which is recorded.
 */
export async function assignSubstitute(options: {
  substitutionId: string;
  substituteId: string;
  manualOverride?: boolean;
  overrideReason?: string;
  assignedBy?: string;
}): Promise<AssignResult> {
  const { substitution, candidates } = await substituteCandidates(options.substitutionId);
  if (!substitution) return { ok: false, code: 'NOT_FOUND', message: 'Substitution not found.' };

  const candidate = candidates.find((c) => c.id === options.substituteId);
  if (!candidate) {
    return {
      ok: false,
      code: 'TEACHER_NOT_IN_SCHOOL',
      message: 'That teacher is not available in this school.',
    };
  }

  if (candidate.inactive) {
    return {
      ok: false,
      code: 'TEACHER_INACTIVE',
      message: `${candidate.name} is deactivated and cannot be assigned.`,
    };
  }

  if (candidate.conflict) {
    return {
      ok: false,
      code: 'SUBSTITUTE_BUSY',
      message: `${candidate.name} is already teaching ${candidate.conflict.grade} ${candidate.conflict.section} during period ${substitution.period} on ${substitution.date}.`,
      conflict: candidate.conflict,
    };
  }

  if (!candidate.qualifiedSubject && !options.manualOverride) {
    return {
      ok: false,
      code: 'NOT_SUBJECT_QUALIFIED',
      message: `${candidate.name} is not mapped to ${substitution.subject}. Continue with manual override?`,
      requiresOverride: true,
    };
  }

  const overrideApplied = !candidate.qualifiedSubject;

  // Only the Substitution row changes. The Schedule row keeps naming the
  // regular teacher, because this is cover for one date, not a staffing change.
  await db.substitution.update({
    where: { id: options.substitutionId },
    data: {
      substituteId: options.substituteId,
      status: 'assigned',
      manualOverride: overrideApplied,
      overrideReason: overrideApplied ? options.overrideReason || 'Not mapped to subject' : null,
      assignedBy: options.assignedBy || null,
    },
  });

  return { ok: true, manualOverride: overrideApplied };
}
