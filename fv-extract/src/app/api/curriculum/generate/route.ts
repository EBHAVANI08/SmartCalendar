import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { board, grades } = await request.json();

    if (!board || !grades || !Array.isArray(grades) || grades.length === 0) {
      return NextResponse.json({ error: 'board and grades array are required' }, { status: 400 });
    }

    // Get existing curricula for context
    const existingCurricula = await db.curriculum.findMany();
    const curriculumContext = existingCurricula.length > 0
      ? existingCurricula.map(c => `${c.name} (${c.board}): subjects=${c.subjects}`).join('\n')
      : 'Standard national curriculum';

    const boardSubjectMap: Record<string, Record<string, string[]>> = {
      CBSE: {
        'Grade 1': ['Mathematics', 'English', 'EVS', 'Hindi'],
        'Grade 2': ['Mathematics', 'English', 'EVS', 'Hindi'],
        'Grade 3': ['Mathematics', 'English', 'EVS', 'Hindi'],
        'Grade 4': ['Mathematics', 'English', 'EVS', 'Hindi'],
        'Grade 5': ['Mathematics', 'English', 'EVS', 'Hindi'],
        'Grade 6': ['Mathematics', 'English', 'Science', 'Social Science', 'Hindi'],
        'Grade 7': ['Mathematics', 'English', 'Science', 'Social Science', 'Hindi'],
        'Grade 8': ['Mathematics', 'English', 'Science', 'Social Science', 'Hindi'],
        'Grade 9': ['Mathematics', 'English', 'Science', 'Social Science', 'Hindi'],
        'Grade 10': ['Mathematics', 'English', 'Science', 'Social Science', 'Hindi'],
        'Grade 11': ['Physics', 'Chemistry', 'Mathematics', 'English', 'Computer Science'],
        'Grade 12': ['Physics', 'Chemistry', 'Mathematics', 'English', 'Computer Science'],
      },
      ICSE: {
        'Grade 1': ['Mathematics', 'English', 'EVS', 'Second Language'],
        'Grade 2': ['Mathematics', 'English', 'EVS', 'Second Language'],
        'Grade 3': ['Mathematics', 'English', 'Science', 'Social Studies', 'Second Language'],
        'Grade 4': ['Mathematics', 'English', 'Science', 'Social Studies', 'Second Language'],
        'Grade 5': ['Mathematics', 'English', 'Science', 'Social Studies', 'Second Language'],
        'Grade 6': ['Mathematics', 'English', 'Physics-Chemistry', 'Biology', 'History-Civics', 'Geography'],
        'Grade 7': ['Mathematics', 'English', 'Physics-Chemistry', 'Biology', 'History-Civics', 'Geography'],
        'Grade 8': ['Mathematics', 'English', 'Physics-Chemistry', 'Biology', 'History-Civics', 'Geography'],
        'Grade 9': ['Mathematics', 'English', 'Physics', 'Chemistry', 'Biology', 'History-Civics', 'Geography'],
        'Grade 10': ['Mathematics', 'English', 'Physics', 'Chemistry', 'Biology', 'History-Civics', 'Geography'],
        'Grade 11': ['Physics', 'Chemistry', 'Mathematics', 'English', 'Computer Science'],
        'Grade 12': ['Physics', 'Chemistry', 'Mathematics', 'English', 'Computer Science'],
      },
    };

    // Default to CBSE if board not found
    const subjectMap = boardSubjectMap[board] || boardSubjectMap['CBSE'];

    let allTopics: Array<{
      board: string;
      grade: string;
      subject: string;
      unit: string;
      chapter: string;
      topic: string;
      subtopics: string[];
      estimatedPeriods: number;
      sequenceOrder: number;
      learningOutcomes: string[];
      bloomLevel: string;
      prerequisiteIds: string[];
    }> = [];

    // Use AI to generate curriculum for each grade
    for (const grade of grades) {
      const subjects = subjectMap[grade] || ['Mathematics', 'English', 'Science'];

      try {
        const ZAI = (await import('@/lib/ollama')).default;
        const zai = await ZAI.create();

        const result = await zai.chat.completions.create({
          messages: [
            {
              role: 'system',
              content: `You are an expert curriculum designer for ${board} education board. You create detailed, structured annual curriculum with topics organized by subject, unit, chapter, and topic. You follow ${board} standards precisely. Always respond in valid JSON format only, no markdown.`,
            },
            {
              role: 'user',
              content: `Generate an annual curriculum for ${grade} under the ${board} board for these subjects: ${subjects.join(', ')}.

For each subject, create 3-5 units, each with 2-3 chapters, and each chapter with 2-4 topics. For each topic provide:
- Name of the topic
- Subtopics (array of 2-3 subtopic strings)
- Estimated periods needed (1-5)
- Learning outcomes (array of 2-3 outcome strings)
- Bloom's taxonomy level (one of: Remember, Understand, Apply, Analyze, Evaluate, Create)
- A sequence order number starting from 1

Return ONLY a JSON object with this structure:
{
  "topics": [
    {
      "grade": "${grade}",
      "subject": "Subject Name",
      "unit": "Unit Name",
      "chapter": "Chapter Name",
      "topic": "Topic Name",
      "subtopics": ["subtopic1", "subtopic2"],
      "estimatedPeriods": 3,
      "sequenceOrder": 1,
      "learningOutcomes": ["outcome1", "outcome2"],
      "bloomLevel": "Understand"
    }
  ]
}`,
            },
          ],
        });

        const content = result.choices?.[0]?.message?.content || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.topics && Array.isArray(parsed.topics)) {
            allTopics = allTopics.concat(
              parsed.topics.map((t: Record<string, unknown>) => ({
                board,
                grade: t.grade || grade,
                subject: t.subject || '',
                unit: t.unit || '',
                chapter: t.chapter || '',
                topic: t.topic || '',
                subtopics: Array.isArray(t.subtopics) ? t.subtopics : [],
                estimatedPeriods: Number(t.estimatedPeriods) || 1,
                sequenceOrder: Number(t.sequenceOrder) || 0,
                learningOutcomes: Array.isArray(t.learningOutcomes) ? t.learningOutcomes : [],
                bloomLevel: t.bloomLevel || 'Remember',
                prerequisiteIds: [],
              }))
            );
          }
        }
      } catch (aiError) {
        console.error('AI curriculum generation error for grade', grade, ', using fallback:', aiError);
        // Fallback: generate basic curriculum topics
        for (const subject of subjects) {
          const units = [`Unit 1: Introduction to ${subject}`, `Unit 2: Core Concepts of ${subject}`, `Unit 3: Advanced ${subject}`];
          let seq = 1;
          for (const unit of units) {
            for (let ch = 1; ch <= 2; ch++) {
              for (let tp = 1; tp <= 2; tp++) {
                allTopics.push({
                  board,
                  grade,
                  subject,
                  unit,
                  chapter: `Chapter ${ch}: ${subject} Topic Area ${ch}`,
                  topic: `${subject} Topic ${seq}`,
                  subtopics: [`${subject} Subtopic ${seq}.1`, `${subject} Subtopic ${seq}.2`],
                  estimatedPeriods: 2,
                  sequenceOrder: seq,
                  learningOutcomes: [`Understand key concepts of ${subject} topic ${seq}`, `Apply knowledge through practice`],
                  bloomLevel: seq <= 3 ? 'Remember' : seq <= 6 ? 'Understand' : 'Apply',
                  prerequisiteIds: [],
                });
                seq++;
              }
            }
          }
        }
      }
    }

    // Save to database
    const savedTopics = [];
    for (const topicData of allTopics) {
      const saved = await db.curriculumTopic.create({
        data: {
          board: topicData.board,
          grade: topicData.grade,
          subject: topicData.subject,
          unit: topicData.unit,
          chapter: topicData.chapter,
          topic: topicData.topic,
          subtopics: JSON.stringify(topicData.subtopics),
          estimatedPeriods: topicData.estimatedPeriods,
          sequenceOrder: topicData.sequenceOrder,
          learningOutcomes: JSON.stringify(topicData.learningOutcomes),
          bloomLevel: topicData.bloomLevel,
          prerequisiteIds: JSON.stringify(topicData.prerequisiteIds),
        },
      });
      savedTopics.push(saved);
    }

    return NextResponse.json({
      success: true,
      count: savedTopics.length,
      topics: savedTopics,
    });
  } catch (error) {
    console.error('Error generating curriculum:', error);
    return NextResponse.json({ error: 'Failed to generate curriculum' }, { status: 500 });
  }
}

