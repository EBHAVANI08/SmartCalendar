import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { teacherId, scheduleId } = await request.json();

    if (!teacherId || !scheduleId) {
      return NextResponse.json({ error: 'teacherId and scheduleId are required' }, { status: 400 });
    }

    const teacher = await db.teacher.findUnique({ where: { id: teacherId } });
    if (!teacher) {
      return NextResponse.json({ error: 'Teacher not found' }, { status: 404 });
    }

    const schedule = await db.schedule.findUnique({ where: { id: scheduleId } });
    if (!schedule) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
    }

    const updated = await db.schedule.update({
      where: { id: scheduleId },
      data: { teacherId },
      include: { teacher: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error assigning teacher:', error);
    return NextResponse.json({ error: 'Failed to assign teacher' }, { status: 500 });
  }
}
