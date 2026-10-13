import { db } from '@/lib/db';
import { NOT_ARCHIVED } from '@/lib/soft-delete';
import { getDayConfig } from '@/lib/timetable-config';
import { buildTeachingGrid, periodsForDay, workingDayNames } from '@/lib/timetable-constraints';

/**
 * Teacher workload limits, as the school entered them.
 *
 * A teacher's limits are their own standing rule (TeacherWorkloadRule with no
 * timetable version) when they have one, otherwise the school's defaults
 * (SchoolPreferences.defaultMax*), otherwise "missing". Nothing here invents a
 * limit: a school that has entered none is told so.
 */

export interface WorkloadCaps {
  maxWeekly: number | null;
  maxDaily: number | null;
  maxConsecutive: number | null;
}

export interface UnavailableSlot {
  day: string;
  period: number;
}

export interface EffectiveWorkload extends WorkloadCaps {
  source: 'personal' | 'school' | 'missing';
  unavailable: UnavailableSlot[];
}

export interface TeacherLoad {
  weekly: number;
  busiestDay: { day: string; periods: number } | null;
  longestRun: { day: string; length: number; from: number; to: number } | null;
}

const hasAnyCap = (caps: WorkloadCaps) => caps.maxWeekly !== null || caps.maxDaily !== null || caps.maxConsecutive !== null;

/** Standing rules only: rows bound to a timetable version belong to that version. */
const STANDING_RULE = { OR: [{ timetableVersionId: null }, { timetableVersionId: { isSet: false } }] };

export function parseUnavailable(value: unknown): UnavailableSlot[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((u): u is { day: unknown; period: unknown } => Boolean(u) && typeof u === 'object')
    .map((u) => ({ day: String(u.day ?? ''), period: Number(u.period) }))
    .filter((u) => u.day && Number.isInteger(u.period) && u.period > 0);
}

export async function schoolWorkloadDefaults(schoolId: string): Promise<WorkloadCaps> {
  const preferences = await db.schoolPreferences.findUnique({
    where: { schoolId },
    select: { defaultMaxWeekly: true, defaultMaxDaily: true, defaultMaxConsecutive: true },
  });
  return {
    maxWeekly: preferences?.defaultMaxWeekly ?? null,
    maxDaily: preferences?.defaultMaxDaily ?? null,
    maxConsecutive: preferences?.defaultMaxConsecutive ?? null,
  };
}

/** The standing personal rule of each teacher (newest if several), keyed by teacher id. */
export async function personalRules(schoolId: string, teacherIds?: string[]) {
  const rules = await db.teacherWorkloadRule.findMany({
    where: { schoolId, ...(teacherIds ? { teacherId: { in: teacherIds } } : {}), ...STANDING_RULE },
    orderBy: { updatedAt: 'desc' },
  });
  const byTeacher = new Map<string, (typeof rules)[number]>();
  for (const rule of rules) if (!byTeacher.has(rule.teacherId)) byTeacher.set(rule.teacherId, rule);
  return byTeacher;
}

export async function effectiveWorkloads(schoolId: string, teacherIds: string[]): Promise<Map<string, EffectiveWorkload>> {
  const [defaults, rules] = await Promise.all([schoolWorkloadDefaults(schoolId), personalRules(schoolId, teacherIds)]);
  const result = new Map<string, EffectiveWorkload>();
  for (const id of teacherIds) {
    const rule = rules.get(id);
    if (rule) {
      result.set(id, { maxWeekly: rule.maxWeekly, maxDaily: rule.maxDaily, maxConsecutive: rule.maxConsecutive, source: 'personal', unavailable: parseUnavailable(rule.unavailableSlots) });
    } else {
      result.set(id, { ...defaults, source: hasAnyCap(defaults) ? 'school' : 'missing', unavailable: [] });
    }
  }
  return result;
}

/** Weekly count, busiest day and longest run of back-to-back periods. */
export function teacherLoad(rows: { day: string; period: number }[]): TeacherLoad {
  const byDay = new Map<string, number[]>();
  for (const row of rows) byDay.set(row.day, [...(byDay.get(row.day) ?? []), row.period]);
  let busiestDay: TeacherLoad['busiestDay'] = null;
  let longestRun: TeacherLoad['longestRun'] = null;
  for (const [day, periods] of byDay) {
    const unique = [...new Set(periods)].sort((a, b) => a - b);
    if (!busiestDay || unique.length > busiestDay.periods) busiestDay = { day, periods: unique.length };
    let start = unique[0];
    for (let i = 0; i < unique.length; i++) {
      if (i > 0 && unique[i] !== unique[i - 1] + 1) start = unique[i];
      const length = unique[i] - start + 1;
      if (!longestRun || length > longestRun.length) longestRun = { day, length, from: start, to: unique[i] };
    }
  }
  return { weekly: rows.length, busiestDay, longestRun };
}

