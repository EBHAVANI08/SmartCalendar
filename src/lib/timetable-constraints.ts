import { db } from '@/lib/db';

/**
 * Shared timetable constraints.
 *
 * Every writer of a `Schedule` row — AI generation, sample seeding, bulk import,
 * manual edits, teacher changes and substitute assignment — must go through the
 * same validation, so a rule cannot be enforced in one path and skipped in
 * another. Frontend checks are advisory; this module is the authority.
 */

export const DAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export type DayName = (typeof DAY_NAMES)[number];

export interface DayPeriodConfig {
  /** Number of working days, counted from Monday (5 = Mon-Fri, 6 = Mon-Sat). */
  workingDays: number;
  /** Periods on a normal working day. */
  periodsPerDay: number;
  /** Periods on Saturday, when Saturday is a working day. */
  saturdayPeriods?: number;
  /** Explicit per-day overrides; takes precedence over everything above. */
  perDayPeriods?: Partial<Record<DayName, number>>;
}

export const DEFAULT_PERIODS_PER_DAY = 8;
export const DEFAULT_SATURDAY_PERIODS = 5;
const MIN_PERIODS = 1;
const MAX_PERIODS = 12;

function clampPeriods(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(MAX_PERIODS, Math.max(MIN_PERIODS, Math.floor(parsed)));
}

/** The days that are actually taught, in order. */
export function workingDayNames(config: DayPeriodConfig): DayName[] {
  const count = Math.min(6, Math.max(1, Number(config.workingDays) || 6));
  return DAY_NAMES.slice(0, count) as DayName[];
}

/**
 * How many periods a specific day is configured for. This is the single place
 * that answers the question — there is deliberately no "assume every day has
 * the same count" fallback, which is what allowed Saturday to receive periods
 * beyond its configured limit.
 */
export function periodsForDay(day: string, config: DayPeriodConfig): number {
  const normalizedDay = day as DayName;
  const override = config.perDayPeriods?.[normalizedDay];
  if (override !== undefined) return clampPeriods(override, DEFAULT_PERIODS_PER_DAY);

  const base = clampPeriods(config.periodsPerDay, DEFAULT_PERIODS_PER_DAY);
  if (normalizedDay === 'Saturday') {
    if (config.saturdayPeriods !== undefined) {
      // Saturday is commonly a short day; never allow it to exceed a normal day.
      return Math.min(base, clampPeriods(config.saturdayPeriods, base));
    }
    // Default Saturday to 5 periods if unspecified
    return Math.min(base, DEFAULT_SATURDAY_PERIODS);
  }
  return base;
}

/** Every (day, period) pair that may legally hold a lesson. */
export function buildTeachingGrid(config: DayPeriodConfig): { day: DayName; period: number }[] {
  const grid: { day: DayName; period: number }[] = [];
  for (const day of workingDayNames(config)) {
    const total = periodsForDay(day, config);
    for (let period = 1; period <= total; period++) grid.push({ day, period });
  }
  return grid;
}

export function isPeriodWithinDay(day: string, period: number, config: DayPeriodConfig): boolean {
  if (!workingDayNames(config).includes(day as DayName)) return false;
  return Number.isInteger(period) && period >= 1 && period <= periodsForDay(day, config);
}

