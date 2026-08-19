import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { fromId, toId, targetDay, targetPeriod, grade, section, schoolId } = await request.json();

    if (fromId && toId) {
      // Direct swap between two existing Schedule records
      const s1 = await db.schedule.findUnique({ where: { id: fromId }, include: { teacher: true } });
      const s2 = await db.schedule.findUnique({ where: { id: toId }, include: { teacher: true } });

      if (!s1 || !s2) {
        return NextResponse.json({ error: 'One or both schedule slots not found.' }, { status: 404 });
      }

      // Check teacher conflict for s1 moving to s2's slot
      if (s1.teacherId) {
        const c1 = await db.schedule.findFirst({
          where: {
            id: { notIn: [fromId, toId] },
            teacherId: s1.teacherId,
            day: s2.day,
            period: s2.period,
            schoolId: s1.schoolId,
          },
        });
        if (c1) {
          return NextResponse.json(
            { error: `Conflict: Teacher ${s1.teacher?.name || ''} is already teaching on ${s2.day} Period ${s2.period}.` },
            { status: 409 }
          );
        }
      }

      // Check teacher conflict for s2 moving to s1's slot
      if (s2.teacherId) {
        const c2 = await db.schedule.findFirst({
          where: {
            id: { notIn: [fromId, toId] },
            teacherId: s2.teacherId,
            day: s1.day,
            period: s1.period,
            schoolId: s2.schoolId,
          },
        });
        if (c2) {
          return NextResponse.json(
            { error: `Conflict: Teacher ${s2.teacher?.name || ''} is already teaching on ${s1.day} Period ${s1.period}.` },
            { status: 409 }
          );
        }
      }

      // Perform swap of day, period, startTime, endTime
      await db.$transaction([
        db.schedule.update({
          where: { id: fromId },
          data: {
            day: s2.day,
            period: s2.period,
            startTime: s2.startTime,
            endTime: s2.endTime,
          },
        }),
        db.schedule.update({
          where: { id: toId },
          data: {
            day: s1.day,
            period: s1.period,
            startTime: s1.startTime,
            endTime: s1.endTime,
          },
        }),
      ]);

      // Record in audit log
      if (s1.schoolId) {
        await db.auditLog.create({
          data: {
            schoolId: s1.schoolId,
            actorId: 'admin',
            actorRole: 'user',
            action: 'SWAP_PERIODS',
            entityType: 'Schedule',
            entityId: fromId,
            reason: `Swapped period ${s1.subject} (${s1.day} P${s1.period}) with ${s2.subject} (${s2.day} P${s2.period})`,
          },
        });
      }

      return NextResponse.json({ success: true, message: 'Periods swapped successfully!' });
    }

    if (fromId && targetDay && targetPeriod) {
      // Move s1 to a new target day + period (which might be currently empty)
      const s1 = await db.schedule.findUnique({ where: { id: fromId }, include: { teacher: true } });
      if (!s1) return NextResponse.json({ error: 'Source schedule slot not found.' }, { status: 404 });

      // Check if target slot has a schedule
      const existingAtTarget = await db.schedule.findFirst({
        where: {
          grade: grade || s1.grade,
          section: section || s1.section,
          day: targetDay,
          period: Number(targetPeriod),
          schoolId: schoolId || s1.schoolId,
        },
      });

      if (existingAtTarget) {
        // Perform swap
        return POST(
          new Request(request.url, {
            method: 'POST',
            body: JSON.stringify({ fromId, toId: existingAtTarget.id }),
          })
        );
      }

      // Check teacher conflict at target slot
      if (s1.teacherId) {
        const conflict = await db.schedule.findFirst({
          where: {
            id: { not: fromId },
            teacherId: s1.teacherId,
            day: targetDay,
            period: Number(targetPeriod),
            schoolId: s1.schoolId,
          },
        });
        if (conflict) {
          return NextResponse.json(
            { error: `Conflict: Teacher ${s1.teacher?.name || ''} is already teaching on ${targetDay} Period ${targetPeriod}.` },
            { status: 409 }
          );
        }
      }

      // Move to empty target slot
      const updated = await db.schedule.update({
        where: { id: fromId },
        data: {
          day: targetDay,
          period: Number(targetPeriod),
        },
      });

      return NextResponse.json({ success: true, message: 'Period moved successfully!', updated });
    }

    return NextResponse.json({ error: 'Invalid swap payload. Provide fromId and either toId or targetDay/targetPeriod.' }, { status: 400 });
  } catch (error) {
    console.error('Error swapping periods:', error);
    return NextResponse.json({ error: `Failed to swap periods: ${String(error)}` }, { status: 500 });
  }
}
