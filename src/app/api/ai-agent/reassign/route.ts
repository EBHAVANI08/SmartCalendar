import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCapability } from '@/lib/authz';

export async function POST(req: NextRequest) {
  const denied = requireCapability(req, 'substitution.assign');
  if (denied) return denied;

  try {
    const { requestId, newTeacherId, assignedBy } = await req.json();
    if (!requestId || !newTeacherId) {
      return NextResponse.json({ success: false, error: 'requestId and newTeacherId required' }, { status: 400 });
    }

    const updated = await db.substitution.update({
      where: { id: requestId },
      data: {
        substituteId: newTeacherId,
        status: 'assigned',
        source: assignedBy || 'ADMIN',
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        assignmentId: updated.id,
        message: 'Substitute changed successfully',
      },
    });
  } catch (error) {
    console.error('[REASSIGN ERROR]', error);
    return NextResponse.json({ success: false, error: 'Reassignment failed' }, { status: 500 });
  }
}
