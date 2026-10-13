import { db } from '@/lib/db';
import {
  DAY_NAMES,
  DEFAULT_PERIODS_PER_DAY,
  AUTO_FIXABLE_BELL_ISSUES,
  bellIssues,
  type DayName,
  type DayPeriodConfig,
} from '@/lib/timetable-constraints';
import { gradeKey } from '@/lib/name-normalize';

/**
 * Per-day period configuration.
 *
 * Every consumer -- the generator, manual editing, change-teacher, revisions,
 * the leave affected-period lookup, substitution and validation -- reads the
 * shape of the week from here. Day limits are never inferred from whatever
 * Schedule rows happen to exist, which is how Saturday previously ended up
 * with periods it was never configured for.
 */

export interface GradeDayConfig {
  enabled?: boolean;
  workingDays?: number;
  periodsPerDay?: number;
  saturdayPeriods?: number;
  perDayPeriods?: Partial<Record<DayName, number>>;
  startTime?: string;
  endTime?: string;
  breakEnabled?: boolean;
  breakAfter?: number;
  breakMinutes?: number;
  lunchEnabled?: boolean;
  lunchAfter?: number;
  lunchMinutes?: number;
}

export interface StoredDayConfig extends DayPeriodConfig {
  schoolId: string;
  startTime: string;
  endTime: string;
  breakEnabled: boolean;
  breakAfter: number;
  breakMinutes: number;
  lunchEnabled: boolean;
  lunchAfter: number;
  lunchMinutes: number;
  /** False when the school has not configured anything yet. */
  configured: boolean;
  /** True if resolved for a specific grade with custom settings enabled. */
  isGradeCustom?: boolean;
  gradeName?: string | null;
  /** All grade-specific overrides defined for this school. */
  gradeConfigs?: Record<string, GradeDayConfig>;
}

/** The stored row's shape (SchoolDayPeriodConfig). */
interface DayConfigRow {
  workingDays: number;
  perDayPeriods: string;
  startTime: string;
  endTime: string;
  breakEnabled?: boolean | null;
  breakAfter: number;
  breakMinutes: number;
  lunchEnabled?: boolean | null;
  lunchAfter: number;
  lunchMinutes: number;
  gradeConfigs?: string | null;
}

export const DEFAULT_SATURDAY_PERIODS = 5;

/**
 * Shown only for a school that has saved no day configuration yet
 * (`configured: false`). Capacity checks and generation treat an unconfigured
 * school as not ready instead of scheduling against these values.
 */
const DEFAULTS = {
  workingDays: 6,
  periodsPerDay: DEFAULT_PERIODS_PER_DAY,
  saturdayPeriods: DEFAULT_SATURDAY_PERIODS,
  startTime: '08:00',
  endTime: '15:00',
  breakEnabled: true,
  breakAfter: 2,
  breakMinutes: 15,
  lunchEnabled: true,
  lunchAfter: 4,
  lunchMinutes: 30,
};

/**
 * A break is on when explicitly enabled. Rows saved before the switch existed
 * have no flag; there a break with minutes is on and a 0-minute one is off.
 */
function breakIsOn(explicit: boolean | null | undefined, minutes: number): boolean {
  return typeof explicit === 'boolean' ? explicit : minutes > 0;
}

function parsePerDay(value: unknown): Partial<Record<DayName, number>> {
  if (!value) return {};
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object') return {};
    const result: Partial<Record<DayName, number>> = {};
    for (const day of DAY_NAMES) {
      const raw = (parsed as Record<string, unknown>)[day];
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 0) result[day] = Math.floor(n);
    }
    return result;
  } catch {
    return {};
  }
}

function parseGradeConfigs(value: unknown): Record<string, GradeDayConfig> {
  if (!value) return {};
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, GradeDayConfig>;
  } catch {
    return {};
  }
}

