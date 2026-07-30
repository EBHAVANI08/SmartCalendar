import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { assignmentId, rejectionReason } = await req.json();
    if (!assignmentId) return NextResponse.json({ success: false, error: 'assignmentId required' }, { status: 400 });

    await db.substitution.update({
      where: { id: assignmentId },
      data: { status: 'pending', substituteId: null, reason: rejectionReason || 'Rejected' },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[REJECT ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}
