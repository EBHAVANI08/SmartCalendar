export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { requireCapability } from '@/lib/authz';
import { isCorrupt } from '@/lib/faculty-dedup';
import { NextResponse } from 'next/server';

/**
 * Delete several deactivated faculty records in one action.
 *
 * Cleaning up a broken import meant deleting records one at a time, each with
 * its own reference-clearing step. With 17 corrupt records left that is 17
 * separate confirmations, so the work never gets done.
 *
 * The rules are exactly the same as the single delete - this only removes the
 * repetition, never the safety:
 *
 *   - the record must already be deactivated
 *   - it must belong to the caller's school
 *   - references block it, unless `resolveReferences` is explicitly requested
 *   - every deletion is audited individually
 *
 * `confirm` defaults to false and returns a preview.
 */

const MAX_BATCH = 100;

async function referencesOf(teacherId: string) {
  const [schedules, coverSubs, absentSubs, leaves, attendance, lessonPlans, notifications] =
    await Promise.all([
      db.schedule.count({ where: { teacherId } }),
      db.substitution.count({ where: { substituteId: teacherId } }),
      db.substitution.count({ where: { absentTeacherId: teacherId } }),
      db.leaveApplication.count({ where: { teacherId } }),
      db.biometricAttendance.count({ where: { teacherId } }),
      db.lessonPlan.count({ where: { teacherId } }),
      db.teacherNotification.count({ where: { teacherId } }),
    ]);

  // Attendance only counts as history worth keeping once a real device exists.
  const attendanceBlocks = Boolean(process.env.BIOMETRIC_WEBHOOK_SECRET);

  return {
    detachable: schedules + coverSubs,
    removable: absentSubs + leaves + attendance + lessonPlans + notifications,
    blocking: schedules + coverSubs + absentSubs + leaves + (attendanceBlocks ? attendance : 0),
    breakdown: { schedules, coverSubs, absentSubs, leaves, attendance, lessonPlans, notifications },
  };
}

/** Detach what the schema allows, remove what it does not. */
async function clearReferences(teacherId: string) {
  const cleared: Record<string, number> = {};

  const s = await db.schedule.updateMany({ where: { teacherId }, data: { teacherId: null } });
  if (s.count) cleared['timetable periods unallocated'] = s.count;

  const c = await db.substitution.updateMany({
    where: { substituteId: teacherId },
    data: { substituteId: null, status: 'pending' },
  });
  if (c.count) cleared['cover assignments returned to pending'] = c.count;

  const a = await db.substitution.deleteMany({ where: { absentTeacherId: teacherId } });
  if (a.count) cleared['cover requests removed'] = a.count;

  const l = await db.leaveApplication.deleteMany({ where: { teacherId } });
  if (l.count) cleared['leave records removed'] = l.count;

  const att = await db.biometricAttendance.deleteMany({ where: { teacherId } });
  if (att.count) cleared['attendance records removed'] = att.count;

  const lp = await db.lessonPlan.deleteMany({ where: { teacherId } });
  if (lp.count) cleared['lesson plans removed'] = lp.count;

  const n = await db.teacherNotification.deleteMany({ where: { teacherId } });
  if (n.count) cleared['notifications removed'] = n.count;

  return cleared;
}

