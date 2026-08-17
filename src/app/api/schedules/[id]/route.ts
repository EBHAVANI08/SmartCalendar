import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { subject, teacherId, roomId, startTime, endTime, topic } = await request.json();
    const current = await db.schedule.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ error: 'Timetable period not found.' }, { status: 404 });
    if (!subject?.trim() || !startTime || !endTime) return NextResponse.json({ error: 'Subject, start time and end time are required.' }, { status: 400 });
    if (startTime >= endTime) return NextResponse.json({ error: 'End time must be later than start time.' }, { status: 400 });
    if (teacherId) {
      const conflict = await db.schedule.findFirst({ where: { id: { not: id }, teacherId, day: current.day, period: current.period, schoolId: current.schoolId } });
      if (conflict) return NextResponse.json({ error: `Teacher is already assigned to ${conflict.grade} ${conflict.section} during this period.` }, { status: 409 });
      const weekly = await db.schedule.findMany({ where: { id: { not: id }, teacherId, schoolId: current.schoolId }, select: { day: true } });
      const loadByDay = weekly.reduce<Record<string, number>>((counts, item) => { counts[item.day] = (counts[item.day] || 0) + 1; return counts; }, {});
      const currentLoad = loadByDay[current.day] || 0;
      const dayLimit = current.day === 'Saturday' ? 4 : 8;
      if (currentLoad >= dayLimit) return NextResponse.json({ error: `Teacher has reached the ${dayLimit}-period limit for ${current.day}.` }, { status: 409 });
      const anotherFullDay = Object.entries(loadByDay).find(([day, count]) => day !== current.day && day !== 'Saturday' && count > 5);
      if (current.day !== 'Saturday' && currentLoad + 1 > 5 && anotherFullDay) return NextResponse.json({ error: `Teacher already has a full-load day on ${anotherFullDay[0]}. Only one day per week may exceed 5 periods.` }, { status: 409 });
    }
    const updated = await db.schedule.update({ where: { id }, data: { subject: subject.trim(), teacherId: teacherId || null, roomId: roomId?.trim() || null, startTime, endTime, topic: topic?.trim() || null }, include: { teacher: true } });
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: `Failed to update timetable period: ${String(error)}` }, { status: 500 });
  }
}