/** Resolves a stored row (school default plus an optional grade override). No database access. */
export function resolveDayConfig(schoolId: string, row: DayConfigRow | null, grade?: string | null): StoredDayConfig {
  if (!row) {
    return {
      ...DEFAULTS,
      schoolId,
      configured: false,
      isGradeCustom: false,
      gradeName: grade || null,
      periodsPerDay: DEFAULT_PERIODS_PER_DAY,
      saturdayPeriods: DEFAULT_SATURDAY_PERIODS,
      perDayPeriods: {
        Monday: DEFAULT_PERIODS_PER_DAY,
        Tuesday: DEFAULT_PERIODS_PER_DAY,
        Wednesday: DEFAULT_PERIODS_PER_DAY,
        Thursday: DEFAULT_PERIODS_PER_DAY,
        Friday: DEFAULT_PERIODS_PER_DAY,
        Saturday: DEFAULT_SATURDAY_PERIODS,
      },
      gradeConfigs: {},
    };
  }

  const allGradeConfigs = parseGradeConfigs(row.gradeConfigs);
  // Overrides are keyed by grade name; match any spelling of the same grade.
  const overrideKey = grade
    ? (grade in allGradeConfigs ? grade : Object.keys(allGradeConfigs).find((name) => gradeKey(name) === gradeKey(grade)))
    : undefined;
  const gradeOverride = overrideKey ? allGradeConfigs[overrideKey] : null;
  const isCustom = Boolean(grade && gradeOverride && gradeOverride.enabled !== false);

  const basePerDay = parsePerDay(row.perDayPeriods);
  const baseWeekday = basePerDay.Monday ?? DEFAULT_PERIODS_PER_DAY;
  const baseSaturday = basePerDay.Saturday ?? DEFAULT_SATURDAY_PERIODS;

  if (isCustom && gradeOverride) {
    const customPerDay = gradeOverride.perDayPeriods ? parsePerDay(gradeOverride.perDayPeriods) : basePerDay;
    const workingDays = Math.min(6, Math.max(1, Number(gradeOverride.workingDays) || row.workingDays));
    const weekday = customPerDay.Monday ?? gradeOverride.periodsPerDay ?? baseWeekday;
    const saturday = customPerDay.Saturday ?? gradeOverride.saturdayPeriods ?? baseSaturday;

    const perDayPeriods: Partial<Record<DayName, number>> = {
      Monday: customPerDay.Monday ?? weekday,
      Tuesday: customPerDay.Tuesday ?? weekday,
      Wednesday: customPerDay.Wednesday ?? weekday,
      Thursday: customPerDay.Thursday ?? weekday,
      Friday: customPerDay.Friday ?? weekday,
      ...(workingDays >= 6 ? { Saturday: customPerDay.Saturday ?? saturday } : {}),
      ...customPerDay,
    };
    const breakMinutes = Number(gradeOverride.breakMinutes ?? row.breakMinutes);
    const lunchMinutes = Number(gradeOverride.lunchMinutes ?? row.lunchMinutes);

    return {
      schoolId,
      configured: true,
      isGradeCustom: true,
      gradeName: grade,
      workingDays,
      periodsPerDay: weekday,
      saturdayPeriods: perDayPeriods.Saturday ?? saturday,
      perDayPeriods,
      startTime: gradeOverride.startTime || row.startTime,
      endTime: gradeOverride.endTime || row.endTime,
      breakEnabled: breakIsOn(gradeOverride.breakEnabled ?? row.breakEnabled, breakMinutes),
      breakAfter: Number(gradeOverride.breakAfter) || row.breakAfter,
      breakMinutes,
      lunchEnabled: breakIsOn(gradeOverride.lunchEnabled ?? row.lunchEnabled, lunchMinutes),
      lunchAfter: Number(gradeOverride.lunchAfter) || row.lunchAfter,
      lunchMinutes,
      gradeConfigs: allGradeConfigs,
    };
  }

  const perDayPeriods: Partial<Record<DayName, number>> = {
    Monday: basePerDay.Monday ?? baseWeekday,
    Tuesday: basePerDay.Tuesday ?? baseWeekday,
    Wednesday: basePerDay.Wednesday ?? baseWeekday,
    Thursday: basePerDay.Thursday ?? baseWeekday,
    Friday: basePerDay.Friday ?? baseWeekday,
    ...(row.workingDays >= 6 ? { Saturday: basePerDay.Saturday ?? baseSaturday } : {}),
    ...basePerDay,
  };

  return {
    schoolId,
    configured: true,
    isGradeCustom: false,
    gradeName: grade || null,
    workingDays: row.workingDays,
    periodsPerDay: baseWeekday,
    saturdayPeriods: perDayPeriods.Saturday ?? baseSaturday,
    perDayPeriods,
    startTime: row.startTime,
    endTime: row.endTime,
    breakEnabled: breakIsOn(row.breakEnabled, row.breakMinutes),
    breakAfter: row.breakAfter,
    breakMinutes: row.breakMinutes,
    lunchEnabled: breakIsOn(row.lunchEnabled, row.lunchMinutes),
    lunchAfter: row.lunchAfter,
    lunchMinutes: row.lunchMinutes,
    gradeConfigs: allGradeConfigs,
  };
}

