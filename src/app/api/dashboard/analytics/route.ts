import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const TIME_SLOTS = [
  { period: 1, startTime: '08:00', endTime: '08:40' },
  { period: 2, startTime: '08:40', endTime: '09:20' },
  { period: 3, startTime: '09:20', endTime: '10:00' },
  { period: 4, startTime: '10:20', endTime: '11:00' },
  { period: 5, startTime: '11:00', endTime: '11:40' },
  { period: 6, startTime: '11:40', endTime: '12:20' },
  { period: 7, startTime: '13:00', endTime: '13:40' },
  { period: 8, startTime: '13:40', endTime: '14:20' },
];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get('date') || new Date().toISOString().split('T')[0];

    // ── 1. Weekly Substitution Trends (last 4 weeks) ──
    const weekStart = getWeekStart(date);
    const fourWeeksAgo = new Date(weekStart + 'T00:00:00');
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 21);
    const fourWeeksAgoStr = fourWeeksAgo.toISOString().split('T')[0];

    const weeklySubs = await db.substitution.findMany({
      where: { date: { gte: fourWeeksAgoStr, lte: date } },
    });

    const weeklyTrends: { week: string; total: number; aiAssigned: number; manualAssigned: number; sameSubject: number; crossSubject: number }[] = [];
    for (let w = 0; w < 4; w++) {
      const wStart = new Date(weekStart + 'T00:00:00');
      wStart.setDate(wStart.getDate() - (3 - w) * 7);
      const wEnd = new Date(wStart);
      wEnd.setDate(wEnd.getDate() + 4);
      const wStartStr = wStart.toISOString().split('T')[0];
      const wEndStr = wEnd.toISOString().split('T')[0];

      const weekSubs = weeklySubs.filter(s => s.date >= wStartStr && s.date <= wEndStr);
      const aiAssigned = weekSubs.filter(s => s.source === 'ai-agent' && s.substituteId).length;
      const manualAssigned = weekSubs.filter(s => s.source === 'manual').length;
      const resolved = weekSubs.filter(s => !!s.substituteId).length;

      weeklyTrends.push({
        week: `Week ${4 - w}`,
        total: weekSubs.length,
        aiAssigned,
        manualAssigned,
        sameSubject: resolved,
        crossSubject: weekSubs.length - resolved,
      });
    }

    // ── 2. Most Substituted Subjects (top 5) ──
    const subjectCounts: Record<string, { name: string; count: number; color: string | null }> = {};
    for (const sub of weeklySubs) {
      const name = sub.subject;
      if (!subjectCounts[name]) subjectCounts[name] = { name, count: 0, color: null };
      subjectCounts[name].count++;
    }
    const topSubjects = Object.values(subjectCounts).sort((a, b) => b.count - a.count).slice(0, 5);

    // ── 3. Most Frequently Absent Teachers (top 5) ──
    const teacherAbsenceCounts: Record<string, { name: string; department: string | null; count: number }> = {};
    const allLeaves = await db.leaveApplication.findMany({
      where: { status: 'approved', startDate: { gte: fourWeeksAgoStr } },
      include: { teacher: true },
    });
    for (const leave of allLeaves) {
      const id = leave.teacherId;
      if (!teacherAbsenceCounts[id]) teacherAbsenceCounts[id] = { name: leave.teacher.name, department: leave.teacher.subject, count: 0 };
      teacherAbsenceCounts[id].count++;
    }
    const topAbsentTeachers = Object.values(teacherAbsenceCounts).sort((a, b) => b.count - a.count).slice(0, 5);

    // ── 4. Substitution Coverage Rate ──
    const todaySubs = await db.substitution.findMany({ where: { date } });
    const resolvedSameSubject = todaySubs.filter(s => s.source === 'ai-agent' && !!s.substituteId).length;
    const resolvedTotal = todaySubs.filter(s => !!s.substituteId).length;
    const pendingTotal = todaySubs.filter(s => s.status === 'pending').length;
    const coverageRate = todaySubs.length > 0 ? Math.round((resolvedTotal / todaySubs.length) * 100) : 100;
    const sameSubjectRate = resolvedTotal > 0 ? Math.round((resolvedSameSubject / resolvedTotal) * 100) : 0;

    // ── 5. Subject-wise Breakdown (closest equivalent to department; flat schema has no department field) ──
    const deptBreakdown: Record<string, { department: string; absences: number; substitutions: number; coverageRate: number }> = {};
    const absentLeavesToday = await db.leaveApplication.findMany({
      where: { status: 'approved', startDate: { lte: date }, endDate: { gte: date } },
      include: { teacher: true },
    });
    for (const leave of absentLeavesToday) {
      const dept = leave.teacher.subject || 'Unknown';
      if (!deptBreakdown[dept]) deptBreakdown[dept] = { department: dept, absences: 0, substitutions: 0, coverageRate: 0 };
      deptBreakdown[dept].absences++;
    }
    for (const sub of todaySubs) {
      const dept = sub.subject || 'Unknown';
      if (!deptBreakdown[dept]) deptBreakdown[dept] = { department: dept, absences: 0, substitutions: 0, coverageRate: 0 };
      if (sub.substituteId) deptBreakdown[dept].substitutions++;
    }
    for (const dept of Object.values(deptBreakdown)) {
      dept.coverageRate = dept.absences > 0 ? Math.round((dept.substitutions / dept.absences) * 100) : 100;
    }

    // ── 6. Peak Substitution Hours ──
    const peakHours: Record<string, { timeSlot: string; count: number }> = {};
    for (const sub of todaySubs) {
      const slotInfo = TIME_SLOTS.find(t => t.period === sub.period);
      const slot = slotInfo ? `${slotInfo.startTime}-${slotInfo.endTime}` : `Period ${sub.period}`;
      if (!peakHours[slot]) peakHours[slot] = { timeSlot: slot, count: 0 };
      peakHours[slot].count++;
    }
    const peakHoursList = Object.values(peakHours).sort((a, b) => b.count - a.count);

    // ── 7. Overload Alerts ──
    const overloadAlerts: { teacherId: string; teacherName: string; substitutionCount: number; maxClasses: number }[] = [];
    const dayName = DAY_NAMES[new Date(date + 'T00:00:00').getDay()];
    const todayAssignments = todaySubs.filter(s => !!s.substituteId);
    const teacherSubCounts: Record<string, { name: string; subCount: number; regularClasses: number }> = {};
    for (const a of todayAssignments) {
      const subId = a.substituteId!;
      if (!teacherSubCounts[subId]) {
        const teacher = await db.teacher.findUnique({ where: { id: subId } });
        const regularClasses = await db.schedule.count({ where: { teacherId: subId, day: dayName } });
        teacherSubCounts[subId] = { name: teacher?.name || 'Unknown', subCount: 0, regularClasses };
      }
      teacherSubCounts[subId].subCount++;
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

    // ── 8. Subject Crisis Alerts (closest equivalent to department crisis) ──
    const crisisAlerts: { department: string; absentCount: number; totalTeachers: number; severity: 'critical' | 'warning' }[] = [];
    const allTeachers = await db.teacher.findMany({ select: { subject: true } });
    const deptTeacherCounts: Record<string, number> = {};
    for (const t of allTeachers) {
      const dept = t.subject || 'Unknown';
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
