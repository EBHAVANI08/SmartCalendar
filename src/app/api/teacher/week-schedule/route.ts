import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const teacherId = req.nextUrl.searchParams.get('teacherId');
    if (!teacherId) return NextResponse.json({ success: false, error: 'teacherId required' }, { status: 400 });

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const weekSchedule: Record<string, any[]> = {};

    for (const day of days) {
      const schedules = await db.schedule.findMany({
        where: { teacherId, day },
        orderBy: { period: 'asc' },
      });
      weekSchedule[day] = schedules;
    }

    return NextResponse.json({ success: true, data: { weekSchedule } });
  } catch (error) {
    console.error('[WEEK SCHEDULE ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}
