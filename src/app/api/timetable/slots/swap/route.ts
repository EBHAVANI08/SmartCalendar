import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { schoolId, firstSlotId, secondSlotId, actorId, reason } = await request.json();
  const slots = await db.timetableSlot.findMany({ where: { schoolId, id: { in: [firstSlotId, secondSlotId] } } });
  if (slots.length !== 2 || slots[0].timetableVersionId !== slots[1].timetableVersionId) return NextResponse.json({ error: 'Select two slots from the same timetable version.' }, { status: 400 });
  const [first, second] = slots; const temporaryPeriod = 10000 + first.period;
  try { await db.$transaction(async (tx) => { await tx.timetableSlot.update({ where: { id: first.id }, data: { dayOfWeek: 7, period: temporaryPeriod } }); await tx.timetableSlot.update({ where: { id: second.id }, data: { dayOfWeek: first.dayOfWeek, period: first.period } }); await tx.timetableSlot.update({ where: { id: first.id }, data: { dayOfWeek: second.dayOfWeek, period: second.period } }); await tx.auditLog.create({ data: { schoolId, actorId, actorRole: 'school', action: 'SWAP', entityType: 'TimetableVersion', entityId: first.timetableVersionId, before: { first, second }, reason } }); }); return NextResponse.json({ success: true }); }
  catch { return NextResponse.json({ error: 'Swap would create a class, teacher or room conflict.' }, { status: 409 }); }
}
