import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import ZAI from '@/lib/ollama';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { teacherId, topic, subjectId, gradeLevel, curriculumId } = body as {
      teacherId: string;
      topic: string;
      subjectId: string;
      gradeLevel?: number;
      curriculumId?: string;
    };

    if (!teacherId || !topic || !subjectId) {
      return NextResponse.json(
        { success: false, error: 'teacherId, topic, and subjectId are required' },
        { status: 400 },
      );
    }

    const teacher = await db.teacher.findUnique({ where: { id: teacherId } });
    if (!teacher) {
      return NextResponse.json(
        { success: false, error: 'Teacher not found' },
        { status: 404 },
      );
    }

    const subject = await db.subject.findUnique({ where: { id: subjectId } });
    if (!subject) {
      return NextResponse.json(
        { success: false, error: 'Subject not found' },
        { status: 404 },
      );
    }

    // Gather curriculum context if available
    let curriculumContext = '';
    if (curriculumId) {
      const curriculum = await db.curriculum.findUnique({ where: { id: curriculumId } });
      if (curriculum && gradeLevel) {
        const cs = await db.curriculumSubject.findUnique({
          where: {
            curriculumId_subjectId_gradeLevel: {
              curriculumId,
              subjectId,
              gradeLevel,
            },
          },
        });
        if (cs) {
          const csTopics = JSON.parse(cs.topics || '[]');
          const csObjectives = JSON.parse(cs.learningObjectives || '[]');
          const csAssessment = cs.assessmentCriteria ? JSON.parse(cs.assessmentCriteria) : [];
          curriculumContext = `
CURRICULUM ALIGNMENT (${curriculum.name}):
- Related Curriculum Topics: ${csTopics.join(', ')}
- Curriculum Learning Objectives: ${csObjectives.join('; ')}
- Assessment Criteria: ${csAssessment.join('; ')}
- Recommended Weekly Hours: ${cs.weeklyHours || 'N/A'}`;
        }
      }
    }

    // Get teacher's recent lesson plans for this subject for context
    const recentPlans = await db.lessonPlan.findMany({
      where: {
        teacherId,
        subjectId,
        ...(gradeLevel ? { gradeLevel } : {}),
      },
      take: 3,
      orderBy: { createdAt: 'desc' },
    });

    const recentTopicsStr = recentPlans.map(lp => lp.topic).join(', ') || 'None available';

    const zai = await ZAI.create();

    const systemPrompt = `You are an expert educational content designer and pedagogy specialist. You produce ONLY valid JSON, no markdown, no code fences, no extra text. Your materials must be thorough, practical, and ready for immediate classroom use.`;

    const userPrompt = `Generate COMPLETE study material for a teacher preparing a class session.

TEACHER CONTEXT:
- Name: ${teacher.name}
- Designation: ${teacher.designation || 'Teacher'}
- Department: ${teacher.department || 'General'}
- Recent Topics Taught: ${recentTopicsStr}

SUBJECT & TOPIC:
- Subject: ${subject.name}
- Grade Level: ${gradeLevel || 'Not specified (adjust appropriately)'}
- Topic: ${topic}
${curriculumContext}

Generate a detailed JSON response with these fields:
{
  "topicTitle": "Formatted, engaging topic title",
  "gradeLevel": ${gradeLevel || 'null'},
  "estimatedDuration": "Total class duration in minutes",
  "subTopics": [
    {
      "title": "Sub-topic title",
      "duration": "Estimated time in minutes",
      "keyPoints": ["point1", "point2", "point3"],
      "teachingApproach": "How to introduce and develop this sub-topic"
    }
  ],
  "keyConceptsAndDefinitions": [
    {
      "term": "Key term or concept",
      "definition": "Clear, grade-appropriate definition",
      "explanation": "Detailed explanation with context"
    }
  ],
  "teachingScript": {
    "introduction": "Opening hook and context-setting (2-3 minutes)",
    "mainContent": "Step-by-step narrative for delivering the core content",
    "transitions": "How to move between sub-topics smoothly",
    "conclusion": "Summary and connection to next lesson"
  },
  "examplesAndIllustrations": [
    {
      "title": "Example title",
      "description": "Detailed example with step-by-step solution or explanation",
      "visualAid": "Description of diagram or visual to draw on board",
      "relevance": "Why this example matters for understanding"
    }
  ],
  "discussionQuestions": [
    "Thought-provoking question 1",
    "Question 2 to check understanding",
    "Higher-order thinking question 3"
  ],
  "practiceProblems": [
    {
      "question": "Problem statement",
      "type": "individual | group | pair-work",
      "difficulty": "easy | medium | hard",
      "hint": "Hint for students who are stuck",
      "solution": "Complete solution or answer key"
    }
  ],
  "activities": [
    {
      "name": "Activity name",
      "type": "individual | group | hands-on | interactive",
      "duration": "Time in minutes",
      "instructions": "Step-by-step instructions",
      "materials": ["material1", "material2"],
      "learningOutcome": "What students will achieve"
    }
  ],
  "assessmentIdeas": {
    "formativeChecks": ["Quick checks during the lesson"],
    "exitTicket": "Brief assessment at end of class",
    "rubric": "Grading criteria if applicable"
  },
  "homeworkAssignment": {
    "task": "Detailed homework description",
    "dueDate": "Next class or specific timeline",
    "rubric": "How it will be graded",
    "extensionActivity": "Optional challenge for advanced students"
  },
  "differentiationStrategies": {
    "forAdvanced": ["Extension activities or deeper questions"],
    "forOnLevel": ["Standard approach and scaffolding"],
    "forStruggling": ["Simplified approaches, visual aids, peer support"]
  },
  "crossCurricularLinks": ["Connections to other subjects"],
  "commonMisconceptions": [
    {
      "misconception": "What students commonly get wrong",
      "correction": "How to address it"
    }
  ]
}

Make the content thorough, specific to the topic, grade-appropriate, and immediately usable by the teacher.`;

    let material: Record<string, unknown> = {};
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
        material = JSON.parse(jsonMatch[0]);
      }
    } catch (aiError) {
      console.error('[TEACHER_MATERIAL_AI_ERROR]', aiError);
      material = {
        topicTitle: topic,
        gradeLevel: gradeLevel || null,
        estimatedDuration: '40 minutes',
        subTopics: [],
        keyConceptsAndDefinitions: [],
        teachingScript: { introduction: '', mainContent: '', transitions: '', conclusion: '' },
        examplesAndIllustrations: [],
        discussionQuestions: [],
        practiceProblems: [],
        activities: [],
        assessmentIdeas: { formativeChecks: [], exitTicket: '', rubric: '' },
        homeworkAssignment: { task: '', dueDate: '', rubric: '', extensionActivity: '' },
        differentiationStrategies: { forAdvanced: [], forOnLevel: [], forStruggling: [] },
        crossCurricularLinks: [],
        commonMisconceptions: [],
      };
    }

    return NextResponse.json({
      success: true,
      data: {
        teacher: { id: teacher.id, name: teacher.name },
        subject: { id: subject.id, name: subject.name },
        topic,
        gradeLevel: gradeLevel || null,
        curriculumId: curriculumId || null,
        material,
      },
    });
  } catch (error) {
    console.error('[TEACHER_GENERATE_MATERIAL_ERROR]', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to generate study material' },
      { status: 500 },
    );
  }
}
