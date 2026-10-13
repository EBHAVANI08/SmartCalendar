import { db } from '@/lib/db';
import { MIN_PERIOD_MINUTES } from '@/lib/scheduling-constants';
import { gradeKey, subjectKey } from '@/lib/name-normalize';
import { NOT_ARCHIVED } from '@/lib/soft-delete';

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
  const teaching = Math.max(periods * MIN_PERIOD_MINUTES, end - start - breakMinutes - lunchMinutes);
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

/** Bell settings for one grade (or the school default), as stored. */
export interface BellConfig {
  startTime: string;
  endTime: string;
  breakEnabled: boolean;
  breakAfter: number;
  breakMinutes: number;
  lunchEnabled: boolean;
  lunchAfter: number;
  lunchMinutes: number;
}

export type BellTimelineItem =
  | { kind: 'period'; period: number; startTime: string; endTime: string }
  | { kind: 'break' | 'lunch'; after: number; startTime: string; endTime: string };

/**
 * Periods followed by an enabled break or lunch. Lessons on either side of one
 * are not back to back (no double period across it).
 */
export function breakBoundaries(config: Pick<BellConfig, 'breakEnabled' | 'breakAfter' | 'breakMinutes' | 'lunchEnabled' | 'lunchAfter' | 'lunchMinutes'>): number[] {
  const after: number[] = [];
  if (config.breakEnabled && config.breakMinutes > 0 && config.breakAfter > 0) after.push(config.breakAfter);
  if (config.lunchEnabled && config.lunchMinutes > 0 && config.lunchAfter > 0) after.push(config.lunchAfter);
  return [...new Set(after)].sort((a, b) => a - b);
}

/** Most periods any working day has; the full day's bell is built for this count. */
export function longestDayPeriods(config: DayPeriodConfig): number {
  return Math.max(1, ...workingDayNames(config).map((day) => periodsForDay(day, config)));
}

/**
 * The full day's bell: periods and the enabled breaks, in order. A full day
 * runs from startTime to endTime; shorter days use the same period times and
 * end earlier. Every screen and the generator read times from here.
 */
export function buildBellTimeline(config: DayPeriodConfig & BellConfig): BellTimelineItem[] {
  const periods = longestDayPeriods(config);
  const breakMinutes = config.breakEnabled ? config.breakMinutes : 0;
  const lunchMinutes = config.lunchEnabled ? config.lunchMinutes : 0;
  const timings = buildPeriodTimings({
    periods,
    startTime: config.startTime,
    endTime: config.endTime,
    breakAfter: config.breakEnabled ? config.breakAfter : undefined,
    breakMinutes,
    lunchAfter: config.lunchEnabled ? config.lunchAfter : undefined,
    lunchMinutes,
  });
  const items: BellTimelineItem[] = [];
  for (const timing of timings) {
    items.push({ kind: 'period', ...timing });
    let cursor = timing.endTime;
    for (const [kind, enabled, after, minutes] of [
      ['break', config.breakEnabled, config.breakAfter, breakMinutes],
      ['lunch', config.lunchEnabled, config.lunchAfter, lunchMinutes],
    ] as const) {
      if (!enabled || after !== timing.period || minutes <= 0) continue;
      const end = addMinutes(cursor, minutes);
      items.push({ kind, after, startTime: cursor, endTime: end });
      cursor = end;
    }
  }
  return items;
}

