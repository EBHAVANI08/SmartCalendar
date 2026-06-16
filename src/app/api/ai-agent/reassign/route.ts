import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { requestId, newTeacherId, assignedBy } = await req.json();
    if (!requestId || !newTeacherId) {
      return NextResponse.json({ success: false, error: 'requestId and newTeacherId required' }, { status: 400 });
    }

    const substitution = await db.substitution.findUnique({
      where: { id: requestId },
      include: { absentTeacher: true, substitute: true },
    });

    if (!substitution) {
      return NextResponse.json({ success: false, error: 'Substitution request not found' }, { status: 404 });
    }

    const previousTeacherName = substitution.substitute?.name || 'Unknown';

    const updated = await db.substitution.update({
      where: { id: requestId },
      data: { substituteId: newTeacherId, status: 'completed', source: assignedBy === 'AI_AGENT' ? 'ai-agent' : 'manual' },
    });

    await db.teacherNotification.create({
      data: {
        type: 'lesson_plan',
        referenceId: updated.id,
        teacherId: newTeacherId,
        sentBy: assignedBy || 'admin',
        title: `Substitution Reassignment - ${substitution.subject}`,
        description: `You have been assigned as substitute for ${substitution.grade} Section ${substitution.section} ${substitution.subject} class on ${substitution.date} (Period ${substitution.period}). Original teacher: ${substitution.absentTeacher.name}. Topic: ${substitution.todayTopic || 'N/A'}`,
      },
    });

    if (substitution.substituteId) {
      await db.teacherNotification.create({
        data: {
          type: 'lesson_plan',
          referenceId: updated.id,
          teacherId: substitution.substituteId,
          sentBy: assignedBy || 'admin',
          title: `Substitution Changed - ${substitution.subject}`,
          description: `Your substitution assignment for ${substitution.grade} Section ${substitution.section} ${substitution.subject} class on ${substitution.date} has been reassigned by the admin. No action required from you.`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        assignmentId: updated.id,
        previousTeacher: previousTeacherName,
        message: `Substitute changed from ${previousTeacherName} to new teacher`,
      },
    });
  } catch (error) {
    console.error('[REASSIGN ERROR]', error);
    return NextResponse.json({ success: false, error: 'Reassignment failed' }, { status: 500 });
  }
}
