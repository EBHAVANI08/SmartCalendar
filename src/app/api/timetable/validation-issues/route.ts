export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { requireCapability } from '@/lib/authz';
import { operationalScheduleFilter } from '@/lib/timetable-lifecycle';
import { scanTimetable, ACKNOWLEDGEABLE_CODES } from '@/lib/timetable-validation';
import { NextResponse } from 'next/server';

/**
 * Validation issues for a school's timetable.
 *
 *   GET    list stored issues
 *   POST   re-scan the timetable and replace the stored issues
 *   PATCH  acknowledge one warning
 *
 * Publication is gated on errors, so those issues have to be visible somewhere.
 * Until now nothing in the product created or displayed them, which meant the
 * gate silently never fired.
 */

async function targetVersion(request: Request, schoolId: string) {
  const requested = new URL(request.url).searchParams.get('versionId');
  if (requested === 'legacy') return null;
  if (requested) return requested;
  const scope = await operationalScheduleFilter(schoolId);
  return scope.timetableVersionId ?? null;
}

export async function GET(request: Request) {
  const denied = requireCapability(request, 'timetable.version.read');
  if (denied) return denied;

  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) return NextResponse.json({ error: 'No school in session' }, { status: 401 });

  const versionId = await targetVersion(request, schoolId);
  const issues = await db.validationIssue.findMany({
    where: {
      schoolId,
      ...(versionId
        ? { timetableVersionId: versionId }
        : { OR: [{ timetableVersionId: null }, { timetableVersionId: { isSet: false } }] }),
    },
    orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
    take: 500,
  });

  const errors = issues.filter((i) => i.severity === 'error').length;
  return NextResponse.json({
    success: true,
    versionId,
    issues: issues.map((i) => ({ ...i, canAcknowledge: i.severity !== 'error' && ACKNOWLEDGEABLE_CODES.has(i.code) })),
    errors,
    warnings: issues.length - errors,
    blocksPublish: errors > 0,
  });
}

export async function POST(request: Request) {
  const denied = requireCapability(request, 'timetable.version.read');
  if (denied) return denied;

  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) return NextResponse.json({ error: 'No school in session' }, { status: 401 });

  const versionId = await targetVersion(request, schoolId);
  const result = await scanTimetable(schoolId, versionId);

  // Keep acknowledgements across a re-scan, so an Admin does not have to
  // re-acknowledge the same warning every time they look.
  const previous = await db.validationIssue.findMany({
    where: { schoolId, acknowledged: true },
    select: { code: true, grade: true, section: true, day: true, period: true, acknowledgedBy: true },
  });
  const ackKey = (i: { code: string; grade?: string | null; section?: string | null; day?: string | null; period?: number | null }) =>
    `${i.code}|${i.grade ?? ''}|${i.section ?? ''}|${i.day ?? ''}|${i.period ?? ''}`;
  const acked = new Map(previous.map((p) => [ackKey(p), p.acknowledgedBy ?? null]));

  await db.validationIssue.deleteMany({
    where: {
      schoolId,
      importBatchId: null,
      ...(versionId
        ? { timetableVersionId: versionId }
        : { OR: [{ timetableVersionId: null }, { timetableVersionId: { isSet: false } }] }),
    },
  });

  if (result.issues.length) {
    await db.validationIssue.createMany({
      data: result.issues.slice(0, 1000).map((i) => {
        const wasAcked = i.severity !== 'error' && acked.has(ackKey(i));
        return {
          schoolId,
          timetableVersionId: versionId,
          severity: i.severity,
          code: i.code,
          dataset: 'Schedule',
          message: i.message,
          grade: i.grade ?? null,
          section: i.section ?? null,
          day: i.day ?? null,
          period: i.period ?? null,
          subject: i.subject ?? null,
          teacherId: i.teacherId ?? null,
          teacherName: i.teacherName ?? null,
          acknowledged: wasAcked,
          acknowledgedBy: wasAcked ? acked.get(ackKey(i)) : null,
          acknowledgedAt: wasAcked ? new Date() : null,
        };
      }),
    });
  }

  return NextResponse.json({
    success: true,
    versionId,
    scanned: result.scanned,
    errors: result.errors,
    warnings: result.warnings,
    byCode: result.byCode,
    blocksPublish: result.errors > 0,
    truncated: result.issues.length > 1000,
  });
}

export async function PATCH(request: Request) {
  const denied = requireCapability(request, 'timetable.version.transition');
  if (denied) return denied;

  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) return NextResponse.json({ error: 'No school in session' }, { status: 401 });

  const { issueId } = await request.json().catch(() => ({ issueId: null }));
  if (!issueId) return NextResponse.json({ error: 'issueId is required' }, { status: 400 });

  const issue = await db.validationIssue.findFirst({ where: { id: issueId, schoolId } });
  if (!issue) return NextResponse.json({ error: 'Issue not found' }, { status: 404 });

  // An error is a hard constraint violation. Acknowledging it would let an
  // invalid timetable publish, so it is refused outright.
  if (issue.severity === 'error' || !ACKNOWLEDGEABLE_CODES.has(issue.code)) {
    return NextResponse.json(
      {
        error: 'This issue cannot be acknowledged. Errors must be fixed before the timetable can be published.',
        code: 'NOT_ACKNOWLEDGEABLE',
      },
      { status: 409 }
    );
  }

  const updated = await db.validationIssue.update({
    where: { id: issueId },
    data: {
      acknowledged: true,
      acknowledgedBy: request.headers.get('x-user-email') || request.headers.get('x-user-id') || 'unknown',
      acknowledgedAt: new Date(),
    },
  });

  return NextResponse.json({ success: true, issue: updated });
}
