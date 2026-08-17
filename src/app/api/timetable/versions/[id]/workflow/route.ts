import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const schema = z.object({ schoolId: z.string(), actorId: z.string(), actorRole: z.string(), action: z.enum(['submit', 'approve', 'reject', 'publish', 'archive']), note: z.string().optional() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params; const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid workflow request', details: parsed.error.flatten() }, { status: 400 });
  const { schoolId, actorId, actorRole, action, note } = parsed.data;
  const current = await db.timetableVersion.findFirst({ where: { id, schoolId } });
  if (!current) return NextResponse.json({ error: 'Timetable version not found' }, { status: 404 });
  const allowed: Record<string, string[]> = { draft: ['submit', 'archive'], review: ['approve', 'reject'], approved: ['publish', 'archive'], published: ['archive'] };
  if (!allowed[current.status]?.includes(action)) return NextResponse.json({ error: `Cannot ${action} a timetable in ${current.status} status.` }, { status: 409 });
  if (['approve', 'publish', 'archive'].includes(action) && !['admin', 'school'].includes(actorRole)) return NextResponse.json({ error: 'Administrator authority is required.' }, { status: 403 });
  const nextStatus = { submit: 'review', approve: 'approved', reject: 'draft', publish: 'published', archive: 'archived' }[action];
  const updated = await db.$transaction(async (tx) => {
    if (action === 'publish') {
      const blocking = await tx.validationIssue.count({ where: { timetableVersionId: id, severity: 'error', acknowledged: false } });
      if (blocking) throw new Error(`BLOCKING:${blocking}`);
      await tx.timetableVersion.updateMany({ where: { schoolId, academicYearId: current.academicYearId, status: 'published', NOT: { id } }, data: { status: 'archived' } });
    }
    const version = await tx.timetableVersion.update({ where: { id }, data: { status: nextStatus, approvedBy: action === 'approve' ? actorId : current.approvedBy, approvedAt: action === 'approve' ? new Date() : current.approvedAt, publishedBy: action === 'publish' ? actorId : current.publishedBy, publishedAt: action === 'publish' ? new Date() : current.publishedAt } });
    if (action === 'submit') await tx.approvalRequest.create({ data: { schoolId, entityType: 'TimetableVersion', entityId: id, requestedBy: actorId } });
    if (['approve', 'reject'].includes(action)) await tx.approvalRequest.updateMany({ where: { schoolId, entityType: 'TimetableVersion', entityId: id, status: 'pending' }, data: { status: action === 'approve' ? 'approved' : 'rejected', reviewedBy: actorId, reviewedAt: new Date(), reviewNote: note } });
    await tx.auditLog.create({ data: { schoolId, actorId, actorRole, action: action.toUpperCase(), entityType: 'TimetableVersion', entityId: id, before: current, after: version, reason: note } });
    return version;
  }).catch((error) => { if (String(error).includes('BLOCKING:')) return null; throw error; });
  if (!updated) return NextResponse.json({ error: 'Publication blocked by unresolved validation errors.' }, { status: 409 });
  return NextResponse.json({ success: true, version: updated });
}