/** Evenly divided 24-hour period timings, with break and lunch inserted. */
export function buildPeriodTimings(options: {
  periods: number;
  startTime?: string;
  endTime?: string;
  breakAfter?: number;
  breakMinutes?: number;
  lunchAfter?: number;
  lunchMinutes?: number;
}): { period: number; startTime: string; endTime: string }[] {
  const periods = clampPeriods(options.periods, DEFAULT_PERIODS_PER_DAY);
  const parse = (value: string | undefined, fallback: number) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec((value || '').trim());
    return match ? Number(match[1]) * 60 + Number(match[2]) : fallback;
  };
  const format = (value: number) =>
    `${String(Math.floor(value / 60) % 24).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;

  const start = parse(options.startTime, 8 * 60);
  const end = parse(options.endTime, 15 * 60);
  const breakMinutes = Math.max(0, Number(options.breakMinutes) || 0);
  const lunchMinutes = Math.max(0, Number(options.lunchMinutes) || 0);
  const teaching = Math.max(periods * 20, end - start - breakMinutes - lunchMinutes);
  const perPeriod = Math.floor(teaching / periods);
  const extra = teaching % periods;

  let cursor = start;
  return Array.from({ length: periods }, (_, index) => {
    const period = index + 1;
    const startTime = format(cursor);
    cursor += perPeriod + (index < extra ? 1 : 0);
    const endTime = format(cursor);
    if (period === options.breakAfter) cursor += breakMinutes;
    if (period === options.lunchAfter) cursor += lunchMinutes;
    return { period, startTime, endTime };
  });
}

export interface SlotIdentity {
  schoolId: string;
  grade: string;
  section: string;
  day: string;
  period: number;
}

export interface ConflictCheckInput extends SlotIdentity {
  teacherId?: string | null;
  /**
   * Which timetable version this slot belongs to. Conflict checks are scoped
   * to it, so a draft revision does not collide with the published version it
   * was copied from - they legitimately hold the same class/day/period.
   */
  timetableVersionId?: string | null;
  /** Schedule row being edited, excluded from its own conflict check. */
  ignoreScheduleId?: string | null;
  config?: DayPeriodConfig;
}

export interface ConflictResult {
  ok: boolean;
  code?:
    | 'PERIOD_OUT_OF_RANGE'
    | 'TEACHER_DOUBLE_BOOKED'
    | 'CLASS_DOUBLE_BOOKED'
    | 'TEACHER_INACTIVE'
    | 'TEACHER_NOT_IN_SCHOOL';
  message?: string;
  /** Where the conflicting teacher already is, for a useful error message. */
  conflictWith?: { grade: string; section: string; subject: string };
}

/**
 * Validate a single assignment against the hard constraints:
 *  - the period must exist on that day
 *  - the teacher must belong to this school and be active
 *  - the teacher must not already be teaching in that day+period
 *  - the class/section must not already have a lesson in that day+period
 */
export async function checkSlotConflicts(input: ConflictCheckInput): Promise<ConflictResult> {
  const { schoolId, grade, section, day, period, teacherId, ignoreScheduleId } = input;

  if (input.config && !isPeriodWithinDay(day, period, input.config)) {
    return {
      ok: false,
      code: 'PERIOD_OUT_OF_RANGE',
      message: `${day} is configured for ${periodsForDay(day, input.config)} period(s); period ${period} is outside that range.`,
    };
  }

  // The class must not already be occupied in this slot.
  const versionScope =
    input.timetableVersionId === undefined
      ? {}
      : input.timetableVersionId === null
        ? { OR: [{ timetableVersionId: null }, { timetableVersionId: { isSet: false } }] }
        : { timetableVersionId: input.timetableVersionId };

  const classClash = await db.schedule.findFirst({
    where: {
      schoolId,
      grade,
      section,
      day,
      period,
      ...versionScope,
      ...(ignoreScheduleId ? { NOT: { id: ignoreScheduleId } } : {}),
    },
    select: { id: true, subject: true },
  });
  if (classClash) {
    return {
      ok: false,
      code: 'CLASS_DOUBLE_BOOKED',
      message: `${grade} ${section} already has ${classClash.subject} in period ${period} on ${day}.`,
    };
  }

  if (!teacherId) return { ok: true };

  const teacher = await db.teacher.findUnique({
    where: { id: teacherId },
    select: { id: true, name: true, schoolId: true, role: true },
  });
  if (!teacher || teacher.schoolId !== schoolId) {
    return {
      ok: false,
      code: 'TEACHER_NOT_IN_SCHOOL',
      message: 'That teacher does not belong to this school.',
    };
  }
  if (teacher.role === 'inactive') {
    return {
      ok: false,
      code: 'TEACHER_INACTIVE',
      message: `${teacher.name} is deactivated and cannot receive timetable assignments.`,
    };
  }

  // One teacher can only be in one place at a time: school + day + period.
  const teacherClash = await db.schedule.findFirst({
    where: {
      schoolId,
      day,
      period,
      teacherId,
      ...versionScope,
      ...(ignoreScheduleId ? { NOT: { id: ignoreScheduleId } } : {}),
    },
    select: { grade: true, section: true, subject: true },
  });
  if (teacherClash) {
    return {
      ok: false,
      code: 'TEACHER_DOUBLE_BOOKED',
      message: `${teacher.name} is already assigned to ${teacherClash.grade} ${teacherClash.section} during period ${period} on ${day}.`,
      conflictWith: teacherClash,
    };
  }

  return { ok: true };
}

/**
 * In-memory clash tracker for bulk generation, where rows are not yet written
 * and so cannot be found by a database query.
 */
export class ClashTracker {
  private teacherBusy = new Set<string>();
  private classBusy = new Set<string>();

  private teacherKey(teacherId: string, day: string, period: number) {
    return `${teacherId}|${day}|${period}`;
  }

  private classKey(grade: string, section: string, day: string, period: number) {
    return `${grade}|${section}|${day}|${period}`;
  }

  isTeacherBusy(teacherId: string, day: string, period: number): boolean {
    return this.teacherBusy.has(this.teacherKey(teacherId, day, period));
  }

  isClassBusy(grade: string, section: string, day: string, period: number): boolean {
    return this.classBusy.has(this.classKey(grade, section, day, period));
  }

  reserve(input: { teacherId?: string | null; grade: string; section: string; day: string; period: number }) {
    if (input.teacherId) {
      this.teacherBusy.add(this.teacherKey(input.teacherId, input.day, input.period));
    }
    this.classBusy.add(this.classKey(input.grade, input.section, input.day, input.period));
  }

  /**
   * Seed the tracker from rows already persisted for this school.
   *
   * `timetableVersionId` scopes the load the same way `checkSlotConflicts` does.
   * Without it a draft revision collides with the published version it was
   * copied from - they legitimately hold the same teacher in the same slot.
   * Omit it to consider every version (the historical behaviour).
   */
  async loadExisting(
    schoolId: string,
    exclude?: { grade: string; section: string },
    timetableVersionId?: string | null
  ) {
    const versionScope =
      timetableVersionId === undefined
        ? {}
        : timetableVersionId === null
          ? { OR: [{ timetableVersionId: null }, { timetableVersionId: { isSet: false } }] }
          : { timetableVersionId };

    const rows = await db.schedule.findMany({
      where: {
        schoolId,
        ...versionScope,
        ...(exclude ? { NOT: { grade: exclude.grade, section: exclude.section } } : {}),
      },
      select: { grade: true, section: true, day: true, period: true, teacherId: true },
    });
    for (const row of rows) this.reserve(row);
    return rows.length;
  }
}
