import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import ZAI from '@/lib/ollama';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { assignmentId } = body as { assignmentId: string };

    if (!assignmentId) {
      return NextResponse.json(
        { success: false, error: 'assignmentId is required' },
        { status: 400 },
      );
    }

    // Fetch the substitution assignment with full context
    const assignment = await db.substitutionAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        substitutionRequest: {
          include: {
            schedule: {
              include: {
                subject: true,
                section: {
                  include: {
                    grade: true,
                    students: { select: { id: true, name: true, rollNo: true } },
                  },
                },
                timeSlot: true,
                teacher: true,
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

    const subReq = assignment.substitutionRequest;
    const schedule = subReq.schedule;
    const section = schedule.section;
    const subject = schedule.subject;
    const originalTeacher = subReq.originalTeacher;
    const substituteTeacher = assignment.substituteTeacher;
    const students = section.students;
    const gradeLevel = section.grade.level;

    // Get the absent teacher's lesson plans for this subject/grade
    const teacherLessonPlans = await db.lessonPlan.findMany({
      where: {
        teacherId: originalTeacher.id,
        subjectId: subject.id,
        gradeLevel,
      },
      take: 5,
      orderBy: { createdAt: 'desc' },
    });

    // Get curriculum-aligned topics if available
    const school = await db.school.findFirst({
      include: { curriculum: true },
    });
    let curriculumTopics: string[] = [];
    let curriculumObjectives: string[] = [];
    let curriculumAssessment: string[] = [];
    if (school?.curriculum) {
      const cs = await db.curriculumSubject.findUnique({
        where: {
          curriculumId_subjectId_gradeLevel: {
            curriculumId: school.curriculum.id,
            subjectId: subject.id,
            gradeLevel,
          },
        },
      });
      if (cs) {
        curriculumTopics = JSON.parse(cs.topics);
        curriculumObjectives = JSON.parse(cs.learningObjectives);
        if (cs.assessmentCriteria) curriculumAssessment = JSON.parse(cs.assessmentCriteria);
      }
    }

    // Get previous substitution data for this section+subject (if any)
    const previousSubs = await db.substitutionRequest.findMany({
      where: {
        subjectId: subject.id,
        status: 'RESOLVED',
        schedule: { sectionId: section.id },
      },
      include: {
        assignments: { where: { status: 'ACCEPTED' }, take: 1 },
      },
      take: 3,
      orderBy: { createdAt: 'desc' },
    });

    const zai = await ZAI.create();

    const systemPrompt = `You are an expert AI lesson planner specializing in creating tailored substitute teacher lesson plans. You produce ONLY valid JSON, no markdown, no code fences, no extra text. Your plans must be practical, engaging, and curriculum-aligned, while being specifically adapted for a substitute teacher who may not know the class well.`;

    const userPrompt = `Generate a comprehensive TAILORED substitute lesson plan with the following context:

SUBSTITUTION CONTEXT:
- Subject: ${subject.name} (Grade ${gradeLevel}, Section ${section.name})
- Original Teacher: ${originalTeacher.name} (${originalTeacher.designation || 'Teacher'}, ${originalTeacher.department || 'Department'})
- Substitute Teacher: ${substituteTeacher.name} (${substituteTeacher.designation || 'Teacher'}, ${substituteTeacher.department || 'Department'})
- Date: ${subReq.date}
- Time Slot: ${schedule.timeSlot.name} (${schedule.timeSlot.startTime} - ${schedule.timeSlot.endTime})
- Scheduled Topic: ${schedule.topic || 'As per curriculum'}
- Number of Students: ${students.length}
- Absence Reason: ${subReq.reason} ${subReq.reasonDetail || ''}

CURRICULUM ALIGNMENT:
- Curriculum: ${school?.curriculum?.name || 'Standard'}
- Curriculum Topics for this Grade: ${curriculumTopics.length > 0 ? curriculumTopics.join(', ') : 'Not specified'}
- Curriculum Learning Objectives: ${curriculumObjectives.length > 0 ? curriculumObjectives.join('; ') : 'Not specified'}
- Assessment Criteria: ${curriculumAssessment.length > 0 ? curriculumAssessment.join('; ') : 'Standard'}

PREVIOUS LESSON CONTEXT:
- Recent Topics by Original Teacher: ${teacherLessonPlans.map(lp => lp.topic).join(', ') || 'None available'}
- Previous Substitutions for this Class: ${previousSubs.length} (topics covered: ${previousSubs.map(ps => ps.assignments[0]?.topic || 'unknown').join(', ') || 'none'})

STUDENT ROSTER (first 10): ${students.slice(0, 10).map(s => `${s.rollNo}. ${s.name}`).join(', ')}

Generate a JSON response with these fields:
{
  "topic": "Specific topic for this session (aligned with curriculum progression and previous lessons)",
  "learningObjectives": ["3-5 measurable objectives aligned with curriculum standards"],
  "teachingMethod": "Detailed methodology adapted for a substitute teacher - step by step approach with timing breakdown",
  "materials": ["List of materials needed - board, textbook chapters, worksheets, etc."],
  "activities": ["3-5 structured activities with estimated duration (e.g., 'Introduction & Review - 5 min', 'Main Activity - 15 min')"],
  "assessment": "Quick assessment strategy to gauge understanding before the period ends",
  "classroomTips": "3-5 specific tips for managing this grade/section as a substitute",
  "differentiation": "How to adapt for advanced, on-level, and struggling students",
  "dnaMatch": "How this plan connects to the original teacher's teaching sequence and curriculum progression",
  "connectionToNextLesson": "What the returning teacher should pick up from in the next class"
}`;

    let lessonDNA: Record<string, unknown> = {
      topic: schedule.topic || `${subject.name} - Review and Practice`,
      learningObjectives: [`Review key ${subject.name} concepts for Grade ${gradeLevel}`],
      teachingMethod: 'Review previous content and guide students through practice exercises',
      materials: ['Textbook', 'Whiteboard'],
      activities: ['Review - 10 min', 'Guided Practice - 15 min', 'Independent Work - 10 min', 'Wrap-up - 5 min'],
      assessment: 'Observe student responses during guided practice',
      classroomTips: 'Follow the seating chart, maintain consistent expectations',
      differentiation: 'Provide simpler problems for struggling students, extension questions for advanced',
      dnaMatch: 'This plan serves as a bridge in the curriculum sequence',
      connectionToNextLesson: 'Returning teacher should continue from where this session ends',
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
        lessonDNA = JSON.parse(jsonMatch[0]);
      }
    } catch (aiError) {
      console.error('[LESSON_DNA_AI_ERROR]', aiError);
      // Fallback plan is already set above
    }

    // Save/update the lesson pack
    const pack = await db.lessonPack.upsert({
      where: { assignmentId },
      create: {
        assignmentId,
        previousTopics: JSON.stringify(teacherLessonPlans.map(lp => lp.topic)),
        generatedPlan: JSON.stringify(lessonDNA),
        rosterSnapshot: JSON.stringify(students.map(s => ({ name: s.name, rollNo: s.rollNo }))),
        emergencyContacts: JSON.stringify([]),
      },
      update: {
        previousTopics: JSON.stringify(teacherLessonPlans.map(lp => lp.topic)),
        generatedPlan: JSON.stringify(lessonDNA),
        rosterSnapshot: JSON.stringify(students.map(s => ({ name: s.name, rollNo: s.rollNo }))),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        lessonDNA,
        pack,
        curriculumTopics,
        curriculumObjectives,
        previousTopics: teacherLessonPlans.map(lp => lp.topic),
        studentCount: students.length,
        substitutionContext: {
          subject: subject.name,
          grade: section.grade.name,
          section: section.name,
          date: subReq.date,
          timeSlot: `${schedule.timeSlot.startTime} - ${schedule.timeSlot.endTime}`,
          originalTeacher: originalTeacher.name,
          substituteTeacher: substituteTeacher.name,
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

