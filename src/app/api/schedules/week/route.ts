import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const section = searchParams.get('section') || searchParams.get('sectionId');
    const grade = searchParams.get('grade');

    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const weekData: Record<string, any> = {};

    for (const day of dayNames) {
      const schedules = await db.schedule.findMany({
        where: {
          day,
          ...(section ? { section } : {}),
          ...(grade ? { grade } : {}),
        },
        include: { teacher: true },
        orderBy: { period: 'asc' },
      });

      weekData[day] = {
        day,
        schedules: schedules.map(s => ({
          period: s.period,
          startTime: s.startTime,
          endTime: s.endTime,
          subjectName: s.subject,
          teacherName: s.teacher?.name || 'Unassigned',
          grade: s.grade,
          section: s.section,
          topic: s.topic,
        })),
      };
    }

    return NextResponse.json({ success: true, data: weekData });
  } catch (error) {
    console.error('[SCHEDULES WEEK ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch weekly schedule' }, { status: 500 });
  }
}
