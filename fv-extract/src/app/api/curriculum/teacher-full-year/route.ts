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
        teacherSubjects: { include: { subject: true } },
        schedules: {
          include: {
            subject: true,
            section: { include: { grade: true, students: { select: { id: true } } } },
            timeSlot: true,
            term: { include: { academicYear: true } },
            lessonPlans: { orderBy: { createdAt: 'desc' }, take: 1 },
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

    // Build curriculum map if curriculumId is provided
    let curriculumData: {
      id: string;
      name: string;
      code: string;
      framework: string | null;
    } | null = null;

    const curriculumMap = new Map<string, {
      topics: string[];
      learningObjectives: string[];
      assessmentCriteria: string[];
      weeklyHours: number | null;
    }>();

    if (curriculumId) {
      const curriculum = await db.curriculum.findUnique({
        where: { id: curriculumId },
        include: { subjects: { include: { subject: true } } },
      });

      if (curriculum) {
        curriculumData = {
          id: curriculum.id,
          name: curriculum.name,
          code: curriculum.code,
          framework: curriculum.framework,
        };

        for (const cs of curriculum.subjects) {
          curriculumMap.set(`${cs.subjectId}-${cs.gradeLevel}`, {
            topics: JSON.parse(cs.topics || '[]'),
            learningObjectives: JSON.parse(cs.learningObjectives || '[]'),
            assessmentCriteria: cs.assessmentCriteria ? JSON.parse(cs.assessmentCriteria) : [],
            weeklyHours: cs.weeklyHours,
          });
        }
      }
    }

    // Try to get school curriculum if no specific curriculumId provided
    if (!curriculumId) {
      const school = await db.school.findFirst({ include: { curriculum: { include: { subjects: { include: { subject: true } } } } } });
      if (school?.curriculum) {
        curriculumData = {
          id: school.curriculum.id,
          name: school.curriculum.name,
          code: school.curriculum.code,
          framework: school.curriculum.framework,
        };
        for (const cs of school.curriculum.subjects) {
          curriculumMap.set(`${cs.subjectId}-${cs.gradeLevel}`, {
            topics: JSON.parse(cs.topics || '[]'),
            learningObjectives: JSON.parse(cs.learningObjectives || '[]'),
            assessmentCriteria: cs.assessmentCriteria ? JSON.parse(cs.assessmentCriteria) : [],
            weeklyHours: cs.weeklyHours,
          });
        }
      }
    }

    const dayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

    // Build weekly calendar enriched with curriculum and lesson plan data
    const weeklyCalendar: Record<number, Array<Record<string, unknown>>> = {};
    const topicCounterMap = new Map<string, number>();

    for (let day = 1; day <= 5; day++) {
      const daySchedules = teacher.schedules.filter(s => s.dayOfWeek === day);
      weeklyCalendar[day] = [];

      for (const s of daySchedules) {
        const gradeLevel = s.section.grade.level;
        const curKey = `${s.subjectId}-${gradeLevel}`;
        const curData = curriculumMap.get(curKey);

        // Track topic index per subject-grade-day combination
        const counterKey = `${curKey}-${day}`;
        if (!topicCounterMap.has(counterKey)) {
          topicCounterMap.set(counterKey, 0);
        }
        const topicIndex = topicCounterMap.get(counterKey)!;
        topicCounterMap.set(counterKey, topicIndex + 1);

        // Determine scheduled topic
        let scheduledTopic = s.topic || null;
        const plan = s.lessonPlans?.[0] || teacher.lessonPlans.find(
          lp => lp.scheduleId === s.id || (lp.subjectId === s.subjectId && lp.dayOfWeek === day),
        );

        if (!scheduledTopic && plan) {
          scheduledTopic = plan.topic;
        }
        if (!scheduledTopic && curData && curData.topics.length > 0) {
          scheduledTopic = curData.topics[topicIndex % curData.topics.length];
        }

        // Quiz recommendation
        let quizRecommendation = null;
        if (curData && curData.topics.length > 0) {
          const effectiveIndex = topicIndex % curData.topics.length;
          const topicNumber = effectiveIndex + 1;
          if (topicNumber % 4 === 0) {
            quizRecommendation = {
              recommended: true,
              topicRange: curData.topics.slice(Math.max(0, effectiveIndex - 3), effectiveIndex + 1),
              type: 'Topic Quiz',
            };
          } else if (topicNumber === curData.topics.length) {
            quizRecommendation = {
              recommended: true,
              topicRange: curData.topics.slice(Math.max(0, effectiveIndex - 3), effectiveIndex + 1),
              type: 'Unit Test',
            };
          }
        }

        // Homework recommendation
        let homeworkRecommendation = null;
        if (scheduledTopic) {
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
          scheduledTopic,
          topicIndex,

          // Curriculum data
          curriculumTopics: curData?.topics || [],
          learningObjectives: curData?.learningObjectives || [],
          assessmentCriteria: curData?.assessmentCriteria || [],
          curriculumWeeklyHours: curData?.weeklyHours || null,

          // Lesson plan enrichment
          lessonPlan: plan ? {
            id: plan.id,
            topic: plan.topic,
            learningObjectives: JSON.parse(plan.learningObjectives || '[]'),
            teachingMethod: plan.teachingMethod,
            materials: JSON.parse(plan.materials || '[]'),
            activities: JSON.parse(plan.activities || '[]'),
            quizSchedule: plan.quizSchedule ? JSON.parse(plan.quizSchedule) : null,
            homework: plan.homework ? JSON.parse(plan.homework) : null,
            assessmentNotes: plan.assessmentNotes,
          } : null,

          quizRecommendation,
          homeworkRecommendation,
        };

        weeklyCalendar[day].push(entry);
      }
    }

    // Summary statistics
    const assignedGrades = [...new Set(teacher.schedules.map(s => s.section.grade.level))].sort();
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

    // Quiz schedule overview
    const quizScheduleOverview: Array<Record<string, unknown>> = [];
    const seenQuizKeys = new Set<string>();
    for (const [curKey, curData] of curriculumMap.entries()) {
      const topics = curData.topics;
      for (let i = 3; i < topics.length; i += 4) {
        const quizKey = `${curKey}-quiz-${i}`;
        if (!seenQuizKeys.has(quizKey)) {
          seenQuizKeys.add(quizKey);
          const [subjectId, gradeLevelStr] = curKey.split('-');
          const subject = assignedSubjects.find(s => s.id === subjectId);
          quizScheduleOverview.push({
            subject: subject?.name || subjectId,
            gradeLevel: parseInt(gradeLevelStr),
            quizAfterTopic: topics[i],
            topicRange: topics.slice(Math.max(0, i - 3), i + 1),
            type: i + 1 >= topics.length ? 'Unit Test' : 'Topic Quiz',
          });
        }
      }
      if (topics.length > 4 && (topics.length - 1) % 4 !== 3) {
        const quizKey = `${curKey}-final`;
        if (!seenQuizKeys.has(quizKey)) {
          seenQuizKeys.add(quizKey);
          const [subjectId, gradeLevelStr] = curKey.split('-');
          const subject = assignedSubjects.find(s => s.id === subjectId);
          quizScheduleOverview.push({
            subject: subject?.name || subjectId,
            gradeLevel: parseInt(gradeLevelStr),
            quizAfterTopic: topics[topics.length - 1],
            topicRange: topics.slice(Math.max(0, topics.length - 4)),
            type: 'Final Assessment',
          });
        }
      }
    }

    // Homework schedule overview
    const homeworkScheduleOverview: Array<Record<string, unknown>> = [];
    for (let day = 1; day <= 5; day++) {
      const dayEntries = weeklyCalendar[day] || [];
      for (const entry of dayEntries) {
        const e = entry as Record<string, unknown>;
        if (e.homeworkRecommendation) {
          const hw = e.homeworkRecommendation as { topic: string; type: string; dueNextClass: boolean };
          homeworkScheduleOverview.push({
            day: e.dayName,
            subject: (e.subject as { name: string })?.name,
            grade: (e.grade as { level: number })?.level,
            topic: hw.topic,
            type: hw.type,
            dueNextClass: hw.dueNextClass,
          });
        }
      }
    }

    // Curriculum subject summary
    const curriculumSubjectSummary: Array<Record<string, unknown>> = [];
    const seenSummaryKeys = new Set<string>();
    for (const [curKey, curData] of curriculumMap.entries()) {
      if (seenSummaryKeys.has(curKey)) continue;
      seenSummaryKeys.add(curKey);
      const [subjectId, gradeLevelStr] = curKey.split('-');
      const subject = assignedSubjects.find(s => s.id === subjectId);
      if (subject && assignedGrades.includes(parseInt(gradeLevelStr))) {
        curriculumSubjectSummary.push({
          subjectId,
          subjectName: subject.name,
          gradeLevel: parseInt(gradeLevelStr),
          topics: curData.topics,
          learningObjectives: curData.learningObjectives,
          assessmentCriteria: curData.assessmentCriteria,
          weeklyHours: curData.weeklyHours,
        });
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
        curriculum: curriculumData,
        weeklyCalendar,
        assignedGrades,
        assignedSubjects,
        assignedSections,
        totalClassesPerWeek: teacher.schedules.length,
        totalLessonPlans: teacher.lessonPlans.length,
        quizScheduleOverview,
        homeworkScheduleOverview,
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
