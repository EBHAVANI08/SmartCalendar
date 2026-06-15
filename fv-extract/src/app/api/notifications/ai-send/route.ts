import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// POST /api/notifications/ai-send - AI identifies and sends curriculum/lesson plans to matching teachers
export async function POST(request: Request) {
  try {
    const { type, referenceIds, grades, subjects } = await request.json();

    if (!type || !referenceIds || !Array.isArray(referenceIds)) {
      return NextResponse.json({ error: 'type and referenceIds[] are required' }, { status: 400 });
    }

    // Find all teachers that match the grades and subjects
    const allTeachers = await db.teacher.findMany();
    const matchedTeachers: Array<{ id: string; name: string; subject: string; matchedGrades: string[]; matchedSubjects: string[] }> = [];

    for (const teacher of allTeachers) {
      let teacherGrades: string[] = [];
      try {
        teacherGrades = JSON.parse(teacher.grades || '[]');
      } catch { teacherGrades = []; }

      // Check if teacher's subject matches any of the subjects
      const subjectMatch = !subjects || subjects.length === 0 || subjects.includes(teacher.subject);
      // Check if teacher's grades overlap with the target grades
      const gradeMatch = !grades || grades.length === 0 || teacherGrades.some((g: string) => grades.includes(g));

      if (subjectMatch && gradeMatch) {
        const matchedGrades = grades ? teacherGrades.filter((g: string) => grades.includes(g)) : teacherGrades;
        matchedTeachers.push({
          id: teacher.id,
          name: teacher.name,
          subject: teacher.subject,
          matchedGrades,
          matchedSubjects: [teacher.subject],
        });
      }
    }

    if (matchedTeachers.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No matching teachers found for the selected grades and subjects',
        count: 0,
        teachers: [],
      });
    }

    // Create notifications for each teacher × reference combination
    let totalCreated = 0;
    let totalSkipped = 0;

    for (const refId of referenceIds) {
      // Get the title for the reference
      let title = `${type} shared with you`;
      if (type === 'curriculum') {
        const topic = await db.curriculumTopic.findUnique({ where: { id: refId } });
        if (topic) title = `Curriculum: ${topic.topic} (${topic.subject} - ${topic.grade})`;
      } else if (type === 'lesson_plan') {
        const plan = await db.lessonPlan.findUnique({ where: { id: refId } });
        if (plan) title = `Lesson Plan: ${plan.topic} (${plan.subject} - ${plan.grade})`;
      }

      // Check existing
      const existing = await db.teacherNotification.findMany({
        where: { type, referenceId: refId, teacherId: { in: matchedTeachers.map(t => t.id) } },
      });
      const existingTeacherIds = new Set(existing.map(n => n.teacherId));

      for (const teacher of matchedTeachers) {
        if (existingTeacherIds.has(teacher.id)) {
          totalSkipped++;
          continue;
        }
        await db.teacherNotification.create({
          data: {
            type,
            referenceId: refId,
            teacherId: teacher.id,
            sentBy: 'ai',
            title,
            description: `AI identified ${teacher.name} as a ${teacher.subject} teacher for ${teacher.matchedGrades.join(', ')}`,
          },
        });
        totalCreated++;
      }
    }

    return NextResponse.json({
      success: true,
      count: totalCreated,
      skipped: totalSkipped,
      teachers: matchedTeachers.map(t => ({ id: t.id, name: t.name, subject: t.subject, matchedGrades: t.matchedGrades })),
      message: `AI sent to ${totalCreated} teacher(s)${totalSkipped > 0 ? ` (${totalSkipped} already had it)` : ''}`,
    });
  } catch (error) {
    console.error('Error in AI auto-send:', error);
    return NextResponse.json({ error: 'Failed to auto-send' }, { status: 500 });
  }
}
