export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { requireCapability } from '@/lib/authz';
import { NextResponse } from 'next/server';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Clear the references that block deleting a faculty record.
 *
 * The delete dialog used to be a dead end: it said "blocked" and offered only
 * "Keep deactivated". For a corrupt record - a mangled import with a name like
 * "rrrrr" - that meant the garbage could never be removed, because equally
 * garbage rows pointed at it.
 *
 * There are two honest routes out, and they are different jobs:
 *
 *   REMAP   (/api/teachers/remap) when the broken record is a mangled version
 *           of a real person. Their history moves to the real record.
 *
 *   RESOLVE (here) when nobody real is behind the record. Its dependent rows
 *           are detached where the schema allows, and removed where it does not.
 *
 * What is possible is decided by the schema, not by preference:
 *
 *   Schedule.teacherId          nullable -> detach, the period becomes unallocated
 *   Substitution.substituteId   nullable -> detach, the cover becomes unassigned
 *   Substitution.absentTeacherId REQUIRED -> the row cannot exist without a
 *                                            teacher, so it is removed
 *   LeaveApplication.teacherId   REQUIRED -> same
 *
 * Nothing happens without `confirm: true`. The default response is a preview.
 */

interface Planned {
  kind: string;
  count: number;
  action: 'detach' | 'delete';
  effect: string;
}

async function buildPlan(teacherId: string) {
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

  const plan: Planned[] = [
    {
      kind: 'timetable periods',
      count: schedules,
      action: 'detach',
      effect: 'The lesson stays on the timetable and becomes unallocated. Nothing is deleted.',
    },
    {
      kind: 'cover assignments (as substitute)',
      count: coverSubs,
      action: 'detach',
      effect: 'The cover request stays and returns to pending, so it can be reassigned.',
    },
    {
      kind: 'cover requests (as the absent teacher)',
      count: absentSubs,
      action: 'delete',
      effect: 'A cover request cannot exist without the teacher it covers for, so the row is removed.',
    },
    {
      kind: 'leave records',
      count: leaves,
      action: 'delete',
      effect: 'A leave application cannot exist without an applicant, so the row is removed.',
    },
    {
      kind: 'attendance records',
      count: attendance,
      action: 'delete',
      effect: 'Attendance belongs to the profile it was recorded against.',
    },
    {
      kind: 'lesson plans',
      count: lessonPlans,
      action: 'delete',
      effect: 'Authored by this profile.',
    },
    {
      kind: 'notifications',
      count: notifications,
      action: 'delete',
      effect: 'Addressed to this profile.',
    },
  ];

  return plan.filter((p) => p.count > 0);
}

export async function POST(request: Request, ctx: Ctx) {
  // Same capability as merging and remapping faculty identities.
  const denied = requireCapability(request, 'faculty.dedup');
  if (denied) return denied;

  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }

  const { id } = await ctx.params;
  const teacher = await db.teacher.findFirst({ where: { id, schoolId } });
  if (!teacher) {
    return NextResponse.json({ error: 'Teacher not found in this school.' }, { status: 404 });
  }

  // Deactivation stays the gate, so this can never surprise an active teacher.
  if (teacher.role !== 'inactive') {
    return NextResponse.json(
      {
        error: `${teacher.name} is still active. Deactivate the record first.`,
        code: 'NOT_DEACTIVATED',
      },
      { status: 409 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const confirm = body.confirm === true;
  const plan = await buildPlan(id);

  const totals = {
    detaching: plan.filter((p) => p.action === 'detach').reduce((n, p) => n + p.count, 0),
    deleting: plan.filter((p) => p.action === 'delete').reduce((n, p) => n + p.count, 0),
  };

  // Preview. Nothing has changed.
  if (!confirm) {
    return NextResponse.json({
      success: true,
      mode: 'preview',
      teacher: { id: teacher.id, role: teacher.role },
      plan,
      totals,
      // Deleting rows is not reversible from the UI, so say so plainly.
      warning: totals.deleting
        ? `${totals.deleting} record(s) will be permanently removed. This cannot be undone from here.`
        : null,
      alternative:
        'If this record is a mangled version of a real teacher, use Map to Existing Faculty instead — that moves the history to them rather than removing it.',
    });
  }

  // Execute. Detach first, so a failure part-way cannot orphan anything.
  const applied: Record<string, number> = {};

  const detachedSchedules = await db.schedule.updateMany({
    where: { teacherId: id },
    data: { teacherId: null },
  });
  if (detachedSchedules.count) applied['timetable periods unallocated'] = detachedSchedules.count;

  const detachedCover = await db.substitution.updateMany({
    where: { substituteId: id },
    data: { substituteId: null, status: 'pending' },
  });
  if (detachedCover.count) applied['cover assignments returned to pending'] = detachedCover.count;

  const removedSubs = await db.substitution.deleteMany({ where: { absentTeacherId: id } });
  if (removedSubs.count) applied['cover requests removed'] = removedSubs.count;

  const removedLeave = await db.leaveApplication.deleteMany({ where: { teacherId: id } });
  if (removedLeave.count) applied['leave records removed'] = removedLeave.count;

  const removedAttendance = await db.biometricAttendance.deleteMany({ where: { teacherId: id } });
  if (removedAttendance.count) applied['attendance records removed'] = removedAttendance.count;

  const removedPlans = await db.lessonPlan.deleteMany({ where: { teacherId: id } });
  if (removedPlans.count) applied['lesson plans removed'] = removedPlans.count;

  const removedNotifs = await db.teacherNotification.deleteMany({ where: { teacherId: id } });
  if (removedNotifs.count) applied['notifications removed'] = removedNotifs.count;

  const remaining = await buildPlan(id);

  await db.auditLog
    .create({
      data: {
        schoolId,
        actorId: request.headers.get('x-user-id') || 'unknown',
        actorRole: request.headers.get('x-user-role') || 'unknown',
        action: 'faculty.resolve_references',
        entityType: 'Teacher',
        entityId: id,
        before: { name: teacher.name, email: teacher.email, plan: JSON.parse(JSON.stringify(plan)) },
        after: { applied },
        reason: 'Cleared blocking references so a deactivated faculty record could be deleted',
      },
    })
    .catch(() => null);

  return NextResponse.json({
    success: true,
    mode: 'applied',
    applied,
    remainingReferences: remaining.reduce((n, p) => n + p.count, 0),
    canDeleteNow: remaining.length === 0,
    message: remaining.length === 0
      ? 'References cleared. The record can now be deleted.'
      : `${remaining.reduce((n, p) => n + p.count, 0)} reference(s) still remain.`,
  });
}
