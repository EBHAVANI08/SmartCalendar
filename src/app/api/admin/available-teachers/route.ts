import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const timeSlotId = searchParams.get('timeSlotId');
    const subjectId = searchParams.get('subjectId');

    if (!date || !timeSlotId) {
      return NextResponse.json({ success: false, error: 'date and timeSlotId required' }, { status: 400 });
    }

    const timeSlot = await db.timeSlot.findUnique({ where: { id: timeSlotId } });
    if (!timeSlot) return NextResponse.json({ success: false, error: 'Time slot not found' }, { status: 404 });

    const dayOfWeek = new Date(date + 'T00:00:00').getDay();
    const scheduleDay = dayOfWeek >= 1 && dayOfWeek <= 5 ? dayOfWeek : 1;

    let prioritizedCandidates: any[] = [];

    if (subjectId) {
      const subjectTeachers = await db.teacherSubject.findMany({
        where: { subjectId },
        include: {
          teacher: {
            include: {
              leaves: { where: { status: 'APPROVED', startDate: { lte: date }, endDate: { gte: date } } },
              schedules: { where: { dayOfWeek: scheduleDay }, include: { timeSlot: true, subject: true, section: true, grade: true } },
              substitutionsAsSubstitute: { where: { status: 'ACCEPTED', createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } },
              teacherSubjects: { include: { subject: true } },
            },
          },
          subject: true,
        },
      });

      for (const st of subjectTeachers) {
        const teacher = st.teacher;
        if (!teacher.isActive) continue;

        const isOnLeave = teacher.leaves.length > 0;
        const scheduleConflict = teacher.schedules.find((s: any) => s.timeSlotId === timeSlotId);
        const available = !isOnLeave && !scheduleConflict;
        const conflicts: string[] = [];
        if (isOnLeave) conflicts.push('On approved leave');
        if (scheduleConflict) conflicts.push(`Teaching ${scheduleConflict.subject.name}`);

        let score = 50;
        if (st.isPrimary) score += 30;
        if (teacher.designation?.includes('HOD')) score += 15;
        else if (teacher.designation?.includes('Senior')) score += 10;

        prioritizedCandidates.push({
          teacherId: teacher.id, teacherName: teacher.name, employeeId: teacher.employeeId,
          department: teacher.department || '', designation: teacher.designation || '',
          subjects: teacher.teacherSubjects.map((ts: any) => ts.subject.name),
          isAvailable: available, conflicts, score, teachesSameSubject: true, isPrimary: st.isPrimary,
          currentLoad: teacher.schedules.length, weeklySubCount: teacher.substitutionsAsSubstitute.length,
        });
      }
    }

    // Cross-subject teachers
    const allActiveTeachers = await db.teacher.findMany({
      where: { isActive: true },
      include: {
        leaves: { where: { status: 'APPROVED', startDate: { lte: date }, endDate: { gte: date } } },
        schedules: { where: { dayOfWeek: scheduleDay }, include: { timeSlot: true, subject: true, section: true, grade: true } },
        substitutionsAsSubstitute: { where: { status: 'ACCEPTED', createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } },
        teacherSubjects: { include: { subject: true } },
      },
      orderBy: { name: 'asc' },
    });

    const seenIds = new Set(prioritizedCandidates.map(c => c.teacherId));
    for (const teacher of allActiveTeachers) {
      if (seenIds.has(teacher.id)) continue;

      const isOnLeave = teacher.leaves.length > 0;
      const scheduleConflict = teacher.schedules.find((s: any) => s.timeSlotId === timeSlotId);
      const available = !isOnLeave && !scheduleConflict;
      const conflicts: string[] = [];
      if (isOnLeave) conflicts.push('On approved leave');
      if (scheduleConflict) conflicts.push(`Teaching ${scheduleConflict.subject.name}`);

      let score = 10;
      if (teacher.designation?.includes('HOD')) score += 10;

      prioritizedCandidates.push({
        teacherId: teacher.id, teacherName: teacher.name, employeeId: teacher.employeeId,
        department: teacher.department || '', designation: teacher.designation || '',
        subjects: teacher.teacherSubjects.map((ts: any) => ts.subject.name),
        isAvailable: available, conflicts, score, teachesSameSubject: false, isPrimary: false,
        currentLoad: teacher.schedules.length, weeklySubCount: teacher.substitutionsAsSubstitute.length,
      });
    }

    prioritizedCandidates.sort((a, b) => {
      if (a.isAvailable !== b.isAvailable) return a.isAvailable ? -1 : 1;
      if (a.teachesSameSubject !== b.teachesSameSubject) return a.teachesSameSubject ? -1 : 1;
      return b.score - a.score;
    });

    return NextResponse.json({ success: true, data: prioritizedCandidates });
  } catch (error) {
    console.error('[ADMIN AVAILABLE TEACHERS ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}
