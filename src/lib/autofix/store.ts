import { randomUUID } from 'crypto';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { EDITABLE_STATUSES } from '@/lib/timetable-lifecycle';
import { AUTOFIX_RETRY_DELAY_MS, AUTOFIX_TRANSACTION_ATTEMPTS } from '@/lib/scheduling-constants';
import { assertWritable, valuesMatch } from '@/lib/autofix/snapshot-ops';
import type { Change, Fix, ModelName, Snapshot } from '@/lib/autofix/types';

/**
 * Database side of the auto-fix engine: read a school's setup into a snapshot,
 * write fixes (with their AutoFixLog entries) and undo them. Every query is
 * scoped to one schoolId.
 */

const iso = (value: Date | null | undefined) => (value ? value.toISOString() : null);

export async function loadSnapshot(schoolId: string, options: { protectedConfigIds?: string[] } = {}): Promise<Snapshot> {
  const versions = await db.timetableVersion.findMany({ where: { schoolId }, select: { id: true, status: true } });
  const editableIds = versions.filter((v) => (EDITABLE_STATUSES as string[]).includes(v.status)).map((v) => v.id);
  const teacherIds = (await db.teacher.findMany({ where: { schoolId }, select: { id: true } })).map((t) => t.id);

  const [dayConfig, configs, masters, sections, teachers, editable, frozenRows, qualifications, undone] = await Promise.all([
    db.schoolDayPeriodConfig.findUnique({ where: { schoolId } }),
    db.gradeSubjectConfig.findMany({ where: { schoolId } }),
    db.subjectMaster.findMany({ where: { schoolId } }),
    db.classSection.findMany({ where: { schoolId } }),
    db.teacher.findMany({ where: { schoolId }, select: { id: true, role: true, subject: true, subjects: true, grades: true, sections: true } }),
    editableIds.length
      ? db.schedule.findMany({ where: { schoolId, timetableVersionId: { in: editableIds } }, select: { id: true, timetableVersionId: true, grade: true, section: true, day: true, period: true, subject: true } })
      : Promise.resolve([]),
    // Everything not in an editable version is frozen: published, superseded,
    // approved and unversioned (legacy live) rows.
    db.schedule.findMany({
      where: { schoolId, NOT: { timetableVersionId: { in: editableIds } } },
      select: { grade: true },
      distinct: ['grade'],
    }),
    db.teacherQualification.findMany({ where: { schoolId, teacherId: { in: teacherIds } }, select: { id: true, teacherId: true, subjectId: true } }),
    db.autoFixLog.findMany({ where: { schoolId, undoneAt: { not: null } }, select: { suppressKey: true } }),
  ]);
  const [mergeRules, gradeCounts, subjectCounts] = await Promise.all([
    db.mergeRule.findMany({ where: { schoolId }, select: { id: true, kind: true, from: true, to: true }, orderBy: { createdAt: 'asc' } }),
    db.schedule.groupBy({ by: ['grade'], where: { schoolId }, _count: { _all: true } }),
    db.schedule.groupBy({ by: ['subject'], where: { schoolId }, _count: { _all: true } }),
  ]);

  return {
    schoolId,
    dayConfig: dayConfig
      ? {
          id: dayConfig.id,
          workingDays: dayConfig.workingDays,
          perDayPeriods: dayConfig.perDayPeriods,
          startTime: dayConfig.startTime,
          endTime: dayConfig.endTime,
          breakEnabled: dayConfig.breakEnabled ?? null,
          breakAfter: dayConfig.breakAfter,
          breakMinutes: dayConfig.breakMinutes,
          lunchEnabled: dayConfig.lunchEnabled ?? null,
          lunchAfter: dayConfig.lunchAfter,
          lunchMinutes: dayConfig.lunchMinutes,
          gradeConfigs: dayConfig.gradeConfigs ?? null,
        }
      : null,
    subjectConfigs: configs.map((c) => ({
      id: c.id,
      grade: c.grade,
      subjectName: c.subjectName,
      weeklyPeriods: c.weeklyPeriods,
      maxPeriodsPerDay: c.maxPeriodsPerDay,
      priority: c.priority,
      allowConsecutive: c.allowConsecutive,
      requiredRoomType: c.requiredRoomType ?? null,
      active: c.active,
      archivedAt: iso(c.archivedAt),
      source: c.source ?? null,
      quotaEditedAt: iso(c.quotaEditedAt),
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
    subjectMasters: masters.map((m) => ({ id: m.id, name: m.name, code: m.code, active: m.active, archivedAt: iso(m.archivedAt) })),
    classSections: sections.map((c) => ({ id: c.id, grade: c.grade, section: c.section, code: c.code, academicYearId: c.academicYearId, active: c.active, archivedAt: iso(c.archivedAt) })),
    teachers: teachers.map((t) => ({ id: t.id, role: t.role, subject: t.subject, subjects: t.subjects ?? null, grades: t.grades, sections: t.sections ?? null })),
    editableSchedules: editable.map((r) => ({ ...r, timetableVersionId: r.timetableVersionId as string })),
    teacherQualifications: qualifications,
    frozenGrades: frozenRows.map((r) => r.grade),
    suppressed: undone.map((u) => u.suppressKey),
    mergeRules: mergeRules.map((rule) => ({ ...rule, kind: rule.kind === 'grade' ? 'grade' : 'subject' })),
    scheduleCounts: {
      grades: Object.fromEntries(gradeCounts.map((row) => [row.grade, row._count._all])),
      subjects: Object.fromEntries(subjectCounts.map((row) => [row.subject, row._count._all])),
    },
    protectedConfigIds: options.protectedConfigIds ?? [],
  };
}

/** Values as Prisma expects them (archivedAt as a Date). */
function toData(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).map(([field, value]) =>
    [field, field === 'archivedAt' && typeof value === 'string' ? new Date(value) : value]));
}

type Tx = Prisma.TransactionClient;

function delegate(tx: Tx, model: ModelName) {
  switch (model) {
    case 'gradeSubjectConfig': return tx.gradeSubjectConfig;
    case 'subjectMaster': return tx.subjectMaster;
    case 'classSection': return tx.classSection;
    case 'teacher': return tx.teacher;
    case 'schedule': return tx.schedule;
    case 'teacherQualification': return tx.teacherQualification;
    case 'schoolDayPeriodConfig': return tx.schoolDayPeriodConfig;
  }
}

/** Reads the fields a change touches, scoped to the school. */
async function currentValues(tx: Tx, schoolId: string, change: Change): Promise<Record<string, unknown> | null> {
  const select = Object.fromEntries(Object.keys(change.after).map((field) => [field, true]));
  const row = await (delegate(tx, change.model) as unknown as { findFirst(args: unknown): Promise<Record<string, unknown> | null> })
    .findFirst({ where: { id: change.id, schoolId }, select });
  return row;
}

/** Rows of a frozen timetable version must never change, even if the snapshot was stale. */
async function assertScheduleEditable(tx: Tx, schoolId: string, change: Change): Promise<void> {
  if (change.model !== 'schedule') return;
  const row = await tx.schedule.findFirst({ where: { id: change.id, schoolId }, select: { timetableVersionId: true } });
  const version = row?.timetableVersionId
    ? await tx.timetableVersion.findFirst({ where: { id: row.timetableVersionId, schoolId }, select: { status: true } })
    : null;
  if (!version || !(EDITABLE_STATUSES as string[]).includes(version.status)) {
    throw new Error(`Auto-fix refused: schedule ${change.id} is not in an editable timetable version`);
  }
}

async function writeChanges(tx: Tx, schoolId: string, changes: Change[], direction: 'after' | 'before'): Promise<void> {
  const ordered = direction === 'after' ? changes : [...changes].reverse();
  for (const change of ordered) {
    assertWritable(change);
    await assertScheduleEditable(tx, schoolId, change);
    const result = await (delegate(tx, change.model) as unknown as { updateMany(args: unknown): Promise<{ count: number }> })
      .updateMany({ where: { id: change.id, schoolId }, data: toData(change[direction]) });
    if (result.count !== 1) throw new Error(`Auto-fix: ${change.model} ${change.id} not found in this school`);
  }
}

const TRANSACTION_TIMEOUT_MS = 60_000;

/**
 * A MongoDB transaction interrupted by the network is rolled back entirely, so
 * it is safe to run again. Anything else is re-thrown at once.
 */
function isTransient(error: unknown): boolean {
  const text = error instanceof Error ? `${(error as { code?: string }).code ?? ''} ${error.message}` : String(error);
  return /TransientTransactionError|P2034|write conflict|connection (was )?(forcibly )?closed|ECONNRESET|os error 10054/i.test(text);
}

async function withRetry<T>(work: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await work();
    } catch (error) {
      if (attempt >= AUTOFIX_TRANSACTION_ATTEMPTS || !isTransient(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, AUTOFIX_RETRY_DELAY_MS * attempt));
    }
  }
}

