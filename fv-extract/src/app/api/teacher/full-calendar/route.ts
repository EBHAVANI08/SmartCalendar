import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const teacherId = searchParams.get('teacherId');
    let curriculumId = searchParams.get('curriculumId');

    if (!teacherId) {
      return NextResponse.json(
        { success: false, error: 'teacherId query parameter is required' },
        { status: 400 },
      );
    }

    // Auto-detect school curriculum if not provided
    if (!curriculumId) {
      const school = await db.school.findFirst({
        select: { curriculumId: true },
      });
      if (school?.curriculumId) {
        curriculumId = school.curriculumId;
      }
    }

    const teacher = await db.teacher.findUnique({
      where: { id: teacherId },
      include: {
        teacherSubjects: {
          include: { subject: true },
        },
        schedules: {
          include: {
            subject: true,
            section: {
              include: {
                grade: true,
                students: { select: { id: true } },
              },
            },
            timeSlot: true,
            term: {
              include: {
                academicYear: true,
              },
            },
          },
          orderBy: [{ dayOfWeek: 'asc' }, { timeSlot: { order: 'asc' } }],
        },
        lessonPlans: {
          orderBy: { createdAt: 'desc' },
          take: 200,
        },
      },
    });

    if (!teacher) {
      return NextResponse.json(
        { success: false, error: 'Teacher not found' },
        { status: 404 },
      );
    }

    // Build curriculum map for quick lookup
    const curriculumMap = new Map<string, {
      topics: string[];
      learningObjectives: string[];
      assessmentCriteria: string[];
      weeklyHours: number | null;
    }>();

    if (curriculumId) {
      const curriculumSubjects = await db.curriculumSubject.findMany({
        where: { curriculumId },
      });
      for (const cs of curriculumSubjects) {
        curriculumMap.set(`${cs.subjectId}-${cs.gradeLevel}`, {
          topics: JSON.parse(cs.topics || '[]'),
          learningObjectives: JSON.parse(cs.learningObjectives || '[]'),
          assessmentCriteria: cs.assessmentCriteria ? JSON.parse(cs.assessmentCriteria) : [],
          weeklyHours: cs.weeklyHours,
        });
      }
    }

    // Track topic index per subject-grade for round-robin assignment
    const topicIndexTracker = new Map<string, number>();

    // Build enriched weekly calendar grouped by day of week
    const dayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const weeklyCalendar: Record<number, Array<Record<string, unknown>>> = {};
    const quizScheduleOverview: Array<Record<string, unknown>> = [];

    // Group schedules by subject-grade for topic index calculation
    const subjectGradeGroups = new Map<string, number>();
    for (const s of teacher.schedules) {
      const key = `${s.subjectId}-${s.section.grade.level}`;
      if (!subjectGradeGroups.has(key)) {
        subjectGradeGroups.set(key, 0);
      }
    }

    for (let day = 1; day <= 5; day++) {
      const daySchedules = teacher.schedules.filter(s => s.dayOfWeek === day);
      weeklyCalendar[day] = [];

      for (const s of daySchedules) {
        const gradeLevel = s.section.grade.level;
        const curKey = `${s.subjectId}-${gradeLevel}`;
        const curData = curriculumMap.get(curKey);

        // Track topic index per subject-grade combination
        if (!topicIndexTracker.has(curKey)) {
          topicIndexTracker.set(curKey, 0);
        }
        const topicIndex = topicIndexTracker.get(curKey)!;
        topicIndexTracker.set(curKey, topicIndex + 1);

        // Find the most relevant lesson plan for this schedule
        const plan = teacher.lessonPlans.find(
          lp => lp.scheduleId === s.id || (lp.subjectId === s.subjectId && lp.dayOfWeek === s.dayOfWeek && lp.gradeLevel === gradeLevel),
        );

        // Determine scheduled topic
        let scheduledTopic = s.topic || plan?.topic || null;
        if (curData && !scheduledTopic && curData.topics.length > 0) {
          scheduledTopic = curData.topics[topicIndex % curData.topics.length];
        }
        if (!scheduledTopic) {
          scheduledTopic = `${s.subject.name} - Session ${topicIndex + 1}`;
        }

        // Quiz recommendation: every 4th topic = quiz, last = unit test
        let quizRecommendation = null;
        if (curData && curData.topics.length > 0) {
          const topicNumber = (topicIndex % curData.topics.length) + 1;
          if (topicNumber % 4 === 0) {
            quizRecommendation = {
              recommended: true,
              topicRange: curData.topics.slice(Math.max(0, topicIndex - 3), topicIndex + 1),
              type: 'Topic Quiz',
            };
          } else if (topicNumber === curData.topics.length) {
            quizRecommendation = {
              recommended: true,
              topicRange: curData.topics.slice(Math.max(0, topicIndex - 3), topicIndex + 1),
              type: 'Unit Test',
            };
          }
        }
        // Also check lesson plan quiz schedule
        if (!quizRecommendation && plan?.quizSchedule) {
          try {
            const qs = JSON.parse(plan.quizSchedule);
            quizRecommendation = {
              recommended: true,
              topicRange: qs.topicRange || [scheduledTopic],
              type: qs.type || 'Quiz',
            };
          } catch { /* ignore */ }
        }

        // Homework recommendation
        let homeworkRecommendation = null;
        if (plan?.homework) {
          try {
            const hw = JSON.parse(plan.homework);
            homeworkRecommendation = {
              topic: hw.topic || scheduledTopic,
              type: hw.type || 'Practice Problems',
              dueNextClass: hw.dueNextClass !== false,
            };
          } catch { /* ignore */ }
        } else if (curData) {
          homeworkRecommendation = {
            topic: scheduledTopic,
            type: topicIndex % 2 === 0 ? 'Practice Problems' : 'Reading & Notes',
            dueNextClass: true,
          };
        }

        // Build lesson plan object for frontend
        const lessonPlanObj = plan ? {
          id: plan.id,
          topic: plan.topic,
          learningObjectives: JSON.parse(plan.learningObjectives || '[]'),
          teachingMethod: plan.teachingMethod,
          materials: JSON.parse(plan.materials || '[]'),
          activities: JSON.parse(plan.activities || '[]'),
          quizSchedule: plan.quizSchedule ? JSON.parse(plan.quizSchedule) : null,
          homework: plan.homework ? JSON.parse(plan.homework) : null,
          assessmentNotes: plan.assessmentNotes,
        } : null;

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
            level: s.section.grade.level,
            name: s.section.grade.name,
          },
          section: {
            id: s.section.id,
            name: s.section.name,
            studentCount: s.section.students.length,
          },
          timeSlot: {
            id: s.timeSlot.id,
            name: s.timeSlot.name,
            start: s.timeSlot.startTime,
            end: s.timeSlot.endTime,
            isBreak: s.timeSlot.isBreak,
          },
          room: s.room,
          term: s.term ? {
            id: s.term.id,
            name: s.term.name,
            academicYear: s.term.academicYear?.name || '',
          } : null,

          // Topic and curriculum info
          scheduledTopic,
          topic: s.topic || plan?.topic || scheduledTopic,
          topicIndex,
          curriculumTopics: curData?.topics || [],
          learningObjectives: plan
            ? JSON.parse(plan.learningObjectives || '[]')
            : curData?.learningObjectives || [],
          assessmentCriteria: curData?.assessmentCriteria || [],
          curriculumWeeklyHours: curData?.weeklyHours || null,

          // Lesson plan (nested object for frontend)
          lessonPlan: lessonPlanObj,

          // Recommendations
          quizRecommendation,
          homeworkRecommendation,
        };

        weeklyCalendar[day].push(entry);
      }
    }

    // Build quiz schedule overview
    for (const [key, curData] of curriculumMap.entries()) {
      if (!curData.topics.length) continue;
      const [subjectId, gradeLevel] = key.split('-');
      // Check if this subject-grade is relevant to this teacher
      const isRelevant = teacher.schedules.some(s => s.subjectId === subjectId && s.section.grade.level === parseInt(gradeLevel));
      if (!isRelevant) continue;

      const subject = teacher.schedules.find(s => s.subjectId === subjectId)?.subject;
      for (let i = 3; i < curData.topics.length; i += 4) {
        quizScheduleOverview.push({
          subject: subject?.name || 'Unknown',
          gradeLevel: parseInt(gradeLevel),
          quizAfterTopic: curData.topics[i],
          topicRange: curData.topics.slice(Math.max(0, i - 3), i + 1),
          type: i + 1 >= curData.topics.length ? 'Unit Test' : 'Topic Quiz',
        });
      }
      if (curData.topics.length > 4 && (curData.topics.length - 1) % 4 !== 3) {
        quizScheduleOverview.push({
          subject: subject?.name || 'Unknown',
          gradeLevel: parseInt(gradeLevel),
          quizAfterTopic: curData.topics[curData.topics.length - 1],
          topicRange: curData.topics.slice(Math.max(0, curData.topics.length - 4)),
          type: 'Final Assessment',
        });
      }
    }

    // Build curriculum subject summary
    const curriculumSubjectSummary: Array<Record<string, unknown>> = [];
    const teacherSubjectIds = new Set(teacher.schedules.map(s => s.subjectId));
    const teacherGradeLevels = [...new Set(teacher.schedules.map(s => s.section.grade.level))].sort();

    for (const [key, curData] of curriculumMap.entries()) {
      const [subjectId, gradeLevel] = key.split('-');
      const gl = parseInt(gradeLevel);
      if (teacherSubjectIds.has(subjectId) && teacherGradeLevels.includes(gl)) {
        const subject = teacher.schedules.find(s => s.subjectId === subjectId)?.subject;
        curriculumSubjectSummary.push({
          subjectId,
          subjectName: subject?.name || 'Unknown',
          gradeLevel: gl,
          topics: curData.topics,
          learningObjectives: curData.learningObjectives,
          assessmentCriteria: curData.assessmentCriteria,
          weeklyHours: curData.weeklyHours,
        });
      }
    }

    // Compute summary statistics
    const assignedGrades = teacherGradeLevels;
    const assignedSubjects = [
      ...new Map(
        teacher.schedules.map(s => [
          s.subject.id,
          { id: s.subject.id, name: s.subject.name, code: s.subject.code, color: s.subject.color },
        ]),
      ).values(),
    ];
    const assignedSections = [
      ...new Map(
        teacher.schedules.map(s => [
          s.section.id,
          { id: s.section.id, name: s.section.name, gradeName: s.section.grade.name, gradeLevel: s.section.grade.level },
        ]),
      ).values(),
    ];
    const totalClassesPerWeek = teacher.schedules.length;
    const totalLessonPlans = teacher.lessonPlans.length;

    // Get curriculum info if available
    let curriculumInfo = null;
    if (curriculumId) {
      const c = await db.curriculum.findUnique({ where: { id: curriculumId } });
      if (c) {
        curriculumInfo = { id: c.id, name: c.name, code: c.code, framework: c.framework };
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        teacher: {
          id: teacher.id,
          name: teacher.name,
          email: teacher.email,
          department: teacher.department,
          designation: teacher.designation,
          employeeId: teacher.employeeId,
        },
        curriculum: curriculumInfo,
        weeklyCalendar,
        assignedGrades,
        assignedSubjects,
        assignedSections,
        totalClassesPerWeek,
        totalLessonPlans,
        curriculumSubjectSummary,
        quizScheduleOverview,
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
