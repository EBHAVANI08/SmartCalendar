import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const sectionId = searchParams.get('sectionId');

    if (!date) {
      return NextResponse.json({ success: false, error: 'Date is required' }, { status: 400 });
    }

    const dayOfWeek = new Date(date + 'T00:00:00').getDay();
    const scheduleDay = dayOfWeek >= 1 && dayOfWeek <= 5 ? dayOfWeek : 1;

    const where: any = { dayOfWeek: scheduleDay };
    if (sectionId) where.sectionId = sectionId;

    const schedules = await db.schedule.findMany({
      where,
      include: {
        subject: true, teacher: true, grade: true, section: true, timeSlot: true,
        substitutions: {
          where: { date, status: { in: ['PENDING', 'ASSIGNED', 'RESOLVED'] } },
          include: { assignments: { include: { substituteTeacher: true } }, originalTeacher: true },
        },
      },
      orderBy: { timeSlot: { order: 'asc' } },
    });

    const enrichedSchedules = await Promise.all(
      schedules.map(async (sched) => {
        const leave = await db.leave.findFirst({
          where: { teacherId: sched.teacherId, status: 'APPROVED', startDate: { lte: date }, endDate: { gte: date } },
        });

        const isAbsent = !!leave;
        const sub = sched.substitutions[0];
        const acceptedAssignment = sub?.assignments.find(a => a.status === 'ACCEPTED');
        const activeAssignment = acceptedAssignment || sub?.assignments[0];
        const isSubstituted = sub?.status === 'RESOLVED' && !!acceptedAssignment;

        return {
          id: sched.id, dayOfWeek: sched.dayOfWeek, room: sched.room, topic: sched.topic,
          subject: { id: sched.subject.id, name: sched.subject.name, code: sched.subject.code, color: sched.subject.color },
          teacher: { id: sched.teacher.id, name: sched.teacher.name, employeeId: sched.teacher.employeeId, department: sched.teacher.department, designation: sched.teacher.designation },
          timeSlot: { id: sched.timeSlot.id, name: sched.timeSlot.name, startTime: sched.timeSlot.startTime, endTime: sched.timeSlot.endTime, order: sched.timeSlot.order, isBreak: sched.timeSlot.isBreak },
          grade: { id: sched.grade.id, name: sched.grade.name, level: sched.grade.level },
          section: { id: sched.section.id, name: sched.section.name },
          isSubstituted, substituteTeacher: activeAssignment?.substituteTeacher || null,
          isAbsent, isOnLeave: !!leave,
          substitutionStatus: sub?.status || null, substitutionTopic: activeAssignment?.topic || null,
          isSubjectSwap: sub?.reason === 'SUBJECT_SWAP', isAutoAssigned: activeAssignment?.assignedBy === 'AI_AGENT',
          assignedBy: activeAssignment?.assignedBy || null, originalTeacherName: sub?.originalTeacher?.name || null,
          absenceReason: sub?.reason || (isAbsent ? 'ABSENT' : null), absenceDetail: sub?.reasonDetail || null,
        };
      })
    );

    return NextResponse.json({ success: true, data: enrichedSchedules });
  } catch (error) {
    console.error('[SCHEDULES TODAY ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}