/** Writes each fix and its log entry in one transaction. Returns the log ids. */
export async function persistFixes(schoolId: string, fixes: Fix[], options: { trigger: string; actor?: string | null }): Promise<{ runId: string; ids: string[] }> {
  const runId = randomUUID();
  const ids: string[] = [];
  for (const fix of fixes) {
    const log = await withRetry(() => db.$transaction(async (tx) => {
      // The data must still be what the engine saw; otherwise skip the fix.
      for (const change of fix.changes) {
        const current = await currentValues(tx, schoolId, change);
        if (!current || !valuesMatch(current, change.before)) throw new StaleFixError(fix.summary);
      }
      await writeChanges(tx, schoolId, fix.changes, 'after');
      return tx.autoFixLog.create({
        data: {
          schoolId,
          runId,
          trigger: options.trigger,
          rule: fix.rule,
          tier: fix.tier,
          entity: fix.entity,
          summary: fix.summary,
          before: fix.before as Prisma.InputJsonValue,
          after: fix.after as Prisma.InputJsonValue,
          changes: fix.changes as unknown as Prisma.InputJsonValue,
          suppressKey: fix.suppressKey,
          appliedBy: options.actor ?? null,
          // Written explicitly so `undoneAt: null` / `acknowledgedAt: null` filters match.
          undoneAt: null,
          undoneBy: null,
          acknowledgedAt: null,
        },
        select: { id: true },
      });
    }, { timeout: TRANSACTION_TIMEOUT_MS, maxWait: TRANSACTION_TIMEOUT_MS })).catch((error) => {
      if (error instanceof StaleFixError) return null; // data changed meanwhile; the next run re-evaluates
      throw error;
    });
    if (log) ids.push(log.id);
  }
  return { runId, ids };
}

