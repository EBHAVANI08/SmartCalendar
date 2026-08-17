import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params; const { schoolId } = await request.json();
  if (!schoolId) return NextResponse.json({ error: 'schoolId is required' }, { status: 400 });
  const [version, requirements, bellSlots, slots] = await Promise.all([
    db.timetableVersion.findFirst({ where: { id, schoolId } }), db.subjectRequirement.findMany({ where: { timetableVersionId: id, schoolId } }),
    db.bellScheduleSlot.findMany({ where: { timetableVersionId: id, schoolId, slotType: 'teaching' } }), db.timetableSlot.findMany({ where: { timetableVersionId: id, schoolId } }),
  ]);
  if (!version) return NextResponse.json({ error: 'Timetable version not found' }, { status: 404 });
  const issues: { severity: string; code: string; dataset: string; message: string }[] = [];
  const capacityByClass = new Map<string, number>();
  const days = new Set(bellSlots.map((x) => x.dayOfWeek));
  for (const requirement of requirements) capacityByClass.set(requirement.classSectionId, (capacityByClass.get(requirement.classSectionId) || 0) + requirement.weeklyPeriods);
  for (const [classSectionId, required] of capacityByClass) {
    const available = bellSlots.length || (days.size ? days.size * 8 : 48);
    if (required > available) issues.push({ severity: 'error', code: 'CLASS_CAPACITY_SHORTAGE', dataset: 'SubjectRequirements', message: `Class ${classSectionId} requires ${required} periods but only ${available} teaching slots exist.` });
  }
  const assigned = new Map<string, number>();
  for (const slot of slots) if (slot.subjectId) assigned.set(`${slot.classSectionId}|${slot.subjectId}`, (assigned.get(`${slot.classSectionId}|${slot.subjectId}`) || 0) + 1);
  for (const requirement of requirements) {
    const count = assigned.get(`${requirement.classSectionId}|${requirement.subjectId}`) || 0;
    if (count < requirement.weeklyPeriods) issues.push({ severity: 'error', code: 'UNALLOCATED_PERIODS', dataset: 'TimetableSlots', message: `${requirement.weeklyPeriods - count} periods remain unallocated for class ${requirement.classSectionId}, subject ${requirement.subjectId}.` });
  }
  await db.$transaction([db.validationIssue.deleteMany({ where: { timetableVersionId: id, importBatchId: null } }), ...issues.map((issue) => db.validationIssue.create({ data: { schoolId, timetableVersionId: id, ...issue } }))]);
  return NextResponse.json({ success: true, blocking: issues.some((x) => x.severity === 'error'), summary: { requirements: requirements.length, teachingSlots: bellSlots.length, allocatedSlots: slots.length, errors: issues.filter((x) => x.severity === 'error').length, warnings: issues.filter((x) => x.severity === 'warning').length }, issues });
}
