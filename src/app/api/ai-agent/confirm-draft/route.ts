import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * POST /api/ai-agent/confirm-draft
 * Confirms a pending substitution that already has a substitute assigned.
 * The flat schema has no separate DRAFT workflow; "pending with substituteId set"
 * is treated as the draft state, confirmed by moving status to completed.
 * Body: { requestId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { requestId } = await request.json();
    if (!requestId) {
      return NextResponse.json({ success: false, error: 'Missing requestId' }, { status: 400 });
    }

    const substitution = await db.substitution.findUnique({
      where: { id: requestId },
      include: { absentTeacher: true, substitute: true },
    });

    if (!substitution) {
      return NextResponse.json({ success: false, error: 'Request not found' }, { status: 404 });
    }
    if (!substitution.substituteId) {
      return NextResponse.json({ success: false, error: 'No substitute assigned to confirm' }, { status: 400 });
    }

    await db.substitution.update({ where: { id: requestId }, data: { status: 'completed' } });

    await db.teacherNotification.create({
      data: {
        type: 'lesson_plan',
        referenceId: requestId,
        teacherId: substitution.substituteId,
        sentBy: 'admin',
        title: `Substitution Assignment Confirmed - ${substitution.subject}`,
        description: `You have been assigned as substitute for ${substitution.grade} Section ${substitution.section} ${substitution.subject} on ${substitution.date} (Period ${substitution.period}). Original teacher: ${substitution.absentTeacher.name}.`,
      },
    });

    return NextResponse.json({
      success: true,
      data: { requestId, status: 'completed', assignmentsConfirmed: 1 },
    });
  } catch (error: any) {
    console.error('Confirm draft error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