/** Start/end of each period on one day (first N periods of the full-day bell). */
export function periodTimingsForDay(config: DayPeriodConfig & BellConfig, day: string): { period: number; startTime: string; endTime: string }[] {
  const count = periodsForDay(day, config);
  return buildBellTimeline(config)
    .filter((item): item is Extract<BellTimelineItem, { kind: 'period' }> => item.kind === 'period')
    .slice(0, count)
    .map(({ period, startTime, endTime }) => ({ period, startTime, endTime }));
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function toMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec((time || '').trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/**
 * Problems that make a bell schedule unusable. An empty list means valid.
 * Checked on save (the API rejects invalid settings) and shown in setup.
 */
export type BellIssueCode = 'TIME_FORMAT' | 'TIME_ORDER' | 'BREAK_ZERO' | 'BREAK_RANGE' | 'SAME_PERIOD' | 'TOO_SHORT';

/** Issues the auto-fix engine corrects by itself (see src/lib/autofix/rules.ts). */
export const AUTO_FIXABLE_BELL_ISSUES: readonly BellIssueCode[] = ['BREAK_ZERO', 'BREAK_RANGE', 'SAME_PERIOD'];

export function validateBellConfig(config: DayPeriodConfig & BellConfig, label = 'School day'): string[] {
  return bellIssues(config, label).map((issue) => issue.message);
}

export function bellIssues(config: DayPeriodConfig & BellConfig, label = 'School day'): { code: BellIssueCode; message: string }[] {
  const errors: { code: BellIssueCode; message: string }[] = [];
  const periods = longestDayPeriods(config);
  const start = toMinutes(config.startTime);
  const end = toMinutes(config.endTime);
  if (start === null || end === null) errors.push({ code: 'TIME_FORMAT', message: `${label}: start and end times must be HH:MM.` });
  else if (end <= start) errors.push({ code: 'TIME_ORDER', message: `${label}: the day must end after it starts (${config.startTime} – ${config.endTime}).` });

  const checkBreak = (name: string, enabled: boolean, after: number, minutes: number) => {
    if (!enabled) return;
    if (!(minutes > 0)) errors.push({ code: 'BREAK_ZERO', message: `${label}: ${name} is switched on but lasts 0 minutes. Give it a duration or switch it off.` });
    if (!Number.isInteger(after) || after < 1 || after >= periods) {
      errors.push({ code: 'BREAK_RANGE', message: `${label}: ${name} must come after a period between 1 and ${periods - 1}.` });
    }
  };
  checkBreak('the short break', config.breakEnabled, config.breakAfter, config.breakMinutes);
  checkBreak('lunch', config.lunchEnabled, config.lunchAfter, config.lunchMinutes);
  if (config.breakEnabled && config.lunchEnabled && config.breakAfter === config.lunchAfter) {
    errors.push({ code: 'SAME_PERIOD', message: `${label}: the short break and lunch are both after period ${config.breakAfter}. Put them after different periods.` });
  }

  if (start !== null && end !== null && end > start) {
    const breaks = (config.breakEnabled ? Math.max(0, config.breakMinutes) : 0) + (config.lunchEnabled ? Math.max(0, config.lunchMinutes) : 0);
    const perPeriod = Math.floor((end - start - breaks) / periods);
    if (perPeriod < MIN_PERIOD_MINUTES) {
      errors.push({ code: 'TOO_SHORT', message: `${label}: ${periods} periods and the breaks leave only ${Math.max(0, perPeriod)} minutes per period between ${config.startTime} and ${config.endTime}; at least ${MIN_PERIOD_MINUTES} are needed.` });
    }
  }
  return errors;
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
  /** The class's own day setup (grade override when it has one); its breaks separate periods. */
  config?: DayPeriodConfig | (DayPeriodConfig & BellConfig);
  /** Subject of the lesson: enables the same-teacher-same-class rule (Rule A). */
  subject?: string;
  /** Also check the subject's daily limit, double periods and minimum gap (when the lesson moves). */
  checkSubjectRules?: boolean;
}

export interface ConflictResult {
  ok: boolean;
  code?:
    | 'PERIOD_OUT_OF_RANGE'
    | 'TEACHER_DOUBLE_BOOKED'
    | 'CLASS_DOUBLE_BOOKED'
    | 'TEACHER_INACTIVE'
    | 'TEACHER_NOT_IN_SCHOOL'
    | 'TEACHER_SAME_CLASS_CONSECUTIVE'
    | 'SUBJECT_DAILY_LIMIT'
    | 'SUBJECT_NOT_DOUBLE'
    | 'SUBJECT_MIN_GAP';
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

  const placement = await checkPlacementRules(input, versionScope);
  if (placement) return placement;

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
 * Rules about where a lesson sits next to the class's other lessons that day:
 *  - Rule A (school setting, on by default): the same teacher does not teach
 *    this class a different subject in the period just before or after;
 *  - with checkSubjectRules: the subject's daily limit, double periods only
 *    when allowed (pairs only), and the "Apart" minimum gap.
 * A break or lunch between two periods means they are not back to back.
 */
async function checkPlacementRules(
  input: ConflictCheckInput,
  versionScope: Record<string, unknown>,
): Promise<ConflictResult | null> {
  const { schoolId, grade, section, day, period, teacherId, subject, ignoreScheduleId } = input;
  if (!subject) return null;
  const breaks = input.config && 'breakAfter' in input.config ? breakBoundaries(input.config) : [];
  const touching = (a: number, b: number) => Math.abs(a - b) === 1 && !breaks.includes(Math.min(a, b));
  const sameDay = await db.schedule.findMany({
    where: { schoolId, grade, section, day, ...versionScope, ...(ignoreScheduleId ? { NOT: { id: ignoreScheduleId } } : {}) },
    select: { period: true, subject: true, teacherId: true },
  });

  if (teacherId) {
    const preferences = await db.schoolPreferences.findUnique({ where: { schoolId }, select: { noSameClassBackToBack: true } });
    if (preferences?.noSameClassBackToBack !== false) {
      const neighbour = sameDay.find((row) => touching(row.period, period) && row.teacherId === teacherId && subjectKey(row.subject) !== subjectKey(subject));
      if (neighbour) {
        return {
          ok: false,
          code: 'TEACHER_SAME_CLASS_CONSECUTIVE',
          message: `The same teacher already teaches ${grade} ${section} ${neighbour.subject} in period ${neighbour.period} on ${day}; a different subject right before or after is not allowed (School Setup can switch this rule off).`,
        };
      }
    }
  }

  if (!input.checkSubjectRules) return null;
  const rules = (await db.gradeSubjectConfig.findMany({
    where: { schoolId, active: true, AND: [NOT_ARCHIVED] },
    select: { grade: true, subjectName: true, maxPeriodsPerDay: true, allowConsecutive: true, sameDayMinGap: true },
  })).filter((r) => gradeKey(r.grade) === gradeKey(grade) && subjectKey(r.subjectName) === subjectKey(subject));
  const rule = rules.find((r) => r.grade === grade) ?? rules[0];
  const samePeriods = sameDay.filter((row) => subjectKey(row.subject) === subjectKey(subject)).map((row) => row.period);
  const limit = rule?.maxPeriodsPerDay ?? 1;
  if (samePeriods.length + 1 > limit) {
    return { ok: false, code: 'SUBJECT_DAILY_LIMIT', message: `${subject} would be ${samePeriods.length + 1} times on ${day} for ${grade} ${section}; the limit is ${limit}.` };
  }
  for (const other of samePeriods) {
    if (touching(other, period)) {
      if (!rule?.allowConsecutive) {
        return { ok: false, code: 'SUBJECT_NOT_DOUBLE', message: `${subject} is already in period ${other} on ${day}; it is not set up for double periods.` };
      }
    } else if (rule?.sameDayMinGap != null && Math.abs(other - period) - 1 < rule.sameDayMinGap) {
      return { ok: false, code: 'SUBJECT_MIN_GAP', message: `${subject} is in period ${other} on ${day}; it needs at least ${rule.sameDayMinGap} period(s) between.` };
    }
  }
  if (rule?.allowConsecutive) {
    const block = [...samePeriods, period].sort((a, b) => a - b);
    let run = 1;
    for (let i = 1; i < block.length; i++) {
      run = touching(block[i - 1], block[i]) ? run + 1 : 1;
      if (run > 2) return { ok: false, code: 'SUBJECT_NOT_DOUBLE', message: `${subject} would run ${run} periods in a row on ${day}; only pairs are allowed.` };
    }
  }
  return null;
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
