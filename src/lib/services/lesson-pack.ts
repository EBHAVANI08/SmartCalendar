/**
 * Lesson Pack Generator — Feature 2.2
 *
 * Auto-generates lesson continuity packs for substitute teachers.
 * Uses z-ai-web-dev-sdk to generate a 40-min lesson plan.
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
  const substitution = await db.substitution.findUnique({
    where: { id: assignmentId },
    include: {
      absentTeacher: true,
      substitute: true,
    },
  });

  if (!substitution) return null;

  // Get student roster snapshot
  const students = await db.student.findMany({
    where: {
      grade: substitution.grade,
      section: substitution.section,
    },
    orderBy: { rollNo: 'asc' },
    take: 40,
  });

  const rosterSnapshot = students.map(s => ({
    name: s.name,
    rollNo: s.rollNo,
    grade: s.grade,
    section: s.section,
  }));

  const emergencyContacts = [
    {
      name: substitution.absentTeacher.name,
      role: 'Absent Teacher',
      email: substitution.absentTeacher.email,
      phone: substitution.absentTeacher.phone || 'N/A',
    },
  ];

  if (substitution.substitute) {
    emergencyContacts.push({
      name: substitution.substitute.name,
      role: 'Substitute Teacher',
      email: substitution.substitute.email,
      phone: substitution.substitute.phone || 'N/A',
    });
  }

  const previousTopics = [
    substitution.yesterdayTopic || 'Introduction to Chapter',
    substitution.todayTopic || 'Core concepts and problem solving',
  ];

  let generatedPlan = substitution.lessonDNA || '';

  if (!generatedPlan) {
    try {
      const zai = await ZAI.create();
      const prompt = `Create a detailed 40-minute substitute lesson plan for ${substitution.grade} ${substitution.section} ${substitution.subject}.
Yesterday's topic: ${substitution.yesterdayTopic || 'Chapter overview'}
Today's target topic: ${substitution.todayTopic || 'Lesson continuation'}

Provide structured JSON output with fields: warmUp (5 min), mainActivity (25 min), assessment (10 min).`;

      const response = await zai.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
      });

      generatedPlan = response.choices?.[0]?.message?.content || 'Standard Substitute Plan: Review previous chapter notes and conduct practice problems.';
    } catch {
      generatedPlan = 'Standard Substitute Plan: Review previous chapter notes and conduct practice problems.';
    }
  }

  return {
    assignmentId,
    previousTopics,
    generatedPlan,
    rosterSnapshot,
    emergencyContacts,
  };
}
