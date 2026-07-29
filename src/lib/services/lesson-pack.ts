/**
 * Lesson Pack Generator — Feature 2.2
 *
 * Auto-generates lesson continuity packs for substitute teachers.
 * Uses z-ai-web-dev-sdk to generate a 45-min lesson plan.
 */

import { db } from '@/lib/db';
import ZAI from 'z-ai-web-dev-sdk';

interface LessonPackData {
  assignmentId: string;
  previousTopics: string[];
  generatedPlan: string;
  rosterSnapshot: any[];
  emergencyContacts: any[];
}

/**
 * Generate a lesson pack for a substitution assignment.
 */
export async function generateLessonPack(assignmentId: string): Promise<LessonPackData | null> {
  // Check if pack already exists
  const existing = await db.lessonPack.findUnique({ where: { assignmentId } });
  if (existing) {
    return {
      assignmentId,
      previousTopics: JSON.parse(existing.previousTopics),
      generatedPlan: existing.generatedPlan,
      rosterSnapshot: JSON.parse(existing.rosterSnapshot),
      emergencyContacts: JSON.parse(existing.emergencyContacts),
    };
  }

  // Get assignment details
  const assignment = await db.substitutionAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      substitutionRequest: {
        include: {
          schedule: { include: { subject: true, grade: true, section: true, timeSlot: true, teacher: true } },
          originalTeacher: true,
        },
      },
      substituteTeacher: true,
    },
  });

  if (!assignment) return null;

  const schedule = assignment.substitutionRequest.schedule;

  // Get previous topics (last 3)
  const previousTopics = await getPreviousTopics(
    schedule.subjectId,
    schedule.sectionId,
    assignment.substitutionRequest.date
  );

  // Get student roster
  const students = await db.student.findMany({
    where: { sectionId: schedule.sectionId },
    orderBy: { rollNo: 'asc' },
  });

  const rosterSnapshot = students.map(s => ({
    name: s.name,
    rollNo: s.rollNo,
    avatar: s.avatar || null,
    notes: s.notes || null,
  }));

  // Get emergency contacts (from section's class teacher + HOD)
  const emergencyContacts: any[] = [];
  // Find class teacher for this section (the teacher with the most periods in this section)
  const sectionTeachers = await db.schedule.findMany({
    where: { sectionId: schedule.sectionId },
    include: { teacher: true },
    take: 20,
  });

  // Add HOD if found
  const hod = sectionTeachers.find(s => s.teacher.designation?.includes('HOD'));
  if (hod) {
    emergencyContacts.push({
      name: hod.teacher.name,
      role: 'HOD',
      phone: hod.teacher.phone,
      email: hod.teacher.email,
    });
  }

  // Add original teacher as contact
  emergencyContacts.push({
    name: assignment.substitutionRequest.originalTeacher.name,
    role: 'Original Teacher',
    phone: assignment.substitutionRequest.originalTeacher.phone,
    email: assignment.substitutionRequest.originalTeacher.email,
  });

  // Generate lesson plan using AI
  let generatedPlan: string;
  try {
    generatedPlan = await generateLessonPlanAI({
      subject: schedule.subject.name,
      grade: schedule.grade.name,
      section: schedule.section.name,
      previousTopics,
      todayTopic: assignment.topic || schedule.topic || 'General review',
      originalTeacher: schedule.teacher.name,
      timeSlot: `${schedule.timeSlot.name} (${schedule.timeSlot.startTime}-${schedule.timeSlot.endTime})`,
    });
  } catch {
    // Fallback: generate a simple plan without AI
    generatedPlan = generateFallbackLessonPlan(
      schedule.subject.name,
      schedule.grade.name,
      previousTopics,
      assignment.topic || schedule.topic || 'General review'
    );
  }

  // Store in DB
  await db.lessonPack.create({
    data: {
      assignmentId,
      previousTopics: JSON.stringify(previousTopics),
      generatedPlan,
      rosterSnapshot: JSON.stringify(rosterSnapshot),
      emergencyContacts: JSON.stringify(emergencyContacts),
    },
  });

  return {
    assignmentId,
    previousTopics,
    generatedPlan,
    rosterSnapshot,
    emergencyContacts,
  };
}

/**
 * Get the last 3 topics taught in a subject+section.
 */