export async function getDayConfig(schoolId: string, grade?: string | null): Promise<StoredDayConfig> {
  const row = await db.schoolDayPeriodConfig.findUnique({ where: { schoolId } }).catch(() => null);
  return resolveDayConfig(schoolId, row, grade);
}

export interface DayConfigInput {
  workingDays?: number;
  periodsPerDay?: number;
  saturdayPeriods?: number;
  perDayPeriods?: Partial<Record<DayName, number>>;
  startTime?: string;
  endTime?: string;
  breakEnabled?: boolean;
  breakAfter?: number;
  breakMinutes?: number;
  lunchEnabled?: boolean;
  lunchAfter?: number;
  lunchMinutes?: number;
  // Grade-wise fields
  grade?: string;
  enabled?: boolean;
  targetGrades?: string[];
  gradeConfigs?: Record<string, GradeDayConfig>;
}

export type SaveDayConfigResult =
  | { ok: true; config: StoredDayConfig }
  | { ok: false; errors: string[] };

function expandPerDay(input: DayConfigInput, workingDays: number, weekday: number): Record<string, number> {
  const expanded: Record<string, number> = {};
  for (const day of DAY_NAMES.slice(0, workingDays)) {
    const explicit = input.perDayPeriods?.[day as DayName];
    if (explicit !== undefined && Number.isFinite(Number(explicit))) {
      expanded[day] = Math.min(12, Math.max(0, Math.floor(Number(explicit))));
    } else if (day === 'Saturday' && input.saturdayPeriods !== undefined) {
      expanded[day] = Math.min(weekday, Math.max(0, Math.floor(Number(input.saturdayPeriods))));
    } else if (day === 'Saturday') {
      expanded[day] = Math.min(weekday, DEFAULT_SATURDAY_PERIODS);
    } else {
      expanded[day] = weekday;
    }
  }
  return expanded;
}

/**
 * Bell problems a save is rejected for. Problems the auto-fix engine corrects
 * (0-minute breaks, breaks outside the day, break and lunch after the same
 * period) are saved and then fixed and logged by the engine.
 */
function blockingBellErrors(config: StoredDayConfig, label?: string): string[] {
  return bellIssues(config, label).filter((issue) => !AUTO_FIXABLE_BELL_ISSUES.includes(issue.code)).map((issue) => issue.message);
}

/**
 * Persist the week shape. Accepts either base school configuration or grade-specific
 * overrides and batch applications. Bell settings that cannot be corrected
 * automatically (times out of order, periods too short) are rejected.
 */
