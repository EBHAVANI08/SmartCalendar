export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { createInitialVersion, createRevision, getPublishedVersion, versionHistory } from '@/lib/timetable-lifecycle';
import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/authz';

/** Version history for the Admin view. */
export async function GET(request: Request) {
  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }

  const [history, published, unversioned] = await Promise.all([
    versionHistory(schoolId),
    getPublishedVersion(schoolId),
    db.schedule.count({ where: { schoolId, OR: [{ timetableVersionId: null }, { timetableVersionId: { isSet: false } }] } }),
  ]);

  return NextResponse.json({
    success: true,
    versions: history,
    currentVersionId: published?.id ?? null,
    unversionedRows: unversioned,
  });
}

/**
 * POST { action: 'adopt' | 'revise', sourceVersionId?, changeNotes?, name? }
 *
 * - adopt : bring existing unversioned rows under a first draft version
 * - revise: copy a version (typically the published one) into a new draft so
 *           it can be edited without disturbing what is live
 */
export async function POST(request: Request) {
  const denied = requireCapability(request, 'timetable.version.transition');
  if (denied) return denied;

  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }
  const actor = request.headers.get('x-user-email') || request.headers.get('x-user-id') || 'admin';

  const body = await request.json().catch(() => ({}));
  const action = String(body.action ?? 'adopt');

  if (action === 'adopt') {
    // Adoption rewrites every timetable row to point at a new version. It is
    // not exposed to school admins yet: an accidental click migrated a live
    // tenant into versioned mode. Platform owners only until the flow is
    // reviewable and reversible from the UI.
    if (request.headers.get('x-user-role') !== 'superadmin') {
      return NextResponse.json(
        {
          error: 'Adopting an existing timetable into version control is not available yet. Contact your platform administrator.',
          code: 'ADOPT_NOT_PERMITTED',
        },
        { status: 403 }
      );
    }

    const existing = await db.timetableVersion.count({ where: { schoolId } });
    const unversioned = await db.schedule.count({ where: { schoolId, OR: [{ timetableVersionId: null }, { timetableVersionId: { isSet: false } }] } });
    if (existing > 0 && unversioned === 0) {
      return NextResponse.json(
        { error: 'This school already has versioned timetables and no loose rows to adopt.', code: 'NOTHING_TO_ADOPT' },
        { status: 409 }
      );
    }

    const { version, adoptedRows } = await createInitialVersion({
      schoolId,
      createdBy: actor,
      name: body.name,
      changeNotes: body.changeNotes,
    });

    return NextResponse.json({
      success: true,
      message: `Created ${version.name} v${version.version} (draft) and adopted ${adoptedRows} existing timetable row(s).`,
      version,
      adoptedRows,
    });
  }

  if (action === 'revise') {
    const sourceVersionId =
      String(body.sourceVersionId ?? '') || (await getPublishedVersion(schoolId))?.id || '';
    if (!sourceVersionId) {
      return NextResponse.json(
        { error: 'No source version given and this school has no published timetable to revise.' },
        { status: 400 }
      );
    }

    const result = await createRevision({
      schoolId,
      sourceVersionId,
      createdBy: actor,
      changeNotes: body.changeNotes,
      name: body.name,
    });
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    // Copy the source rows into the revision. The unique key includes
    // timetableVersionId, so these live alongside the originals and the
    // published timetable keeps serving unchanged.
    const rows = await db.schedule.findMany({
      where: { schoolId, timetableVersionId: result.source.id },
    });

    let copied = 0;
    for (const row of rows) {
      await db.schedule.create({
        data: {
          schoolId,
          timetableVersionId: result.revision.id,
          grade: row.grade,
          section: row.section,
          day: row.day,
          period: row.period,
          subject: row.subject,
          teacherId: row.teacherId,
          roomId: row.roomId,
          topic: row.topic,
          startTime: row.startTime,
          endTime: row.endTime,
        },
      });
      copied++;
    }

    await db.auditLog
      .create({
        data: {
          schoolId,
          actorId: request.headers.get('x-user-id') || 'unknown',
          actorRole: request.headers.get('x-user-role') || 'unknown',
          action: 'timetable.revise',
          entityType: 'TimetableVersion',
          entityId: result.revision.id,
          after: { basedOn: result.source.id, version: result.revision.version, copiedRows: copied },
          reason: body.changeNotes ? String(body.changeNotes) : null,
        },
      })
      .catch(() => null);

    return NextResponse.json({
      success: true,
      message: `Created v${result.revision.version} (draft) from v${result.source.version} with ${copied} row(s) copied. v${result.source.version} is unchanged.`,
      version: result.revision,
      copiedRows: copied,
      basedOn: { id: result.source.id, version: result.source.version, status: result.source.status },
    });
  }

  return NextResponse.json({ error: `Unknown action "${action}". Use "adopt" or "revise".` }, { status: 400 });
}
