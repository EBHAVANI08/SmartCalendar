import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCapability } from '@/lib/authz';

export const dynamic = 'force-dynamic';

const schema = z.object({
  action: z.enum(['submit', 'approve', 'reject', 'publish', 'archive']),
  note: z.string().optional(),
  changeNotes: z.string().optional(),
});

/**
 * Timetable lifecycle transitions:
 *   draft -> review -> approved -> published -> superseded/archived
 *
 * Publishing a new version supersedes the previous published one (recording
 * which version replaced it) rather than silently archiving it, so version
 * history stays traceable in both directions.
 *
 * Tenant and actor come from the verified session — they used to be read from
 * the request body, which let a caller act on another school's timetable.
 */
export async function POST(request: Request, context: {
 params: Promise<{ id: string }> }) {
  const denied = requireCapability(request, 'timetable.version.transition');
  if (denied) return denied;

  const { id } = await context.params;

  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }
  const actorId = request.headers.get('x-user-id') || 'unknown';
  const actorRole = request.headers.get('x-user-role') || 'unknown';

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid workflow request', details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { action, note, changeNotes } = parsed.data;

  const current = await db.timetableVersion.findFirst({ where: { id, schoolId } });
  if (!current) return NextResponse.json({ error: 'Timetable version not found' }, { status: 404 });

  const allowed: Record<string, string[]> = {
    draft: ['submit', 'approve', 'archive'],
    review: ['approve', 'reject', 'archive'],
    approved: ['publish', 'reject', 'archive'],
    published: ['archive'],
    superseded: ['archive'],
  };
  if (!allowed[current.status]?.includes(action)) {
    return NextResponse.json(
      { error: `Cannot ${action} a timetable in ${current.status} status.`, code: 'INVALID_TRANSITION' },
      { status: 409 }
    );
  }

  if (['approve', 'publish', 'archive'].includes(action) && !['admin', 'school', 'superadmin'].includes(actorRole)) {
    return NextResponse.json({ error: 'Administrator authority is required.' }, { status: 403 });
  }

  const nextStatus = {
    submit: 'review',
    approve: 'approved',
    reject: 'draft',
    publish: 'published',
    archive: 'archived',
  }[action];

  let supersededVersion: { id: string; version: number } | null = null;

  const updated = await db
    .$transaction(async (tx) => {
      if (action === 'publish') {
        // Errors block publication whether or not someone acknowledged them.
        // Acknowledgement exists for warnings; a hard constraint violation must
        // not become publishable because a button was clicked.
        const blocking = await tx.validationIssue.count({
          where: { timetableVersionId: id, severity: 'error' },
        });
        if (blocking) throw new Error(`BLOCKING:${blocking}`);

        // Supersede the outgoing published version, recording its replacement.
        const previous = await tx.timetableVersion.findFirst({
          where: { schoolId, status: 'published', NOT: { id } },
          orderBy: { version: 'desc' },
        });
        if (previous) {
          await tx.timetableVersion.update({
            where: { id: previous.id },
            data: { status: 'superseded', supersededById: id, supersededAt: new Date() },
          });
          supersededVersion = { id: previous.id, version: previous.version };
        }
      }

      const version = await tx.timetableVersion.update({
        where: { id },
        data: {
          status: nextStatus,
          ...(changeNotes ? { changeNotes } : {}),
          approvedBy: action === 'approve' ? actorId : current.approvedBy,
          approvedAt: action === 'approve' ? new Date() : current.approvedAt,
          publishedBy: action === 'publish' ? actorId : current.publishedBy,
          publishedAt: action === 'publish' ? new Date() : current.publishedAt,
        },
      });

      if (action === 'submit') {
        await tx.approvalRequest.create({
          data: { schoolId, entityType: 'TimetableVersion', entityId: id, requestedBy: actorId },
        });
      }
      if (['approve', 'reject'].includes(action)) {
        await tx.approvalRequest.updateMany({
          where: { schoolId, entityType: 'TimetableVersion', entityId: id, status: 'pending' },
          data: {
            status: action === 'approve' ? 'approved' : 'rejected',
            reviewedBy: actorId,
            reviewedAt: new Date(),
            reviewNote: note,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          schoolId,
          actorId,
          actorRole,
          action: `timetable.${action}`,
          entityType: 'TimetableVersion',
          entityId: id,
          before: { status: current.status, version: current.version },
          after: { status: nextStatus, version: version.version },
          reason: note ?? changeNotes ?? null,
        },
      });

      return version;
    })
    .catch((error) => {
      if (String(error).includes('BLOCKING:')) return null;
      throw error;
    });

  if (!updated) {
    return NextResponse.json(
      { error: 'Publication blocked by unresolved validation errors.', code: 'VALIDATION_BLOCKED' },
      { status: 409 }
    );
  }

  return NextResponse.json({ success: true, version: updated, superseded: supersededVersion });
}
