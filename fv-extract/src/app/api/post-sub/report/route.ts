import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import ZAI from '@/lib/ollama';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const assignmentId = searchParams.get('assignmentId');

    if (!assignmentId) {
      return NextResponse.json(
        { success: false, error: 'assignmentId query parameter is required' },
        { status: 400 },
      );
    }

    const report = await db.postSubReport.findUnique({
      where: { assignmentId },
      include: {
        assignment: {
          include: {
            substitutionRequest: {
              include: {
                schedule: {
                  include: { subject: true, section: { include: { grade: true } }, timeSlot: true },
                },
                originalTeacher: true,
              },
            },
            substituteTeacher: { select: { id: true, name: true, department: true } },
          },
        },
      },
    });

    if (!report) {
      return NextResponse.json(
        { success: false, error: 'No post-sub report found for this assignment' },
        { status: 404 },
      );
    }

    // Parse JSON fields for frontend consumption
    const enriched = {
      ...report,
      topicsCovered: JSON.parse(report.topicsCovered || '[]'),
      studentQuestions: JSON.parse(report.studentQuestions || '[]'),
      areasOfDifficulty: JSON.parse(report.areasOfDifficulty || '[]'),
      suggestedFollowUp: JSON.parse(report.suggestedFollowUp || '{}'),
      subject: report.assignment.substitutionRequest.schedule.subject.name,
      grade: report.assignment.substitutionRequest.schedule.section.grade.name,
      section: report.assignment.substitutionRequest.schedule.section.name,
      originalTeacher: report.assignment.substitutionRequest.originalTeacher.name,
      substituteTeacher: report.assignment.substituteTeacher.name,
      date: report.assignment.substitutionRequest.date,
    };

    return NextResponse.json({ success: true, data: enriched });
  } catch (error) {
    console.error('[POST_SUB_REPORT_GET_ERROR]', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch post-sub report' },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      assignmentId,
      topicsCovered,
      studentQuestions,
      areasOfDifficulty,
      classBehaviorNotes,
      completionPercentage,
    } = body as {
      assignmentId: string;
      topicsCovered?: string;
      studentQuestions?: string;
      areasOfDifficulty?: string;
      classBehaviorNotes?: string;
      completionPercentage?: number;
    };

    if (!assignmentId) {
      return NextResponse.json(
        { success: false, error: 'assignmentId is required' },
        { status: 400 },
      );
    }

    const assignment = await db.substitutionAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        substitutionRequest: {
          include: {
            schedule: {
              include: {
                subject: true,
                section: { include: { grade: true, students: true } },
                timeSlot: true,
              },
            },
            originalTeacher: true,
          },
        },
        substituteTeacher: true,
        lessonPack: true,
      },
    });

    if (!assignment) {
      return NextResponse.json(
        { success: false, error: 'Substitution assignment not found' },
        { status: 404 },
      );
    }

    const schedule = assignment.substitutionRequest.schedule;
    const subject = schedule.subject;
    const section = schedule.section;
    const originalTeacher = assignment.substitutionRequest.originalTeacher;
    const substituteTeacher = assignment.substituteTeacher;

    // Get original lesson plan context
    const lessonPack = assignment.lessonPack;
    let generatedPlan: Record<string, unknown> | null = null;
    if (lessonPack?.generatedPlan) {
      try {
        generatedPlan = JSON.parse(lessonPack.generatedPlan);
      } catch { /* ignore parse error */ }
    }

    const zai = await ZAI.create();

    const systemPrompt = `You are an expert educational analyst specializing in post-substitution handoff reports. You produce ONLY valid JSON, no markdown, no code fences. Your reports help returning teachers seamlessly resume their classes with full context about what happened during their absence.`;

    const userPrompt = `Generate a comprehensive AI-enhanced post-substitution handoff report.

SUBSTITUTION CONTEXT:
- Subject: ${subject.name}, Grade ${section.grade.level}, Section ${section.name}
- Original Teacher: ${originalTeacher.name} (${originalTeacher.designation || 'Teacher'}, ${originalTeacher.department || 'Dept'})
- Substitute: ${substituteTeacher.name} (${substituteTeacher.designation || 'Teacher'}, ${substituteTeacher.department || 'Dept'})
- Date: ${assignment.substitutionRequest.date}
- Time: ${schedule.timeSlot.startTime} - ${schedule.timeSlot.endTime}
- Planned Topic: ${assignment.topic || schedule.topic || 'As per curriculum'}
${generatedPlan ? `- Generated Lesson Plan Topic: ${generatedPlan.topic || 'N/A'}` : ''}
- Student Count: ${section.students.length}

SUBSTITUTE TEACHER'S INPUT:
- Topics Covered: ${topicsCovered || 'Not reported'}
- Student Questions Observed: ${studentQuestions || 'None noted'}
- Areas of Difficulty: ${areasOfDifficulty || 'None noted'}
- Class Behavior Notes: ${classBehaviorNotes || 'Normal'}
- Completion Percentage: ${completionPercentage || 0}%

Generate JSON with these fields:
{
  "topicsCovered": ["topic1", "topic2"] (structured list of what was actually covered),
  "studentQuestions": ["q1", "q2", "q3"] (key questions students asked that indicate understanding gaps),
  "areasOfDifficulty": ["area1", "area2"] (specific topics/concepts students struggled with),
  "classBehaviorNotes": "Detailed behavioral observations with specific patterns noted",
  "suggestedFollowUp": {
    "topic": "Recommended next topic for the returning teacher",
    "reviewTopics": ["topics that need re-teaching or reinforcement"],
    "homeworkAdjustment": "Suggestion for adjusting upcoming homework based on progress",
    "assessmentRecommendation": "Suggested assessment approach to gauge retention",
    "pacingAdjustment": "Whether to speed up, maintain, or slow down pace"
  },
  "completionPercentage": 85 (estimated 0-100),
  "overallEffectiveness": 4 (1-5 scale, how well the substitution went),
  "keyTakeawaysForReturningTeacher": ["critical points the returning teacher must know"],
  "recommendedPreparationForNextClass": ["what the returning teacher should prepare"]
}`;

    let report: Record<string, unknown> = {
      topicsCovered: topicsCovered ? topicsCovered.split(',').map((t: string) => t.trim()) : [],
      studentQuestions: studentQuestions ? studentQuestions.split(',').map((q: string) => q.trim()) : [],
      areasOfDifficulty: areasOfDifficulty ? areasOfDifficulty.split(',').map((a: string) => a.trim()) : [],
      classBehaviorNotes: classBehaviorNotes || '',
      suggestedFollowUp: {},
      completionPercentage: completionPercentage || 0,
      overallEffectiveness: 3,
      keyTakeawaysForReturningTeacher: [],
      recommendedPreparationForNextClass: [],
    };

    try {
      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.6,
        max_tokens: 4000,
      });
      const content = completion.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const raw = JSON.parse(jsonMatch[0]);
        report = {
          topicsCovered: Array.isArray(raw.topicsCovered) ? raw.topicsCovered : report.topicsCovered,
          studentQuestions: Array.isArray(raw.studentQuestions) ? raw.studentQuestions : report.studentQuestions,
          areasOfDifficulty: Array.isArray(raw.areasOfDifficulty) ? raw.areasOfDifficulty : report.areasOfDifficulty,
          classBehaviorNotes: raw.classBehaviorNotes || report.classBehaviorNotes,
          suggestedFollowUp: raw.suggestedFollowUp || report.suggestedFollowUp,
          completionPercentage: typeof raw.completionPercentage === 'number' ? raw.completionPercentage : (completionPercentage || 0),
          overallEffectiveness: typeof raw.overallEffectiveness === 'number' ? raw.overallEffectiveness : 3,
          keyTakeawaysForReturningTeacher: Array.isArray(raw.keyTakeawaysForReturningTeacher) ? raw.keyTakeawaysForReturningTeacher : [],
          recommendedPreparationForNextClass: Array.isArray(raw.recommendedPreparationForNextClass) ? raw.recommendedPreparationForNextClass : [],
        };
      }
    } catch (aiError) {
      console.error('[POST_SUB_AI_ERROR]', aiError);
      // Fallback data is already set
    }

    // Create/update the PostSubReport record
    const saved = await db.postSubReport.upsert({
      where: { assignmentId },
      create: {
        assignmentId,
        topicsCovered: JSON.stringify(report.topicsCovered),
        studentQuestions: JSON.stringify(report.studentQuestions),
        areasOfDifficulty: JSON.stringify(report.areasOfDifficulty),
        classBehaviorNotes: typeof report.classBehaviorNotes === 'string' ? report.classBehaviorNotes : JSON.stringify(report.classBehaviorNotes),
        suggestedFollowUp: JSON.stringify(report.suggestedFollowUp),
        completionPercentage: typeof report.completionPercentage === 'number' ? report.completionPercentage : 0,
        overallEffectiveness: typeof report.overallEffectiveness === 'number' ? report.overallEffectiveness : 3,
        aiGenerated: true,
      },
      update: {
        topicsCovered: JSON.stringify(report.topicsCovered),
        studentQuestions: JSON.stringify(report.studentQuestions),
        areasOfDifficulty: JSON.stringify(report.areasOfDifficulty),
        classBehaviorNotes: typeof report.classBehaviorNotes === 'string' ? report.classBehaviorNotes : JSON.stringify(report.classBehaviorNotes),
        suggestedFollowUp: JSON.stringify(report.suggestedFollowUp),
        completionPercentage: typeof report.completionPercentage === 'number' ? report.completionPercentage : 0,
        overallEffectiveness: typeof report.overallEffectiveness === 'number' ? report.overallEffectiveness : 3,
        aiGenerated: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...saved,
        parsedTopicsCovered: report.topicsCovered,
        parsedStudentQuestions: report.studentQuestions,
        parsedAreasOfDifficulty: report.areasOfDifficulty,
        parsedSuggestedFollowUp: report.suggestedFollowUp,
        keyTakeawaysForReturningTeacher: report.keyTakeawaysForReturningTeacher,
        recommendedPreparationForNextClass: report.recommendedPreparationForNextClass,
      },
    });
  } catch (error) {
    console.error('[POST_SUB_REPORT_POST_ERROR]', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to generate post-sub report' },
      { status: 500 },
    );
  }
}

