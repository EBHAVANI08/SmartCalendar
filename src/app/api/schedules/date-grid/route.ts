import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get('date');
    if (!date) return NextResponse.json({ success: false, error: 'Date required' }, { status: 400 });

    const dayOfWeek = new Date(date + 'T00:00:00').getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return NextResponse.json({ success: true, data: [] });
    }

    const timeSlots = await db.timeSlot.findMany({ orderBy: { order: 'asc' } });

    const grades = await db.grade.findMany({
      include: {
        sections: { orderBy: { name: 'asc' } },
      },
      orderBy: { level: 'asc' },
    });

    // Get all substitutions for this date
    const substitutions = await db.substitutionRequest.findMany({
      where: { date },
      include: {
        assignments: { where: { status: 'ACCEPTED' }, include: { substituteTeacher: true } },
        originalTeacher: true,
      },
    });

    const subMap = new Map<string, {
      reason: string;
      reasonDetail: string | null;
      status: string;
      substitute: { id: string; name: string } | null;
      isSubjectSwap: boolean;
      swappedSubjectName?: string;
      topic: string | null;
      assignedBy: string | null;
    }>();

    for (const sub of substitutions) {
      const assignment = sub.assignments[0];
      subMap.set(sub.scheduleId, {
        reason: sub.reason,
        reasonDetail: sub.reasonDetail,
        status: sub.status,
        substitute: assignment ? { id: assignment.substituteTeacher.id, name: assignment.substituteTeacher.name } : null,
        isSubjectSwap: sub.reason === 'SUBJECT_SWAP',
        swappedSubjectName: undefined,
        topic: assignment?.topic || null,
        assignedBy: assignment?.assignedBy || null,
      });
    }

    // Get leaves for this date
    const leaves = await db.leave.findMany({
      where: { status: 'APPROVED', startDate: { lte: date }, endDate: { gte: date } },
    });
    const absentTeacherIds = new Set(leaves.map(l => l.teacherId));

    const result = [];

    for (const grade of grades) {
      const gradeData: any = {
        id: grade.id,
        level: grade.level,
        name: grade.name,
        sections: [],
      };

      for (const section of grade.sections) {
        const schedules = await db.schedule.findMany({
          where: { sectionId: section.id, dayOfWeek },
          include: { subject: true, teacher: true, timeSlot: true },
          orderBy: { timeSlot: { order: 'asc' } },
        });

        const periodData = timeSlots.map(slot => {
          const schedule = schedules.find(s => s.timeSlotId === slot.id);
          if (!schedule || slot.isBreak) {
            return {
              timeSlotId: slot.id,
              timeSlotName: slot.name,
              startTime: slot.startTime,
              endTime: slot.endTime,
              isBreak: slot.isBreak,
              subjectId: null,
              subjectName: null,
              subjectColor: null,
              teacherId: null,
              teacherName: null,
              topic: null,
              isAbsent: false,
              isSubstituted: false,
              substituteTeacher: null,
              substitutionInfo: null,
            };
          }

          const isAbsent = absentTeacherIds.has(schedule.teacherId);
          const subInfo = subMap.get(schedule.id);
          const isSubstituted = !!subInfo?.substitute;

          return {
            timeSlotId: slot.id,
            timeSlotName: slot.name,
            startTime: slot.startTime,
            endTime: slot.endTime,
            isBreak: slot.isBreak,
            subjectId: schedule.subjectId,
            subjectName: schedule.subject.name,
            subjectColor: schedule.subject.color,
            teacherId: schedule.teacherId,
            teacherName: schedule.teacher.name,
            topic: schedule.topic,
            isAbsent,
            isSubstituted,
            substituteTeacher: subInfo?.substitute || null,
            substitutionInfo: isSubstituted ? {
              reason: subInfo!.reason,
              isSubjectSwap: subInfo!.isSubjectSwap,
              topic: subInfo!.topic,
              assignedBy: subInfo!.assignedBy,
            } : null,
          };
        });

        gradeData.sections.push({
          id: section.id,
          name: section.name,
          periods: periodData,
        });
      }

      result.push(gradeData);
    }

    return NextResponse.json({ success: true, data: result, timeSlots });
  } catch (error) {
    console.error('[DATE GRID ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed to load grid' }, { status: 500 });
  }
}
