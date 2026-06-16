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

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
    const dayName = DAY_NAMES[dayOfWeek];

    // Get teacher's regular schedule for the day
    const schedules = await db.schedule.findMany({
      where: { teacherId, day: dayName },
      orderBy: { period: 'asc' },
    });

    // Get substitutions where this teacher is the substitute today
    const substitutions = await db.substitution.findMany({
      where: { substituteId: teacherId, date, status: { in: ['assigned', 'completed'] } },
      include: { absentTeacher: true },
    });

    // Get notifications for this teacher
    const notifications = await db.teacherNotification.findMany({
      where: { teacherId, isRead: false },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // Build combined day schedule across all periods
    const daySchedule = TIME_SLOTS.map(slot => {
      const regular = schedules.find(s => s.period === slot.period);
      const substitution = substitutions.find(s => s.period === slot.period);

      if (substitution) {
        return {
          period: slot.period,
          timeSlotName: slot.name,
          startTime: slot.startTime,
          endTime: slot.endTime,
          isBreak: false,
          isSubstitution: true,
          subjectName: substitution.subject,
          gradeName: substitution.grade,
          sectionName: substitution.section,
          topic: substitution.todayTopic,
          originalTeacherId: substitution.absentTeacherId,
          originalTeacherName: substitution.absentTeacher.name,
          absenceReason: substitution.reason,
          room: null,
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
          originalTeacherId: null,
          originalTeacherName: null,
          absenceReason: null,
          room: regular.roomId,
        };
      }

      return {
        period: slot.period,
        timeSlotName: slot.name,
        startTime: slot.startTime,
        endTime: slot.endTime,
        isBreak: false,
        isSubstitution: false,
        isFree: true,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        schedules: daySchedule,
        substitutions: substitutions.map(s => ({
          id: s.id,
          subjectName: s.subject,
          gradeName: s.grade,
          sectionName: s.section,
          period: s.period,
          originalTeacherName: s.absentTeacher.name,
          reason: s.reason,
          topic: s.todayTopic,
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
