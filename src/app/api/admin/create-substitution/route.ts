import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { scheduleId, date, substituteTeacherId, assignedBy, reason } = body;

    if (!scheduleId || !date || !substituteTeacherId) {
      return NextResponse.json(
        { success: false, error: 'scheduleId, date, and substituteTeacherId are required' },
        { status: 400 }
      );
    }

    const schedule = await db.schedule.findUnique({
      where: { id: scheduleId },
      include: { teacher: true },
    });

    if (!schedule) {
      return NextResponse.json({ success: false, error: 'Schedule not found' }, { status: 404 });
    }

    const substitution = await db.substitution.create({
      data: {
        date,
        period: schedule.period,
        absentTeacherId: schedule.teacherId || '',
        substituteId: substituteTeacherId,
        grade: schedule.grade,
        section: schedule.section,
        subject: schedule.subject,
        reason: reason || 'MANUAL_ASSIGN',
        source: assignedBy || 'ADMIN',
        status: 'assigned',
      },
    });

    await db.teacherNotification.create({
      data: {
        type: 'curriculum',
        title: `Substitution Assignment - ${schedule.subject}`,
        description: `Manual assignment for Grade ${schedule.grade} ${schedule.section} on ${date}`,
        teacherId: substituteTeacherId,
        referenceId: substitution.id,
      },
    });

    return NextResponse.json({ success: true, data: substitution });
  } catch (error) {
    console.error('[ADMIN CREATE SUBSTITUTION ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed to create substitution' }, { status: 500 });
  }
}
