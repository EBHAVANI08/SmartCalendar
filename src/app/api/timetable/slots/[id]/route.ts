import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params; const { schoolId, actorId, reason, ...changes } = await request.json();
  const current = await db.timetableSlot.findFirst({ where: { id, schoolId } });
  if (!current) return NextResponse.json({ error: 'Slot not found' }, { status: 404 });
  const version = await db.timetableVersion.findUnique({ where: { id: current.timetableVersionId } });
  if (!version || !['draft', 'review'].includes(version.status)) return NextResponse.json({ error: 'This timetable version is not editable.' }, { status: 409 });
  try { const updated = await db.$transaction(async (tx) => { const slot = await tx.timetableSlot.update({ where: { id }, data: changes }); await tx.auditLog.create({ data: { schoolId, actorId, actorRole: 'school', action: 'UPDATE', entityType: 'TimetableSlot', entityId: id, before: current, after: slot, reason } }); return slot; }); return NextResponse.json({ success: true, slot: updated }); }
  catch { return NextResponse.json({ error: 'The requested move creates a class, teacher or room conflict.' }, { status: 409 }); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params; const { schoolId, actorId, reason } = await request.json(); const current = await db.timetableSlot.findFirst({ where: { id, schoolId } });
  if (!current) return NextResponse.json({ error: 'Slot not found' }, { status: 404 });
  const version = await db.timetableVersion.findUnique({ where: { id: current.timetableVersionId } }); if (!version || version.status !== 'draft') return NextResponse.json({ error: 'Only draft slots can be removed.' }, { status: 409 });
  await db.$transaction([db.timetableSlot.delete({ where: { id } }), db.auditLog.create({ data: { schoolId, actorId, actorRole: 'school', action: 'DELETE', entityType: 'TimetableSlot', entityId: id, before: current, reason } })]);
  return NextResponse.json({ success: true });
}
