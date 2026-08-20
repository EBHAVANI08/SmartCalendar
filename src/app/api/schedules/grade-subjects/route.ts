import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * GET /api/schedules/grade-subjects
 * Returns subjects and time slots for a given grade
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const grade = searchParams.get('grade') || searchParams.get('gradeId');
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
    const schoolId = searchParams.get('schoolId');

    if (!grade) {
      return NextResponse.json(
        { success: false, error: 'grade is required' },
        { status: 400 },
      );
    }

    const dayIndex = new Date(date + 'T00:00:00').getDay();
    const dayName = DAYS[dayIndex >= 1 && dayIndex <= 5 ? dayIndex : 1];

    const schedules = await db.schedule.findMany({
      where: {
        grade,
        day: dayName,
        ...(schoolId ? { schoolId } : {}),
      },
      include: {
        teacher: true,
      },
      orderBy: { period: 'asc' },
    });

    const subjectMap = new Map<string, {
      name: string;
      periods: { period: number; startTime: string; endTime: string }[];
      sections: string[];
      teachers: { id: string; name: string }[];
    }>();

    for (const sched of schedules) {
      const existing = subjectMap.get(sched.subject);
      const periodData = {
        period: sched.period,
        startTime: sched.startTime,
        endTime: sched.endTime,
      };

      if (existing) {
        if (!existing.periods.some(p => p.period === sched.period)) {
          existing.periods.push(periodData);
        }
        if (!existing.sections.includes(sched.section)) {
          existing.sections.push(sched.section);
        }
        if (sched.teacher && !existing.teachers.some(t => t.id === sched.teacher!.id)) {
          existing.teachers.push({ id: sched.teacher.id, name: sched.teacher.name });
        }
      } else {
        subjectMap.set(sched.subject, {
          name: sched.subject,
          periods: [periodData],
          sections: [sched.section],
          teachers: sched.teacher ? [{ id: sched.teacher.id, name: sched.teacher.name }] : [],
        });
      }
    }

    const subjects = Array.from(subjectMap.values()).map(s => ({
      ...s,
      periods: s.periods.sort((a, b) => a.period - b.period),
    }));

    return NextResponse.json({
      success: true,
      data: {
        grade,
        day: dayName,
        date,
        totalSubjects: subjects.length,
        subjects,
      },
    });
  } catch (error) {
    console.error('Error fetching grade subjects:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch grade subjects' },
      { status: 500 },
    );
  }
}
