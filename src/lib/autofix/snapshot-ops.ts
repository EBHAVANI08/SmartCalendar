import { resolveDayConfig, type StoredDayConfig } from '@/lib/timetable-config';
import type { Change, ModelName, Snapshot } from '@/lib/autofix/types';

/**
 * Pure operations on a Snapshot. The engine, the database layer and the tests
 * all apply and revert changes through these, so "what a fix does" has one
 * definition.
 */

/**
 * Fields an auto-fix may write, per model. Anything else (passwords, logins,
 * roles, timetable assignments) is out of reach by construction.
 */
export const WRITABLE_FIELDS: Record<ModelName, readonly string[]> = {
  gradeSubjectConfig: ['grade', 'subjectName', 'weeklyPeriods', 'maxPeriodsPerDay', 'priority', 'allowConsecutive', 'active', 'archivedAt'],
  subjectMaster: ['name', 'code', 'active', 'archivedAt'],
  classSection: ['grade', 'code', 'active', 'archivedAt'],
  teacher: ['subject', 'subjects', 'grades', 'sections'],
  schedule: ['grade', 'subject'],
  teacherQualification: ['subjectId'],
  schoolDayPeriodConfig: ['breakEnabled', 'breakAfter', 'lunchEnabled', 'lunchAfter', 'gradeConfigs'],
};

export function assertWritable(change: Change): void {
  const allowed = WRITABLE_FIELDS[change.model];
  for (const field of Object.keys(change.after)) {
    if (!allowed.includes(field)) throw new Error(`Auto-fix may not change ${change.model}.${field}`);
  }
}

type Row = Record<string, unknown> & { id: string };

function rowsOf(snapshot: Snapshot, model: ModelName): Row[] {
  switch (model) {
    case 'gradeSubjectConfig': return snapshot.subjectConfigs as unknown as Row[];
    case 'subjectMaster': return snapshot.subjectMasters as unknown as Row[];
    case 'classSection': return snapshot.classSections as unknown as Row[];
    case 'teacher': return snapshot.teachers as unknown as Row[];
    case 'schedule': return snapshot.editableSchedules as unknown as Row[];
    case 'teacherQualification': return snapshot.teacherQualifications as unknown as Row[];
    case 'schoolDayPeriodConfig': return snapshot.dayConfig ? [snapshot.dayConfig as unknown as Row] : [];
  }
}

/** Comparable form of a stored value (dates as ISO strings, objects as JSON). */
export function normalizeValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value === undefined) return null;
  if (value && typeof value === 'object') return JSON.stringify(value);
  return value;
}

export function valuesMatch(current: Record<string, unknown>, expected: Record<string, unknown>): boolean {
  return Object.entries(expected).every(([field, value]) => normalizeValue(current[field]) === normalizeValue(value));
}

export function cloneSnapshot(snapshot: Snapshot): Snapshot {
  return JSON.parse(JSON.stringify(snapshot)) as Snapshot;
}

/** Applies changes to the snapshot in place. */
export function applyChanges(snapshot: Snapshot, changes: Change[]): void {
  for (const change of changes) {
    assertWritable(change);
    const row = rowsOf(snapshot, change.model).find((candidate) => candidate.id === change.id);
    if (!row) throw new Error(`Auto-fix: ${change.model} ${change.id} not in snapshot`);
    Object.assign(row, change.after);
  }
}

/**
 * Reverts changes in place, newest first. Returns the conflicts (rows changed
 * since the fix) instead of reverting when any exist.
 */
export function revertChanges(snapshot: Snapshot, changes: Change[]): { ok: boolean; conflicts: string[] } {
  const conflicts: string[] = [];
  for (const change of changes) {
    const row = rowsOf(snapshot, change.model).find((candidate) => candidate.id === change.id);
    if (!row || !valuesMatch(row, change.after)) conflicts.push(`${change.model} ${change.id}`);
  }
  if (conflicts.length) return { ok: false, conflicts };
  for (const change of [...changes].reverse()) {
    const row = rowsOf(snapshot, change.model).find((candidate) => candidate.id === change.id)!;
    Object.assign(row, change.before);
  }
  return { ok: true, conflicts };
}

export const isLive = (row: { archivedAt: string | null }) => !row.archivedAt;

/** Active with a weekly quota: the row counts toward demand. */
export const inUse = (row: { active: boolean; weeklyPeriods: number; archivedAt: string | null }) =>
  isLive(row) && row.active && row.weeklyPeriods > 0;

/** The grade's week from the snapshot's own day configuration (override applied). */
export function weekFor(snapshot: Snapshot, grade: string | null): StoredDayConfig {
  return resolveDayConfig(snapshot.schoolId, snapshot.dayConfig, grade);
}

/** Single spaces, no leading/trailing whitespace. */
export function tidyName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/** Short stable hash for suppress keys (FNV-1a). */
export function shortHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
