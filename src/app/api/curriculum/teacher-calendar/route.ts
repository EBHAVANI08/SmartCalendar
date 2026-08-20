import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const teacherId = searchParams.get('teacherId');
    const curriculumId = searchParams.get('curriculumId');

    if (!teacherId) {
      return NextResponse.json(
        { success: false, error: 'teacherId query parameter is required' },
        { status: 400 },
      );
    }

    const teacher = await db.teacher.findUnique({
      where: { id: teacherId },
      include: {
        schedules: {
          orderBy: [{ day: 'asc' }, { period: 'asc' }],
        },
        lessonPlans: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!teacher) {
      return NextResponse.json(
        { success: false, error: 'Teacher not found' },
        { status: 404 },
      );
    }

    const curriculum = curriculumId
      ? await db.curriculum.findUnique({ where: { id: curriculumId } })
      : await db.curriculum.findFirst();

    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const weeklyCalendar: Record<string, Array<Record<string, unknown>>> = {};

    for (const day of dayNames) {
      const daySchedules = teacher.schedules.filter(s => s.day === day);
      weeklyCalendar[day] = [];

      for (const s of daySchedules) {
        const plan = teacher.lessonPlans.find(
          lp => lp.grade === s.grade && lp.subject === s.subject,
        );

        weeklyCalendar[day].push({
          scheduleId: s.id,
          day: s.day,
          period: s.period,
          subject: s.subject,
          grade: s.grade,
          section: s.section,
          startTime: s.startTime,
          endTime: s.endTime,
          topic: s.topic || plan?.topic || `${s.subject} Unit`,
          lessonPlan: plan ? {
            id: plan.id,
            topic: plan.topic,
            objectives: JSON.parse(plan.objectives || '[]'),
            planContent: JSON.parse(plan.planContent || '{}'),
          } : null,
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        teacher: {
          id: teacher.id,
          name: teacher.name,
          subject: teacher.subject,
          grades: JSON.parse(teacher.grades || '[]'),
        },
        curriculum: curriculum ? {
          id: curriculum.id,
          name: curriculum.name,
          board: curriculum.board,
        } : null,
        weeklyCalendar,
        totalClassesPerWeek: teacher.schedules.length,
      },
    });
  } catch (error) {
    console.error('[CURRICULUM_TEACHER_CALENDAR_ERROR]', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch curriculum teacher calendar' },
      { status: 500 },
    );
  }
}
