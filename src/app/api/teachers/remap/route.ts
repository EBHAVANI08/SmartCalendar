export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { TEACHER_REFERENCES } from '@/lib/faculty-dedup';
import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/authz';

/**
 * Point every reference held by one faculty record at another.
 *
 * Used to rescue a malformed record: its timetable rows, leaves, substitutions
 * and attendance move to the real teacher, and only then can the broken record
 * be retired. Both records must belong to the caller's school - references are
 * never moved across tenants.
 */
export async function POST(request: Request) {
  const denied = requireCapability(request, 'faculty.dedup');
  if (denied) return denied;

  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const fromTeacherId = String(body.fromTeacherId ?? '');
  const toTeacherId = String(body.toTeacherId ?? '');
  const alsoDelete = body.deleteSource === true;

  if (!fromTeacherId || !toTeacherId) {
    return NextResponse.json({ error: 'fromTeacherId and toTeacherId are required.' }, { status: 400 });
  }
  if (fromTeacherId === toTeacherId) {
    return NextResponse.json({ error: 'Source and target are the same record.' }, { status: 400 });
  }

  const [from, to] = await Promise.all([
    db.teacher.findFirst({ where: { id: fromTeacherId, schoolId } }),
    db.teacher.findFirst({ where: { id: toTeacherId, schoolId } }),
  ]);
  if (!from || !to) {
    return NextResponse.json(
      { error: 'Both faculty records must exist in this school.', code: 'NOT_IN_SCHOOL' },
      { status: 404 }
    );
  }

  const repointed: Record<string, number> = {};
  let dropped = 0;

  for (const ref of TEACHER_REFERENCES) {
    const model = (db as unknown as Record<string, any>)[ref.model];
    if (!model?.updateMany) continue;
    try {
      const res = await model.updateMany({
        where: { [ref.field]: fromTeacherId },
        data: { [ref.field]: toTeacherId },
      });
      if (res.count) repointed[ref.label] = (repointed[ref.label] ?? 0) + res.count;
    } catch {
      // A uniqueness collision means the target already holds an equivalent
      // record. Move them individually and drop the genuinely redundant ones.
      const rows = await model.findMany({ where: { [ref.field]: fromTeacherId }, select: { id: true } });
      for (const row of rows) {
        try {
          await model.update({ where: { id: row.id }, data: { [ref.field]: toTeacherId } });
          repointed[ref.label] = (repointed[ref.label] ?? 0) + 1;
        } catch {
          await model.delete({ where: { id: row.id } }).catch(() => null);
          dropped++;
        }
      }
    }
  }

  // Confirm nothing still points at the source before offering to remove it.
  let remaining = 0;
  for (const ref of TEACHER_REFERENCES) {
    const model = (db as unknown as Record<string, any>)[ref.model];
    if (!model?.count) continue;
    try {
      remaining += await model.count({ where: { [ref.field]: fromTeacherId } });
    } catch {
      /* model not present in this deployment */
    }
  }

  let deleted = false;
  if (alsoDelete && remaining === 0) {
    await db.teacher.delete({ where: { id: fromTeacherId } }).catch(() => null);
    deleted = true;
  }

  await db.auditLog
    .create({
      data: {
        schoolId,
        actorId: request.headers.get('x-user-id') || 'unknown',
        actorRole: request.headers.get('x-user-role') || 'unknown',
        action: 'faculty.remap',
        entityType: 'Teacher',
        entityId: fromTeacherId,
        before: { name: from.name, email: from.email },
        after: { remappedTo: toTeacherId, targetName: to.name, repointed, deleted },
        reason: `Repointed ${Object.values(repointed).reduce((a, b) => a + b, 0)} reference(s) to ${to.name}`,
      },
    })
    .catch(() => null);

  const total = Object.values(repointed).reduce((a, b) => a + b, 0);
  return NextResponse.json({
    success: true,
    message: `Moved ${total} reference(s) to ${to.name}.${dropped ? ` ${dropped} redundant row(s) removed.` : ''}${
      remaining === 0 ? ' The source record can now be deleted.' : ` ${remaining} reference(s) still remain.`
    }`,
    repointed,
    droppedRedundant: dropped,
    remainingReferences: remaining,
    sourceDeleted: deleted,
  });
}
