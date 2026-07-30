import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import ZAI from 'z-ai-web-dev-sdk';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { assignmentId } = body as { assignmentId: string };

    if (!assignmentId) {
      return NextResponse.json({ success: false, error: 'assignmentId is required' }, { status: 400 });
    }

    const substitution = await db.substitution.findUnique({
      where: { id: assignmentId },
      include: { absentTeacher: true, substitute: true },
    });

    if (!substitution) {
      return NextResponse.json({ success: false, error: 'Substitution assignment not found' }, { status: 404 });
    }

    let lessonDNA = {
      topic: substitution.todayTopic || `${substitution.subject} - Review and Practice`,
      learningObjectives: [`Review key ${substitution.subject} concepts for ${substitution.grade}`],
      teachingMethod: 'Review previous content and guide students through practice exercises',
      materials: ['Textbook', 'Whiteboard'],
      activities: ['Review - 10 min', 'Guided Practice - 15 min', 'Independent Work - 10 min', 'Wrap-up - 5 min'],
      assessment: 'Observe student responses during guided practice',
      classroomTips: 'Follow the seating chart, maintain consistent expectations',
      differentiation: 'Provide simpler problems for struggling students',
      dnaMatch: 'This plan serves as a bridge in the curriculum sequence',
      connectionToNextLesson: 'Returning teacher should continue from where this session ends',
    };

    try {
      const zai = await ZAI.create();
      const prompt = `Create a substitute lesson plan for ${substitution.grade} ${substitution.section} ${substitution.subject}. Yesterday: ${substitution.yesterdayTopic}. Today: ${substitution.todayTopic}. Output JSON format.`;
      const completion = await zai.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
      });
      const content = completion.choices?.[0]?.message?.content || '';
      const match = content.match(/\{[\s\S]*\}/);
      if (match) lessonDNA = JSON.parse(match[0]);
    } catch (e) {
      console.error('[LESSON_DNA_AI_ERROR]', e);
    }

    await db.substitution.update({
      where: { id: assignmentId },
      data: { lessonDNA: JSON.stringify(lessonDNA) },
    });

    return NextResponse.json({
      success: true,
      data: { lessonDNA },
    });
  } catch (error) {
    console.error('[LESSON_DNA_GENERATE_ERROR]', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to generate lesson DNA' },
      { status: 500 },
    );
  }
}
