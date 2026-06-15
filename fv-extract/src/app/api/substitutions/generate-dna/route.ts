import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

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

    // Use groq-sdk to generate lesson DNA
    let ZAI: any;
    try {
      const ZAI = (await import('@/lib/ollama')).default;
    } catch {
      // Fallback if SDK not available
      const lessonDNA = {
        topicSummary: `${substitution.subject} lesson for ${substitution.grade} ${substitution.section}`,
        keyConcepts: ['Core topic review', 'Practice exercises', 'Assessment preparation'],
        teachingTips: [
          'Start with a brief review of the previous lesson',
          'Use visual aids and examples',
          'Encourage student participation',
          'Monitor understanding through quick checks',
        ],
        studentBehaviorPatterns: [
          'Students are generally engaged in the morning periods',
          'Attention may wane after lunch - use interactive activities',
          'Group work helps maintain focus',
        ],
        recommendedActivities: [
          'Quick quiz on previous lesson (5 min)',
          'Main instruction with examples (20 min)',
          'Guided practice in pairs (15 min)',
          'Independent work and wrap-up (5 min)',
        ],
      };

      await db.substitution.update({
        where: { id: substitutionId },
        data: { lessonDNA: JSON.stringify(lessonDNA) },
      });

      return NextResponse.json({ lessonDNA, substitutionId });
    }

    const zai = await ZAI.create();
    const result = await zai.chat.completions.create({
      model: 'deepseek-ai/DeepSeek-V3',
      messages: [
        {
          role: 'system',
          content: 'You are an expert educational AI assistant. Generate detailed lesson DNA for substitute teachers. Always respond in valid JSON format.',
        },
        {
          role: 'user',
          content: `Generate lesson DNA for a substitution:
- Subject: ${substitution.subject}
- Grade: ${substitution.grade} ${substitution.section}
- Period: ${substitution.period}
- Absent Teacher: ${substitution.absentTeacher.name}
- Reason for absence: ${substitution.reason || 'Not specified'}

Return a JSON object with these fields:
1. topicSummary: A brief summary of what this lesson should cover
2. keyConcepts: Array of 3-5 key concepts to teach
3. teachingTips: Array of 4-5 practical teaching tips for the substitute
4. studentBehaviorPatterns: Array of 3-4 behavioral patterns to watch for
5. recommendedActivities: Array of 4-5 recommended classroom activities with time allocations

Only return valid JSON, no markdown formatting.`,
        },
      ],
    });

    let lessonDNA;
    try {
      const content = result.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      lessonDNA = jsonMatch ? JSON.parse(jsonMatch[0]) : {
        topicSummary: `${substitution.subject} lesson for ${substitution.grade} ${substitution.section}`,
        keyConcepts: ['Core topic review', 'Practice exercises'],
        teachingTips: ['Review previous lesson', 'Use interactive methods'],
        studentBehaviorPatterns: ['Monitor engagement levels'],
        recommendedActivities: ['Quiz', 'Main instruction', 'Practice'],
      };
    } catch {
      lessonDNA = {
        topicSummary: `${substitution.subject} lesson for ${substitution.grade} ${substitution.section}`,
        keyConcepts: ['Core topic review', 'Practice exercises'],
        teachingTips: ['Review previous lesson', 'Use interactive methods'],
        studentBehaviorPatterns: ['Monitor engagement levels'],
        recommendedActivities: ['Quiz', 'Main instruction', 'Practice'],
      };
    }

    await db.substitution.update({
      where: { id: substitutionId },
      data: { lessonDNA: JSON.stringify(lessonDNA) },
    });

    return NextResponse.json({ lessonDNA, substitutionId });
  } catch (error) {
    console.error('Error generating lesson DNA:', error);
    return NextResponse.json({ error: 'Failed to generate lesson DNA' }, { status: 500 });
  }
}

