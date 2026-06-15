import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const subject = searchParams.get('subject');
    const grade = searchParams.get('grade');
    const board = searchParams.get('board');
    const search = searchParams.get('search');

    const where: Record<string, unknown> = {};
    if (subject) where.subject = subject;
    if (grade) where.grade = grade;
    if (board) where.board = board;

    let plans = await db.lessonPlan.findMany({
      where,
      include: { teacher: { select: { id: true, name: true, subject: true } } },
      orderBy: { createdAt: 'desc' },
    });

    // Search filter (applied in-memory since Prisma doesn't support full-text search on SQLite easily)
    if (search) {
      const q = search.toLowerCase();
      plans = plans.filter(
        (p) =>
          p.topic.toLowerCase().includes(q) ||
          p.subject.toLowerCase().includes(q) ||
          p.grade.toLowerCase().includes(q) ||
          (p.objectives && p.objectives.toLowerCase().includes(q))
      );
    }

    return NextResponse.json(plans);
  } catch (error) {
    console.error('Error fetching lesson plans:', error);
    return NextResponse.json({ error: 'Failed to fetch lesson plans' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { teacherId, grade, section, subject, topic, board } = await request.json();

    if (!grade || !subject || !topic) {
      return NextResponse.json({ error: 'grade, subject, and topic are required' }, { status: 400 });
    }

    // Get teacher info if provided
    let teacherName = 'AI Generated';
    if (teacherId) {
      const teacher = await db.teacher.findUnique({ where: { id: teacherId } });
      if (teacher) teacherName = teacher.name;
    }

    // Get curriculum info if available
    const curricula = await db.curriculum.findMany();
    const curriculumInfo = curricula.length > 0
      ? curricula.map(c => `${c.name} (${c.board})`).join(', ')
      : `${board || 'CBSE'} curriculum`;

    let planContent: Record<string, unknown>;
    try {
      const ZAI = (await import('@/lib/ollama')).default;
      const zai = await ZAI.create();

      const result = await zai.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: `You are an expert educational AI specializing in lesson plan creation for ${board || 'CBSE'} board. Generate comprehensive, practical lesson plans. Always respond in valid JSON format only, no markdown.`,
          },
          {
            role: 'user',
            content: `Generate a detailed lesson plan for:
**Teacher**: ${teacherName}
**Grade**: ${grade}
**Section**: ${section || 'A'}
**Subject**: ${subject}
**Topic**: ${topic}
**Board**: ${board || 'CBSE'}
**Duration**: 40 minutes
**Curriculum**: ${curriculumInfo}

Return ONLY a JSON object with these exact fields:
{
  "title": "Lesson title",
  "objectives": ["obj1", "obj2", "obj3"],
  "warmUp": "Description of warm-up activity (5 min)",
  "mainContent": [
    {"section": "Section name", "duration": "10 min", "description": "Detailed description"}
  ],
  "differentiation": {"struggling": "Support for struggling learners", "onLevel": "Standard activity", "advanced": "Extension for advanced learners"},
  "assessment": {"formative": "During-lesson assessment", "summative": "End-of-lesson assessment"},
  "resources": ["resource1", "resource2"],
  "homework": "Homework assignment",
  "keyVocabulary": ["term1", "term2", "term3"]
}`,
          },
        ],
      });

      const content = result.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        planContent = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in AI response');
      }
    } catch (aiError) {
      console.error('AI lesson plan generation error, using fallback:', aiError);
      planContent = {
        title: `${topic} - Lesson Plan for ${grade}`,
        objectives: [
          `Understand key concepts of ${topic}`,
          `Apply knowledge through guided practice`,
          `Demonstrate mastery through assessment`,
        ],
        warmUp: `Quick review quiz on previous ${subject} lesson (5 min)`,
        mainContent: [
          { section: 'Direct Instruction', duration: '15 min', description: `Introduce the main concept of ${topic} with examples and visual aids` },
          { section: 'Guided Practice', duration: '12 min', description: 'Work through examples together as a class' },
          { section: 'Independent Practice', duration: '10 min', description: 'Students work independently on practice problems' },
        ],
        differentiation: {
          struggling: 'Provide step-by-step guided worksheet with worked examples',
          onLevel: 'Standard practice problems with increasing difficulty',
          advanced: 'Challenge problems that extend the concept to new situations',
        },
        assessment: {
          formative: 'Observe student work during guided practice',
          summative: 'Review completed independent practice for accuracy',
        },
        resources: ['Textbook', 'Whiteboard and markers', 'Worksheets'],
        homework: `Complete practice problems on ${topic}`,
        keyVocabulary: [subject + ' terminology', 'Key concept', 'Core principle'],
      };
    }

    // Save to database
    const savedPlan = await db.lessonPlan.create({
      data: {
        teacherId: teacherId || null,
        grade,
        section: section || null,
        subject,
        topic,
        board: board || 'CBSE',
        duration: 40,
        aiGenerated: true,
        planContent: JSON.stringify(planContent),
        objectives: JSON.stringify(planContent.objectives || []),
        warmUp: typeof planContent.warmUp === 'string' ? planContent.warmUp : JSON.stringify(planContent.warmUp),
        mainContent: JSON.stringify(planContent.mainContent || []),
        differentiation: JSON.stringify(planContent.differentiation || {}),
        assessment: JSON.stringify(planContent.assessment || {}),
        resources: JSON.stringify(planContent.resources || []),
        homework: planContent.homework || null,
        keyVocabulary: JSON.stringify(planContent.keyVocabulary || []),
      },
    });

    return NextResponse.json({ success: true, lessonPlan: savedPlan });
  } catch (error) {
    console.error('Error creating lesson plan:', error);
    return NextResponse.json({ error: 'Failed to create lesson plan' }, { status: 500 });
  }
}
