import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { requestId, teacherId, assignedBy } = await req.json();
    if (!requestId || !teacherId) return NextResponse.json({ success: false, error: 'requestId and teacherId required' }, { status: 400 });

    const substitution = await db.substitution.findUnique({
      where: { id: requestId },
    });

    if (!substitution) return NextResponse.json({ success: false, error: 'Request not found' }, { status: 404 });

    const updated = await db.substitution.update({
      where: { id: requestId },
      data: {
        substituteId: teacherId,
        status: 'assigned',
        source: assignedBy || 'ADMIN',
      },
    });

    await db.teacherNotification.create({
      data: {
        type: 'curriculum',
        title: `Substitution Assignment - ${substitution.subject}`,
        description: `You have been assigned to take ${substitution.subject} for Grade ${substitution.grade} ${substitution.section} on ${substitution.date}.`,
        teacherId,
        referenceId: requestId,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('[AI ASSIGN ERROR]', error);
    return NextResponse.json({ success: false, error: 'Assignment failed' }, { status: 500 });
  }
}
