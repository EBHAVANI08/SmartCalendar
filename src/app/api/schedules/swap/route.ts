import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    let { fromId, toId, fromDay, fromPeriod, toDay, toPeriod, targetDay, targetPeriod, grade = 'Grade 10', section = 'A', schoolId } = body;

    if (targetDay !== undefined) toDay = targetDay;
    if (targetPeriod !== undefined) toPeriod = targetPeriod;

    // Helper: find or create schedule slot by day + period coordinates
    const ensureSlot = async (day: string, period: number) => {
      let slot = await db.schedule.findFirst({
        where: { grade, section, day, period: Number(period) },
        include: { teacher: true },
      });
      if (!slot) {
        slot = await db.schedule.create({
          data: {
            grade,
            section,
            day,
            period: Number(period),
            subject: 'Free Period / Library',
            startTime: '08:00',
            endTime: '08:45',
            roomId: `R-${grade.replace(/\D/g, '')}${section}`,
          },
          include: { teacher: true },
        });
      }
      return slot;
    };

    // If IDs are missing, find or create the slots by coordinates
    if (!fromId && fromDay && fromPeriod) {
      const sFrom = await ensureSlot(fromDay, Number(fromPeriod));
      fromId = sFrom.id;
    }
    if (!toId && toDay && toPeriod) {
      const sTo = await ensureSlot(toDay, Number(toPeriod));
      toId = sTo.id;
    }

    if (fromId && toId) {
      const s1 = await db.schedule.findUnique({ where: { id: fromId }, include: { teacher: true } });
      const s2 = await db.schedule.findUnique({ where: { id: toId }, include: { teacher: true } });

      if (!s1 || !s2) {
        return NextResponse.json({ error: 'One or both schedule slots not found.' }, { status: 404 });
      }

      // Swap subject, teacherId, roomId, topic between s1 and s2
      await db.schedule.update({
        where: { id: s1.id },
        data: {
          subject: s2.subject,
          teacherId: s2.teacherId,
          roomId: s2.roomId,
          topic: s2.topic,
        },
      });

      await db.schedule.update({
        where: { id: s2.id },
        data: {
          subject: s1.subject,
          teacherId: s1.teacherId,
          roomId: s1.roomId,
          topic: s1.topic,
        },
      });

      return NextResponse.json({
        success: true,
        message: `Swapped ${s1.day} P${s1.period} (${s1.subject}) ↔ ${s2.day} P${s2.period} (${s2.subject})`,
      });
    }

    return NextResponse.json({ error: 'Invalid swap payload. Provide valid coordinates or slot IDs.' }, { status: 400 });
  } catch (error) {
    console.error('Error swapping periods:', error);
    return NextResponse.json({ error: `Failed to swap periods: ${String(error)}` }, { status: 500 });
  }
}
