import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { assignmentId, rejectionReason } = await req.json();
    if (!assignmentId) return NextResponse.json({ success: false, error: 'assignmentId required' }, { status: 400 });

    const substitution = await db.substitution.findUnique({ where: { id: assignmentId } });
    if (!substitution) return NextResponse.json({ success: false, error: 'Assignment not found' }, { status: 404 });

    // Flat schema's Substitution has no rejectionReason field; fold it into reason for visibility
    await db.substitution.update({
      where: { id: assignmentId },
      data: {
        substituteId: null,
        status: 'pending',
        reason: rejectionReason ? `${substitution.reason} (rejected: ${rejectionReason})` : substitution.reason,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[REJECT ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}
