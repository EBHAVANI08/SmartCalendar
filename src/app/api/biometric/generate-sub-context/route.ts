import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Load AI config at runtime (not at compile time) to avoid memory-heavy SDK import
function loadAIConfig(): { baseUrl: string; apiKey: string; chatId?: string; token?: string; userId?: string } | null {
  const configPaths = [
    path.join(process.cwd(), '.z-ai-config'),
    path.join(os.homedir(), '.z-ai-config'),
    '/etc/.z-ai-config'
  ];
  for (const filePath of configPaths) {
    try {
      const configStr = fs.readFileSync(filePath, 'utf-8');
      const config = JSON.parse(configStr);
      if (config.baseUrl && config.apiKey) return config;
    } catch { /* continue */ }
  }
  return null;
}

// Call AI chat completions using native fetch (avoids z-ai-web-dev-sdk import that crashes Turbopack)
async function callAIChat(messages: { role: string; content: string }[], maxTokens: number = 4000) {
  const config = loadAIConfig();
  if (!config) throw new Error('AI config not found');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`,
    'X-Z-AI-From': 'Z',
  };
  if (config.chatId) headers['X-Chat-Id'] = config.chatId;
  if (config.userId) headers['X-User-Id'] = config.userId;
  if (config.token) headers['X-Token'] = config.token;

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      messages,
      max_tokens: maxTokens,
      thinking: { type: 'disabled' },
    }),
  });

  if (!response.ok) {
    throw new Error(`AI API error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

// Generate comprehensive substitute teacher context using AI
// Enhanced to fetch yesterday's lesson plan and generate popup-ready context
export async function POST(request: Request) {
  try {
    let body: { substitutionId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { substitutionId } = body;

    if (!substitutionId || typeof substitutionId !== 'string') {
      return NextResponse.json({ error: 'substitutionId is required' }, { status: 400 });
    }

    let substitution;
    try {
      substitution = await db.substitution.findUnique({
        where: { id: substitutionId },
        include: {
          absentTeacher: true,
          substitute: true,
        },
      });
    } catch (dbErr) {
      console.error('Database error finding substitution:', dbErr);
      return NextResponse.json({ error: 'Database error while finding substitution' }, { status: 500 });
    }

    if (!substitution) {
      return NextResponse.json({ error: 'Substitution not found' }, { status: 404 });
    }

    if (!substitution.absentTeacher) {
      return NextResponse.json({ error: 'Absent teacher data not found for this substitution' }, { status: 404 });
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
    let teacherTodaySchedule: { period: number; grade: string; section: string; subject: string; topic: string | null; startTime: string; endTime: string }[] = [];
    let teacherYesterdaySchedule: { period: number; grade: string; section: string; subject: string; topic: string | null; startTime: string; endTime: string }[] = [];
    try {
      teacherTodaySchedule = await db.schedule.findMany({
        where: { teacherId: substitution.absentTeacherId, day: today },
        orderBy: { period: 'asc' },
      });
    } catch { /* schedule query might fail */ }

    try {
      teacherYesterdaySchedule = await db.schedule.findMany({
        where: { teacherId: substitution.absentTeacherId, day: yesterdayDay },
        orderBy: { period: 'asc' },
      });
    } catch { /* schedule query might fail */ }

    // Find yesterday's specific period details — same grade, same subject, same period
    const yesterdayPeriod = teacherYesterdaySchedule.find(
      (s) => s.period === substitution.period && s.grade === substitution.grade && s.section === substitution.section
    );

    // Also try finding by just period and grade (section might differ)
    const yesterdayPeriodByGrade = !yesterdayPeriod
      ? teacherYesterdaySchedule.find((s) => s.period === substitution.period && s.grade === substitution.grade)
      : null;

    // Also try finding by same grade+section regardless of period
    const yesterdaySameClass = teacherYesterdaySchedule.find(
      (s) => s.grade === substitution.grade && s.section === substitution.section && s.subject === substitution.subject
    );

    const yesterdayScheduleEntry = yesterdayPeriod || yesterdayPeriodByGrade || yesterdaySameClass;

    // ─── Fetch lesson plan for PREVIOUS day's class ───
    let yesterdayLessonPlan = null;
    try {
      yesterdayLessonPlan = await db.lessonPlan.findFirst({
        where: {
          teacherId: substitution.absentTeacherId,
          grade: substitution.grade,
          subject: substitution.subject,
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
      try {
        yesterdayLessonPlan = await db.lessonPlan.findFirst({
          where: {
            teacherId: substitution.absentTeacherId,
            grade: substitution.grade,
            subject: substitution.subject,
          },
          orderBy: { createdAt: 'desc' },
        });
      } catch {
        // LessonPlan table might not have data for this teacher
      }
    }

    // Also try finding lesson plans for this grade+section (not just grade+subject)
    if (!yesterdayLessonPlan && substitution.section) {
      try {
        yesterdayLessonPlan = await db.lessonPlan.findFirst({
          where: {
            teacherId: substitution.absentTeacherId,
            grade: substitution.grade,
            section: substitution.section,
            subject: substitution.subject,
          },
          orderBy: { createdAt: 'desc' },
        });
      } catch {
        // Section-based query might fail
      }
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
            // Also try extracting from planContent
            if (planContent && typeof planContent === 'object' && 'keyVocabulary' in planContent) {
              return (planContent as { keyVocabulary?: string[] }).keyVocabulary;
            }
            return [];
          } catch {
            return [];
          }
        })(),
        activities: (() => {
          try {
            const mc = yesterdayLessonPlan.mainContent ? JSON.parse(yesterdayLessonPlan.mainContent) : null;
            if (mc && typeof mc === 'object' && 'activities' in mc) return (mc as { activities?: string[] }).activities;
            // Extract section descriptions from mainContent array
            if (Array.isArray(mc)) {
              return mc.map((s: { section?: string; description?: string }) => s.section || s.description || '').filter(Boolean);
            }
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

    // Get curriculum context (with error handling)
    let curriculumTopics: { unit: string; topic: string; learningOutcomes: string; bloomLevel: string }[] = [];
    try {
      curriculumTopics = await db.curriculumTopic.findMany({
        where: {
          subject: substitution.subject,
          grade: substitution.grade,
        },
        take: 5,
        orderBy: { sequenceOrder: 'asc' },
      });
    } catch {
      // CurriculumTopic table might not have data
    }

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
      teachingInstructions: [] as string[],
      studentExpectations: '',
      assessmentIdea: '',
      materialsNeeded: [] as string[],
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
      const yesterdayDetailsStr = yesterdayLessonPlan
        ? `Topic: ${yesterdayDetails.topic || 'N/A'}
Objectives: ${yesterdayDetails.objectives?.join(', ') || 'N/A'}
Key Concepts: ${yesterdayDetails.keyConcepts?.join(', ') || 'N/A'}
Activities: ${yesterdayDetails.activities?.join(', ') || 'N/A'}
Homework Assigned: ${yesterdayDetails.homework || 'N/A'}
Resources Used: ${yesterdayDetails.resources?.join(', ') || 'N/A'}`
        : `No formal lesson plan found. Schedule topic: ${yesterdayScheduleEntry?.topic || 'Not available'}`;

      const curriculumContextStr = curriculumTopics.length > 0
        ? curriculumTopics.map((ct) => `- ${ct.unit}: ${ct.topic} (${ct.bloomLevel}) - ${ct.learningOutcomes}`).join('\n')
        : 'No curriculum topics available for this subject and grade.';

      const result = await callAIChat([
        {
          role: 'system',
          content: `You are an expert substitute teacher preparation AI with deep knowledge of CBSE/ICSE/IB curricula. You receive detailed context about an absent teacher's class and generate comprehensive, practical guidance for the substitute teacher. Your guidance must be actionable, specific to the subject and grade, and include step-by-step instructions that a substitute with no prior knowledge of the class can follow. Always respond in valid JSON format only. Do not include markdown code blocks or any text outside the JSON.`,
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
${curriculumContextStr}

Generate a JSON object with these EXACT fields:
1. "yesterdayTopic": Brief title of what was taught yesterday (1 sentence string)
2. "yesterdayDetails": { "keyConcepts": array of 3-4 key concepts taught (strings), "activities": array of 1-2 activities done (strings), "homeworkAssigned": any homework given or "None" }
3. "todayCoveragePlan": { "topic": today's topic as a string, "objectives": array of 2-3 learning objectives (strings), "keyPoints": array of 3-4 key points to cover (strings) }
4. "teachingInstructions": Array of 5-6 step-by-step instructions for the substitute, each as a clear actionable step string
5. "studentExpectations": 2-3 sentences describing what students already know and what they expect to learn today (string)
6. "assessmentIdea": A quick formative assessment the substitute can do (2-3 sentences with specific questions or activity, as a string)
7. "materialsNeeded": Array of 3-5 specific materials needed (strings)

Only return valid JSON, no markdown formatting, no code blocks.`,
        },
      ], 4000);

      const content = result.choices?.[0]?.message?.content || '';

      // Try to extract JSON from the response - handle markdown code blocks
      let jsonStr = content;
      // Remove markdown code block markers if present
      const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim();
      } else {
        // Try to find JSON object in the response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonStr = jsonMatch[0];
        }
      }

      try {
        aiLessonDNA = JSON.parse(jsonStr);
      } catch (parseError) {
        console.error('Failed to parse AI JSON response:', parseError, 'Content:', content.substring(0, 200));
        // Try a more aggressive extraction
        try {
          const aggressiveMatch = content.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/);
          if (aggressiveMatch) {
            aiLessonDNA = JSON.parse(aggressiveMatch[0]);
          }
        } catch {
          // Give up on parsing, use fallback
        }
      }

      // Populate popup context with AI-generated data
      if (aiLessonDNA) {
        popupContext.yesterdayTopic = typeof aiLessonDNA.yesterdayTopic === 'string'
          ? aiLessonDNA.yesterdayTopic
          : popupContext.yesterdayTopic;

        popupContext.yesterdayDetails = {
          ...popupContext.yesterdayDetails,
          ...((typeof aiLessonDNA.yesterdayDetails === 'object' && aiLessonDNA.yesterdayDetails !== null) ? aiLessonDNA.yesterdayDetails as Record<string, unknown> : {}),
        };

        // Handle todayCoveragePlan - can be string or object
        if (typeof aiLessonDNA.todayCoveragePlan === 'string') {
          popupContext.todayCoveragePlan = aiLessonDNA.todayCoveragePlan;
        } else if (typeof aiLessonDNA.todayCoveragePlan === 'object' && aiLessonDNA.todayCoveragePlan !== null) {
          const tcp = aiLessonDNA.todayCoveragePlan as { topic?: string; objectives?: string[]; keyPoints?: string[] };
          // Convert object to a readable string for the popup
          const parts: string[] = [];
          if (tcp.topic) parts.push(tcp.topic);
          if (tcp.objectives && Array.isArray(tcp.objectives) && tcp.objectives.length > 0) {
            parts.push('Objectives: ' + tcp.objectives.join('; '));
          }
          if (tcp.keyPoints && Array.isArray(tcp.keyPoints) && tcp.keyPoints.length > 0) {
            parts.push('Key Points: ' + tcp.keyPoints.join('; '));
          }
          popupContext.todayCoveragePlan = parts.length > 0 ? parts.join('. ') : popupContext.todayCoveragePlan;
        }

        popupContext.teachingInstructions = Array.isArray(aiLessonDNA.teachingInstructions)
          ? (aiLessonDNA.teachingInstructions as string[])
          : [];

        popupContext.studentExpectations = typeof aiLessonDNA.studentExpectations === 'string'
          ? aiLessonDNA.studentExpectations
          : '';

        popupContext.assessmentIdea = typeof aiLessonDNA.assessmentIdea === 'string'
          ? aiLessonDNA.assessmentIdea
          : '';

        popupContext.materialsNeeded = Array.isArray(aiLessonDNA.materialsNeeded)
          ? (aiLessonDNA.materialsNeeded as string[])
          : [];
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
          keyPoints: ['Review previous material', 'Introduce new concepts', 'Practice exercises'],
        },
        teachingInstructions: [
          'Start by greeting students and taking attendance',
          `Review yesterday's topic: ${popupContext.yesterdayTopic}`,
          'Introduce today\'s material using the textbook',
          'Give students guided practice problems',
          'Circulate and help students who are struggling',
          'Summarize key points and assign homework',
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
    try {
      await db.substitution.update({
        where: { id: substitutionId },
        data: {
          lessonDNA: JSON.stringify(aiLessonDNA),
          subContext: JSON.stringify(popupContext),
        },
      });
    } catch (dbError) {
      console.error('Failed to update substitution with context:', dbError);
      // Still return the context even if DB update fails
    }

    return NextResponse.json({
      success: true,
      substitutionId,
      context: popupContext,
      aiLessonDNA,
    });
  } catch (error) {
    console.error('Error generating substitute context:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate substitute context';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
