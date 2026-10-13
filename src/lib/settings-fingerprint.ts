import { createHash } from 'node:crypto';
import type { SolverInput } from '@/lib/solver/types';

/**
 * A short hash per settings area, taken from the exact input the timetable
 * solver used. Stored with a generated draft so the Studio can tell the admin
 * which settings changed after the draft was made. Pure: no database access.
 */

export const SETTINGS_AREAS = {
  week: 'Days & periods',
  subjects: 'Subjects',
  teachers: 'Teacher assignments',
  workload: 'Teacher workload',
  rooms: 'Rooms',
  rules: 'Timetable rules',
} as const;

export type SettingsArea = keyof typeof SETTINGS_AREAS;
export type SettingsFingerprint = Record<SettingsArea, string>;

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
const sorted = <T>(items: T[], key: (item: T) => string) => [...items].sort((a, b) => key(a).localeCompare(key(b)));

export function fingerprintOf(input: SolverInput): SettingsFingerprint {
  const requirementKey = (r: { classKey: string; subject: string }) => `${r.classKey}|${r.subject}`;
  return {
    week: hash(sorted(input.classes, (c) => c.key).map((c) => [c.key, c.days, c.homeRoomId, c.breaksAfter ?? []])),
    subjects: hash(sorted(input.requirements, requirementKey).map((r) => [
      requirementKey(r), r.weeklyPeriods, r.maxPerDay, r.allowConsecutive, r.requiredRoomType, r.core, r.teacherRequirement, r.minGap ?? null,
    ])),
    teachers: hash(sorted(input.requirements, requirementKey).map((r) => [requirementKey(r), [...r.teacherIds].sort()])),
    workload: hash(sorted(input.teachers, (t) => t.id).map((t) => [
      t.id, t.maxWeekly, t.maxDaily, t.maxConsecutive, sorted(t.unavailable, (u) => `${u.day}|${u.period}`),
    ])),
    rooms: hash(sorted(input.rooms, (r) => r.id).map((r) => [r.id, r.type, r.maxParallelClasses ?? 1])),
    rules: hash({ noSameClassBackToBack: input.rules?.noSameClassBackToBack !== false }),
  };
}

/** Areas whose hash differs; empty when nothing changed or nothing was stored. */
export function changedAreas(stored: unknown, current: SettingsFingerprint): { area: SettingsArea; label: string }[] {
  if (!stored || typeof stored !== 'object') return [];
  const previous = stored as Partial<SettingsFingerprint>;
  return (Object.keys(SETTINGS_AREAS) as SettingsArea[])
    .filter((area) => previous[area] && previous[area] !== current[area])
    .map((area) => ({ area, label: SETTINGS_AREAS[area] }));
}
