import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// Generate comprehensive substitute teacher context using AI
// Enhanced to fetch yesterday's lesson plan and generate popup-ready context
export async function POST(request: Request) {
  try {
    const { substitutionId } = await request.json();

    if (!substitutionId) {
      return NextResponse.json({ error: 'substitutionId is required' }, { status: 400 });
    }

    const substitution = await db.substitution.findUnique({
      where: { id: substitutionId },
      include: {
        absentTeacher: true,
        substitute: true,
      },
    });

    if (!substitution) {
      return NextResponse.json({ error: 'Substitution not found' }, { status: 404 });
    }

    // Get the absent teacher's full schedule for context
    const dateObj = new Date(substitution.date + 'T00:00:00');
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = dayNames[dateObj.getDay()];

    const yesterday = new Date(dateObj);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDay = dayNames[yesterday.getDay()];
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    // Get absent teacher's schedule for today and yesterday
    const teacherTodaySchedule = await db.schedule.findMany({
      where: { teacherId: substitution.absentTeacherId, day: today },
      orderBy: { period: 'asc' },
    });

    const teacherYesterdaySchedule = await db.schedule.findMany({
      where: { teacherId: substitution.absentTeacherId, day: yesterdayDay },
      orderBy: { period: 'asc' },
    });

    // Find yesterday's specific period details — same grade, same subject, same period
    const yesterdayPeriod = teacherYesterdaySchedule.find(
      (s) => s.period === substitution.period && s.grade === substitution.grade && s.section === substitution.section
    );

    // Also try finding by just period and grade (section might differ)
    const yesterdayPeriodByGrade = !yesterdayPeriod
      ? teacherYesterdaySchedule.find((s) => s.period === substitution.period && s.grade === substitution.grade)
      : null;

    const yesterdayScheduleEntry = yesterdayPeriod || yesterdayPeriodByGrade;

    // ─── Fetch lesson plan for PREVIOUS day's class ───
    // Look for a lesson plan that matches yesterday's date, same grade, same subject
    let yesterdayLessonPlan = null;
    try {
      yesterdayLessonPlan = await db.lessonPlan.findFirst({
        where: {
          teacherId: substitution.absentTeacherId,
          grade: substitution.grade,
          subject: substitution.subject,
          // Try to match by the plan content or recent creation near yesterday
          createdAt: {
            gte: new Date(yesterdayStr + 'T00:00:00'),
            lte: new Date(yesterdayStr + 'T23:59:59'),
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch {
      // Date-based query might fail, try without date filter
    }

    // If no lesson plan from yesterday specifically, get the most recent one for this grade+subject
    if (!yesterdayLessonPlan) {
      yesterdayLessonPlan = await db.lessonPlan.findFirst({
        where: {
          teacherId: substitution.absentTeacherId,
          grade: substitution.grade,
          subject: substitution.subject,
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    // Parse lesson plan details
    let yesterdayDetails: {
      topic?: string;
      objectives?: string[];
      keyConcepts?: string[];
      activities?: string[];
      homework?: string;
      warmUp?: string;
      mainContent?: string;
      resources?: string[];
    } = {};

    if (yesterdayLessonPlan) {
      let planContent: Record<string, unknown> = {};
      try {
        planContent = JSON.parse(yesterdayLessonPlan.planContent || '{}');
      } catch {
        planContent = {};
      }

      yesterdayDetails = {
        topic: yesterdayLessonPlan.topic,
        objectives: (() => {
          try {
            return JSON.parse(yesterdayLessonPlan.objectives || '[]');
          } catch {
            return [];
          }
        })(),
        keyConcepts: (() => {
          try {
            const mc = yesterdayLessonPlan.mainContent ? JSON.parse(yesterdayLessonPlan.mainContent) : null;
            if (mc && typeof mc === 'object' && 'keyConcepts' in mc) return (mc as { keyConcepts?: string[] }).keyConcepts;
            return [];
          } catch {
            return [];
          }
        })(),
        activities: (() => {
          try {
            const mc = yesterdayLessonPlan.mainContent ? JSON.parse(yesterdayLessonPlan.mainContent) : null;
            if (mc && typeof mc === 'object' && 'activities' in mc) return (mc as { activities?: string[] }).activities;
            return [];
          } catch {
            return [];
          }
        })(),
        homework: yesterdayLessonPlan.homework || undefined,
        warmUp: yesterdayLessonPlan.warmUp || undefined,
        mainContent: yesterdayLessonPlan.mainContent || undefined,
        resources: (() => {
          try {
            return JSON.parse(yesterdayLessonPlan.resources || '[]');
          } catch {
            return [];
          }
        })(),
      };
    }

    // Determine yesterday's topic from lesson plan or schedule topic field
    const yesterdayTopic =
      yesterdayLessonPlan?.topic ||
      yesterdayScheduleEntry?.topic ||
      substitution.yesterdayTopic ||
      'Previous lesson';

    // Get curriculum context
    const curriculumTopics = await db.curriculumTopic.findMany({
      where: {
        subject: substitution.subject,
        grade: substitution.grade,
      },
      take: 5,
      orderBy: { sequenceOrder: 'asc' },
    });

    // Build comprehensive popup-ready context
    const popupContext = {
      substitution: {
        id: substitution.id,
        date: substitution.date,
        period: substitution.period,
        grade: substitution.grade,
        section: substitution.section,
        subject: substitution.subject,
        reason: substitution.reason,
      },
      absentTeacher: {
        name: substitution.absentTeacher.name,
        subject: substitution.absentTeacher.subject,
      },
      yesterdayTopic,
      yesterdayDetails,
      todayCoveragePlan: substitution.todayTopic || `Continue from: ${yesterdayTopic}`,
      teachingInstructions: [] as string[], // Will be populated by AI
      studentExpectations: '', // Will be populated by AI
      assessmentIdea: '', // Will be populated by AI
      materialsNeeded: [] as string[], // Will be populated by AI
      curriculumContext: curriculumTopics.map((ct) => ({
        unit: ct.unit,
        topic: ct.topic,
        learningOutcomes: (() => {
          try {
            return JSON.parse(ct.learningOutcomes || '[]');
          } catch {
            return [];
          }
        })(),
        bloomLevel: ct.bloomLevel,
      })),
      fullDaySchedule: teacherTodaySchedule.map((s) => ({
        period: s.period,
        grade: s.grade,
        section: s.section,
        subject: s.subject,
        topic: s.topic,
        time: `${s.startTime}-${s.endTime}`,
      })),
    };

    // ─── Use AI to generate comprehensive substitute guidance ───
    let aiLessonDNA: Record<string, unknown> | null = null;
    try {
      const zaiModule = await import('z-ai-web-dev-sdk');
      const ZAI = zaiModule.default || zaiModule;
      const zai = await ZAI.create();

      const yesterdayDetailsStr = yesterdayLessonPlan
        ? `Topic: ${yesterdayDetails.topic || 'N/A'}
Objectives: ${yesterdayDetails.objectives?.join(', ') || 'N/A'}
Key Concepts: ${yesterdayDetails.keyConcepts?.join(', ') || 'N/A'}
Activities: ${yesterdayDetails.activities?.join(', ') || 'N/A'}
Homework Assigned: ${yesterdayDetails.homework || 'N/A'}
Resources Used: ${yesterdayDetails.resources?.join(', ') || 'N/A'}`
        : `No formal lesson plan found. Schedule topic: ${yesterdayScheduleEntry?.topic || 'Not available'}`;

      const result = await zai.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: `You are an expert substitute teacher preparation AI with deep knowledge of CBSE/ICSE/IB curricula. You receive detailed context about an absent teacher's class and generate comprehensive, practical guidance for the substitute teacher. Your guidance must be actionable, specific to the subject and grade, and include step-by-step instructions that a substitute with no prior knowledge of the class can follow. Always respond in valid JSON format.`,
          },
          {
            role: 'user',
            content: `Generate comprehensive substitute teacher guidance for:
- Subject: ${substitution.subject}
- Grade: ${substitution.grade} ${substitution.section}
- Period: ${substitution.period}
- Absent Teacher: ${substitution.absentTeacher.name}
- Date: ${substitution.date}

YESTERDAY'S CLASS DETAILS:
${yesterdayDetailsStr}

TODAY'S EXPECTED TOPIC:
${substitution.todayTopic || `Continue from yesterday's topic: ${yesterdayTopic}`}

CURRICULUM CONTEXT:
${curriculumTopics.map((ct) => `- ${ct.unit}: ${ct.topic} (${ct.bloomLevel}) - ${ct.learningOutcomes}`).join('\n')}

Generate a JSON object with these EXACT fields:
1. yesterdayTopic: Brief title of what was taught yesterday (1 sentence)
2. yesterdayDetails: { keyConcepts: array of 3-4 key concepts taught, activities: array of 1-2 activities done, homeworkAssigned: any homework given or "None" }
3. todayCoveragePlan: { topic: today's topic, objectives: array of 2-3 learning objectives, keyPoints: array of 3-4 key points to cover }
4. teachingInstructions: Array of 5-6 step-by-step instructions for the substitute, each as a clear actionable step (e.g., "Start by reviewing yesterday's homework on fractions", "Introduce the concept of decimal conversion using the whiteboard")
5. studentExpectations: 2-3 sentences describing what students already know and what they expect to learn today
6. assessmentIdea: A quick formative assessment the substitute can do (2-3 sentences with specific questions or activity)
7. materialsNeeded: Array of 3-5 specific materials needed (e.g., "Whiteboard and markers", "Worksheet on decimal conversion", "Student textbooks page 45")

Only return valid JSON, no markdown.`,
          },
        ],
        max_tokens: 4000,
      });

      const content = result.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        aiLessonDNA = JSON.parse(jsonMatch[0]);

        // Populate popup context with AI-generated data
        if (aiLessonDNA) {
          popupContext.yesterdayTopic = (aiLessonDNA.yesterdayTopic as string) || popupContext.yesterdayTopic;
          popupContext.yesterdayDetails = {
            ...popupContext.yesterdayDetails,
            ...((aiLessonDNA.yesterdayDetails as Record<string, unknown>) || {}),
          };
          popupContext.todayCoveragePlan = (aiLessonDNA.todayCoveragePlan as string) || popupContext.todayCoveragePlan;
          popupContext.teachingInstructions = Array.isArray(aiLessonDNA.teachingInstructions)
            ? (aiLessonDNA.teachingInstructions as string[])
            : [];
          popupContext.studentExpectations = (aiLessonDNA.studentExpectations as string) || '';
          popupContext.assessmentIdea = (aiLessonDNA.assessmentIdea as string) || '';
          popupContext.materialsNeeded = Array.isArray(aiLessonDNA.materialsNeeded)
            ? (aiLessonDNA.materialsNeeded as string[])
            : [];
        }
      }
    } catch (aiError) {
      console.error('AI context generation error:', aiError);
      // Fallback context with all required fields
      aiLessonDNA = {
        yesterdayTopic: popupContext.yesterdayTopic,
        yesterdayDetails: {
          keyConcepts: ['Previous lesson content'],
          activities: ['Classwork and discussion'],
          homeworkAssigned: 'None specified',
        },
        todayCoveragePlan: {
          topic: substitution.todayTopic || substitution.subject,
          objectives: [`Continue learning about ${substitution.todayTopic || substitution.subject}`],
          keyPoints: [`Review previous material`, `Introduce new concepts`, `Practice exercises`],
        },
        teachingInstructions: [
          `Start by greeting students and taking attendance`,
          `Review yesterday's topic: ${popupContext.yesterdayTopic}`,
          `Introduce today's material using the textbook`,
          `Give students guided practice problems`,
          `Circulate and help students who are struggling`,
          `Summarize key points and assign homework`,
        ],
        studentExpectations: 'Students should be familiar with the previous lesson material and ready to continue building on that knowledge.',
        assessmentIdea: 'Ask 3-4 oral questions related to yesterday\'s lesson at the start, then check understanding with a quick practice problem during class.',
        materialsNeeded: ['Student textbooks', 'Whiteboard and markers', 'Notebook for notes', 'Practice worksheets'],
      };

      // Populate popup context with fallback data
      popupContext.teachingInstructions = (aiLessonDNA.teachingInstructions as string[]) || [];
      popupContext.studentExpectations = (aiLessonDNA.studentExpectations as string) || '';
      popupContext.assessmentIdea = (aiLessonDNA.assessmentIdea as string) || '';
      popupContext.materialsNeeded = (aiLessonDNA.materialsNeeded as string[]) || [];
    }

    // Update substitution with full context — store both lessonDNA and the popup-ready subContext
    await db.substitution.update({
      where: { id: substitutionId },
      data: {
        lessonDNA: JSON.stringify(aiLessonDNA),
        subContext: JSON.stringify(popupContext),
      },
    });

    return NextResponse.json({
      success: true,
      substitutionId,
      context: popupContext,
      aiLessonDNA,
    });
  } catch (error) {
    console.error('Error generating substitute context:', error);
    return NextResponse.json({ error: 'Failed to generate substitute context' }, { status: 500 });
  }
}
