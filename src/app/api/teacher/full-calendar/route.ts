import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const teacherId = searchParams.get('teacherId');

    if (!teacherId) {
      return NextResponse.json({ success: false, error: 'teacherId required' }, { status: 400 });
    }

    const teacher = await db.teacher.findUnique({
      where: { id: teacherId },
      include: { schedules: true, lessonPlans: true },
    });

    if (!teacher) {
      return NextResponse.json({ success: false, error: 'Teacher not found' }, { status: 404 });
    }

    const weeklyCalendar: Record<string, any[]> = {};
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

    for (const day of days) {
      weeklyCalendar[day] = teacher.schedules.filter(s => s.day === day);
    }

    return NextResponse.json({
      success: true,
      data: {
        teacher: {
          id: teacher.id,
          name: teacher.name,
          email: teacher.email,
          subject: teacher.subject,
          role: teacher.role,
        },
        weeklyCalendar,
        totalClassesPerWeek: teacher.schedules.length,
        totalLessonPlans: teacher.lessonPlans.length,
      },
    });
  } catch (error) {
    console.error('[TEACHER_FULL_CALENDAR_ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}