async function getPreviousTopics(subjectId: string, sectionId: string, date: string): Promise<string[]> {
  const topics: string[] = [];
  let checkDate = date;

  for (let i = 0; i < 10 && topics.length < 3; i++) {
    // Go to previous working day
    const d = new Date(checkDate + 'T00:00:00');
    const day = d.getDay();
    if (day === 1) d.setDate(d.getDate() - 3);
    else if (day === 0) d.setDate(d.getDate() - 2);
    else d.setDate(d.getDate() - 1);
    checkDate = d.toISOString().split('T')[0];

    const dayOfWeek = d.getDay();
    const scheduleDay = dayOfWeek >= 1 && dayOfWeek <= 5 ? dayOfWeek : 1;

    const prevSchedule = await db.schedule.findFirst({
      where: { subjectId, sectionId, dayOfWeek: scheduleDay },
    });

    if (prevSchedule) {
      // Check if there was a substitution for this schedule on this date
      const sub = await db.substitutionRequest.findFirst({
        where: { scheduleId: prevSchedule.id, date: checkDate, status: 'RESOLVED' },
        include: { assignments: { where: { status: 'ACCEPTED' } } },
      });

      if (sub?.assignments[0]?.topic) {
        topics.push(sub.assignments[0].topic);
      } else if (prevSchedule.topic) {
        topics.push(prevSchedule.topic);
      }
    }
  }

  return topics;
}

/**
 * Generate a lesson plan using z-ai-web-dev-sdk.
 */
async function generateLessonPlanAI(params: {
  subject: string;
  grade: string;
  section: string;
  previousTopics: string[];
  todayTopic: string;
  originalTeacher: string;
  timeSlot: string;
}): Promise<string> {
  const zai = await ZAI.create();

  const prompt = `You are an experienced substitute teacher preparing for a class. Generate a detailed 45-minute lesson plan.

Subject: ${params.subject}
Grade: ${params.grade} Section ${params.section}
Time Slot: ${params.timeSlot}
Original Teacher: ${params.originalTeacher} (absent)
Previous Topics Covered: ${params.previousTopics.length > 0 ? params.previousTopics.join(', ') : 'No previous topics available'}
Today's Planned Topic: ${params.todayTopic}

Generate a structured lesson plan with:
1. **Warm-up (5 min)**: An engaging opening activity
2. **Review (5 min)**: Quick recap of previous topic
3. **Main Content (20 min)**: Key concepts with explanations
4. **Group Activity (10 min)**: Collaborative exercise
5. **Wrap-up & Exit Tickets (5 min)**: Summary + 3 quick assessment questions

Format as clean markdown with clear sections and bullet points.`;

  const response = await zai.chat.completions.create({
    messages: [
      { role: 'system', content: 'You are a helpful lesson plan generator for substitute teachers. Always output clean, well-structured markdown.' },
      { role: 'user', content: prompt },
    ],
  });

  return response.choices[0]?.message?.content || generateFallbackLessonPlan(params.subject, params.grade, params.previousTopics, params.todayTopic);
}

/**
 * Fallback lesson plan generator (no AI needed).
 */
function generateFallbackLessonPlan(subject: string, grade: string, previousTopics: string[], todayTopic: string): string {
  const prevTopicsText = previousTopics.length > 0
    ? previousTopics.map((t, i) => `${i + 1}. ${t}`).join('\n')
    : 'No previous topics available. Start with a general review.';

  return `# Lesson Plan: ${subject} — Grade ${grade}

## Today's Topic: ${todayTopic}

## Previous Topics Covered
${prevTopicsText}

---

### 1. Warm-up (5 minutes)
- Quick mental math/vocabulary drill related to the subject
- Ask 2-3 recall questions from the previous class

### 2. Review (5 minutes)
- Brief recap of key concepts from the last lesson
- Address any questions students may have

### 3. Main Content (20 minutes)
- Introduce today's topic with clear explanations
- Write key points on the board
- Provide 2-3 worked examples
- Check for understanding with quick questions

### 4. Group Activity (10 minutes)
- Divide class into groups of 4-5
- Assign a practice problem or discussion topic
- Groups present their answers/findings

### 5. Wrap-up & Exit Tickets (5 minutes)
- Summarize the key takeaways
- **Exit Ticket Questions:**
  1. What was the main concept learned today?
  2. Give one example of how this applies in real life.
  3. What question do you still have about this topic?

---
*This is an auto-generated plan. Adjust based on class dynamics.*`;
}
