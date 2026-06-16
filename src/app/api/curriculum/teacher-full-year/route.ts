import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

/**
 * GET /api/curriculum/teacher-full-year
 * Simplified flat-schema equivalent: returns the teacher's weekly schedule
 * enriched with CurriculumTopic data where available, plus their lesson
 * plans. The original quiz-schedule/homework-recommendation engine depended
 * on a CurriculumSubject join table (with per subject+grade topic lists and
 * weekly hours) that does not exist in the current schema, so it is omitted
 * rather than faked.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const teacherId = searchParams.get('teacherId');
    const board = searchParams.get('board') || 'CBSE';

    if (!teacherId) {
      return NextResponse.json({ success: false, error: 'teacherId query parameter is required' }, { status: 400 });
    }

    const teacher = await db.teacher.findUnique({ where: { id: teacherId } });
    if (!teacher) {
      return NextResponse.json({ success: false, error: 'Teacher not found' }, { status: 404 });
    }

    const schedules = await db.schedule.findMany({ where: { teacherId }, orderBy: [{ day: 'asc' }, { period: 'asc' }] });
    const lessonPlans = await db.lessonPlan.findMany({ where: { teacherId }, orderBy: { createdAt: 'desc' }, take: 200 });

    const assignedGrades = [...new Set(schedules.map(s => s.grade))];
    const assignedSubjects = [...new Set(schedules.map(s => s.subject))];

    const curriculumTopics = await db.curriculumTopic.findMany({
      where: { board, grade: { in: assignedGrades }, subject: { in: assignedSubjects } },
      orderBy: { sequenceOrder: 'asc' },
    });

    const weeklyCalendar: Record<number, Array<Record<string, unknown>>> = {};
    for (let day = 1; day <= 5; day++) {
      const dayName = DAY_NAMES[day];
      const daySchedules = schedules.filter(s => s.day === dayName);

      weeklyCalendar[day] = daySchedules.map(s => {
        const plan = lessonPlans.find(lp => lp.grade === s.grade && lp.section === s.section && lp.subject === s.subject);
        const topics = curriculumTopics.filter(ct => ct.grade === s.grade && ct.subject === s.subject);
        return {
          scheduleId: s.id,
          dayName,
          period: s.period,
          subject: s.subject,
          grade: s.grade,
          section: s.section,
          startTime: s.startTime,
          endTime: s.endTime,
          topic: s.topic,
          curriculumTopics: topics.map(t => t.topic),
          lessonPlan: plan ? { id: plan.id, topic: plan.topic } : null,
        };
      });
    }

    const curriculumSubjectSummary = assignedSubjects.flatMap(subject =>
      assignedGrades
        .filter(grade => curriculumTopics.some(t => t.subject === subject && t.grade === grade))
        .map(grade => ({
          subjectName: subject,
          grade,
          topics: curriculumTopics.filter(t => t.subject === subject && t.grade === grade).map(t => t.topic),
        }))
    );

    return NextResponse.json({
      success: true,
      data: {
        teacher: { id: teacher.id, name: teacher.name, email: teacher.email, subject: teacher.subject },
        board,
        weeklyCalendar,
        assignedGrades,
        assignedSubjects,
        totalClassesPerWeek: schedules.length,
        totalLessonPlans: lessonPlans.length,
        curriculumSubjectSummary,
      },
    });
  } catch (error) {
    console.error('[CURRICULUM_TEACHER_FULL_YEAR_ERROR]', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch teacher full year calendar' },
      { status: 500 },
    );
  }
}
