import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * POST /api/ai-agent/confirm-draft
 * Confirm a draft pre-arranged substitution → moves status to ACCEPTED
 * Body: { requestId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { requestId } = await request.json();

    if (!requestId) {
      return NextResponse.json({ success: false, error: 'Missing requestId' }, { status: 400 });
    }

    // Get the draft request with its assignment
    const draftRequest = await db.substitutionRequest.findUnique({
      where: { id: requestId },
      include: {
        assignments: true,
        schedule: { include: { subject: true, grade: true, section: true, timeSlot: true, teacher: true } },
      },
    });

    if (!draftRequest) {
      return NextResponse.json({ success: false, error: 'Request not found' }, { status: 404 });
    }

    if (draftRequest.status !== 'DRAFT') {
      return NextResponse.json({ success: false, error: 'Request is not a draft' }, { status: 400 });
    }

    // Update request status to RESOLVED
    await db.substitutionRequest.update({
      where: { id: requestId },
      data: { status: 'RESOLVED' },
    });

    // Update assignment status to ACCEPTED
    for (const assignment of draftRequest.assignments) {
      if (assignment.status === 'DRAFT') {
        await db.substitutionAssignment.update({
          where: { id: assignment.id },
          data: { status: 'ACCEPTED', respondedAt: new Date() },
        });

        // Create notification for the substitute teacher
        await db.notification.create({
          data: {
            type: 'TEACHER_ASSIGNED',
            title: `Substitution Assignment Confirmed — ${draftRequest.schedule.subject.name}`,
            message: `You have been assigned as substitute for Grade ${draftRequest.schedule.grade.name} Section ${draftRequest.schedule.section.name} ${draftRequest.schedule.subject.name} on ${draftRequest.date} (${draftRequest.schedule.timeSlot.startTime}-${draftRequest.schedule.timeSlot.endTime}). Original teacher: ${draftRequest.schedule.teacher.name}.`,
            data: JSON.stringify({ assignmentId: assignment.id, requestId }),
            teacherId: assignment.substituteTeacherId,
            targetRole: 'TEACHER',
            assignmentId: assignment.id,
            substitutionRequestId: requestId,
          },
        });

        // Create admin notification
        await db.notification.create({
          data: {
            type: 'AI_AUTO_ASSIGNED',
            title: `Pre-arranged Substitution Confirmed — ${draftRequest.schedule.subject.name}`,
            message: `Pre-arranged substitute ${assignment.substituteTeacherId} confirmed for Grade ${draftRequest.schedule.grade.name} Section ${draftRequest.schedule.section.name}. Originally predicted absence for ${draftRequest.schedule.teacher.name}.`,
            targetRole: 'ADMIN',
            substitutionRequestId: requestId,
            assignmentId: assignment.id,
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        requestId,
        status: 'RESOLVED',
        assignmentsConfirmed: draftRequest.assignments.filter(a => a.status === 'DRAFT').length,
      },
    });
  } catch (error: any) {
    console.error('Confirm draft error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