export async function POST(request: Request) {
  const denied = requireCapability(request, 'faculty.dedup');
  if (denied) return denied;

  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];
  const confirm = body.confirm === true;
  const resolveReferences = body.resolveReferences === true;

  if (!ids.length) {
    return NextResponse.json({ error: 'Select at least one faculty record.' }, { status: 400 });
  }
  if (ids.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `Select at most ${MAX_BATCH} records at a time.` },
      { status: 400 }
    );
  }

  // Only records in this school. Anything else is silently absent from the plan
  // rather than acted on.
  const teachers = await db.teacher.findMany({ where: { id: { in: ids }, schoolId } });
  const found = new Set(teachers.map((t) => t.id));
  const notInSchool = ids.filter((id) => !found.has(id));

  interface PlanEntry {
    id: string;
    name: string;
    corrupt: boolean;
    corruptReasons: string[];
    status: 'ready' | 'needs_resolve' | 'still_active';
    references: Record<string, number>;
    blocking: number;
    willDetach: number;
    willRemove: number;
  }

  const plan: PlanEntry[] = [];
  for (const t of teachers) {
    const refs = await referencesOf(t.id);
    const corrupt = isCorrupt(t).length > 0;
    let status: 'ready' | 'needs_resolve' | 'still_active';
    if (t.role !== 'inactive') status = 'still_active';
    else if (refs.blocking > 0) status = 'needs_resolve';
    else status = 'ready';

    plan.push({
      id: t.id,
      name: t.name,
      corrupt,
      corruptReasons: corrupt ? isCorrupt(t) : [],
      status,
      references: refs.breakdown,
      blocking: refs.blocking,
      willDetach: refs.detachable,
      willRemove: refs.removable,
    });
  }

  const ready = plan.filter((p) => p.status === 'ready');
  const needsResolve = plan.filter((p) => p.status === 'needs_resolve');
  const stillActive = plan.filter((p) => p.status === 'still_active');

  const deletable = resolveReferences ? [...ready, ...needsResolve] : ready;

  if (!confirm) {
    return NextResponse.json({
      success: true,
      mode: 'preview',
      selected: ids.length,
      notInSchool: notInSchool.length,
      plan,
      summary: {
        deletableNow: ready.length,
        needsReferenceClearing: needsResolve.length,
        stillActive: stillActive.length,
        wouldDelete: deletable.length,
        rowsDetached: deletable.reduce((n, p) => n + p.willDetach, 0),
        rowsRemoved: deletable.reduce((n, p) => n + p.willRemove, 0),
      },
      warning: needsResolve.length && !resolveReferences
        ? `${needsResolve.length} record(s) are referenced by existing history and will be skipped. Enable "clear references" to remove them too.`
        : deletable.reduce((n, p) => n + p.willRemove, 0)
          ? `${deletable.reduce((n, p) => n + p.willRemove, 0)} dependent record(s) will be permanently removed. This cannot be undone.`
          : null,
    });
  }

  // Execute, one record at a time so a failure never leaves a half-done batch.
  const results: { id: string; ok: boolean; reason?: string; cleared?: Record<string, number> }[] = [];
  let deletedCount = 0;
  const totalCleared: Record<string, number> = {};

  for (const entry of deletable) {
    const teacher = teachers.find((t) => t.id === entry.id)!;
    try {
      let cleared: Record<string, number> = {};
      if (entry.blocking > 0 || entry.willRemove > 0) {
        if (!resolveReferences && entry.blocking > 0) {
          results.push({ id: entry.id, ok: false, reason: 'references not cleared' });
          continue;
        }
        cleared = await clearReferences(entry.id);
        for (const [k, v] of Object.entries(cleared)) {
          totalCleared[k] = (totalCleared[k] ?? 0) + v;
        }
      }

      await db.teacher.delete({ where: { id: entry.id } });
      deletedCount++;
      results.push({ id: entry.id, ok: true, cleared });

      await db.auditLog
        .create({
          data: {
            schoolId,
            actorId: request.headers.get('x-user-id') || 'unknown',
            actorRole: request.headers.get('x-user-role') || 'unknown',
            action: 'faculty.bulk_delete',
            entityType: 'Teacher',
            entityId: entry.id,
            before: { name: teacher.name, email: teacher.email, role: teacher.role, corrupt: entry.corrupt },
            after: { cleared: JSON.parse(JSON.stringify(cleared)) },
            reason: `Bulk delete of a deactivated faculty record${entry.corrupt ? ' (corrupt import)' : ''}`,
          },
        })
        .catch(() => null);
    } catch (err) {
      results.push({
        id: entry.id,
        ok: false,
        reason: err instanceof Error ? err.message : 'delete failed',
      });
    }
  }

  const skipped = [...stillActive, ...(resolveReferences ? [] : needsResolve)];

  return NextResponse.json({
    success: true,
    mode: 'applied',
    deleted: deletedCount,
    skipped: skipped.length,
    skippedReasons: skipped.map((s) => ({ id: s.id, status: s.status })),
    cleared: totalCleared,
    results,
    message: `Deleted ${deletedCount} faculty record(s).${
      skipped.length ? ` ${skipped.length} skipped.` : ''
    }`,
  });
}
