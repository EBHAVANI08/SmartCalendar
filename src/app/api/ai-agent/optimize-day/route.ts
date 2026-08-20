import { NextRequest, NextResponse } from 'next/server';
import { optimizeDaySchedule } from '@/lib/services/day-optimizer';

/**
 * POST /api/ai-agent/optimize-day
 * Run the multi-constraint day optimizer.
 * Body: { date: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { date } = await request.json();
    if (!date) {
      return NextResponse.json({ success: false, error: 'Date is required' }, { status: 400 });
    }

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayIndex = new Date(date + 'T00:00:00').getDay();
    if (dayIndex === 0 || dayIndex === 6) {
      return NextResponse.json({ success: false, error: 'Cannot optimize weekends' }, { status: 400 });
    }

    const dayOfWeek = dayNames[dayIndex];
    const result = await optimizeDaySchedule({ date, dayOfWeek });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Optimize day error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
