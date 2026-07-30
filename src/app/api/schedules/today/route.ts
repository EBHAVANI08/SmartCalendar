import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    if (!date) {
      return NextResponse.json({ success: false, error: 'Date is required' }, { status: 400 });
    }

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeek = new Date(date + 'T00:00:00').getDay();
    const dayName = days[dayOfWeek] || 'Monday';

    const schedules = await db.schedule.findMany({
      where: { day: dayName },
      include: { teacher: true },
      orderBy: { period: 'asc' },
    });

    const substitutions = await db.substitution.findMany({
      where: { date },
      include: { absentTeacher: true, substitute: true },
    });

    return NextResponse.json({ success: true, data: { schedules, substitutions } });
  } catch (error) {
    console.error('[SCHEDULES TODAY ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}
