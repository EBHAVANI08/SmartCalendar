import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params; const { schoolId, actorId, name, effectiveFrom } = await request.json();
  const source = await db.timetableVersion.findFirst({ where: { id, schoolId } }); if (!source) return NextResponse.json({ error: 'Source version not found' }, { status: 404 });
  const slots = await db.timetableSlot.findMany({ where: { schoolId, timetableVersionId: id } }); const latest = await db.timetableVersion.findFirst({ where: { schoolId, academicYearId: source.academicYearId, name: name || source.name }, orderBy: { version: 'desc' } });
  const clone = await db.$transaction(async (tx) => { const version = await tx.timetableVersion.create({ data: { schoolId, academicYearId: source.academicYearId, academicTermId: source.academicTermId, campusId: source.campusId, name: name || source.name, timetableType: source.timetableType, version: (latest?.version || 0) + 1, status: 'draft', effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : source.effectiveFrom, basedOnId: source.id, generationConfig: source.generationConfig || undefined, createdBy: actorId } }); if (slots.length) await tx.timetableSlot.createMany({ data: slots.map((slot) => ({ schoolId, timetableVersionId: version.id, classSectionId: slot.classSectionId, subjectId: slot.subjectId, teacherId: slot.teacherId, roomId: slot.roomId, dayOfWeek: slot.dayOfWeek, period: slot.period, lessonType: slot.lessonType, topic: slot.topic, locked: slot.locked, fixedReason: slot.fixedReason, warnings: slot.warnings || undefined })) }); await tx.auditLog.create({ data: { schoolId, actorId, actorRole: 'school', action: 'CLONE', entityType: 'TimetableVersion', entityId: version.id, before: source, after: version } }); return version; });
  return NextResponse.json({ success: true, version: clone }, { status: 201 });
}
