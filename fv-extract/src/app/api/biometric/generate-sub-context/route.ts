import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// Generate comprehensive substitute teacher context using AI
// Includes: yesterday's topic, today's expected topic, lesson DNA, teaching guidance
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

    // Get absent teacher's schedule
    const teacherTodaySchedule = await db.schedule.findMany({
      where: { teacherId: substitution.absentTeacherId, day: today },
      orderBy: { period: 'asc' },
    });

    const teacherYesterdaySchedule = await db.schedule.findMany({
      where: { teacherId: substitution.absentTeacherId, day: yesterdayDay },
      orderBy: { period: 'asc' },
    });

    // Find yesterday's specific period details
    const yesterdayPeriod = teacherYesterdaySchedule.find(s => s.period === substitution.period);

    // Get any lesson plans for the absent teacher
    const lessonPlans = await db.lessonPlan.findMany({
      where: {
        teacherId: substitution.absentTeacherId,
        grade: substitution.grade,
        subject: substitution.subject,
      },
      orderBy: { createdAt: 'desc' },
      take: 2,
    });

    // Get curriculum context
    const curriculumTopics = await db.curriculumTopic.findMany({
      where: {
        subject: substitution.subject,
        grade: substitution.grade,
      },
      take: 5,
      orderBy: { sequenceOrder: 'asc' },
    });

    // Build context object
    const contextData = {
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
      yesterdayClass: {
        date: yesterdayStr,
        day: yesterdayDay,
        topic: yesterdayPeriod?.topic || substitution.yesterdayTopic || 'Previous lesson',
        period: substitution.period,
        grade: substitution.grade,
        section: substitution.section,
      },
      todayExpectedTopic: substitution.todayTopic || substitution.subject,
      recentLessonPlans: lessonPlans.map(lp => ({
        topic: lp.topic,
        objectives: JSON.parse(lp.objectives || '[]'),
        homework: lp.homework,
      })),
      curriculumContext: curriculumTopics.map(ct => ({
        unit: ct.unit,
        topic: ct.topic,
        learningOutcomes: JSON.parse(ct.learningOutcomes || '[]'),
        bloomLevel: ct.bloomLevel,
      })),
      fullDaySchedule: teacherTodaySchedule.map(s => ({
        period: s.period,
        grade: s.grade,
        section: s.section,
        subject: s.subject,
        topic: s.topic,
        time: `${s.startTime}-${s.endTime}`,
      })),
    };

    // Use AI to generate enhanced lesson DNA for the substitute
    let aiLessonDNA = null;
    try {
      const ZAI = (await import('@/lib/ollama')).default;
      const zai = await ZAI.create();

      const result = await zai.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: `You are an expert substitute teacher preparation AI. You receive detailed context about an absent teacher's class and generate comprehensive guidance for the substitute teacher. This includes what was taught yesterday, what should be taught today, and practical teaching tips. Always respond in valid JSON format.`,
          },
          {
            role: 'user',
            content: `Generate comprehensive substitute teacher guidance for:
- Subject: ${substitution.subject}
- Grade: ${substitution.grade} ${substitution.section}
- Period: ${substitution.period}
- Absent Teacher: ${substitution.absentTeacher.name}
- Date: ${substitution.date}

YESTERDAY'S CLASS (What the regular teacher taught):
${yesterdayPeriod?.topic || substitution.yesterdayTopic || 'Previous lesson'}

TODAY'S EXPECTED TOPIC (What should be taught today):
${substitution.todayTopic || substitution.subject}

RECENT LESSON OBJECTIVES:
${lessonPlans.map(lp => `- ${lp.topic}: ${lp.objectives}`).join('\n')}

CURRICULUM CONTEXT:
${curriculumTopics.map(ct => `- ${ct.unit}: ${ct.topic} (${ct.bloomLevel}) - ${ct.learningOutcomes}`).join('\n')}

Generate a JSON object with these fields:
1. continuityNote: Brief note connecting yesterday's lesson to today's (1-2 sentences)
2. yesterdaySummary: What was covered in the previous class
3. todayLessonPlan: { topic, objectives (array), warmUp (string with duration), mainActivity (string with duration), practice (string with duration), closing (string with duration) }
4. teachingTips: Array of 4-5 specific tips for this subject/grade
5. studentExpectations: What students already know and what they should achieve today
6. assessmentIdea: Quick formative assessment idea (2-3 sentences)
7. keyVocabulary: Array of 4-5 key terms for today's lesson
8. differentiationNotes: Brief note on supporting struggling and advanced students

Only return valid JSON, no markdown.`,
          },
        ],
        max_tokens: 4000,
      });

      const content = result.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        aiLessonDNA = JSON.parse(jsonMatch[0]);
      }
    } catch (aiError) {
      console.error('AI context generation error:', aiError);
      // Fallback context
      aiLessonDNA = {
        continuityNote: `This lesson continues from yesterday's topic: ${substitution.yesterdayTopic || 'previous lesson'}.`,
        yesterdaySummary: substitution.yesterdayTopic || 'Previous lesson content',
        todayLessonPlan: {
          topic: substitution.todayTopic || substitution.subject,
          objectives: [`Continue learning about ${substitution.todayTopic || substitution.subject}`],
          warmUp: 'Review yesterday\'s key concepts (5 min)',
          mainActivity: 'Teach new material with examples (20 min)',
          practice: 'Guided practice and exercises (15 min)',
          closing: 'Summary and homework assignment (5 min)',
        },
        teachingTips: ['Review previous lesson', 'Use visual aids', 'Encourage participation'],
        studentExpectations: 'Students should be familiar with previous material',
        assessmentIdea: 'Quick oral quiz on key concepts from yesterday and today',
        keyVocabulary: [substitution.subject],
        differentiationNotes: 'Provide extra support for struggling students; challenge advanced students with extension problems',
      };
    }

    // Update substitution with full context
    await db.substitution.update({
      where: { id: substitutionId },
      data: {
        lessonDNA: JSON.stringify(aiLessonDNA),
        subContext: JSON.stringify(contextData),
      },
    });

    return NextResponse.json({
      success: true,
      substitutionId,
      context: contextData,
      aiLessonDNA,
    });
  } catch (error) {
    console.error('Error generating substitute context:', error);
    return NextResponse.json({ error: 'Failed to generate substitute context' }, { status: 500 });
  }
}