/** Which limits the load breaks, in words. */
export function capViolations(load: TeacherLoad, caps: WorkloadCaps): string[] {
  const problems: string[] = [];
  if (caps.maxWeekly !== null && load.weekly > caps.maxWeekly) problems.push(`${load.weekly} periods a week (limit ${caps.maxWeekly})`);
  if (caps.maxDaily !== null && load.busiestDay && load.busiestDay.periods > caps.maxDaily) {
    problems.push(`${load.busiestDay.periods} periods on ${load.busiestDay.day} (limit ${caps.maxDaily})`);
  }
  if (caps.maxConsecutive !== null && load.longestRun && load.longestRun.length > caps.maxConsecutive) {
    problems.push(`${load.longestRun.length} in a row on ${load.longestRun.day}, P${load.longestRun.from}–P${load.longestRun.to} (limit ${caps.maxConsecutive})`);
  }
  return problems;
}

export interface SchoolWeekShape {
  configured: boolean;
  /** Working days with their most periods across the school default and every grade override. */
  days: { day: string; periods: number }[];
  longestDay: number;
  /** Most teaching periods in a week for any grade. */
  weeklySlots: number;
}

/** The school's week, widest over the default and every active grade's override. */
export async function schoolWeekShape(schoolId: string): Promise<SchoolWeekShape> {
  const base = await getDayConfig(schoolId);
  const grades = await db.classSection.findMany({ where: { schoolId, active: true, AND: [NOT_ARCHIVED] }, select: { grade: true }, distinct: ['grade'] });
  const configs = [base, ...(await Promise.all(grades.map((g) => getDayConfig(schoolId, g.grade))))].filter((c) => c.configured);
  const days = new Map<string, number>();
  let weeklySlots = 0;
  for (const config of configs) {
    for (const day of workingDayNames(config)) days.set(day, Math.max(days.get(day) ?? 0, periodsForDay(day, config)));
    weeklySlots = Math.max(weeklySlots, buildTeachingGrid(config).length);
  }
  const list = [...days.entries()].map(([day, periods]) => ({ day, periods }));
  return { configured: configs.length > 0, days: list, longestDay: Math.max(0, ...list.map((d) => d.periods)), weeklySlots };
}

/**
 * Checks limits a school enters. Numbers must be whole and positive, fit the
 * school's own week, and agree with each other (a day cannot allow more than
 * the week, a run cannot be longer than a day).
 */
export function validateCaps(caps: WorkloadCaps, week: SchoolWeekShape, options: { allRequired: boolean }): string[] {
  const errors: string[] = [];
  const entries: [keyof WorkloadCaps, string][] = [['maxWeekly', 'Periods per week'], ['maxDaily', 'Periods per day'], ['maxConsecutive', 'Periods in a row']];
  for (const [field, label] of entries) {
    const value = caps[field];
    if (value === null) {
      if (options.allRequired) errors.push(`${label} is required.`);
      continue;
    }
    if (!Number.isInteger(value) || value < 1) errors.push(`${label} must be a whole number of at least 1.`);
  }
  if (errors.length) return errors;
  const { maxWeekly, maxDaily, maxConsecutive } = caps;
  if (maxDaily !== null && maxWeekly !== null && maxDaily > maxWeekly) errors.push('Periods per day cannot be more than periods per week.');
  if (maxConsecutive !== null && maxDaily !== null && maxConsecutive > maxDaily) errors.push('Periods in a row cannot be more than periods per day.');
  if (week.configured) {
    if (maxDaily !== null && maxDaily > week.longestDay) errors.push(`Periods per day cannot be more than the longest school day (${week.longestDay} periods).`);
    if (maxConsecutive !== null && maxConsecutive > week.longestDay) errors.push(`Periods in a row cannot be more than the longest school day (${week.longestDay} periods).`);
    if (maxWeekly !== null && maxWeekly > week.weeklySlots) errors.push(`Periods per week cannot be more than the teaching periods in the week (${week.weeklySlots}).`);
  }
  return errors;
}

/** Unavailable periods must be real periods of the school's week. */
export function validateUnavailable(slots: UnavailableSlot[], week: SchoolWeekShape): string[] {
  if (!week.configured) return [];
  const periods = new Map(week.days.map((d) => [d.day, d.periods]));
  const bad = slots.filter((s) => !periods.has(s.day) || s.period > (periods.get(s.day) ?? 0));
  return bad.length ? [`Not periods of your school week: ${bad.map((s) => `${s.day} P${s.period}`).join(', ')}.`] : [];
}
