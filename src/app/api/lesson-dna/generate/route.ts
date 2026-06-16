import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import ZAI from '@/lib/ollama';

/**
 * POST /api/lesson-dna/generate
 * Generates an AI lesson plan for a substitute teacher covering a specific
 * Substitution, and saves it as a LessonPlan record.
 * Body: { substitutionId: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { substitutionId } = body as { substitutionId: string };

    if (!substitutionId) {
      return NextResponse.json({ success: false, error: 'substitutionId is required' }, { status: 400 });
    }

    const substitution = await db.substitution.findUnique({
      where: { id: substitutionId },
      include: { absentTeacher: true, substitute: true },
    });

    if (!substitution) {
      return NextResponse.json({ success: false, error: 'Substitution not found' }, { status: 404 });
    }
    if (!substitution.substituteId) {
      return NextResponse.json({ success: false, error: 'No substitute assigned yet' }, { status: 400 });
    }

    const studentCount = await db.student.count({ where: { grade: substitution.grade, section: substitution.section } });

    // Recent topics taught by the absent teacher for this subject (most recent lesson plans)
    const recentPlans = await db.lessonPlan.findMany({
      where: { teacherId: substitution.absentTeacherId, subject: substitution.subject },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const zai = await ZAI.create();

    const systemPrompt = `You are an expert AI lesson planner specializing in creating tailored substitute teacher lesson plans. You produce ONLY valid JSON, no markdown, no code fences, no extra text. Your plans must be practical, engaging, and specifically adapted for a substitute teacher who may not know the class well.`;

    const userPrompt = `Generate a comprehensive TAILORED substitute lesson plan with the following context:

SUBSTITUTION CONTEXT:
- Subject: ${substitution.subject} (${substitution.grade}, Section ${substitution.section})
- Original Teacher: ${substitution.absentTeacher.name}
- Substitute Teacher: ${substitution.substitute?.name}
- Date: ${substitution.date}, Period: ${substitution.period}
- Scheduled Topic: ${substitution.todayTopic || substitution.yesterdayTopic || 'As per curriculum'}
- Number of Students: ${studentCount}
- Absence Reason: ${substitution.reason}

RECENT TOPICS BY ORIGINAL TEACHER: ${recentPlans.map(lp => lp.topic).join(', ') || 'None available'}

Generate a JSON response with these fields:
{
  "topic": "Specific topic for this session",
  "objectives": ["3-5 measurable learning objectives"],
  "warmUp": "Opening activity (5 min)",
  "mainContent": "Step-by-step teaching approach with timing breakdown",
  "differentiation": "How to adapt for advanced, on-level, and struggling students",
  "assessment": "Quick assessment strategy to gauge understanding",
  "resources": ["materials needed - board, textbook chapters, worksheets, etc."],
  "homework": "Suggested homework or follow-up task",
  "keyVocabulary": ["key terms for this topic"]
}`;

    let plan: Record<string, unknown> = {
      topic: substitution.todayTopic || `${substitution.subject} - Review and Practice`,
      objectives: [`Review key ${substitution.subject} concepts for ${substitution.grade}`],
      warmUp: 'Quick recap of previous topic (5 min)',
      mainContent: 'Review previous content and guide students through practice exercises',
      differentiation: 'Provide simpler problems for struggling students, extension questions for advanced',
      assessment: 'Observe student responses during guided practice',
      resources: ['Textbook', 'Whiteboard'],
      homework: 'Practice problems from the current chapter',
      keyVocabulary: [],
    };

    try {
      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 4000,
      });
      const content = completion.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        plan = JSON.parse(jsonMatch[0]);
      }
    } catch (aiError) {
      console.error('[LESSON_DNA_AI_ERROR]', aiError);
      // Fallback plan is already set above
    }

    const saved = await db.lessonPlan.create({
      data: {
        teacherId: substitution.substituteId,
        grade: substitution.grade,
        section: substitution.section,
        subject: substitution.subject,
        topic: (plan.topic as string) || substitution.subject,
        aiGenerated: true,
        planContent: JSON.stringify(plan),
        objectives: JSON.stringify(plan.objectives || []),
        warmUp: plan.warmUp as string,
        mainContent: plan.mainContent as string,
        differentiation: plan.differentiation as string,
        assessment: plan.assessment as string,
        resources: JSON.stringify(plan.resources || []),
        homework: plan.homework as string,
        keyVocabulary: JSON.stringify(plan.keyVocabulary || []),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        lessonPlan: saved,
        studentCount,
        substitutionContext: {
          subject: substitution.subject,
          grade: substitution.grade,
          section: substitution.section,
          date: substitution.date,
          originalTeacher: substitution.absentTeacher.name,
          substituteTeacher: substitution.substitute?.name,
        },
      },
    });
  } catch (error) {
    console.error('[LESSON_DNA_GENERATE_ERROR]', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to generate lesson DNA' },
      { status: 500 },
    );
  }
}
