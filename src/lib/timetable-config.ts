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

export async function getDayConfig(schoolId: string): Promise<StoredDayConfig> {
  const row = await db.schoolDayPeriodConfig.findUnique({ where: { schoolId } }).catch(() => null);

  if (!row) {
    return {
      ...DEFAULTS,
      schoolId,
      configured: false,
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
    };
  }

  const parsedOverrides = parsePerDay(row.perDayPeriods);
  const weekday = parsedOverrides.Monday ?? DEFAULT_PERIODS_PER_DAY;
  const saturday = parsedOverrides.Saturday ?? DEFAULT_SATURDAY_PERIODS;

  const perDayPeriods: Partial<Record<DayName, number>> = {
    Monday: parsedOverrides.Monday ?? weekday,
    Tuesday: parsedOverrides.Tuesday ?? weekday,
    Wednesday: parsedOverrides.Wednesday ?? weekday,
    Thursday: parsedOverrides.Thursday ?? weekday,
    Friday: parsedOverrides.Friday ?? weekday,
    ...(row.workingDays >= 6 ? { Saturday: parsedOverrides.Saturday ?? saturday } : {}),
    ...parsedOverrides,
  };

  return {
    schoolId,
    configured: true,
    workingDays: row.workingDays,
    periodsPerDay: weekday,
    saturdayPeriods: perDayPeriods.Saturday ?? saturday,
    perDayPeriods,
    startTime: row.startTime,
    endTime: row.endTime,
    breakAfter: row.breakAfter,
    breakMinutes: row.breakMinutes,
    lunchAfter: row.lunchAfter,
    lunchMinutes: row.lunchMinutes,
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
}

/**
 * Persist the week shape. Accepts either explicit per-day counts or the
 * simpler periodsPerDay + saturdayPeriods pair the Studio UI sends, and
 * always stores the fully expanded per-day map so later readers never have to
 * re-derive it.
 */
export async function saveDayConfig(schoolId: string, input: DayConfigInput) {
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
  };

  await db.schoolDayPeriodConfig.upsert({
    where: { schoolId },
    update: data,
    create: { schoolId, ...data },
  });

  return getDayConfig(schoolId);
}
