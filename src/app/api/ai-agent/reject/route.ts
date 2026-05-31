import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { assignmentId, rejectionReason } = await req.json();
    if (!assignmentId) return NextResponse.json({ success: false, error: 'assignmentId required' }, { status: 400 });

    await db.substitutionAssignment.update({
      where: { id: assignmentId },
      data: { status: 'REJECTED', rejectionReason: rejectionReason || 'Rejected' },
    });

    const assignment = await db.substitutionAssignment.findUnique({
      where: { id: assignmentId },
      include: { substitutionRequest: true },
    });

    if (assignment) {
      await db.substitutionRequest.update({
        where: { id: assignment.substitutionRequestId },
        data: { status: 'PENDING' },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[REJECT ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}
