import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { teacherId, date, status, reason } = await req.json();
    if (!teacherId || !date || !status) {
      return NextResponse.json({ success: false, error: 'teacherId, date, status required' }, { status: 400 });
    }

    // Use Leave model instead of Attendance
    if (status === 'ABSENT') {
      await db.leave.create({
        data: { teacherId, type: 'Sick Leave', startDate: date, endDate: date, reason: reason || 'Marked absent', status: 'APPROVED' },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[ATTENDANCE MARK ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}
