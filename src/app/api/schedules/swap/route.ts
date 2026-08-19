import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { fromId, toId, targetDay, targetPeriod, grade, section, schoolId } = body;

    // ── Case 1: swap two existing schedule records ──────────────────────────
    if (fromId && toId) {
      const s1 = await db.schedule.findUnique({ where: { id: fromId }, include: { teacher: true } });
      const s2 = await db.schedule.findUnique({ where: { id: toId },   include: { teacher: true } });

      if (!s1 || !s2) {
        return NextResponse.json({ error: 'One or both schedule slots not found.' }, { status: 404 });
      }

      // Teacher conflict checks
      if (s1.teacherId) {
        const c1 = await db.schedule.findFirst({
          where: { id: { notIn: [fromId, toId] }, teacherId: s1.teacherId, day: s2.day, period: s2.period, schoolId: s1.schoolId },
        });
        if (c1) return NextResponse.json({ error: `Conflict: ${s1.teacher?.name || 'Teacher'} already teaches on ${s2.day} P${s2.period}.` }, { status: 409 });
      }
      if (s2.teacherId) {
        const c2 = await db.schedule.findFirst({
          where: { id: { notIn: [fromId, toId] }, teacherId: s2.teacherId, day: s1.day, period: s1.period, schoolId: s2.schoolId },
        });
        if (c2) return NextResponse.json({ error: `Conflict: ${s2.teacher?.name || 'Teacher'} already teaches on ${s1.day} P${s1.period}.` }, { status: 409 });
      }

      // 3-step swap to avoid unique constraint collision:
      // Step 1 – park s1 on a temporary sentinel day so the unique slot is free
      const tmpDay = `__swap_${fromId}`;
      await db.schedule.update({ where: { id: fromId }, data: { day: tmpDay, period: 0 } });
      // Step 2 – move s2 into s1's original slot
      await db.schedule.update({
        where: { id: toId },
        data: { day: s1.day, period: s1.period, startTime: s1.startTime, endTime: s1.endTime },
      });
      // Step 3 – move s1 from temp into s2's original slot
      await db.schedule.update({
        where: { id: fromId },
        data: { day: s2.day, period: s2.period, startTime: s2.startTime, endTime: s2.endTime },
      });

      // Audit log
      if (s1.schoolId) {
        await db.auditLog.create({
          data: {
            schoolId: s1.schoolId,
            actorId: 'admin',
            actorRole: 'user',
            action: 'SWAP_PERIODS',
            entityType: 'Schedule',
            entityId: fromId,
            reason: `Swapped ${s1.subject} (${s1.day} P${s1.period}) ↔ ${s2.subject} (${s2.day} P${s2.period})`,
          },
        });
      }

      return NextResponse.json({ success: true, message: 'Periods swapped successfully!' });
    }

    // ── Case 2: move one record to a target slot (may be occupied or empty) ──
    if (fromId && targetDay !== undefined && targetPeriod !== undefined) {
      const s1 = await db.schedule.findUnique({ where: { id: fromId }, include: { teacher: true } });
      if (!s1) return NextResponse.json({ error: 'Source schedule slot not found.' }, { status: 404 });

      // If target slot is occupied, delegate to Case 1
      const existingAtTarget = await db.schedule.findFirst({
        where: {
          grade:     grade    || s1.grade,
          section:   section  || s1.section,
          day:       targetDay,
          period:    Number(targetPeriod),
          schoolId:  schoolId || s1.schoolId,
        },
      });
      if (existingAtTarget) {
        return POST(new Request(request.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fromId, toId: existingAtTarget.id }),
        }));
      }

      // Teacher conflict check for empty target
      if (s1.teacherId) {
        const conflict = await db.schedule.findFirst({
          where: { id: { not: fromId }, teacherId: s1.teacherId, day: targetDay, period: Number(targetPeriod), schoolId: s1.schoolId },
        });
        if (conflict) return NextResponse.json({ error: `Conflict: ${s1.teacher?.name || 'Teacher'} already teaches on ${targetDay} P${targetPeriod}.` }, { status: 409 });
      }

      // Move to empty slot
      const updated = await db.schedule.update({
        where: { id: fromId },
        data: { day: targetDay, period: Number(targetPeriod) },
      });
      return NextResponse.json({ success: true, message: 'Period moved successfully!', updated });
    }

    return NextResponse.json({ error: 'Invalid swap payload. Provide fromId and either toId or targetDay/targetPeriod.' }, { status: 400 });
  } catch (error) {
    console.error('Error swapping periods:', error);
    return NextResponse.json({ error: `Failed to swap periods: ${String(error)}` }, { status: 500 });
  }
}
