export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { requireCapability } from '@/lib/authz';
import { TEACHER_REFERENCES } from '@/lib/faculty-dedup';
import { NextResponse } from 'next/server';

/**
 * Resolve one possible-duplicate pair.
 *
 * The old flow offered only "merge" or "leave it", which is too blunt. An Admin
 * usually knows one of these four things:
 *
 *   keep_separate  they are two different people. Both stay active, and the
 *                  pair stops being offered.
 *   review_later   not now. The decision is recorded so it can be revisited.
 *   deactivate     one is the right record and the other should stop being
 *                  scheduled - but its history stays exactly where it is.
 *                  This deliberately does NOT merge.
 *   merge          they are the same person. History moves to the kept record
 *                  and the other is removed.
 *
 * `keepId` decides which record survives, so "keep B" is as available as
 * "keep A" - the suggested canonical is a recommendation, not a constraint.
 */

type Action = 'keep_separate' | 'review_later' | 'deactivate' | 'merge';

const pairKeyOf = (a: string, b: string) => [a, b].sort().join('|');

export async function POST(request: Request) {
  const denied = requireCapability(request, 'faculty.dedup');
  if (denied) return denied;

  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const action = String(body.action ?? '') as Action;
  const keepId = String(body.keepId ?? '');
  const otherId = String(body.otherId ?? '');
  const note = body.note ? String(body.note).slice(0, 500) : null;

  if (!['keep_separate', 'review_later', 'deactivate', 'merge'].includes(action)) {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }
  if (!keepId || !otherId || keepId === otherId) {
    return NextResponse.json({ error: 'Two different faculty records are required.' }, { status: 400 });
  }

  // Both must be ours. References are never moved across tenants.
  const [keep, other] = await Promise.all([
    db.teacher.findFirst({ where: { id: keepId, schoolId } }),
    db.teacher.findFirst({ where: { id: otherId, schoolId } }),
  ]);
  if (!keep || !other) {
    return NextResponse.json(
      { error: 'Both faculty records must exist in this school.', code: 'NOT_IN_SCHOOL' },
      { status: 404 }
    );
  }

  const actor = request.headers.get('x-user-email') || request.headers.get('x-user-id') || 'unknown';
  const audit = (act: string, after: Record<string, unknown>, reason: string) =>
    db.auditLog
      .create({
        data: {
          schoolId,
          actorId: request.headers.get('x-user-id') || 'unknown',
          actorRole: request.headers.get('x-user-role') || 'unknown',
          action: act,
          entityType: 'Teacher',
          entityId: otherId,
          before: { keep: { id: keep.id, name: keep.name }, other: { id: other.id, name: other.name } },
          after: JSON.parse(JSON.stringify(after)),
          reason,
        },
      })
      .catch(() => null);

  // ── Decisions that change no faculty data ────────────────────────────────
  if (action === 'keep_separate' || action === 'review_later') {
    const pairKey = pairKeyOf(keepId, otherId);
    await db.facultyDuplicateDecision.upsert({
      where: { schoolId_pairKey: { schoolId, pairKey } },
      create: { schoolId, pairKey, decision: action, teacherAId: keepId, teacherBId: otherId, decidedBy: actor, note },
      update: { decision: action, decidedBy: actor, note },
    });

    await audit(
      `faculty.dedup.${action}`,
      { decision: action },
      action === 'keep_separate'
        ? 'Marked as two different people; both remain active'
        : 'Deferred for later review'
    );

    return NextResponse.json({
      success: true,
      action,
      message: action === 'keep_separate'
        ? `${keep.name} and ${other.name} will no longer be offered as a duplicate pair.`
        : 'Saved for later review.',
    });
  }

  // ── Deactivate the other record, WITHOUT merging ─────────────────────────
  if (action === 'deactivate') {
    if (other.role === 'inactive') {
      return NextResponse.json({ error: `${other.name} is already deactivated.` }, { status: 409 });
    }

    await db.teacher.update({ where: { id: otherId }, data: { role: 'inactive' } });
    // Recorded so the pair stops resurfacing; the history stays untouched.
    await db.facultyDuplicateDecision.upsert({
      where: { schoolId_pairKey: { schoolId, pairKey: pairKeyOf(keepId, otherId) } },
      create: {
        schoolId, pairKey: pairKeyOf(keepId, otherId), decision: 'keep_separate',
        teacherAId: keepId, teacherBId: otherId, decidedBy: actor,
        note: note ?? `Deactivated in favour of ${keep.name}`,
      },
      update: { decision: 'keep_separate', decidedBy: actor },
    });

    await audit('faculty.dedup.deactivate', { deactivated: otherId, keptActive: keepId },
      `Kept ${keep.name}; deactivated ${other.name} without merging`);

    return NextResponse.json({
      success: true,
      action,
      message: `${other.name} is deactivated. Their history is unchanged and nothing was merged.`,
    });
  }

  // ── Merge: move every reference, then remove the duplicate ───────────────
  const repointed: Record<string, number> = {};
  for (const ref of TEACHER_REFERENCES) {
    const model = (db as unknown as Record<string, any>)[ref.model];
    if (!model?.updateMany) continue;
    try {
      const res = await model.updateMany({ where: { [ref.field]: otherId }, data: { [ref.field]: keepId } });
      if (res.count) repointed[ref.label] = (repointed[ref.label] ?? 0) + res.count;
    } catch {
      // A uniqueness collision means the kept record already has an equivalent
      // row. Move what can move and drop only the genuinely redundant.
      const rows = await model.findMany({ where: { [ref.field]: otherId }, select: { id: true } });
      for (const row of rows) {
        try {
          await model.update({ where: { id: row.id }, data: { [ref.field]: keepId } });
          repointed[ref.label] = (repointed[ref.label] ?? 0) + 1;
        } catch {
          await model.delete({ where: { id: row.id } }).catch(() => null);
        }
      }
    }
  }

  // Combine the lists so the kept record does not lose what the other knew.
  const asList = (v?: string | null) => {
    if (!v) return [] as string[];
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p.map(String).filter(Boolean) : [];
    } catch {
      return String(v).split(/[;,]/).map((x) => x.trim()).filter(Boolean);
    }
  };
  const union = (a: string[], b: string[]) => [...new Set([...a, ...b])];

  const subjects = union(asList(keep.subjects ?? keep.subject), asList(other.subjects ?? other.subject));
  const grades = union(asList(keep.grades), asList(other.grades));
  const sections = union(asList(keep.sections), asList(other.sections));

  await db.teacher.update({
    where: { id: keepId },
    data: {
      subjects: JSON.stringify(subjects),
      subject: subjects[0] ?? keep.subject,
      grades: JSON.stringify(grades),
      ...(sections.length ? { sections: JSON.stringify(sections) } : {}),
      ...(!keep.employeeId && other.employeeId ? { employeeId: other.employeeId } : {}),
      ...(!keep.phone && other.phone ? { phone: other.phone } : {}),
    },
  });

  let remaining = 0;
  for (const ref of TEACHER_REFERENCES) {
    const model = (db as unknown as Record<string, any>)[ref.model];
    if (!model?.count) continue;
    try {
      remaining += await model.count({ where: { [ref.field]: otherId } });
    } catch {
      /* model absent in this deployment */
    }
  }
  if (remaining === 0) {
    await db.teacher.delete({ where: { id: otherId } }).catch(() => null);
  }

  await db.facultyDuplicateDecision
    .deleteMany({ where: { schoolId, pairKey: pairKeyOf(keepId, otherId) } })
    .catch(() => null);

  await audit('faculty.dedup.merge', { keptId: keepId, removedId: otherId, repointed, remaining },
    `Merged ${other.name} into ${keep.name}`);

  const moved = Object.values(repointed).reduce((a, b) => a + b, 0);
  return NextResponse.json({
    success: true,
    action,
    repointed,
    remainingReferences: remaining,
    removed: remaining === 0,
    message: remaining === 0
      ? `Merged ${other.name} into ${keep.name}. ${moved} reference(s) moved.`
      : `Moved ${moved} reference(s), but ${remaining} still point at ${other.name}, so it was kept.`,
  });
}
