export const dynamic = 'force-dynamic';

import { getTenantSchoolId } from '@/lib/school-helper';
import { buildDedupPlan, executeMerge, type MergeOutcome } from '@/lib/faculty-dedup';
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/authz';

/**
 * Faculty deduplication.
 *
 * GET  - dry run. Builds and returns the merge plan without writing anything.
 * POST - executes named groups only. There is deliberately no "merge
 *        everything" switch: the caller must list the group keys it approved,
 *        and groups marked for review are refused unless explicitly forced.
 */
export async function GET(request: Request) {
  const denied = requireCapability(request, 'faculty.dedup');
  if (denied) return denied;

  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }

  const plan = await buildDedupPlan(schoolId);

  return NextResponse.json({
    success: true,
    mode: 'dry-run',
    school: plan.schoolCode,
    totalFaculty: plan.totalFaculty,
    summary: plan.summary,
    groups: plan.groups.map((g) => ({
      key: g.key,
      matchedOn: g.matchedOn,
      confidence: g.confidence,
      reason: g.reason,
      canonical: {
        id: g.canonical.id,
        name: g.canonical.name,
        email: g.canonical.email,
        employeeId: g.canonical.employeeId,
        why: g.canonicalReason,
      },
      duplicates: g.duplicates.map((d) => ({
        id: d.id, name: d.name, email: d.email, employeeId: d.employeeId,
      })),
      merged: {
        subjects: g.mergedSubjects,
        grades: g.mergedGrades,
        sections: g.mergedSections,
        employeeId: g.mergedEmployeeId,
        email: g.mergedEmail,
      },
      referencesToRepoint: g.refsToRepoint,
      clashesIntroduced: g.clashesIntroduced,
    })),
    corrupt: plan.corrupt.map((c) => ({
      id: c.teacher.id,
      name: c.teacher.name,
      email: c.teacher.email,
      problems: c.problems,
      references: c.refs,
      resolution: c.resolution,
      note: c.note,
    })),
  });
}

export async function POST(request: Request) {
  const denied = requireCapability(request, 'faculty.dedup');
  if (denied) return denied;

  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const approved: string[] = Array.isArray(body.groupKeys) ? body.groupKeys.map(String) : [];
  const includeReview = body.includeReviewGroups === true;

  if (!approved.length) {
    return NextResponse.json(
      { error: 'Nothing to do: pass groupKeys with the groups you approved from the dry run.', code: 'NO_GROUPS' },
      { status: 400 }
    );
  }

  const plan = await buildDedupPlan(schoolId);
  const selected = plan.groups.filter((g) => approved.includes(g.key));
  const missing = approved.filter((k) => !plan.groups.some((g) => g.key === k));
  const refused = selected.filter((g) => g.confidence === 'review' && !includeReview);
  const toRun = selected.filter((g) => g.confidence === 'high' || includeReview);

  const outcomes: MergeOutcome[] = [];
  for (const group of toRun) {
    outcomes.push(await executeMerge(group));
  }

  // Post-merge integrity: nothing may still point at a deleted record.
  const after = await buildDedupPlan(schoolId);
  const emails = new Map<string, number>();
  const empIds = new Map<string, number>();
  for (const t of await db.teacher.findMany({ where: { schoolId }, select: { email: true, employeeId: true } })) {
    const e = (t.email ?? '').toLowerCase();
    if (e) emails.set(e, (emails.get(e) ?? 0) + 1);
    const i = (t.employeeId ?? '').toUpperCase();
    if (i) empIds.set(i, (empIds.get(i) ?? 0) + 1);
  }

  await db.auditLog
    .create({
      data: {
        schoolId,
        actorId: request.headers.get('x-user-id') || 'unknown',
        actorRole: request.headers.get('x-user-role') || 'unknown',
        action: 'faculty.dedup',
        entityType: 'Teacher',
        entityId: schoolId,
        after: {
          merged: outcomes.map((o) => ({ canonical: o.canonicalId, removed: o.removedIds })),
        },
        reason: `Merged ${outcomes.length} duplicate group(s)`,
      },
    })
    .catch(() => null);

  return NextResponse.json({
    success: true,
    mode: 'execute',
    merged: outcomes,
    refusedForReview: refused.map((g) => ({ key: g.key, reason: g.reason })),
    unknownGroupKeys: missing,
    integrity: {
      remainingDuplicateGroups: after.groups.length,
      duplicateEmails: [...emails.entries()].filter(([, n]) => n > 1).map(([e]) => e),
      duplicateEmployeeIds: [...empIds.entries()].filter(([, n]) => n > 1).map(([i]) => i),
      corruptRemaining: after.corrupt.length,
    },
  });
}
