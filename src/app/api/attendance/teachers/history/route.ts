export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { requireCapability } from '@/lib/authz';
import { weekdayOf } from '@/lib/substitution-service';

export async function GET(request: Request) {
  const denied = requireCapability(request, 'attendance.read');
  if (denied) return denied;

  try {
    const schoolId = await getTenantSchoolId(request);
    if (!schoolId) {
      return NextResponse.json({ error: 'School context required.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const today = new Date().toISOString().split('T')[0];

    const defaultFrom = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const from = searchParams.get('from') || defaultFrom;
    const to = searchParams.get('to') || today;
    const teacherId = searchParams.get('teacherId') || undefined;
    const status = searchParams.get('status') || undefined;

    // Fetch teachers for school
    const teachers = await db.teacher.findMany({
      where: {
        schoolId,
        ...(teacherId ? { id: teacherId } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        employeeId: true,
        subject: true,
      },
    });

    const teacherMap = new Map(teachers.map((t) => [t.id, t]));
    const targetTeacherIds = teachers.map((t) => t.id);

    // Fetch attendance records within range
    const records = await db.biometricAttendance.findMany({
      where: {
        teacherId: { in: targetTeacherIds },
        date: { gte: from, lte: to },
        ...(status && status !== 'all' ? { status: status.toLowerCase() } : {}),
      },
      orderBy: [{ date: 'desc' }, { teacherId: 'asc' }],
    });

    // Compute summary
    let presentCount = 0;
    let absentCount = 0;
    let onLeaveCount = 0;
    let lateCount = 0;
    let halfDayCount = 0;

    const formattedRecords = records.map((r) => {
      const st = r.status.toLowerCase();
      if (st === 'present') presentCount++;
      else if (st === 'absent') absentCount++;
      else if (st === 'on_leave') onLeaveCount++;
      else if (st === 'late') lateCount++;
      else if (st === 'half-day') halfDayCount++;

      const teacher = teacherMap.get(r.teacherId);
      return {
        id: r.id,
        date: r.date,
        day: weekdayOf(r.date) || 'Day',
        teacherId: r.teacherId,
        teacherName: teacher?.name || 'Unknown',
        employeeId: teacher?.employeeId || null,
        subject: teacher?.subject || '',
        status: st,
        checkInTime: r.checkInTime,
        checkOutTime: r.checkOutTime,
        syncSource: r.syncSource || 'manual',
        updatedAt: r.updatedAt,
      };
    });

    const totalLogs = formattedRecords.length;
    const effectiveAttending = presentCount + lateCount + halfDayCount * 0.5;
    const attendanceRate = totalLogs > 0 ? Math.round((effectiveAttending / totalLogs) * 100) : 0;

    // Group by date
    const dateGroups: Record<string, { present: number; absent: number; onLeave: number; late: number; total: number }> = {};
    for (const rec of formattedRecords) {
      if (!dateGroups[rec.date]) {
        dateGroups[rec.date] = { present: 0, absent: 0, onLeave: 0, late: 0, total: 0 };
      }
      dateGroups[rec.date].total++;
      if (rec.status === 'present') dateGroups[rec.date].present++;
      else if (rec.status === 'absent') dateGroups[rec.date].absent++;
      else if (rec.status === 'on_leave') dateGroups[rec.date].onLeave++;
      else if (rec.status === 'late') dateGroups[rec.date].late++;
    }

    return NextResponse.json({
      success: true,
      range: { from, to },
      summary: {
        totalLogs,
        present: presentCount,
        absent: absentCount,
        onLeave: onLeaveCount,
        late: lateCount,
        halfDay: halfDayCount,
        attendanceRate,
      },
      dateTrends: Object.entries(dateGroups).map(([d, counts]) => ({
        date: d,
        day: weekdayOf(d) || '',
        ...counts,
      })),
      records: formattedRecords,
    });
  } catch (error: any) {
    console.error('Failed to fetch attendance history:', error);
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
  }
}
