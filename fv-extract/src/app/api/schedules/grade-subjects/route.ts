import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/schedules/grade-subjects
 * Returns subjects and their time slots for a given grade, based on the day of week
 * Query params: gradeId, date (optional, defaults to today)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const gradeId = searchParams.get('gradeId');
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

    if (!gradeId) {
      return NextResponse.json(
        { success: false, error: 'gradeId is required' },
        { status: 400 }
      );
    }

    const dayOfWeek = new Date(date + 'T00:00:00').getDay();
    const scheduleDay = dayOfWeek >= 1 && dayOfWeek <= 5 ? dayOfWeek : 1;

    // Get all schedules for this grade on this day of week
    const schedules = await db.schedule.findMany({
      where: {
        gradeId,
        dayOfWeek: scheduleDay,
      },
      include: {
        subject: true,
        timeSlot: true,
        section: true,
        teacher: true,
      },
      orderBy: { timeSlot: { order: 'asc' } },
    });

    // Group by subject
    const subjectMap = new Map<string, {
      id: string;
      name: string;
      code: string;
      color: string | null;
      category: string | null;
      timeSlots: { id: string; name: string; startTime: string; endTime: string; order: number }[];
      sections: { id: string; name: string }[];
      teachers: { id: string; name: string }[];
    }>();

    for (const sched of schedules) {
      if (sched.timeSlot.isBreak) continue;

      const existing = subjectMap.get(sched.subjectId);
      const timeSlotData = {
        id: sched.timeSlotId,
        name: sched.timeSlot.name,
        startTime: sched.timeSlot.startTime,
        endTime: sched.timeSlot.endTime,
        order: sched.timeSlot.order,
      };
      const sectionData = { id: sched.sectionId, name: sched.section.name };
      const teacherData = { id: sched.teacherId, name: sched.teacher.name };

      if (existing) {
        // Add time slot if not already present
        if (!existing.timeSlots.some(ts => ts.id === sched.timeSlotId)) {
          existing.timeSlots.push(timeSlotData);
        }
        // Add section if not already present
        if (!existing.sections.some(s => s.id === sched.sectionId)) {
          existing.sections.push(sectionData);
        }
        // Add teacher if not already present
        if (!existing.teachers.some(t => t.id === sched.teacherId)) {
          existing.teachers.push(teacherData);
        }
      } else {
        subjectMap.set(sched.subjectId, {
          id: sched.subjectId,
          name: sched.subject.name,
          code: sched.subject.code,
          color: sched.subject.color,
          category: sched.subject.category,
          timeSlots: [timeSlotData],
          sections: [sectionData],
          teachers: [teacherData],
        });
      }
    }

    // Sort time slots within each subject
    const subjects = Array.from(subjectMap.values()).map(s => ({
      ...s,
      timeSlots: s.timeSlots.sort((a, b) => a.order - b.order),
    }));

    return NextResponse.json({
      success: true,
      data: {
        gradeId,
        date,
        dayOfWeek: scheduleDay,
        subjects,
      },
    });
  } catch (error) {
    console.error('[SCHEDULES GRADE-SUBJECTS ERROR]', error);
    const message = error instanceof Error ? error.message : 'Failed to get grade subjects';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
