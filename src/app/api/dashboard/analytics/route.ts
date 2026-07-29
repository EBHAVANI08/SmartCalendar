import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get('date') || new Date().toISOString().split('T')[0];

    // ── 1. Weekly Substitution Trends (last 4 weeks) ──
    const weekStart = getWeekStart(date);
    const fourWeeksAgo = new Date(weekStart + 'T00:00:00');
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 21);
    const fourWeeksAgoStr = fourWeeksAgo.toISOString().split('T')[0];

    const weeklySubs = await db.substitutionRequest.findMany({
      where: { date: { gte: fourWeeksAgoStr, lte: date } },
      include: { assignments: { where: { status: 'ACCEPTED' } } },
    });

    // Group by week
    const weeklyTrends: { week: string; total: number; aiAssigned: number; manualAssigned: number; sameSubject: number; crossSubject: number }[] = [];
    for (let w = 0; w < 4; w++) {
      const wStart = new Date(weekStart + 'T00:00:00');
      wStart.setDate(wStart.getDate() - (3 - w) * 7);
      const wEnd = new Date(wStart);
      wEnd.setDate(wEnd.getDate() + 4);
      const wStartStr = wStart.toISOString().split('T')[0];
      const wEndStr = wEnd.toISOString().split('T')[0];

      const weekSubs = weeklySubs.filter(s => s.date >= wStartStr && s.date <= wEndStr);
      const aiAssigned = weekSubs.filter(s => s.assignments.some(a => a.assignedBy === 'AI_AGENT')).length;
      const manualAssigned = weekSubs.filter(s => s.reason === 'MANUAL').length;
      const sameSubject = weekSubs.filter(s => s.reason !== 'SUBJECT_SWAP' && s.assignments.some(a => a.status === 'ACCEPTED')).length;

      weeklyTrends.push({
        week: `Week ${4 - w}`,
        total: weekSubs.length,
        aiAssigned,
        manualAssigned,
        sameSubject,
        crossSubject: weekSubs.length - sameSubject,
      });
    }

    // ── 2. Most Substituted Subjects (top 5) ──
    const subjectCounts: Record<string, { name: string; count: number; color: string | null }> = {};
    const allSubsWithSubject = await db.substitutionRequest.findMany({
      where: { date: { gte: fourWeeksAgoStr } },
      include: { subject: true },
    });
    for (const sub of allSubsWithSubject) {
      const name = sub.subject.name;
      if (!subjectCounts[name]) subjectCounts[name] = { name, count: 0, color: sub.subject.color };
      subjectCounts[name].count++;
    }
    const topSubjects = Object.values(subjectCounts).sort((a, b) => b.count - a.count).slice(0, 5);

    // ── 3. Most Frequently Absent Teachers (top 5) ──
    const teacherAbsenceCounts: Record<string, { name: string; department: string | null; count: number }> = {};
    const allLeaves = await db.leave.findMany({
      where: { status: 'APPROVED', startDate: { gte: fourWeeksAgoStr } },
      include: { teacher: true },
    });
    for (const leave of allLeaves) {
      const id = leave.teacherId;
      if (!teacherAbsenceCounts[id]) teacherAbsenceCounts[id] = { name: leave.teacher.name, department: leave.teacher.department, count: 0 };
      teacherAbsenceCounts[id].count++;
    }
    const topAbsentTeachers = Object.values(teacherAbsenceCounts).sort((a, b) => b.count - a.count).slice(0, 5);

    // ── 4. Substitution Coverage Rate ──
    const todaySubs = await db.substitutionRequest.findMany({
      where: { date },
      include: { assignments: { where: { status: 'ACCEPTED' } } },
    });
    const resolvedSameSubject = todaySubs.filter(s => s.reason !== 'SUBJECT_SWAP' && s.assignments.length > 0 && s.assignments[0].assignedBy === 'AI_AGENT').length;
    const resolvedTotal = todaySubs.filter(s => s.assignments.length > 0).length;
    const pendingTotal = todaySubs.filter(s => s.status === 'PENDING').length;
    const coverageRate = todaySubs.length > 0 ? Math.round((resolvedTotal / todaySubs.length) * 100) : 100;
    const sameSubjectRate = resolvedTotal > 0 ? Math.round((resolvedSameSubject / resolvedTotal) * 100) : 0;

    // ── 5. Department-wise Breakdown ──
    const deptBreakdown: Record<string, { department: string; absences: number; substitutions: number; coverageRate: number }> = {};
    const absentTeacherIds = await db.leave.findMany({
      where: { status: 'APPROVED', startDate: { lte: date }, endDate: { gte: date } },
      include: { teacher: true },
    });
    for (const leave of absentTeacherIds) {
      const dept = leave.teacher.department || 'Unknown';
      if (!deptBreakdown[dept]) deptBreakdown[dept] = { department: dept, absences: 0, substitutions: 0, coverageRate: 0 };
      deptBreakdown[dept].absences++;
    }
    // Count substitutions per department
    const todaySubRequests = await db.substitutionRequest.findMany({
      where: { date },
      include: { originalTeacher: true, assignments: { where: { status: 'ACCEPTED' } } },
    });
    for (const sub of todaySubRequests) {
      const dept = sub.originalTeacher.department || 'Unknown';
      if (!deptBreakdown[dept]) deptBreakdown[dept] = { department: dept, absences: 0, substitutions: 0, coverageRate: 0 };
      if (sub.assignments.length > 0) deptBreakdown[dept].substitutions++;
    }
    for (const dept of Object.values(deptBreakdown)) {
      dept.coverageRate = dept.absences > 0 ? Math.round((dept.substitutions / dept.absences) * 100) : 100;
    }

    // ── 6. Peak Substitution Hours ──
    const peakHours: Record<string, { timeSlot: string; count: number }> = {};
    const todaySubsWithSlot = await db.substitutionRequest.findMany({
      where: { date },
      include: { schedule: { include: { timeSlot: true } } },
    });
    for (const sub of todaySubsWithSlot) {
      const slot = `${sub.schedule.timeSlot.startTime}-${sub.schedule.timeSlot.endTime}`;
      if (!peakHours[slot]) peakHours[slot] = { timeSlot: slot, count: 0 };
      peakHours[slot].count++;
    }
    const peakHoursList = Object.values(peakHours).sort((a, b) => b.count - a.count);

    // ── 7. Overload Alerts ──
    const overloadAlerts: { teacherId: string; teacherName: string; substitutionCount: number; maxClasses: number }[] = [];
    const todayAssignments = await db.substitutionAssignment.findMany({
      where: { status: 'ACCEPTED', createdAt: { gte: new Date(date + 'T00:00:00'), lte: new Date(date + 'T23:59:59') } },
      include: { substituteTeacher: { include: { schedules: { where: { dayOfWeek: new Date(date + 'T00:00:00').getDay() } } } } },
    });
    const teacherSubCounts: Record<string, { name: string; subCount: number; regularClasses: number }> = {};
    for (const a of todayAssignments) {
      if (!teacherSubCounts[a.substituteTeacherId]) {
        teacherSubCounts[a.substituteTeacherId] = {
          name: a.substituteTeacher.name,
          subCount: 0,
          regularClasses: a.substituteTeacher.schedules.length,
        };
      }
      teacherSubCounts[a.substituteTeacherId].subCount++;
    }
    for (const [id, info] of Object.entries(teacherSubCounts)) {
      if (info.subCount >= 2) {
        overloadAlerts.push({
          teacherId: id,
          teacherName: info.name,
          substitutionCount: info.subCount,
          maxClasses: info.regularClasses + info.subCount,
        });
      }
    }

    // ── 8. Department Crisis Alerts ──
    const crisisAlerts: { department: string; absentCount: number; totalTeachers: number; severity: 'critical' | 'warning' }[] = [];
    const allDeptTeachers = await db.teacher.findMany({
      where: { isActive: true },
      select: { department: true },
    });
    const deptTeacherCounts: Record<string, number> = {};
    for (const t of allDeptTeachers) {
      const dept = t.department || 'Unknown';
      deptTeacherCounts[dept] = (deptTeacherCounts[dept] || 0) + 1;
    }
    for (const [dept, info] of Object.entries(deptBreakdown)) {
      const totalInDept = deptTeacherCounts[dept] || 1;
      const absenceRatio = info.absences / totalInDept;
      if (absenceRatio >= 0.4) {
        crisisAlerts.push({ department: dept, absentCount: info.absences, totalTeachers: totalInDept, severity: 'critical' });
      } else if (absenceRatio >= 0.25) {
        crisisAlerts.push({ department: dept, absentCount: info.absences, totalTeachers: totalInDept, severity: 'warning' });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        weeklyTrends,
        topSubjects,
        topAbsentTeachers,
        coverageRate,
        sameSubjectRate,
        totalToday: todaySubs.length,
        resolvedToday: resolvedTotal,
        pendingToday: pendingTotal,
        deptBreakdown: Object.values(deptBreakdown),
        peakHours: peakHoursList,
        overloadAlerts,
        crisisAlerts,
      },
    });
  } catch (error) {
    console.error('[ANALYTICS ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed to load analytics' }, { status: 500 });
  }
}

function getWeekStart(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const day = date.getDay();
  const diff = day === 0 ? 6 : day - 1;
  date.setDate(date.getDate() - diff);
  return date.toISOString().split('T')[0];
}
