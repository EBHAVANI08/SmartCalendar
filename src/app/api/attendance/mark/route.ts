import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCapability } from '@/lib/authz';

export async function POST(req: NextRequest) {
  const denied = requireCapability(req, 'attendance.write');
  if (denied) return denied;

  try {
    const { teacherId, date, status, reason } = await req.json();
    if (!teacherId || !date || !status) {
      return NextResponse.json({ success: false, error: 'teacherId, date, status required' }, { status: 400 });
    }

    if (status === 'ABSENT') {
      await db.leaveApplication.create({
        data: {
          teacherId,
          leaveType: 'Sick Leave',
          startDate: date,
          endDate: date,
          reason: reason || 'Marked absent',
          status: 'approved',
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[ATTENDANCE MARK ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}
