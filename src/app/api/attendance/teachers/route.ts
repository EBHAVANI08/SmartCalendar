export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { requireCapability } from '@/lib/authz';
import { weekdayOf } from '@/lib/substitution-service';
import { operationalScheduleFilter } from '@/lib/timetable-lifecycle';
import { readList } from '@/lib/faculty';

export async function GET(request: Request) {
  const denied = requireCapability(request, 'attendance.read');
  if (denied) return denied;

  try {
    const schoolId = await getTenantSchoolId(request);
    if (!schoolId) {
      return NextResponse.json({ error: 'School context required.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

    const day = weekdayOf(date);

    // 1. Fetch teachers
    const teachers = await db.teacher.findMany({
      where: { schoolId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        employeeId: true,
        subject: true,
        subjects: true,
        grades: true,
        sections: true,
        role: true,
      },
      orderBy: { name: 'asc' },
    });

    const teacherIds = teachers.map((t) => t.id);

    // 2. Fetch existing attendance records for this date
    const attendanceRecords = await db.biometricAttendance.findMany({
      where: {
        date,
        teacherId: { in: teacherIds },
      },
    });
    const attendanceMap = new Map(attendanceRecords.map((a) => [a.teacherId, a]));

    // 3. Fetch approved leaves covering this date
    const activeLeaves = await db.leaveApplication.findMany({
      where: {
        teacherId: { in: teacherIds },
        startDate: { lte: date },
        endDate: { gte: date },
        status: 'approved',
      },
    });
    const leaveMap = new Map(activeLeaves.map((l) => [l.teacherId, l]));

    // 4. Fetch schedules for today's weekday
    const operationalFilter = await operationalScheduleFilter(schoolId);
    const daySchedules = day
      ? await db.schedule.findMany({
          where: {
            ...operationalFilter,
            teacherId: { in: teacherIds },
            day,
          },
          select: {
            id: true,
            teacherId: true,
            period: true,
            grade: true,
            section: true,
            subject: true,
            startTime: true,
            endTime: true,
          },
          orderBy: { period: 'asc' },
        })
      : [];

    const scheduleMap = new Map<string, typeof daySchedules>();
    for (const sched of daySchedules) {
      if (!sched.teacherId) continue;
      const list = scheduleMap.get(sched.teacherId) || [];
      list.push(sched);
      scheduleMap.set(sched.teacherId, list);
    }

    // 5. Fetch existing substitutions on this date for these teachers
    const substitutions = await db.substitution.findMany({
      where: {
        date,
        absentTeacherId: { in: teacherIds },
      },
      select: {
        id: true,
        absentTeacherId: true,
        period: true,
        grade: true,
        section: true,
        subject: true,
        status: true,
        substituteId: true,
        substitute: { select: { name: true } },
      },
    });

    const subMap = new Map<string, typeof substitutions>();
    for (const sub of substitutions) {
      const list = subMap.get(sub.absentTeacherId) || [];
      list.push(sub);
      subMap.set(sub.absentTeacherId, list);
    }

    // 6. Build response
    let presentCount = 0;
    let absentCount = 0;
    let onLeaveCount = 0;
    let lateCount = 0;
    let halfDayCount = 0;
    let unmarkedCount = 0;

    const data = teachers.map((teacher) => {
      const att = attendanceMap.get(teacher.id);
      const leave = leaveMap.get(teacher.id);
      const classes = scheduleMap.get(teacher.id) || [];
      const teacherSubs = subMap.get(teacher.id) || [];

      let status: 'present' | 'absent' | 'on_leave' | 'late' | 'half-day' | 'unmarked' = 'unmarked';

      if (att?.status) {
        status = att.status.toLowerCase() as any;
      } else if (leave) {
        status = 'on_leave';
      }

      // Count summary
      if (status === 'present') presentCount++;
      else if (status === 'absent') absentCount++;
      else if (status === 'on_leave') onLeaveCount++;
      else if (status === 'late') lateCount++;
      else if (status === 'half-day') halfDayCount++;
      else unmarkedCount++;

      return {
        id: teacher.id,
        name: teacher.name,
        email: teacher.email,
        phone: teacher.phone,
        employeeId: teacher.employeeId,
        subject: teacher.subject,
        subjects: readList(teacher.subjects ?? teacher.subject),
        grades: readList(teacher.grades),
        sections: readList(teacher.sections),
        status,
        checkInTime: att?.checkInTime || (status === 'present' ? '08:00' : null),
        checkOutTime: att?.checkOutTime || null,
        syncSource: att?.syncSource || (att ? 'manual' : null),
        leaveInfo: leave
          ? {
              id: leave.id,
              leaveType: leave.leaveType,
              reason: leave.reason,
              isEmergency: leave.isEmergency,
              startDate: leave.startDate,
              endDate: leave.endDate,
            }
          : null,
        classesCount: classes.length,
        classes: classes.map((c) => ({
          id: c.id,
          period: c.period,
          grade: c.grade,
          section: c.section,
          subject: c.subject,
          startTime: c.startTime,
          endTime: c.endTime,
        })),
        substitutionsCount: teacherSubs.length,
        substitutions: teacherSubs.map((s) => ({
          id: s.id,
          period: s.period,
          grade: s.grade,
          section: s.section,
          subject: s.subject,
          status: s.status,
          substituteName: s.substitute?.name || null,
        })),
      };
    });

    const markedCount = presentCount + absentCount + onLeaveCount + lateCount + halfDayCount;
    const effectiveAttending = presentCount + lateCount + halfDayCount * 0.5;
    const attendanceRate = markedCount > 0 ? Math.round((effectiveAttending / markedCount) * 100) : 0;

    return NextResponse.json({
      success: true,
      date,
      day: day || 'Sunday',
      isWeekend: day === null,
      summary: {
        total: teachers.length,
        present: presentCount,
        absent: absentCount,
        onLeave: onLeaveCount,
        late: lateCount,
        halfDay: halfDayCount,
        unmarked: unmarkedCount,
        attendanceRate,
      },
      teachers: data,
    });
  } catch (error: any) {
    console.error('Failed to load teacher attendance:', error);
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
  }
}
