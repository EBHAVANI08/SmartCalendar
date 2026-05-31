import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sectionId = searchParams.get('sectionId');
    const startDateParam = searchParams.get('startDate');

    if (!sectionId) {
      return NextResponse.json({ success: false, error: 'Section ID required' }, { status: 400 });
    }

    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const weekData: Record<string, any> = {};

    for (let day = 1; day <= 5; day++) {
      const schedules = await db.schedule.findMany({
        where: { sectionId, dayOfWeek: day },
        include: { subject: true, teacher: true, timeSlot: true },
        orderBy: { timeSlot: { order: 'asc' } },
      });

      weekData[dayNames[day - 1]] = {
        dayOfWeek: day,
        schedules: schedules.map(s => ({
          timeSlotName: s.timeSlot.name,
          startTime: s.timeSlot.startTime,
          endTime: s.timeSlot.endTime,
          subjectName: s.subject.name,
          subjectColor: s.subject.color,
          teacherName: s.teacher.name,
          topic: s.topic,
        })),
      };
    }

    return NextResponse.json({ success: true, data: weekData });
  } catch (error) {
    console.error('[SCHEDULES WEEK ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}
