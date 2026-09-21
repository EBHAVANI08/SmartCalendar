import { db } from '@/lib/db';
import {
  DAY_NAMES,
  DEFAULT_PERIODS_PER_DAY,
  type DayName,
  type DayPeriodConfig,
} from '@/lib/timetable-constraints';

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
  breakAfter?: number;
  breakMinutes?: number;
  lunchAfter?: number;
  lunchMinutes?: number;
}

export interface StoredDayConfig extends DayPeriodConfig {
  schoolId: string;
  startTime: string;
  endTime: string;
  breakAfter: number;
  breakMinutes: number;
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

export const DEFAULT_SATURDAY_PERIODS = 5;

const DEFAULTS = {
  workingDays: 6,
  periodsPerDay: DEFAULT_PERIODS_PER_DAY,
  saturdayPeriods: DEFAULT_SATURDAY_PERIODS,
  startTime: '08:00',
  endTime: '15:00',
  breakAfter: 2,
  breakMinutes: 15,
  lunchAfter: 4,
  lunchMinutes: 30,
};

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

export async function getDayConfig(schoolId: string, grade?: string | null): Promise<StoredDayConfig> {
  const row = await db.schoolDayPeriodConfig.findUnique({ where: { schoolId } }).catch(() => null);

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

  const allGradeConfigs = parseGradeConfigs((row as any).gradeConfigs);
  const gradeOverride = grade ? allGradeConfigs[grade] : null;
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
      breakAfter: Number(gradeOverride.breakAfter) || row.breakAfter,
      breakMinutes: Number(gradeOverride.breakMinutes ?? row.breakMinutes),
      lunchAfter: Number(gradeOverride.lunchAfter) || row.lunchAfter,
      lunchMinutes: Number(gradeOverride.lunchMinutes ?? row.lunchMinutes),
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
    breakAfter: row.breakAfter,
    breakMinutes: row.breakMinutes,
    lunchAfter: row.lunchAfter,
    lunchMinutes: row.lunchMinutes,
    gradeConfigs: allGradeConfigs,
  };
}

export interface DayConfigInput {
  workingDays?: number;
  periodsPerDay?: number;
  saturdayPeriods?: number;
  perDayPeriods?: Partial<Record<DayName, number>>;
  startTime?: string;
  endTime?: string;
  breakAfter?: number;
  breakMinutes?: number;
  lunchAfter?: number;
  lunchMinutes?: number;
  // Grade-wise fields
  grade?: string;
  enabled?: boolean;
  targetGrades?: string[];
  gradeConfigs?: Record<string, GradeDayConfig>;
}

/**
 * Persist the week shape. Accepts either base school configuration or grade-specific
 * overrides and batch applications.
 */
export async function saveDayConfig(schoolId: string, input: DayConfigInput) {
  const existing = await db.schoolDayPeriodConfig.findUnique({ where: { schoolId } }).catch(() => null);
  const currentGradeConfigs = parseGradeConfigs((existing as any)?.gradeConfigs);

  const targetGrade = input.grade?.trim();
  const targetGrades = Array.isArray(input.targetGrades) && input.targetGrades.length > 0
    ? input.targetGrades.map((g) => g.trim()).filter(Boolean)
    : targetGrade ? [targetGrade] : [];

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

        updatedGradeConfigs[g] = {
          enabled: true,
          workingDays,
          periodsPerDay: weekday,
          saturdayPeriods: expanded.Saturday ?? DEFAULT_SATURDAY_PERIODS,
          perDayPeriods: expanded,
          startTime: input.startTime || existing?.startTime || DEFAULTS.startTime,
          endTime: input.endTime || existing?.endTime || DEFAULTS.endTime,
          breakAfter: Number(input.breakAfter) || existing?.breakAfter || DEFAULTS.breakAfter,
          breakMinutes: Number(input.breakMinutes ?? existing?.breakMinutes ?? DEFAULTS.breakMinutes),
          lunchAfter: Number(input.lunchAfter) || existing?.lunchAfter || DEFAULTS.lunchAfter,
          lunchMinutes: Number(input.lunchMinutes ?? existing?.lunchMinutes ?? DEFAULTS.lunchMinutes),
        };
      }
    }

    await db.schoolDayPeriodConfig.upsert({
      where: { schoolId },
      update: { gradeConfigs: JSON.stringify(updatedGradeConfigs) } as any,
      create: {
        schoolId,
        workingDays: existing?.workingDays || DEFAULTS.workingDays,
        perDayPeriods: existing?.perDayPeriods || JSON.stringify({ Monday: 8, Tuesday: 8, Wednesday: 8, Thursday: 8, Friday: 8, Saturday: 5 }),
        startTime: existing?.startTime || DEFAULTS.startTime,
        endTime: existing?.endTime || DEFAULTS.endTime,
        breakAfter: existing?.breakAfter || DEFAULTS.breakAfter,
        breakMinutes: existing?.breakMinutes || DEFAULTS.breakMinutes,
        lunchAfter: existing?.lunchAfter || DEFAULTS.lunchAfter,
        lunchMinutes: existing?.lunchMinutes || DEFAULTS.lunchMinutes,
        gradeConfigs: JSON.stringify(updatedGradeConfigs),
      } as any,
    });

    return getDayConfig(schoolId, targetGrade);
  }

  // Otherwise saving base School Default configuration
  const workingDays = Math.min(6, Math.max(1, Number(input.workingDays) || DEFAULTS.workingDays));
  const weekday = Math.min(12, Math.max(1, Number(input.periodsPerDay) || DEFAULT_PERIODS_PER_DAY));

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

  const data = {
    workingDays,
    perDayPeriods: JSON.stringify(expanded),
    startTime: input.startTime || DEFAULTS.startTime,
    endTime: input.endTime || DEFAULTS.endTime,
    breakAfter: Number(input.breakAfter) || DEFAULTS.breakAfter,
    breakMinutes: Number(input.breakMinutes ?? DEFAULTS.breakMinutes),
    lunchAfter: Number(input.lunchAfter) || DEFAULTS.lunchAfter,
    lunchMinutes: Number(input.lunchMinutes ?? DEFAULTS.lunchMinutes),
    ...(input.gradeConfigs !== undefined ? { gradeConfigs: JSON.stringify(input.gradeConfigs) } : {}),
  };

  await db.schoolDayPeriodConfig.upsert({
    where: { schoolId },
    update: data as any,
    create: { schoolId, ...data } as any,
  });

  return getDayConfig(schoolId);
}
