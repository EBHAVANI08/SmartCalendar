import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get('date') || new Date().toISOString().split('T')[0];

    // Get week boundaries
    const weekStart = getWeekStart(date);
    const weekEndDate = new Date(weekStart + 'T00:00:00');
    weekEndDate.setDate(weekEndDate.getDate() + 4);
    const weekEnd = weekEndDate.toISOString().split('T')[0];

    // ─── 1. Period-wise Absence Heatmap ───
    // Which periods have the most absences/substitutions this week
    const weekSubs = await db.substitutionRequest.findMany({
      where: {
        date: { gte: weekStart, lte: weekEnd },
      },
      include: {
        schedule: { include: { timeSlot: true } },
        assignments: { where: { status: 'ACCEPTED' } },
      },
    });

    const periodHeatmap: Record<string, { periodName: string; startTime: string; endTime: string; absenceCount: number; resolvedCount: number; pendingCount: number }> = {};

    for (const sub of weekSubs) {
      const ts = sub.schedule.timeSlot;
      if (!periodHeatmap[ts.id]) {
        periodHeatmap[ts.id] = {
          periodName: ts.name,
          startTime: ts.startTime,
          endTime: ts.endTime,
          absenceCount: 0,
          resolvedCount: 0,
          pendingCount: 0,
        };
      }
      periodHeatmap[ts.id].absenceCount++;
      if (sub.status === 'RESOLVED') periodHeatmap[ts.id].resolvedCount++;
      else periodHeatmap[ts.id].pendingCount++;
    }

    // ─── 2. Department-wise Absence Breakdown ───
    const leaves = await db.leave.findMany({
      where: {
        status: 'APPROVED',
        startDate: { gte: weekStart, lte: weekEnd },
      },
      include: { teacher: true },
    });

    const deptBreakdown: Record<string, { department: string; absentCount: number; totalTeachers: number; teacherNames: string[] }> = {};

    // Get total teachers per department
    const allTeachers = await db.teacher.findMany({
      where: { isActive: true },
      select: { id: true, department: true, name: true },
    });

    const deptTotals: Record<string, { count: number; teachers: string[] }> = {};
    for (const t of allTeachers) {
      const dept = t.department || 'Unknown';
      if (!deptTotals[dept]) deptTotals[dept] = { count: 0, teachers: [] };
      deptTotals[dept].count++;
      deptTotals[dept].teachers.push(t.name);
    }

    for (const leave of leaves) {
      const dept = leave.teacher.department || 'Unknown';
      if (!deptBreakdown[dept]) {
        deptBreakdown[dept] = {
          department: dept,
          absentCount: 0,
          totalTeachers: deptTotals[dept]?.count || 0,
          teacherNames: [],
        };
      }
      deptBreakdown[dept].absentCount++;
      if (!deptBreakdown[dept].teacherNames.includes(leave.teacher.name)) {
        deptBreakdown[dept].teacherNames.push(leave.teacher.name);
      }
    }

    // ─── 3. Teachers at Risk (3+ substitutions this week) ───
    const weekAssignments = await db.substitutionAssignment.findMany({
      where: {
        status: 'ACCEPTED',
        createdAt: { gte: new Date(weekStart), lte: new Date(weekEnd + 'T23:59:59') },
      },
      include: { substituteTeacher: true, substitutionRequest: { include: { subject: true } } },
    });

    const teacherSubCount: Record<string, { teacherId: string; teacherName: string; department: string; subCount: number; subjects: string[] }> = {};
    for (const a of weekAssignments) {
      const tid = a.substituteTeacherId;
      if (!teacherSubCount[tid]) {
        teacherSubCount[tid] = {
          teacherId: tid,
          teacherName: a.substituteTeacher.name,
          department: a.substituteTeacher.department || 'Unknown',
          subCount: 0,
          subjects: [],
        };
      }
      teacherSubCount[tid].subCount++;
      const subjectName = a.substitutionRequest.subject.name;
      if (!teacherSubCount[tid].subjects.includes(subjectName)) {
        teacherSubCount[tid].subjects.push(subjectName);
      }
    }

    const teachersAtRisk = Object.values(teacherSubCount)
      .filter(t => t.subCount >= 3)
      .sort((a, b) => b.subCount - a.subCount);

    // ─── 4. AI Confidence Metrics ───
    const aiAssignments = weekAssignments.filter(a => a.assignedBy === 'AI_AGENT' && a.aiConfidence !== null);
    const avgConfidence = aiAssignments.length > 0
      ? Math.round(aiAssignments.reduce((sum, a) => sum + (a.aiConfidence || 0), 0) / aiAssignments.length)
      : 0;
    const highConfidence = aiAssignments.filter(a => (a.aiConfidence || 0) >= 70).length;
    const medConfidence = aiAssignments.filter(a => (a.aiConfidence || 0) >= 40 && (a.aiConfidence || 0) < 70).length;
    const lowConfidence = aiAssignments.filter(a => (a.aiConfidence || 0) < 40).length;

    // ─── 5. Substitution type breakdown ───
    const subjectSwapCount = weekSubs.filter(s => s.reason === 'SUBJECT_SWAP').length;
    const aiAutoCount = weekAssignments.filter(a => a.assignedBy === 'AI_AGENT').length;
    const manualCount = weekAssignments.filter(a => a.assignedBy === 'ADMIN').length;
    const pendingCount = weekSubs.filter(s => s.status === 'PENDING').length;
    const totalCount = weekSubs.length;

    // ─── 6. Suggested Proactive Actions ───
    const proactiveActions: string[] = [];

    if (teachersAtRisk.length > 0) {
      proactiveActions.push(`${teachersAtRisk.length} teacher(s) have 3+ substitutions this week. Consider redistributing workload.`);
    }

    const highAbsenceDepts = Object.values(deptBreakdown).filter(d => d.absentCount >= 2);
    if (highAbsenceDepts.length > 0) {
      proactiveActions.push(`${highAbsenceDepts.length} department(s) have high absence rates. Cross-department support may be needed.`);
    }

    if (lowConfidence > 0) {
      proactiveActions.push(`${lowConfidence} AI assignment(s) had low confidence (<40). Review these manually.`);
    }

    if (pendingCount > 0) {
      proactiveActions.push(`${pendingCount} substitution(s) still pending. Assign teachers to avoid uncovered classes.`);
    }

    const peakPeriod = Object.values(periodHeatmap).sort((a, b) => b.absenceCount - a.absenceCount)[0];
    if (peakPeriod && peakPeriod.absenceCount > 2) {
      proactiveActions.push(`Period ${peakPeriod.periodName} (${peakPeriod.startTime}-${peakPeriod.endTime}) has the highest absence rate. Consider having backup teachers available.`);
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
          average: avgConfidence,
          high: highConfidence,
          medium: medConfidence,
          low: lowConfidence,
          total: aiAssignments.length,
        },
        substitutionBreakdown: {
          total: totalCount,
          aiAutoAssigned: aiAutoCount,
          manualAssigned: manualCount,
          subjectSwaps: subjectSwapCount,
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
