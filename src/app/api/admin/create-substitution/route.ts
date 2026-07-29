import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Admin manual substitution creation
 * Creates a new substitution request + assignment directly
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

    // Get the schedule
    const schedule = await db.schedule.findUnique({
      where: { id: scheduleId },
      include: { subject: true, grade: true, section: true, timeSlot: true, teacher: true },
    });

    if (!schedule) {
      return NextResponse.json(
        { success: false, error: 'Schedule not found' },
        { status: 404 }
      );
    }

    // Check for existing substitution
    const existingRequest = await db.substitutionRequest.findFirst({
      where: { scheduleId, date, status: { in: ['PENDING', 'ASSIGNED', 'RESOLVED'] } },
    });

    if (existingRequest) {
      return NextResponse.json(
        { success: false, error: 'A substitution request already exists for this schedule and date' },
        { status: 409 }
      );
    }

    // Create the substitution request
    const subRequest = await db.substitutionRequest.create({
      data: {
        scheduleId,
        originalTeacherId: schedule.teacherId,
        subjectId: schedule.subjectId,
        date,
        reason: reason || 'MANUAL_ASSIGN',
        reasonDetail: `Manually assigned by ${assignedBy || 'admin'}`,
        status: 'RESOLVED',
        aiRecommendation: `Manual assignment by ${assignedBy || 'admin'}. Substitute: ${substituteTeacherId}`,
      },
    });

    // Create the assignment with ACCEPTED status
    const assignment = await db.substitutionAssignment.create({
      data: {
        substitutionRequestId: subRequest.id,
        substituteTeacherId,
        status: 'ACCEPTED',
        assignedBy: assignedBy || 'ADMIN',
        topic: topic || schedule.topic || `Manual substitution for ${schedule.subject.name}`,
      },
    });

    // Get teacher info for notification
    const substituteTeacher = await db.teacher.findUnique({
      where: { id: substituteTeacherId },
    });

    // Send notification to the substitute teacher
    if (substituteTeacher) {
      await db.notification.create({
        data: {
          type: 'TEACHER_ASSIGNED',
          title: `Substitution Assignment - ${schedule.subject.name}`,
          message: `You have been assigned to take ${schedule.subject.name} for Grade ${schedule.grade.name} Section ${schedule.section.name} on ${date} from ${schedule.timeSlot.startTime} to ${schedule.timeSlot.endTime}.\n\nOriginal teacher: ${schedule.teacher.name}\n📝 Topic: ${topic || schedule.topic || 'As per plan'}`,
          data: JSON.stringify({
            assignmentId: assignment.id,
            requestId: subRequest.id,
            scheduleId,
            subject: schedule.subject.name,
            grade: schedule.grade.name,
            section: schedule.section.name,
            time: `${schedule.timeSlot.startTime}-${schedule.timeSlot.endTime}`,
          }),
          teacherId: substituteTeacherId,
          targetRole: 'TEACHER',
          assignmentId: assignment.id,
          substitutionRequestId: subRequest.id,
        },
      });
    }

    // Notify admin
    await db.notification.create({
      data: {
        type: 'TEACHER_ASSIGNED',
        title: `Admin Manual Assignment - ${schedule.subject.name}`,
        message: `${assignedBy || 'Admin'} manually assigned ${substituteTeacher?.name || 'a teacher'} for ${schedule.subject.name} (Grade ${schedule.grade.name} Section ${schedule.section.name}) on ${date} ${schedule.timeSlot.startTime}-${schedule.timeSlot.endTime}. Original teacher: ${schedule.teacher.name}.`,
        data: JSON.stringify({
          requestId: subRequest.id,
          assignmentId: assignment.id,
          substituteTeacherId,
          scheduleId,
        }),
        targetRole: 'ADMIN',
        substitutionRequestId: subRequest.id,
        assignmentId: assignment.id,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        requestId: subRequest.id,
        assignmentId: assignment.id,
        status: 'RESOLVED',
        substituteTeacher: substituteTeacher?.name,
        subject: schedule.subject.name,
        grade: schedule.grade.name,
        section: schedule.section.name,
      },
    });
  } catch (error) {
    console.error('[ADMIN CREATE SUBSTITUTION ERROR]', error);
    const message = error instanceof Error ? error.message : 'Failed to create substitution';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
