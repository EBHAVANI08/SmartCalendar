import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const teacherId = req.nextUrl.searchParams.get('teacherId');
    const date = req.nextUrl.searchParams.get('date');

    if (!teacherId || !date) {
      return NextResponse.json({ success: false, error: 'teacherId and date required' }, { status: 400 });
    }

    const dayOfWeek = new Date(date + 'T00:00:00').getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return NextResponse.json({ success: true, data: { schedules: [], substitutions: [], isWeekend: true } });
    }

    // Get teacher's regular schedule for the day
    const schedules = await db.schedule.findMany({
      where: { teacherId, dayOfWeek },
      include: {
        subject: true,
        grade: true,
        section: true,
        timeSlot: true,
      },
      orderBy: { timeSlot: { order: 'asc' } },
    });

    // Get substitution assignments where this teacher is the substitute
    const substitutionAssignments = await db.substitutionAssignment.findMany({
      where: {
        substituteTeacherId: teacherId,
        status: 'ACCEPTED',
        substitutionRequest: { date },
      },
      include: {
        substitutionRequest: {
          include: {
            schedule: { include: { subject: true, grade: true, section: true, timeSlot: true, teacher: true } },
            originalTeacher: true,
          },
        },
      },
    });

    // Get notifications for this teacher
    const notifications = await db.notification.findMany({
      where: { teacherId, isRead: false },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // Build combined day schedule
    const timeSlots = await db.timeSlot.findMany({ orderBy: { order: 'asc' } });

    const daySchedule = timeSlots.map(slot => {
      const regular = schedules.find(s => s.timeSlotId === slot.id);
      const substitution = substitutionAssignments.find(
        sa => sa.substitutionRequest.schedule.timeSlotId === slot.id
      );

      if (substitution) {
        const sub = substitution.substitutionRequest;
        return {
          timeSlotId: slot.id,
          timeSlotName: slot.name,
          startTime: slot.startTime,
          endTime: slot.endTime,
          isBreak: slot.isBreak,
          isSubstitution: true,
          subjectId: sub.schedule.subjectId,
          subjectName: sub.schedule.subject.name,
          subjectColor: sub.schedule.subject.color,
          gradeId: sub.schedule.gradeId,
          gradeName: sub.schedule.grade.name,
          gradeLevel: sub.schedule.grade.level,
          sectionId: sub.schedule.sectionId,
          sectionName: sub.schedule.section.name,
          topic: substitution.topic || sub.schedule.topic,
          originalTeacherId: sub.originalTeacherId,
          originalTeacherName: sub.originalTeacher.name,
          absenceReason: sub.reason,
          absenceDetail: sub.reasonDetail,
          isSubjectSwap: sub.reason === 'SUBJECT_SWAP',
          assignedBy: substitution.assignedBy,
          room: sub.schedule.room,
        };
      }

      if (regular) {
        return {
          timeSlotId: slot.id,
          timeSlotName: slot.name,
          startTime: slot.startTime,
          endTime: slot.endTime,
          isBreak: slot.isBreak,
          isSubstitution: false,
          subjectId: regular.subjectId,
          subjectName: regular.subject.name,
          subjectColor: regular.subject.color,
          gradeId: regular.gradeId,
          gradeName: regular.grade.name,
          gradeLevel: regular.grade.level,
          sectionId: regular.sectionId,
          sectionName: regular.section.name,
          topic: regular.topic,
          originalTeacherId: null,
          originalTeacherName: null,
          absenceReason: null,
          absenceDetail: null,
          isSubjectSwap: false,
          assignedBy: null,
          room: regular.room,
        };
      }

      return {
        timeSlotId: slot.id,
        timeSlotName: slot.name,
        startTime: slot.startTime,
        endTime: slot.endTime,
        isBreak: slot.isBreak,
        isSubstitution: false,
        isFree: true,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        schedules: daySchedule,
        substitutions: substitutionAssignments.map(sa => ({
          id: sa.id,
          requestId: sa.substitutionRequestId,
          subjectName: sa.substitutionRequest.schedule.subject.name,
          gradeName: sa.substitutionRequest.schedule.grade.name,
          sectionName: sa.substitutionRequest.schedule.section.name,
          timeSlotName: sa.substitutionRequest.schedule.timeSlot.name,
          startTime: sa.substitutionRequest.schedule.timeSlot.startTime,
          endTime: sa.substitutionRequest.schedule.timeSlot.endTime,
          originalTeacherName: sa.substitutionRequest.originalTeacher.name,
          reason: sa.substitutionRequest.reason,
          reasonDetail: sa.substitutionRequest.reasonDetail,
          topic: sa.topic,
          assignedBy: sa.assignedBy,
          isSubjectSwap: sa.substitutionRequest.reason === 'SUBJECT_SWAP',
        })),
        notifications,
        isWeekend: false,
      },
    });
  } catch (error) {
    console.error('[TEACHER SCHEDULE ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed to load schedule' }, { status: 500 });
  }
}
