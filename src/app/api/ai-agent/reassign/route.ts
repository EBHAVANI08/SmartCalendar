import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { requestId, newTeacherId, assignedBy } = await req.json();
    if (!requestId || !newTeacherId) {
      return NextResponse.json({ success: false, error: 'requestId and newTeacherId required' }, { status: 400 });
    }

    const request = await db.substitutionRequest.findUnique({
      where: { id: requestId },
      include: {
        schedule: { include: { subject: true, grade: true, section: true, timeSlot: true, teacher: true } },
        assignments: { include: { substituteTeacher: true } },
      },
    });

    if (!request) {
      return NextResponse.json({ success: false, error: 'Substitution request not found' }, { status: 404 });
    }

    // Find the current active assignment
    const currentAssignment = request.assignments.find(
      a => a.status === 'ACCEPTED' || a.status === 'PENDING'
    );

    const previousTeacherName = currentAssignment?.substituteTeacher?.name || 'Unknown';

    // Deactivate existing assignments
    await db.substitutionAssignment.updateMany({
      where: { substitutionRequestId: requestId, status: { in: ['ACCEPTED', 'PENDING'] } },
      data: {
        status: 'REJECTED',
        rejectionReason: `Reassigned by ${assignedBy || 'ADMIN'} — replaced with different substitute`,
      },
    });

    // Create new assignment
    const newAssignment = await db.substitutionAssignment.create({
      data: {
        substitutionRequestId: requestId,
        substituteTeacherId: newTeacherId,
        status: 'ACCEPTED',
        assignedBy: assignedBy || 'ADMIN',
        topic: request.schedule.topic,
      },
    });

    // Ensure request is still resolved
    await db.substitutionRequest.update({
      where: { id: requestId },
      data: { status: 'RESOLVED' },
    });

    // Notify the new substitute teacher
    await db.notification.create({
      data: {
        type: 'REASSIGNED_SUBSTITUTE',
        title: `Substitution Reassignment - ${request.schedule.subject.name}`,
        message: `You have been assigned as substitute for Grade ${request.schedule.grade.name} Section ${request.schedule.section.name} ${request.schedule.subject.name} class on ${request.date} (${request.schedule.timeSlot.startTime}-${request.schedule.timeSlot.endTime}). Original teacher: ${request.schedule.teacher.name}. Topic: ${request.schedule.topic || 'N/A'}`,
        teacherId: newTeacherId,
        targetRole: 'TEACHER',
        assignmentId: newAssignment.id,
        substitutionRequestId: requestId,
      },
    });

    // Notify the previous substitute teacher about reassignment
    if (currentAssignment?.substituteTeacherId) {
      await db.notification.create({
        data: {
          type: 'SUBSTITUTION_CHANGED',
          title: `Substitution Changed - ${request.schedule.subject.name}`,
          message: `Your substitution assignment for Grade ${request.schedule.grade.name} Section ${request.schedule.section.name} ${request.schedule.subject.name} class on ${request.date} has been reassigned by the admin. No action required from you.`,
          teacherId: currentAssignment.substituteTeacherId,
          targetRole: 'TEACHER',
          substitutionRequestId: requestId,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        assignmentId: newAssignment.id,
        previousTeacher: previousTeacherName,
        message: `Substitute changed from ${previousTeacherName} to new teacher`,
      },
    });
  } catch (error) {
    console.error('[REASSIGN ERROR]', error);
    return NextResponse.json({ success: false, error: 'Reassignment failed' }, { status: 500 });
  }
}
