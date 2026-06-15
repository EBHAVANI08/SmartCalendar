import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const teacherId = searchParams.get('teacherId');
    const curriculumId = searchParams.get('curriculumId');

    if (!teacherId || !curriculumId) {
      return NextResponse.json(
        { success: false, error: 'teacherId and curriculumId query parameters are required' },
        { status: 400 },
      );
    }

    const teacher = await db.teacher.findUnique({
      where: { id: teacherId },
      include: {
        teacherSubjects: { include: { subject: true } },
        schedules: {
          include: {
            subject: true,
            section: { include: { grade: true } },
            timeSlot: true,
            term: { include: { academicYear: true } },
          },
          orderBy: [{ dayOfWeek: 'asc' }, { timeSlot: { order: 'asc' } }],
        },
        lessonPlans: {
          where: { curriculumId },
          include: { subject: true },
          orderBy: [{ dayOfWeek: 'asc' }, { createdAt: 'desc' }],
        },
      },
    });

    if (!teacher) {
      return NextResponse.json(
        { success: false, error: 'Teacher not found' },
        { status: 404 },
      );
    }

    const curriculum = await db.curriculum.findUnique({
      where: { id: curriculumId },
      include: {
        subjects: {
          include: { subject: true },
          orderBy: [{ gradeLevel: 'asc' }, { subject: { name: 'asc' } }],
        },
      },
    });

    if (!curriculum) {
      return NextResponse.json(
        { success: false, error: 'Curriculum not found' },
        { status: 404 },
      );
    }

    // Build a map of curriculum subjects for quick lookup: key = "subjectId-gradeLevel"
    const curriculumMap = new Map<string, {
      topics: string[];
      learningObjectives: string[];
      assessmentCriteria: string[];
      weeklyHours: number | null;
    }>();

    for (const cs of curriculum.subjects) {
      curriculumMap.set(`${cs.subjectId}-${cs.gradeLevel}`, {
        topics: JSON.parse(cs.topics || '[]'),
        learningObjectives: JSON.parse(cs.learningObjectives || '[]'),
        assessmentCriteria: cs.assessmentCriteria ? JSON.parse(cs.assessmentCriteria) : [],
        weeklyHours: cs.weeklyHours,
      });
    }

    const dayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const weeklyCalendar: Record<number, Array<Record<string, unknown>>> = {};

    for (let day = 1; day <= 5; day++) {
      const daySchedules = teacher.schedules.filter(s => s.dayOfWeek === day);
      weeklyCalendar[day] = [];

      for (const s of daySchedules) {
        const gradeLevel = s.section.grade.level;
        const curKey = `${s.subjectId}-${gradeLevel}`;
        const curData = curriculumMap.get(curKey);

        // Find lesson plan for this schedule
        const plan = teacher.lessonPlans.find(
          lp => lp.scheduleId === s.id || (lp.subjectId === s.subjectId && lp.dayOfWeek === day),
        );

        // Determine the scheduled topic from curriculum
        let scheduledTopic = s.topic || plan?.topic || null;
        let topicIndex = -1;
        if (curData && !scheduledTopic && curData.topics.length > 0) {
          // Assign topics based on day of week and time slot order
          // Simple round-robin: use week number (derived from term) to pick topic
          const topicOffset = (day - 1) + daySchedules.indexOf(s);
          topicIndex = topicOffset % curData.topics.length;
          scheduledTopic = curData.topics[topicIndex];
        }

        // Quiz recommendation: every 4-5 topics
        let quizRecommendation = null;
        if (curData && topicIndex >= 0 && curData.topics.length > 0) {
          const topicNumber = topicIndex + 1;
          if (topicNumber % 4 === 0 || topicNumber === curData.topics.length) {
            quizRecommendation = {
              recommended: true,
              topicRange: curData.topics.slice(Math.max(0, topicIndex - 3), topicIndex + 1),
              type: topicNumber === curData.topics.length ? 'Unit Test' : 'Topic Quiz',
            };
          }
        }

        // Homework assignment recommendation
        let homeworkRecommendation = null;
        if (curData && topicIndex >= 0 && curData.topics.length > 0) {
          homeworkRecommendation = {
            topic: scheduledTopic,
            type: topicIndex % 2 === 0 ? 'Practice Problems' : 'Reading & Notes',
            dueNextClass: true,
          };
        }

        const entry: Record<string, unknown> = {
          scheduleId: s.id,
          dayOfWeek: s.dayOfWeek,
          dayName: dayNames[day],
          subject: {
            id: s.subject.id,
            name: s.subject.name,
            code: s.subject.code,
            color: s.subject.color,
          },
          grade: {
            id: s.section.grade.id,
            level: gradeLevel,
            name: s.section.grade.name,
          },
          section: {
            id: s.section.id,
            name: s.section.name,
          },
          timeSlot: {
            id: s.timeSlot.id,
            name: s.timeSlot.name,
            start: s.timeSlot.startTime,
            end: s.timeSlot.endTime,
          },
          room: s.room,
          term: s.term ? {
            id: s.term.id,
            name: s.term.name,
            academicYear: s.term.academicYear?.name || '',
          } : null,

          // Curriculum-aligned content
          scheduledTopic,
          curriculumTopics: curData?.topics || [],
          learningObjectives: curData?.learningObjectives || [],
          assessmentCriteria: curData?.assessmentCriteria || [],
          curriculumWeeklyHours: curData?.weeklyHours || null,
          topicIndex,

          // Lesson plan enrichment (if exists)
          lessonPlan: plan ? {
            id: plan.id,
            topic: plan.topic,
            learningObjectives: JSON.parse(plan.learningObjectives || '[]'),
            teachingMethod: plan.teachingMethod,
            materials: JSON.parse(plan.materials || '[]'),
            activities: JSON.parse(plan.activities || '[]'),
            quizSchedule: plan.quizSchedule ? JSON.parse(plan.quizSchedule) : null,
            homework: plan.homework ? JSON.parse(plan.homework) : null,
          } : null,

          // Auto-recommendations
          quizRecommendation,
          homeworkRecommendation,
        };

        weeklyCalendar[day].push(entry);
      }
    }

    // Build curriculum subject summary for the teacher
    const teacherSubjectIds = new Set(teacher.schedules.map(s => s.subjectId));
    const teacherGradeLevels = [...new Set(teacher.schedules.map(s => s.section.grade.level))].sort();

    const curriculumSubjectSummary = curriculum.subjects
      .filter(cs => teacherSubjectIds.has(cs.subjectId) && teacherGradeLevels.includes(cs.gradeLevel))
      .map(cs => ({
        subjectId: cs.subjectId,
        subjectName: cs.subject.name,
        gradeLevel: cs.gradeLevel,
        topics: JSON.parse(cs.topics || '[]'),
        learningObjectives: JSON.parse(cs.learningObjectives || '[]'),
        assessmentCriteria: cs.assessmentCriteria ? JSON.parse(cs.assessmentCriteria) : [],
        weeklyHours: cs.weeklyHours,
      }));

    // Quiz schedule overview
    const quizScheduleOverview: Array<Record<string, unknown>> = [];
    for (const cs of curriculumSubjectSummary) {
      const topics = cs.topics as string[];
      for (let i = 3; i < topics.length; i += 4) {
        quizScheduleOverview.push({
          subject: cs.subjectName,
          gradeLevel: cs.gradeLevel,
          quizAfterTopic: topics[i],
          topicRange: topics.slice(Math.max(0, i - 3), i + 1),
          type: i + 1 >= topics.length ? 'Unit Test' : 'Topic Quiz',
        });
      }
      // Always include a final assessment if there are enough topics
      if (topics.length > 4 && (topics.length - 1) % 4 !== 3) {
        quizScheduleOverview.push({
          subject: cs.subjectName,
          gradeLevel: cs.gradeLevel,
          quizAfterTopic: topics[topics.length - 1],
          topicRange: topics.slice(Math.max(0, topics.length - 4)),
          type: 'Final Assessment',
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        teacher: {
          id: teacher.id,
          name: teacher.name,
          department: teacher.department,
          designation: teacher.designation,
        },
        curriculum: {
          id: curriculum.id,
          name: curriculum.name,
          code: curriculum.code,
          framework: curriculum.framework,
        },
        weeklyCalendar,
        curriculumSubjectSummary,
        quizScheduleOverview,
        teacherGradeLevels,
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
