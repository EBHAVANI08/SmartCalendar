import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const assignmentId = searchParams.get('assignmentId');

    if (!assignmentId) {
      return NextResponse.json({ success: false, error: 'assignmentId required' }, { status: 400 });
    }

    const sub = await db.substitution.findUnique({
      where: { id: assignmentId },
      include: { absentTeacher: true, substitute: true },
    });

    if (!sub) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: sub.id,
        topicsCovered: [sub.todayTopic || 'Covered scheduled topics'],
        studentQuestions: ['No major issues reported'],
        areasOfDifficulty: [],
        classBehaviorNotes: sub.reason || 'Good behavior overall',
        completionPercentage: sub.status === 'completed' ? 100 : 80,
        subject: sub.subject,
        grade: sub.grade,
        section: sub.section,
        originalTeacher: sub.absentTeacher?.name || 'Original Teacher',
        substituteTeacher: sub.substitute?.name || 'Substitute Teacher',
        date: sub.date,
      },
    });
  } catch (error) {
    console.error('[POST_SUB_REPORT_GET_ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { assignmentId, classBehaviorNotes } = body;

    if (!assignmentId) {
      return NextResponse.json({ success: false, error: 'assignmentId required' }, { status: 400 });
    }

    const sub = await db.substitution.update({
      where: { id: assignmentId },
      data: {
        status: 'completed',
        reason: classBehaviorNotes || undefined,
      },
    });

    return NextResponse.json({ success: true, data: sub });
  } catch (error) {
    console.error('[POST_SUB_REPORT_POST_ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}
