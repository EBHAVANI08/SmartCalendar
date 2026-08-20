import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import ZAI from '@/lib/ollama';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { teacherId } = body as {
      teacherId: string;
      curriculumId?: string;
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
          orderBy: [{ day: 'asc' }, { period: 'asc' }],
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

    const zai = await ZAI.create();
    const generatedPlans: Array<Record<string, unknown>> = [];
    const errors: string[] = [];

    for (const schedule of teacher.schedules) {
      try {
        const scheduledTopic = schedule.topic || `${schedule.subject} - Period ${schedule.period}`;

        // Check if plan exists
        const existingPlan = await db.lessonPlan.findFirst({
          where: {
            teacherId: teacher.id,
            grade: schedule.grade,
            section: schedule.section,
            subject: schedule.subject,
          },
        });

        if (existingPlan) {
          generatedPlans.push({
            scheduleId: schedule.id,
            existing: true,
            planId: existingPlan.id,
            topic: existingPlan.topic,
          });
          continue;
        }

        let planContent: Record<string, unknown> = {
          topic: scheduledTopic,
          objectives: [`Master core principles of ${scheduledTopic}`, `Solve practice problems for ${schedule.subject}`],
          warmUp: '5-minute recap of previous concepts',
          mainContent: 'Step-by-step concept walkthrough with live examples',
          differentiation: 'Extra practice sheets for advanced learners; guided scaffold for basics',
          assessment: 'Exit ticket questions and in-class worksheet check',
          resources: ['Textbook', 'Worksheet', 'Blackboard'],
          homework: `Complete practice exercise for ${scheduledTopic}`,
          keyVocabulary: [scheduledTopic, schedule.subject, 'Application', 'Analysis'],
        };

        try {
          const completion: any = await zai.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [
              { role: 'system', content: 'You are an expert lesson planner. Return ONLY valid JSON with topic, objectives, warmUp, mainContent, differentiation, assessment, resources, homework, keyVocabulary.' },
              { role: 'user', content: `Create a lesson plan for Grade ${schedule.grade} ${schedule.section}, Subject: ${schedule.subject}, Topic: ${scheduledTopic}` },
            ],
            max_tokens: 1500,
          });
          const content = completion.choices?.[0]?.message?.content || '';
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            planContent = { ...planContent, ...parsed };
          }
        } catch {
          // Fallback plan content is already set
        }

        const plan = await db.lessonPlan.create({
          data: {
            teacherId: teacher.id,
            grade: schedule.grade,
            section: schedule.section,
            subject: schedule.subject,
            topic: scheduledTopic,
            board: 'CBSE',
            duration: 40,
            aiGenerated: true,
            planContent: JSON.stringify(planContent),
            objectives: JSON.stringify(planContent.objectives || []),
            warmUp: typeof planContent.warmUp === 'string' ? planContent.warmUp : JSON.stringify(planContent.warmUp || ''),
            mainContent: typeof planContent.mainContent === 'string' ? planContent.mainContent : JSON.stringify(planContent.mainContent || ''),
            differentiation: typeof planContent.differentiation === 'string' ? planContent.differentiation : JSON.stringify(planContent.differentiation || {}),
            assessment: typeof planContent.assessment === 'string' ? planContent.assessment : JSON.stringify(planContent.assessment || {}),
            resources: JSON.stringify(planContent.resources || []),
            homework: typeof planContent.homework === 'string' ? planContent.homework : planContent.homework ? JSON.stringify(planContent.homework) : null,
            keyVocabulary: JSON.stringify(planContent.keyVocabulary || []),
          },
        });

        generatedPlans.push({
          scheduleId: schedule.id,
          existing: false,
          planId: plan.id,
          topic: plan.topic,
          subject: schedule.subject,
          grade: schedule.grade,
          section: schedule.section,
          day: schedule.day,
          period: schedule.period,
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
