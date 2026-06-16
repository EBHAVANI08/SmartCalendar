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
    const date = req.nextUrl.searchParams.get('date');
    if (!date) return NextResponse.json({ success: false, error: 'Date required' }, { status: 400 });

    const dayOfWeek = new Date(date + 'T00:00:00').getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return NextResponse.json({ success: true, data: [], timeSlots: TIME_SLOTS });
    }
    const dayName = DAY_NAMES[dayOfWeek];

    const schedules = await db.schedule.findMany({
      where: { day: dayName },
      include: { teacher: true },
      orderBy: [{ grade: 'asc' }, { section: 'asc' }, { period: 'asc' }],
    });

    // Get all substitutions for this date, keyed by grade|section|period
    const substitutions = await db.substitution.findMany({
      where: { date },
      include: { substitute: true },
    });
    const subMap = new Map<string, typeof substitutions[number]>();
    for (const sub of substitutions) {
      subMap.set(`${sub.grade}|${sub.section}|${sub.period}`, sub);
    }

    // Get teachers on approved leave for this date
    const leaves = await db.leaveApplication.findMany({
      where: { status: 'approved', startDate: { lte: date }, endDate: { gte: date } },
    });
    const absentTeacherIds = new Set(leaves.map(l => l.teacherId));

    // Group schedules by grade -> section
    const gradeMap = new Map<string, Map<string, typeof schedules>>();
    for (const s of schedules) {
      if (!gradeMap.has(s.grade)) gradeMap.set(s.grade, new Map());
      const sectionMap = gradeMap.get(s.grade)!;
      if (!sectionMap.has(s.section)) sectionMap.set(s.section, []);
      sectionMap.get(s.section)!.push(s);
    }

    const sortedGrades = [...gradeMap.keys()].sort(
      (a, b) => parseInt(a.replace('Grade ', '')) - parseInt(b.replace('Grade ', ''))
    );

    const result = sortedGrades.map(gradeName => {
      const sectionMap = gradeMap.get(gradeName)!;
      const sortedSections = [...sectionMap.keys()].sort();

      return {
        name: gradeName,
        level: parseInt(gradeName.replace('Grade ', '')) || 0,
        sections: sortedSections.map(sectionName => {
          const sectionSchedules = sectionMap.get(sectionName)!;

          const periods = TIME_SLOTS.map(slot => {
            const schedule = sectionSchedules.find(s => s.period === slot.period);
            if (!schedule) {
              return {
                period: slot.period,
                timeSlotName: slot.name,
                startTime: slot.startTime,
                endTime: slot.endTime,
                isBreak: false,
                subjectName: null,
                teacherId: null,
                teacherName: null,
                topic: null,
                isAbsent: false,
                isSubstituted: false,
                substituteTeacher: null,
                substitutionInfo: null,
              };
            }

            const isAbsent = !!schedule.teacherId && absentTeacherIds.has(schedule.teacherId);
            const subInfo = subMap.get(`${gradeName}|${sectionName}|${slot.period}`);
            const isSubstituted = !!subInfo?.substitute;

            return {
              period: slot.period,
              timeSlotName: slot.name,
              startTime: schedule.startTime,
              endTime: schedule.endTime,
              isBreak: false,
              subjectName: schedule.subject,
              teacherId: schedule.teacherId,
              teacherName: schedule.teacher?.name || null,
              topic: schedule.topic,
              isAbsent,
              isSubstituted,
              substituteTeacher: subInfo?.substitute ? { id: subInfo.substitute.id, name: subInfo.substitute.name } : null,
              substitutionInfo: isSubstituted ? {
                reason: subInfo!.reason,
                topic: subInfo!.todayTopic,
                status: subInfo!.status,
              } : null,
            };
          });

          return { name: sectionName, periods };
        }),
      };
    });

    return NextResponse.json({ success: true, data: result, timeSlots: TIME_SLOTS });
  } catch (error) {
    console.error('[DATE GRID ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed to load grid' }, { status: 500 });
  }
}
