import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const teacherId = req.nextUrl.searchParams.get('teacherId');
    if (!teacherId) return NextResponse.json({ success: false, error: 'teacherId required' }, { status: 400 });

    const timeSlots = await db.timeSlot.findMany({ orderBy: { order: 'asc' } });
    const weekSchedule: Record<number, any[]> = {};

    for (let day = 1; day <= 5; day++) {
      const schedules = await db.schedule.findMany({
        where: { teacherId, dayOfWeek: day },
        include: { subject: true, grade: true, section: true, timeSlot: true },
        orderBy: { timeSlot: { order: 'asc' } },
      });

      // Get substitutions for this teacher on this day
      const today = new Date();
      // Calculate actual date for this day of week
      const currentDay = today.getDay();
      const diff = day - currentDay;
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() + diff);
      const dateStr = targetDate.toISOString().split('T')[0];

      const substitutionAssignments = await db.substitutionAssignment.findMany({
        where: {
          substituteTeacherId: teacherId,
          status: 'ACCEPTED',
          substitutionRequest: { date: dateStr },
        },
        include: {
          substitutionRequest: {
            include: {
              schedule: { include: { subject: true, grade: true, section: true, timeSlot: true } },
              originalTeacher: true,
            },
          },
        },
      });

      const dayEntries = timeSlots.map(slot => {
        const regular = schedules.find(s => s.timeSlotId === slot.id);
        const sub = substitutionAssignments.find(
          sa => sa.substitutionRequest.schedule.timeSlotId === slot.id
        );

        if (sub) {
          return {
            timeSlotId: slot.id,
            timeSlotName: slot.name,
            startTime: slot.startTime,
            endTime: slot.endTime,
            isBreak: slot.isBreak,
            isSubstitution: true,
            subjectName: sub.substitutionRequest.schedule.subject.name,
            subjectColor: sub.substitutionRequest.schedule.subject.color,
            gradeName: sub.substitutionRequest.schedule.grade.name,
            sectionName: sub.substitutionRequest.schedule.section.name,
            topic: sub.topic,
            originalTeacherName: sub.substitutionRequest.originalTeacher.name,
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
            subjectName: regular.subject.name,
            subjectColor: regular.subject.color,
            gradeName: regular.grade.name,
            sectionName: regular.section.name,
            topic: regular.topic,
          };
        }

        return {
          timeSlotId: slot.id,
          timeSlotName: slot.name,
          startTime: slot.startTime,
          endTime: slot.endTime,
          isBreak: slot.isBreak,
          isFree: true,
        };
      });

      weekSchedule[day] = dayEntries;
    }

    return NextResponse.json({ success: true, data: { weekSchedule, timeSlots } });
  } catch (error) {
    console.error('[WEEK SCHEDULE ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}
