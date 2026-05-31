import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const subjectId = searchParams.get('subjectId');
    const date = searchParams.get('date');
    const timeSlotId = searchParams.get('timeSlotId');

    if (!subjectId || !date || !timeSlotId) {
      return NextResponse.json({ success: false, error: 'subjectId, date, timeSlotId required' }, { status: 400 });
    }

    const timeSlot = await db.timeSlot.findUnique({ where: { id: timeSlotId } });
    if (!timeSlot) return NextResponse.json({ success: false, error: 'Time slot not found' }, { status: 404 });

    const dayOfWeek = new Date(date + 'T00:00:00').getDay();
    const scheduleDay = dayOfWeek >= 1 && dayOfWeek <= 5 ? dayOfWeek : 1;

    const qualifiedTeachers = await db.teacherSubject.findMany({
      where: { subjectId },
      include: {
        teacher: {
          include: {
            leaves: { where: { status: 'APPROVED', startDate: { lte: date }, endDate: { gte: date } } },
            schedules: { where: { dayOfWeek: scheduleDay }, include: { timeSlot: true, subject: true, section: true, grade: true } },
            substitutionsAsSubstitute: { where: { status: 'ACCEPTED' } },
          },
        },
        subject: true,
      },
    });

    const availableTeachers = [];
    const unavailableTeachers = [];

    for (const qt of qualifiedTeachers) {
      const teacher = qt.teacher;
      if (!teacher.isActive) continue;

      const unavailabilityReasons: string[] = [];

      const isOnLeave = teacher.leaves.length > 0;
      if (isOnLeave) unavailabilityReasons.push('On approved leave');

      const scheduleConflict = teacher.schedules.find(s => s.timeSlotId === timeSlotId);
      if (scheduleConflict) {
        unavailabilityReasons.push(`Teaching ${scheduleConflict.subject.name} for Grade ${scheduleConflict.grade?.name} Section ${scheduleConflict.section?.name}`);
      }

      const teacherData = {
        teacherId: teacher.id, teacherName: teacher.name, employeeId: teacher.employeeId,
        department: teacher.department || '', designation: teacher.designation || '',
        isPrimary: qt.isPrimary, gradeLevel: qt.gradeLevel,
        currentLoad: teacher.schedules.length, recentSubstitutions: teacher.substitutionsAsSubstitute.length,
        isAvailable: unavailabilityReasons.length === 0, unavailabilityReasons,
      };

      if (unavailabilityReasons.length === 0) availableTeachers.push(teacherData);
      else unavailableTeachers.push(teacherData);
    }

    availableTeachers.sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      if (a.currentLoad !== b.currentLoad) return a.currentLoad - b.currentLoad;
      return a.recentSubstitutions - b.recentSubstitutions;
    });

    return NextResponse.json({
      success: true,
      data: { subjectId, date, timeSlotId, availableCount: availableTeachers.length, unavailableCount: unavailableTeachers.length, availableTeachers, unavailableTeachers },
    });
  } catch (error) {
    console.error('[TEACHERS AVAILABLE ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}
