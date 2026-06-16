import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const TIME_SLOTS = [
  { period: 1, name: 'Period 1', startTime: '08:00', endTime: '08:40' },
  { period: 2, name: 'Period 2', startTime: '08:40', endTime: '09:20' },
  { period: 3, name: 'Period 3', startTime: '09:20', endTime: '10:00' },
  { period: 4, name: 'Period 4', startTime: '10:20', endTime: '11:00' },
  { period: 5, name: 'Period 5', startTime: '11:00', endTime: '11:40' },
  { period: 6, name: 'Period 6', startTime: '11:40', endTime: '12:20' },
  { period: 7, name: 'Period 7', startTime: '13:00', endTime: '13:40' },
  { period: 8, name: 'Period 8', startTime: '13:40', endTime: '14:20' },
];

const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export async function GET(req: NextRequest) {
  try {
    const teacherId = req.nextUrl.searchParams.get('teacherId');
    if (!teacherId) return NextResponse.json({ success: false, error: 'teacherId required' }, { status: 400 });

    const weekSchedule: Record<number, any[]> = {};

    for (let day = 1; day <= 5; day++) {
      const dayName = DAY_NAMES[day];

      const schedules = await db.schedule.findMany({
        where: { teacherId, day: dayName },
        orderBy: { period: 'asc' },
      });

      // Calculate the actual date for this day of the current week
      const today = new Date();
      const currentDay = today.getDay();
      const diff = day - currentDay;
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() + diff);
      const dateStr = targetDate.toISOString().split('T')[0];

      const substitutions = await db.substitution.findMany({
        where: { substituteId: teacherId, date: dateStr, status: { in: ['assigned', 'completed'] } },
        include: { absentTeacher: true },
      });

      const dayEntries = TIME_SLOTS.map(slot => {
        const regular = schedules.find(s => s.period === slot.period);
        const sub = substitutions.find(s => s.period === slot.period);

        if (sub) {
          return {
            period: slot.period,
            timeSlotName: slot.name,
            startTime: slot.startTime,
            endTime: slot.endTime,
            isBreak: false,
            isSubstitution: true,
            subjectName: sub.subject,
            gradeName: sub.grade,
            sectionName: sub.section,
            topic: sub.todayTopic,
            originalTeacherName: sub.absentTeacher.name,
          };
        }

        if (regular) {
          return {
            period: slot.period,
            timeSlotName: slot.name,
            startTime: slot.startTime,
            endTime: slot.endTime,
            isBreak: false,
            isSubstitution: false,
            subjectName: regular.subject,
            gradeName: regular.grade,
            sectionName: regular.section,
            topic: regular.topic,
          };
        }

        return {
          period: slot.period,
          timeSlotName: slot.name,
          startTime: slot.startTime,
          endTime: slot.endTime,
          isBreak: false,
          isFree: true,
        };
      });

      weekSchedule[day] = dayEntries;
    }

    return NextResponse.json({ success: true, data: { weekSchedule, timeSlots: TIME_SLOTS } });
  } catch (error) {
    console.error('[WEEK SCHEDULE ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}
