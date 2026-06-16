import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Admin manual substitution creation
 * Creates a new Substitution record directly (already resolved)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { scheduleId, date, substituteTeacherId, assignedBy, topic, reason } = body;

    if (!scheduleId || !date || !substituteTeacherId) {
      return NextResponse.json(
        { success: false, error: 'scheduleId, date, and substituteTeacherId are required' },
        { status: 400 }
      );
    }

    const schedule = await db.schedule.findUnique({ where: { id: scheduleId }, include: { teacher: true } });
    if (!schedule) {
      return NextResponse.json({ success: false, error: 'Schedule not found' }, { status: 404 });
    }
    if (!schedule.teacherId) {
      return NextResponse.json({ success: false, error: 'This schedule has no assigned teacher' }, { status: 400 });
    }

    // Check for an existing unresolved substitution for this slot/date
    const existing = await db.substitution.findFirst({
      where: { date, period: schedule.period, grade: schedule.grade, section: schedule.section, status: { in: ['pending', 'assigned', 'completed'] } },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'A substitution request already exists for this schedule and date' },
        { status: 409 }
      );
    }

    const substitution = await db.substitution.create({
      data: {
        date,
        period: schedule.period,
        absentTeacherId: schedule.teacherId,
        substituteId: substituteTeacherId,
        grade: schedule.grade,
        section: schedule.section,
        subject: schedule.subject,
        reason: reason || 'Manual assignment',
        todayTopic: topic || schedule.topic,
        source: 'manual',
        status: 'completed',
      },
    });

    const substituteTeacher = await db.teacher.findUnique({ where: { id: substituteTeacherId } });

    if (substituteTeacher) {
      await db.teacherNotification.create({
        data: {
          type: 'lesson_plan',
          referenceId: substitution.id,
          teacherId: substituteTeacherId,
          sentBy: assignedBy || 'admin',
          title: `Substitution Assignment - ${schedule.subject}`,
          description: `You have been assigned to take ${schedule.subject} for ${schedule.grade} Section ${schedule.section} on ${date} from ${schedule.startTime} to ${schedule.endTime}. Original teacher: ${schedule.teacher?.name}. Topic: ${topic || schedule.topic || 'As per plan'}`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        substitutionId: substitution.id,
        status: 'completed',
        substituteTeacher: substituteTeacher?.name,
        subject: schedule.subject,
        grade: schedule.grade,
        section: schedule.section,
      },
    });
  } catch (error) {
    console.error('[ADMIN CREATE SUBSTITUTION ERROR]', error);
    const message = error instanceof Error ? error.message : 'Failed to create substitution';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
