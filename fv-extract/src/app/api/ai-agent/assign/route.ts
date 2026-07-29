import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { requestId, teacherId, assignedBy } = await req.json();
    if (!requestId || !teacherId) return NextResponse.json({ success: false, error: 'requestId and teacherId required' }, { status: 400 });

    const request = await db.substitutionRequest.findUnique({
      where: { id: requestId },
      include: { schedule: { include: { subject: true, grade: true, section: true, timeSlot: true, teacher: true } } },
    });

    if (!request) return NextResponse.json({ success: false, error: 'Request not found' }, { status: 404 });

    // Deactivate any existing assignments
    await db.substitutionAssignment.updateMany({
      where: { substitutionRequestId: requestId, status: 'PENDING' },
      data: { status: 'REJECTED', rejectionReason: 'Replaced by admin assignment' },
    });

    const assignment = await db.substitutionAssignment.create({
      data: {
        substitutionRequestId: requestId,
        substituteTeacherId: teacherId,
        status: 'ACCEPTED',
        assignedBy: assignedBy || 'ADMIN',
        topic: request.schedule.topic,
      },
    });

    await db.substitutionRequest.update({
      where: { id: requestId },
      data: { status: 'RESOLVED' },
    });

    // Notify substitute teacher
    await db.notification.create({
      data: {
        type: 'MANUAL_ASSIGNED',
        title: `Substitution Assignment - ${request.schedule.subject.name}`,
        message: `You have been assigned as substitute for Grade ${request.schedule.grade.name} Section ${request.schedule.section.name} ${request.schedule.subject.name} class on ${request.date} (${request.schedule.timeSlot.startTime}-${request.schedule.timeSlot.endTime}). Original teacher: ${request.schedule.teacher.name}. Topic: ${request.schedule.topic || 'N/A'}`,
        teacherId,
        targetRole: 'TEACHER',
        assignmentId: assignment.id,
        substitutionRequestId: requestId,
      },
    });

    return NextResponse.json({ success: true, data: { assignmentId: assignment.id } });
  } catch (error) {
    console.error('[AI ASSIGN ERROR]', error);
    return NextResponse.json({ success: false, error: 'Assignment failed' }, { status: 500 });
  }
}