class StaleFixError extends Error {}

export type UndoResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'already_undone' | 'conflict'; conflicts?: string[] };

/**
 * Restores every row of a fix to its value before the fix, provided nothing
 * has changed those rows since. Undone fixes are not re-applied for the same
 * data (see suppressKey).
 */
export async function undoFix(schoolId: string, logId: string, actor?: string | null): Promise<UndoResult> {
  const log = await db.autoFixLog.findFirst({ where: { id: logId, schoolId } });
  if (!log) return { ok: false, reason: 'not_found' };
  if (log.undoneAt) return { ok: false, reason: 'already_undone' };
  const changes = log.changes as unknown as Change[];
  try {
    await withRetry(() => db.$transaction(async (tx) => {
      // Re-read inside the transaction: a retried undo may already have committed.
      const current = await tx.autoFixLog.findFirst({ where: { id: log.id, schoolId }, select: { undoneAt: true } });
      if (current?.undoneAt) return;
      const conflicts: string[] = [];
      for (const change of changes) {
        const current = await currentValues(tx, schoolId, change);
        if (!current || !valuesMatch(current, change.after)) conflicts.push(`${change.model} ${change.id}`);
      }
      if (conflicts.length) throw new UndoConflictError(conflicts);
      await writeChanges(tx, schoolId, changes, 'before');
      await tx.autoFixLog.update({ where: { id: log.id }, data: { undoneAt: new Date(), undoneBy: actor ?? null } });
    }, { timeout: TRANSACTION_TIMEOUT_MS, maxWait: TRANSACTION_TIMEOUT_MS }));
    return { ok: true };
  } catch (error) {
    if (error instanceof UndoConflictError) return { ok: false, reason: 'conflict', conflicts: error.conflicts };
    throw error;
  }
}

class UndoConflictError extends Error {
  constructor(readonly conflicts: string[]) {
    super('conflict');
  }
}

