import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const teacherId = req.nextUrl.searchParams.get('teacherId');
    const date = req.nextUrl.searchParams.get('date');

    if (!teacherId || !date) {
      return NextResponse.json({ success: false, error: 'teacherId and date required' }, { status: 400 });
    }

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeek = new Date(date + 'T00:00:00').getDay();
    const dayName = days[dayOfWeek] || 'Monday';

    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return NextResponse.json({ success: true, data: { schedules: [], substitutions: [], isWeekend: true } });
    }

    const schedules = await db.schedule.findMany({
      where: { teacherId, day: dayName },
      orderBy: { period: 'asc' },
    });

    const substitutions = await db.substitution.findMany({
      where: { substituteId: teacherId, date },
      include: { absentTeacher: true },
    });

    const notifications = await db.teacherNotification.findMany({
      where: { teacherId, isRead: false },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return NextResponse.json({
      success: true,
      data: {
        schedules,
        substitutions,
        notifications,
        isWeekend: false,
      },
    });
  } catch (error) {
    console.error('[TEACHER SCHEDULE ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed to load schedule' }, { status: 500 });
  }
}
