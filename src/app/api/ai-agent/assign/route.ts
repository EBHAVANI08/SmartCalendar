import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { requestId, teacherId, assignedBy } = await req.json();
    if (!requestId || !teacherId) return NextResponse.json({ success: false, error: 'requestId and teacherId required' }, { status: 400 });

    const substitution = await db.substitution.findUnique({ where: { id: requestId }, include: { absentTeacher: true } });
    if (!substitution) return NextResponse.json({ success: false, error: 'Request not found' }, { status: 404 });

    const updated = await db.substitution.update({
      where: { id: requestId },
      data: { substituteId: teacherId, status: 'completed', source: assignedBy === 'AI_AGENT' ? 'ai-agent' : 'manual' },
    });

    await db.teacherNotification.create({
      data: {
        type: 'lesson_plan',
        referenceId: updated.id,
        teacherId,
        sentBy: assignedBy || 'admin',
        title: `Substitution Assignment - ${substitution.subject}`,
        description: `You have been assigned as substitute for ${substitution.grade} Section ${substitution.section} ${substitution.subject} class on ${substitution.date} (Period ${substitution.period}). Original teacher: ${substitution.absentTeacher.name}. Topic: ${substitution.todayTopic || 'N/A'}`,
      },
    });

    return NextResponse.json({ success: true, data: { assignmentId: updated.id } });
  } catch (error) {
    console.error('[AI ASSIGN ERROR]', error);
    return NextResponse.json({ success: false, error: 'Assignment failed' }, { status: 500 });
  }
}
