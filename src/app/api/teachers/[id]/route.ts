export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/authz';

type Ctx = { params: Promise<{ id: string }> };

/** Everything that would be orphaned by hard-deleting a faculty record. */
async function countReferences(teacherId: string) {
  const [schedules, absentSubs, coverSubs, leaves, attendance, lessonPlans, notifications] =
    await Promise.all([
      db.schedule.count({ where: { teacherId } }),
      db.substitution.count({ where: { absentTeacherId: teacherId } }),
      db.substitution.count({ where: { substituteId: teacherId } }),
      db.leaveApplication.count({ where: { teacherId } }),
      db.biometricAttendance.count({ where: { teacherId } }),
      db.lessonPlan.count({ where: { teacherId } }),
      db.teacherNotification.count({ where: { teacherId } }),
    ]);

  // Attendance only counts as history worth protecting once a real device is
  // connected. Until then the Attendance page generates rows with Math.random(),
  // and blocking a cleanup on invented data means corrupt faculty can never be
  // removed - 14 of Takshila's 25 corrupt records were held by nothing else.
  const attendanceIsReal = Boolean(process.env.BIOMETRIC_WEBHOOK_SECRET);

  const blocking = [
    { kind: 'timetable rows', count: schedules, blocks: true },
    { kind: 'substitutions (as absent teacher)', count: absentSubs, blocks: true },
    { kind: 'substitutions (as substitute)', count: coverSubs, blocks: true },
    { kind: 'leave records', count: leaves, blocks: true },
    {
      kind: attendanceIsReal
        ? 'biometric attendance records'
        : 'attendance records (demo data — will be removed with the profile)',
      count: attendance,
      blocks: attendanceIsReal,
    },
    { kind: 'lesson plans', count: lessonPlans, blocks: false },
    { kind: 'notifications', count: notifications, blocks: false },
  ];

  return {
    references: blocking.filter((r) => r.count > 0),
    blockers: blocking.filter((r) => r.blocks && r.count > 0),
    total: blocking.reduce((sum, r) => sum + r.count, 0),
  };
}

/** Reference report, so the UI can explain a blocked delete before attempting it. */
export async function GET(request: Request, ctx: Ctx) {
  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }
  const { id } = await ctx.params;

  const teacher = await db.teacher.findFirst({ where: { id, schoolId } });
  if (!teacher) {
    return NextResponse.json({ error: 'Teacher not found in this school.' }, { status: 404 });
  }

  const { references, blockers, total } = await countReferences(id);
  return NextResponse.json({
    success: true,
    teacher: { id: teacher.id, name: teacher.name, role: teacher.role },
    isInactive: teacher.role === 'inactive',
    canDelete: teacher.role === 'inactive' && blockers.length === 0,
    references,
    blockers,
    totalReferences: total,
  });
}

/**
 * Permanent delete.
 *
 * Two gates, both deliberate:
 *  1. The teacher must already be deactivated - delete is never a one-click
 *     action from the active directory.
 *  2. No historical records may point at them. Hard-deleting a teacher who
 *     appears in a timetable, substitution, leave or attendance record would
 *     orphan that history, so we refuse and tell the Admin exactly what holds
 *     the reference. Archive (deactivate) remains the safe alternative.
 */
export async function DELETE(request: Request, ctx: Ctx) {
  const denied = requireCapability(request, 'faculty.write');
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

  if (teacher.role !== 'inactive') {
    return NextResponse.json(
      {
        error: `${teacher.name} is still active. Deactivate the record first, then delete it.`,
        code: 'NOT_DEACTIVATED',
      },
      { status: 409 }
    );
  }

  const { references, blockers, total } = await countReferences(id);
  if (blockers.length) {
    const summary = blockers.map((b) => `${b.count} ${b.kind}`).join(', ');
    return NextResponse.json(
      {
        error: `${teacher.name} cannot be permanently deleted: ${summary}. Deleting would orphan those records. Keep the profile deactivated (archived) to preserve history.`,
        code: 'HAS_REFERENCES',
        references,
        blockers,
        totalReferences: total,
        suggestion: 'Keep the teacher deactivated, or reassign their timetable rows and substitutions first.',
      },
      { status: 409 }
    );
  }

  // Only non-blocking traces remain; clear them so nothing dangles.
  await db.lessonPlan.deleteMany({ where: { teacherId: id } }).catch(() => null);
  await db.teacherNotification.deleteMany({ where: { teacherId: id } }).catch(() => null);
  if (!process.env.BIOMETRIC_WEBHOOK_SECRET) {
    // Demo attendance goes with the profile it belonged to.
    await db.biometricAttendance.deleteMany({ where: { teacherId: id } }).catch(() => null);
  }
  await db.teacher.delete({ where: { id } });

  await db.auditLog
    .create({
      data: {
        schoolId,
        actorId: request.headers.get('x-user-id') || 'unknown',
        actorRole: request.headers.get('x-user-role') || 'unknown',
        action: 'faculty.delete',
        entityType: 'Teacher',
        entityId: id,
        before: { name: teacher.name, email: teacher.email, role: teacher.role },
        reason: 'Permanent delete of a deactivated faculty record with no blocking references',
      },
    })
    .catch(() => null);

  return NextResponse.json({
    success: true,
    message: `${teacher.name} has been permanently deleted.`,
    deletedId: id,
  });
}
