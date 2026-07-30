import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { teacherId, type, startDate, endDate, reason } = body;

    if (!teacherId || !startDate || !endDate) {
      return NextResponse.json({ success: false, error: 'Teacher ID, start date, and end date are required' }, { status: 400 });
    }

    const leave = await db.leaveApplication.create({
      data: {
        teacherId,
        type: type || 'Casual Leave',
        startDate,
        endDate,
        reason: reason || 'Not specified',
        status: 'approved',
      },
    });

    return NextResponse.json({
      success: true,
      data: leave,
    });
  } catch (error) {
    console.error('[LEAVES APPLY ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed to apply leave' }, { status: 500 });
  }
}
