import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

/**
 * GET /api/teacher/full-calendar
 * Simplified flat-schema equivalent: returns the teacher's real weekly
 * schedule plus their lesson plans. The original quiz/homework recommendation
 * engine depended on a CurriculumSubject join table that does not exist in
 * the current schema, so that part is omitted rather than faked.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const teacherId = searchParams.get('teacherId');

    if (!teacherId) {
      return NextResponse.json({ success: false, error: 'teacherId query parameter is required' }, { status: 400 });
    }

    const teacher = await db.teacher.findUnique({ where: { id: teacherId } });
    if (!teacher) {
      return NextResponse.json({ success: false, error: 'Teacher not found' }, { status: 404 });
    }

    const schedules = await db.schedule.findMany({
      where: { teacherId },
      orderBy: [{ day: 'asc' }, { period: 'asc' }],
    });

    const lessonPlans = await db.lessonPlan.findMany({
      where: { teacherId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const weeklyCalendar: Record<number, Array<Record<string, unknown>>> = {};
    for (let day = 1; day <= 5; day++) {
      const dayName = DAY_NAMES[day];
      const daySchedules = schedules.filter(s => s.day === dayName);

      weeklyCalendar[day] = daySchedules.map(s => {
        const plan = lessonPlans.find(lp => lp.grade === s.grade && lp.section === s.section && lp.subject === s.subject);
        return {
          scheduleId: s.id,
          dayName,
          period: s.period,
          subject: s.subject,
          grade: s.grade,
          section: s.section,
          startTime: s.startTime,
          endTime: s.endTime,
          room: s.roomId,
          topic: s.topic,
          lessonPlan: plan ? {
            id: plan.id,
            topic: plan.topic,
            objectives: JSON.parse(plan.objectives || '[]'),
            warmUp: plan.warmUp,
            mainContent: plan.mainContent,
            differentiation: plan.differentiation,
            assessment: plan.assessment,
            homework: plan.homework,
          } : null,
        };
      });
    }

    const assignedGrades = [...new Set(schedules.map(s => s.grade))].sort();
    const assignedSubjects = [...new Set(schedules.map(s => s.subject))];
    const assignedSections = [...new Map(schedules.map(s => [`${s.grade}|${s.section}`, { grade: s.grade, section: s.section }])).values()];

    return NextResponse.json({
      success: true,
      data: {
        teacher: { id: teacher.id, name: teacher.name, email: teacher.email, subject: teacher.subject, role: teacher.role },
        weeklyCalendar,
        assignedGrades,
        assignedSubjects,
        assignedSections,
        totalClassesPerWeek: schedules.length,
        totalLessonPlans: lessonPlans.length,
      },
    });
  } catch (error) {
    console.error('[TEACHER_FULL_CALENDAR_ERROR]', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch teacher calendar' },
      { status: 500 },
    );
  }
}