export async function saveDayConfig(schoolId: string, input: DayConfigInput): Promise<SaveDayConfigResult> {
  const existing = await db.schoolDayPeriodConfig.findUnique({ where: { schoolId } }).catch(() => null);
  const currentGradeConfigs = parseGradeConfigs(existing?.gradeConfigs);

  const targetGrade = input.grade?.trim();
  const targetGrades = Array.isArray(input.targetGrades) && input.targetGrades.length > 0
    ? input.targetGrades.map((g) => g.trim()).filter(Boolean)
    : targetGrade ? [targetGrade] : [];

  const baseRow: DayConfigRow = existing ?? {
    workingDays: DEFAULTS.workingDays,
    perDayPeriods: JSON.stringify({ Monday: 8, Tuesday: 8, Wednesday: 8, Thursday: 8, Friday: 8, Saturday: 5 }),
    startTime: DEFAULTS.startTime,
    endTime: DEFAULTS.endTime,
    breakEnabled: DEFAULTS.breakEnabled,
    breakAfter: DEFAULTS.breakAfter,
    breakMinutes: DEFAULTS.breakMinutes,
    lunchEnabled: DEFAULTS.lunchEnabled,
    lunchAfter: DEFAULTS.lunchAfter,
    lunchMinutes: DEFAULTS.lunchMinutes,
    gradeConfigs: '{}',
  };

  // If saving for one or more specific grades
  if (targetGrades.length > 0) {
    const updatedGradeConfigs = { ...currentGradeConfigs };

    for (const g of targetGrades) {
      if (input.enabled === false) {
        // Disable custom config for this grade (inherit school default)
        delete updatedGradeConfigs[g];
      } else {
        const workingDays = Math.min(6, Math.max(1, Number(input.workingDays) || DEFAULTS.workingDays));
        const weekday = Math.min(12, Math.max(1, Number(input.periodsPerDay) || DEFAULT_PERIODS_PER_DAY));
        const expanded = expandPerDay(input, workingDays, weekday);
        const breakMinutes = Number(input.breakMinutes ?? baseRow.breakMinutes);
        const lunchMinutes = Number(input.lunchMinutes ?? baseRow.lunchMinutes);

        updatedGradeConfigs[g] = {
          enabled: true,
          workingDays,
          periodsPerDay: weekday,
          saturdayPeriods: expanded.Saturday ?? DEFAULT_SATURDAY_PERIODS,
          perDayPeriods: expanded,
          startTime: input.startTime || baseRow.startTime,
          endTime: input.endTime || baseRow.endTime,
          breakEnabled: input.breakEnabled ?? breakIsOn(baseRow.breakEnabled, breakMinutes),
          breakAfter: Number(input.breakAfter) || baseRow.breakAfter,
          breakMinutes,
          lunchEnabled: input.lunchEnabled ?? breakIsOn(baseRow.lunchEnabled, lunchMinutes),
          lunchAfter: Number(input.lunchAfter) || baseRow.lunchAfter,
          lunchMinutes,
        };
      }
    }

    const planned: DayConfigRow = { ...baseRow, gradeConfigs: JSON.stringify(updatedGradeConfigs) };
    const errors = input.enabled === false
      ? []
      : targetGrades.flatMap((g) => blockingBellErrors(resolveDayConfig(schoolId, planned, g), g));
    if (errors.length > 0) return { ok: false, errors };

    await db.schoolDayPeriodConfig.upsert({
      where: { schoolId },
      update: { gradeConfigs: planned.gradeConfigs },
      create: { schoolId, ...planned },
    });

    return { ok: true, config: await getDayConfig(schoolId, targetGrade) };
  }

  // Otherwise saving base School Default configuration
  const workingDays = Math.min(6, Math.max(1, Number(input.workingDays) || DEFAULTS.workingDays));
  const weekday = Math.min(12, Math.max(1, Number(input.periodsPerDay) || DEFAULT_PERIODS_PER_DAY));
  const breakMinutes = Number(input.breakMinutes ?? DEFAULTS.breakMinutes);
  const lunchMinutes = Number(input.lunchMinutes ?? DEFAULTS.lunchMinutes);

  const data = {
    workingDays,
    perDayPeriods: JSON.stringify(expandPerDay(input, workingDays, weekday)),
    startTime: input.startTime || DEFAULTS.startTime,
    endTime: input.endTime || DEFAULTS.endTime,
    breakEnabled: input.breakEnabled ?? breakIsOn(null, breakMinutes),
    breakAfter: Number(input.breakAfter) || DEFAULTS.breakAfter,
    breakMinutes,
    lunchEnabled: input.lunchEnabled ?? breakIsOn(null, lunchMinutes),
    lunchAfter: Number(input.lunchAfter) || DEFAULTS.lunchAfter,
    lunchMinutes,
    ...(input.gradeConfigs !== undefined ? { gradeConfigs: JSON.stringify(input.gradeConfigs) } : {}),
  };

  const errors = blockingBellErrors(resolveDayConfig(schoolId, { ...baseRow, ...data }, null));
  if (errors.length > 0) return { ok: false, errors };

  await db.schoolDayPeriodConfig.upsert({
    where: { schoolId },
    update: data,
    create: { schoolId, ...data },
  });

  return { ok: true, config: await getDayConfig(schoolId) };
}
