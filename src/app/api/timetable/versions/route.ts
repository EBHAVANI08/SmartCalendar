import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  schoolId: z.string().min(1), academicYearId: z.string().min(1), academicTermId: z.string().optional(),
  campusId: z.string().optional(), name: z.string().min(1), timetableType: z.string().default('regular'),
  effectiveFrom: z.string().datetime().optional(), effectiveTo: z.string().datetime().optional(),
  basedOnId: z.string().optional(), createdBy: z.string().min(1),
});

export async function GET(request: Request) {
  const url = new URL(request.url); const schoolId = url.searchParams.get('schoolId');
  if (!schoolId) return NextResponse.json({ error: 'schoolId is required' }, { status: 400 });
  const versions = await db.timetableVersion.findMany({ where: { schoolId }, orderBy: { updatedAt: 'desc' } });
  return NextResponse.json({ success: true, versions });
}

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid timetable version', details: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  const previous = await db.timetableVersion.findFirst({ where: { schoolId: input.schoolId, academicYearId: input.academicYearId, name: input.name }, orderBy: { version: 'desc' } });
  const created = await db.$transaction(async (tx) => {
    const version = await tx.timetableVersion.create({ data: { ...input, version: (previous?.version || 0) + 1, effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : null, effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null } });
    if (input.basedOnId) {
      const sourceSlots = await tx.timetableSlot.findMany({ where: { timetableVersionId: input.basedOnId, schoolId: input.schoolId } });
      if (sourceSlots.length) await tx.timetableSlot.createMany({ data: sourceSlots.map((slot) => ({
        schoolId: slot.schoolId, timetableVersionId: version.id, classSectionId: slot.classSectionId,
        subjectId: slot.subjectId, teacherId: slot.teacherId, roomId: slot.roomId, dayOfWeek: slot.dayOfWeek,
        period: slot.period, lessonType: slot.lessonType, topic: slot.topic, locked: slot.locked,
        fixedReason: slot.fixedReason, warnings: slot.warnings === null ? undefined : slot.warnings,
      })) });
    }
    await tx.auditLog.create({ data: { schoolId: input.schoolId, actorId: input.createdBy, actorRole: 'school', action: 'CREATE', entityType: 'TimetableVersion', entityId: version.id, after: version } });
    return version;
  });
  return NextResponse.json({ success: true, version: created }, { status: 201 });
}
