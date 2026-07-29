import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { teacherId, grade, section, subject, topic, day, period } = await request.json();

    if (!teacherId || !grade || !subject) {
      return NextResponse.json({ error: 'teacherId, grade, and subject are required' }, { status: 400 });
    }

    // Get teacher info
    const teacher = await db.teacher.findUnique({ where: { id: teacherId } });
    if (!teacher) {
      return NextResponse.json({ error: 'Teacher not found' }, { status: 404 });
    }

    // Get curriculum info if available
    const curricula = await db.curriculum.findMany();
    const curriculumInfo = curricula.length > 0
      ? curricula.map(c => `${c.name} (${c.board})`).join(', ')
      : 'Standard national curriculum';

    // Period time mapping
    const periodTimes: Record<number, { start: string; end: string }> = {
      1: { start: '08:00', end: '08:45' },
      2: { start: '08:50', end: '09:35' },
      3: { start: '09:40', end: '10:25' },
      4: { start: '10:40', end: '11:25' },
      5: { start: '11:30', end: '12:15' },
      6: { start: '12:45', end: '13:30' },
      7: { start: '13:35', end: '14:20' },
      8: { start: '14:25', end: '15:10' },
    };
    const timeSlot = periodTimes[period] || { start: '08:00', end: '08:45' };
    const duration = period >= 6 ? '45 minutes' : '45 minutes';

    // Use z-ai-web-dev-sdk to generate comprehensive lesson plan
    let lessonPlan;
    try {
      const zaiModule = await import('z-ai-web-dev-sdk');
      const ZAI = zaiModule.default || zaiModule;
      const zai = await ZAI.create();

      const result = await zai.chat.completions.create({
        model: 'deepseek-ai/DeepSeek-V3',
        messages: [
          {
            role: 'system',
            content: `You are an expert educational AI with deep knowledge of pedagogy, curriculum design, and differentiated instruction. You generate comprehensive, practical lesson plans that teachers can use immediately. Always respond in valid JSON format only, no markdown.`,
          },
          {
            role: 'user',
            content: `Generate a detailed, comprehensive lesson plan for the following:

**Teacher**: ${teacher.name} (${teacher.subject} specialist)
**Grade**: ${grade}
**Section**: ${section}
**Subject**: ${subject}
**Topic**: ${topic || 'General ' + subject + ' topic'}
**Day**: ${day}
**Period**: ${period} (${timeSlot.start} - ${timeSlot.end}, ${duration})
**Curriculum**: ${curriculumInfo}

Generate a lesson plan that:
1. Is age-appropriate for ${grade}
2. Aligns with ${curriculumInfo} standards
3. Includes differentiated instruction for different learning levels
4. Has clear, measurable learning objectives
5. Includes assessment strategies
6. Considers the 45-minute time constraint
7. Includes engaging activities and varied teaching methods

Return ONLY a JSON object with these exact fields:
{
  "title": "Lesson title",
  "gradeLevel": "${grade}",
  "subject": "${subject}",
  "topic": "Specific topic covered",
  "duration": "${duration}",
  "curriculum": "${curriculumInfo}",
  "learningObjectives": ["objective1", "objective2", "objective3"],
  "keyVocabulary": ["term1", "term2", "term3", "term4"],
  "materials": ["material1", "material2", "material3"],
  "warmUp": {
    "activity": "Description of warm-up activity",
    "duration": "5 minutes",
    "instructions": "Step-by-step instructions"
  },
  "mainInstruction": {
    "activities": [
      {
        "name": "Activity name",
        "duration": "10 minutes",
        "description": "Detailed description",
        "teacherAction": "What the teacher does",
        "studentAction": "What students do"
      }
    ]
  },
  "differentiatedActivities": {
    "belowLevel": "Activity for struggling learners",
    "onLevel": "Activity for on-level learners",
    "aboveLevel": "Extension activity for advanced learners"
  },
  "assessmentStrategies": {
    "formative": "How to assess during the lesson",
    "summative": "End-of-lesson assessment",
    "exitTicket": "Quick exit ticket question"
  },
  "closure": {
    "activity": "How to wrap up the lesson",
    "duration": "3 minutes",
    "summary": "Key takeaways to reinforce"
  },
  "homework": {
    "task": "Homework assignment description",
    "purpose": "Why this homework reinforces learning",
    "estimatedTime": "15-20 minutes"
  },
  "teachingTips": [
    "Tip 1 for this specific lesson",
    "Tip 2 for classroom management",
    "Tip 3 for engagement"
  ],
  "crossCurricularLinks": ["Link to another subject area"],
  "reflectionPrompts": ["Prompt for teacher self-reflection"]
}`,
          },
        ],
      });

      const content = result.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        lessonPlan = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in AI response');
      }
    } catch (aiError) {
      console.error('AI generation error, using fallback:', aiError);
      // Fallback lesson plan
      lessonPlan = {
        title: `${topic || subject} - Lesson Plan for ${grade} ${section}`,
        gradeLevel: grade,
        subject,
        topic: topic || `General ${subject} topic`,
        duration,
        curriculum: curriculumInfo,
        learningObjectives: [
          `Understand key concepts of ${topic || subject}`,
          `Apply knowledge through guided and independent practice`,
          `Demonstrate mastery through formative assessment`,
        ],
        keyVocabulary: [subject + ' terminology', 'Key concept', 'Core principle', 'Application'],
        materials: ['Textbook', 'Whiteboard and markers', 'Worksheets', 'Visual aids'],
        warmUp: {
          activity: `Quick review quiz on previous ${subject} lesson`,
          duration: '5 minutes',
          instructions: 'Ask 3-4 recall questions from the previous lesson. Use think-pair-share for engagement.',
        },
        mainInstruction: {
          activities: [
            {
              name: `Direct Instruction - ${topic || subject}`,
              duration: '15 minutes',
              description: `Introduce the main concept of ${topic || subject} with examples and visual aids`,
              teacherAction: 'Present new material using board examples and real-world connections',
              studentAction: 'Take notes, ask clarifying questions, participate in guided examples',
            },
            {
              name: 'Guided Practice',
              duration: '12 minutes',
              description: 'Work through examples together as a class',
              teacherAction: 'Guide students through practice problems, checking for understanding',
              studentAction: 'Work through examples on whiteboards/paper, share answers',
            },
            {
              name: 'Independent Practice',
              duration: '10 minutes',
              description: 'Students work independently on practice problems',
              teacherAction: 'Circulate, provide support to struggling students, challenge advanced ones',
              studentAction: 'Complete assigned practice problems independently',
            },
          ],
        },
        differentiatedActivities: {
          belowLevel: 'Provide step-by-step guided worksheet with worked examples and visual supports',
          onLevel: 'Standard practice problems with increasing difficulty',
          aboveLevel: 'Challenge problems that extend the concept to new situations',
        },
        assessmentStrategies: {
          formative: 'Observe student work during guided practice, use thumbs up/down for understanding checks',
          summative: 'Review completed independent practice for accuracy',
          exitTicket: `Write one thing you learned about ${topic || subject} today`,
        },
        closure: {
          activity: 'Class summary and exit ticket',
          duration: '3 minutes',
          summary: `Review key points of ${topic || subject} and preview next lesson`,
        },
        homework: {
          task: `Complete practice problems on ${topic || subject} (textbook page TBD)`,
          purpose: 'Reinforce concepts learned in class and prepare for next lesson',
          estimatedTime: '15-20 minutes',
        },
        teachingTips: [
          'Use the first 2 minutes to settle the class and set expectations',
          'Call on different students to ensure wide participation',
          'Check for understanding every 10 minutes using quick formative checks',
        ],
        crossCurricularLinks: ['Connects to critical thinking and problem-solving skills'],
        reflectionPrompts: ['Which students needed the most support today?', 'What would I change about the pacing?'],
      };
    }

    return NextResponse.json({ lessonPlan });
  } catch (error) {
    console.error('Error generating lesson plan:', error);
    return NextResponse.json({ error: 'Failed to generate lesson plan' }, { status: 500 });
  }
}
