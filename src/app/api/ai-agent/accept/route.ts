import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { assignmentId } = await req.json();
    if (!assignmentId) return NextResponse.json({ success: false, error: 'assignmentId required' }, { status: 400 });

    // Flat schema combines request + assignment into one Substitution row
    await db.substitution.update({
      where: { id: assignmentId },
      data: { status: 'completed' },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[ACCEPT ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}
