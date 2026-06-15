import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import ZAI from '@/lib/ollama';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { teacherId, curriculumId, termId } = body as {
      teacherId: string;
      curriculumId?: string;
      termId?: string;
    };

    if (!teacherId) {
      return NextResponse.json(
        { success: false, error: 'teacherId is required' },
        { status: 400 },
      );
    }

    const teacher = await db.teacher.findUnique({
      where: { id: teacherId },
      include: {
        schedules: {
          where: termId ? { termId } : undefined,
          include: {
            subject: true,
            section: { include: { grade: true, students: { select: { id: true } } } },
            timeSlot: true,
            term: { include: { academicYear: true } },
            lessonPlans: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
          orderBy: [{ dayOfWeek: 'asc' }, { timeSlot: { order: 'asc' } }],
        },
      },
    });

    if (!teacher) {
      return NextResponse.json(
        { success: false, error: 'Teacher not found' },
        { status: 404 },
      );
    }

    if (teacher.schedules.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No schedules found for this teacher' },
        { status: 400 },
      );
    }

    // Build curriculum map if curriculumId is provided
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

    const zai = await ZAI.create();
    const dayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const generatedPlans: Array<Record<string, unknown>> = [];
    const errors: string[] = [];

    // Group schedules by subject-grade combination for topic assignment
    const scheduleGroups = new Map<string, typeof teacher.schedules>();
    for (const s of teacher.schedules) {
      const key = `${s.subjectId}-${s.section.grade.level}`;
      if (!scheduleGroups.has(key)) {
        scheduleGroups.set(key, []);
      }
      scheduleGroups.get(key)!.push(s);
    }

    // Track topic index per subject-grade for round-robin assignment
    const topicIndexMap = new Map<string, number>();

    for (const schedule of teacher.schedules) {
      try {
        const gradeLevel = schedule.section.grade.level;
        const curKey = `${schedule.subjectId}-${gradeLevel}`;
        const curData = curriculumMap.get(curKey);

        // Skip if lesson plan already exists for this schedule
        const existingPlan = schedule.lessonPlans?.[0];
        if (existingPlan) {
          generatedPlans.push({
            scheduleId: schedule.id,
            existing: true,
            planId: existingPlan.id,
            topic: existingPlan.topic,
          });
          continue;
        }

        // Determine topic index
        if (!topicIndexMap.has(curKey)) {
          topicIndexMap.set(curKey, 0);
        }
        const topicIndex = topicIndexMap.get(curKey)!;
        topicIndexMap.set(curKey, topicIndex + 1);

        // Determine scheduled topic
        let scheduledTopic = schedule.topic || null;
        if (curData && !scheduledTopic && curData.topics.length > 0) {
          scheduledTopic = curData.topics[topicIndex % curData.topics.length];
        }
        if (!scheduledTopic) {
          scheduledTopic = `${schedule.subject.name} - Session ${topicIndex + 1}`;
        }

        // Quiz schedule: every 4th topic = quiz, last topic = unit test
        let quizSchedule = null;
        if (curData && curData.topics.length > 0) {
          const topicNum = (topicIndex % curData.topics.length) + 1;
          if (topicNum % 4 === 0) {
            quizSchedule = {
              type: 'Topic Quiz',
              topicRange: curData.topics.slice(Math.max(0, topicIndex - 3), topicIndex + 1),
            };
          } else if (topicNum === curData.topics.length) {
            quizSchedule = {
              type: 'Unit Test',
              topicRange: curData.topics.slice(Math.max(0, topicIndex - 3), topicIndex + 1),
            };
          }
        }

        // Homework: alternate between practice problems and reading/notes
        const homework = {
          type: topicIndex % 2 === 0 ? 'Practice Problems' : 'Reading & Notes',
          topic: scheduledTopic,
          dueNextClass: true,
        };

        // Generate detailed lesson plan using AI
        const systemPrompt = `You are an expert lesson planner for school teachers. You produce ONLY valid JSON, no markdown, no code fences, no extra text. Generate practical, curriculum-aligned lesson plans.`;

        const userPrompt = `Generate a detailed lesson plan for the following class session:

TEACHER: ${teacher.name} (${teacher.designation || 'Teacher'}, ${teacher.department || 'General'})
SUBJECT: ${schedule.subject.name}
GRADE: Grade ${gradeLevel}, Section ${schedule.section.name}
DAY: ${dayNames[schedule.dayOfWeek]}
TIME: ${schedule.timeSlot.name} (${schedule.timeSlot.startTime} - ${schedule.timeSlot.endTime})
ROOM: ${schedule.room || 'TBD'}
TOPIC: ${scheduledTopic}
STUDENT COUNT: ${schedule.section.students.length}

${curData ? `CURRICULUM ALIGNMENT:
- Curriculum Topics: ${curData.topics.join(', ')}
- Learning Objectives: ${curData.learningObjectives.join('; ')}
- Assessment Criteria: ${curData.assessmentCriteria.join('; ')}
- Weekly Hours: ${curData.weeklyHours || 'N/A'}
- Topic Index: ${topicIndex + 1} of ${curData.topics.length}` : ''}

${quizSchedule ? `ASSESSMENT: This session includes a ${quizSchedule.type} covering topics: ${quizSchedule.type === 'Topic Quiz' ? curData!.topics.slice(Math.max(0, topicIndex - 3), topicIndex + 1).join(', ') : curData!.topics.slice(-4).join(', ')}` : ''}

Generate JSON with these fields:
{
  "topic": "The specific topic title for this session",
  "learningObjectives": ["3-5 measurable learning objectives"],
  "teachingMethod": "Detailed methodology with step-by-step approach and timing",
  "materials": ["List of materials needed"],
  "activities": ["3-5 structured activities with timing (e.g., 'Warm-up Review - 5 min')"],
  "assessmentNotes": "How to assess student understanding in this session"
}`;

        let lessonPlanData: Record<string, unknown> = {
          topic: scheduledTopic,
          learningObjectives: curData?.learningObjectives?.slice(0, 3) || [`Understand ${scheduledTopic}`],
          teachingMethod: 'Direct instruction with guided practice',
          materials: ['Textbook', 'Whiteboard', 'Worksheets'],
          activities: ['Introduction - 5 min', 'Main Content - 20 min', 'Practice - 10 min', 'Review - 5 min'],
          assessmentNotes: 'Observe student responses and check practice work',
        };

        // Only use AI for the first 5 plans per subject-grade combo to avoid timeout
        const aiCallCount = topicIndexMap.get(`ai_${curKey}`) || 0;
        const shouldUseAI = aiCallCount < 5;

        if (shouldUseAI) {
          topicIndexMap.set(`ai_${curKey}`, aiCallCount + 1);
          try {
            const completion = await zai.chat.completions.create({
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              temperature: 0.7,
              max_tokens: 1500,
            });
            const content = completion.choices?.[0]?.message?.content || '';
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              lessonPlanData = {
                topic: parsed.topic || scheduledTopic,
                learningObjectives: Array.isArray(parsed.learningObjectives) ? parsed.learningObjectives : lessonPlanData.learningObjectives,
                teachingMethod: parsed.teachingMethod || lessonPlanData.teachingMethod,
                materials: Array.isArray(parsed.materials) ? parsed.materials : lessonPlanData.materials,
                activities: Array.isArray(parsed.activities) ? parsed.activities : lessonPlanData.activities,
                assessmentNotes: parsed.assessmentNotes || lessonPlanData.assessmentNotes,
              };
            }
          } catch (aiError) {
            console.error('[LESSON_PLAN_AI_ERROR]', aiError);
            // Fallback data is already set
          }
        } else {
          // Enhanced fallback with curriculum context
          lessonPlanData = {
            topic: scheduledTopic,
            learningObjectives: curData?.learningObjectives?.slice(0, 3) || [`Understand key concepts of ${scheduledTopic}`, `Apply ${schedule.subject.name} principles to solve problems`, `Develop critical thinking through practice`],
            teachingMethod: `1. Warm-up Review (5 min): Recap previous lesson\n2. Concept Introduction (10 min): Present ${scheduledTopic} with examples\n3. Guided Practice (15 min): Work through problems together\n4. Independent Practice (10 min): Students solve problems independently\n5. Summary & Assessment (5 min): Review key points and exit ticket`,
            materials: ['Textbook', 'Whiteboard', 'Worksheets', 'Digital resources'],
            activities: ['Warm-up Review - 5 min', 'Concept Introduction - 10 min', 'Guided Practice - 15 min', 'Independent Practice - 10 min', 'Summary & Exit Ticket - 5 min'],
            assessmentNotes: `Monitor student understanding through questioning and observation of practice work. Check exit tickets for comprehension of ${scheduledTopic}.`,
          };
        }

        // Save lesson plan to database
        const plan = await db.lessonPlan.create({
          data: {
            scheduleId: schedule.id,
            teacherId: teacher.id,
            subjectId: schedule.subjectId,
            gradeLevel,
            sectionId: schedule.sectionId,
            date: new Date().toISOString().split('T')[0],
            dayOfWeek: schedule.dayOfWeek,
            timeSlotId: schedule.timeSlotId,
            topic: lessonPlanData.topic as string,
            learningObjectives: JSON.stringify(lessonPlanData.learningObjectives),
            teachingMethod: lessonPlanData.teachingMethod as string,
            materials: JSON.stringify(lessonPlanData.materials),
            activities: JSON.stringify(lessonPlanData.activities),
            quizSchedule: quizSchedule ? JSON.stringify(quizSchedule) : null,
            homework: JSON.stringify(homework),
            assessmentNotes: lessonPlanData.assessmentNotes as string,
            curriculumId: curriculumId || null,
          },
        });

        generatedPlans.push({
          scheduleId: schedule.id,
          existing: false,
          planId: plan.id,
          topic: plan.topic,
          subject: schedule.subject.name,
          grade: `Grade ${gradeLevel}`,
          section: schedule.section.name,
          dayOfWeek: schedule.dayOfWeek,
          dayName: dayNames[schedule.dayOfWeek],
          timeSlot: schedule.timeSlot.name,
          quizSchedule,
          homework,
        });
      } catch (planError) {
        console.error('[LESSON_PLAN_BULK_ITEM_ERROR]', planError);
        errors.push(`Failed to generate plan for schedule ${schedule.id}: ${planError instanceof Error ? planError.message : 'Unknown error'}`);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        teacherId: teacher.id,
        teacherName: teacher.name,
        totalSchedules: teacher.schedules.length,
        generated: generatedPlans.filter(p => !p.existing).length,
        existing: generatedPlans.filter(p => p.existing).length,
        errors: errors.length,
        plans: generatedPlans,
        errorDetails: errors,
      },
    });
  } catch (error) {
    console.error('[LESSON_PLANS_BULK_ERROR]', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to generate lesson plans' },
      { status: 500 },
    );
  }
}
