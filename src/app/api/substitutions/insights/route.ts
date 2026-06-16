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

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get('date') || new Date().toISOString().split('T')[0];

    const weekStart = getWeekStart(date);
    const weekEndDate = new Date(weekStart + 'T00:00:00');
    weekEndDate.setDate(weekEndDate.getDate() + 4);
    const weekEnd = weekEndDate.toISOString().split('T')[0];

    // ─── 1. Period-wise Absence Heatmap ───
    const weekSubs = await db.substitution.findMany({
      where: { date: { gte: weekStart, lte: weekEnd } },
    });

    const periodHeatmap: Record<number, { periodName: string; startTime: string; endTime: string; absenceCount: number; resolvedCount: number; pendingCount: number }> = {};
    for (const sub of weekSubs) {
      const slot = TIME_SLOTS.find(t => t.period === sub.period);
      if (!periodHeatmap[sub.period]) {
        periodHeatmap[sub.period] = {
          periodName: slot?.name || `Period ${sub.period}`,
          startTime: slot?.startTime || '',
          endTime: slot?.endTime || '',
          absenceCount: 0,
          resolvedCount: 0,
          pendingCount: 0,
        };
      }
      periodHeatmap[sub.period].absenceCount++;
      if (sub.status === 'completed') periodHeatmap[sub.period].resolvedCount++;
      else periodHeatmap[sub.period].pendingCount++;
    }

    // ─── 2. Subject-wise Absence Breakdown (closest equivalent to department; flat schema has no department field) ───
    const leaves = await db.leaveApplication.findMany({
      where: { status: 'approved', startDate: { gte: weekStart, lte: weekEnd } },
      include: { teacher: true },
    });

    const allTeachers = await db.teacher.findMany({ select: { id: true, subject: true, name: true } });
    const deptTotals: Record<string, { count: number; teachers: string[] }> = {};
    for (const t of allTeachers) {
      const dept = t.subject || 'Unknown';
      if (!deptTotals[dept]) deptTotals[dept] = { count: 0, teachers: [] };
      deptTotals[dept].count++;
      deptTotals[dept].teachers.push(t.name);
    }

    const deptBreakdown: Record<string, { department: string; absentCount: number; totalTeachers: number; teacherNames: string[] }> = {};
    for (const leave of leaves) {
      const dept = leave.teacher.subject || 'Unknown';
      if (!deptBreakdown[dept]) {
        deptBreakdown[dept] = { department: dept, absentCount: 0, totalTeachers: deptTotals[dept]?.count || 0, teacherNames: [] };
      }
      deptBreakdown[dept].absentCount++;
      if (!deptBreakdown[dept].teacherNames.includes(leave.teacher.name)) {
        deptBreakdown[dept].teacherNames.push(leave.teacher.name);
      }
    }

    // ─── 3. Teachers at Risk (3+ substitutions this week) ───
    const weekAssignments = weekSubs.filter(s => !!s.substituteId);
    const teacherSubCount: Record<string, { teacherId: string; teacherName: string; department: string; subCount: number; subjects: string[] }> = {};
    for (const a of weekAssignments) {
      const tid = a.substituteId!;
      if (!teacherSubCount[tid]) {
        const teacher = allTeachers.find(t => t.id === tid);
        teacherSubCount[tid] = { teacherId: tid, teacherName: teacher?.name || 'Unknown', department: teacher?.subject || 'Unknown', subCount: 0, subjects: [] };
      }
      teacherSubCount[tid].subCount++;
      if (!teacherSubCount[tid].subjects.includes(a.subject)) {
        teacherSubCount[tid].subjects.push(a.subject);
      }
    }
    const teachersAtRisk = Object.values(teacherSubCount).filter(t => t.subCount >= 3).sort((a, b) => b.subCount - a.subCount);

    // ─── 4. AI Assignment Metrics (flat schema stores no confidence score, only source) ───
    const aiAssignments = weekAssignments.filter(a => a.source === 'ai-agent');

    // ─── 5. Substitution type breakdown ───
    const aiAutoCount = aiAssignments.length;
    const manualCount = weekAssignments.filter(a => a.source === 'manual').length;
    const pendingCount = weekSubs.filter(s => s.status === 'pending').length;
    const totalCount = weekSubs.length;

    // ─── 6. Suggested Proactive Actions ───
    const proactiveActions: string[] = [];
    if (teachersAtRisk.length > 0) {
      proactiveActions.push(`${teachersAtRisk.length} teacher(s) have 3+ substitutions this week. Consider redistributing workload.`);
    }
    const highAbsenceDepts = Object.values(deptBreakdown).filter(d => d.absentCount >= 2);
    if (highAbsenceDepts.length > 0) {
      proactiveActions.push(`${highAbsenceDepts.length} subject area(s) have high absence rates. Cross-subject support may be needed.`);
    }
    if (pendingCount > 0) {
      proactiveActions.push(`${pendingCount} substitution(s) still pending. Assign teachers to avoid uncovered classes.`);
    }
    const peakPeriod = Object.values(periodHeatmap).sort((a, b) => b.absenceCount - a.absenceCount)[0];
    if (peakPeriod && peakPeriod.absenceCount > 2) {
      proactiveActions.push(`${peakPeriod.periodName} (${peakPeriod.startTime}-${peakPeriod.endTime}) has the highest absence rate. Consider having backup teachers available.`);
    }
    if (proactiveActions.length === 0) {
      proactiveActions.push('No critical issues detected. All substitutions are well-managed.');
    }

    return NextResponse.json({
      success: true,
      data: {
        periodHeatmap: Object.values(periodHeatmap).sort((a, b) => a.startTime.localeCompare(b.startTime)),
        departmentBreakdown: Object.values(deptBreakdown).sort((a, b) => b.absentCount - a.absentCount),
        teachersAtRisk,
        aiConfidenceMetrics: {
          // Flat schema stores no per-assignment confidence score
          total: aiAssignments.length,
        },
        substitutionBreakdown: {
          total: totalCount,
          aiAutoAssigned: aiAutoCount,
          manualAssigned: manualCount,
          pending: pendingCount,
        },
        proactiveActions,
        weekRange: { start: weekStart, end: weekEnd },
      },
    });
  } catch (error) {
    console.error('[SUBSTITUTIONS INSIGHTS ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed to load insights' }, { status: 500 });
  }
}

function getWeekStart(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const day = date.getDay();
  const diff = day === 0 ? 6 : day - 1;
  date.setDate(date.getDate() - diff);
  return date.toISOString().split('T')[0];
}
