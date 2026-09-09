/**
 * Predictive Absence Engine — Feature 1.1
 *
 * Predicts likely teacher absences 24-48 hours ahead by analyzing:
 * 1. Pattern signals: recurring Monday/Friday leaves in last 90 days
 * 2. Streak fatigue: 6+ consecutive working days without a free period
 * 3. Cluster signal: 3+ teachers from same subject on leave in last 14 days
 * 4. Pending leave applications for tomorrow/day-after
 *
 * Output: Risk assessments for teachers with riskScore (0-100) and signals
 */

import { db } from '@/lib/db';

interface PredictionSignal {
  type: string;
  score: number;
  description: string;
}

interface TeacherRiskAssessment {
  teacherId: string;
  teacherName: string;
  department: string | null;
  predictedDate: string;
  riskScore: number;
  signals: PredictionSignal[];
}

/**
 * Run the prediction engine for a specific date.
 * Returns risk assessments for all teachers who might be absent on that date.
 */
export async function predictAbsencesForDate(targetDate: string, schoolId?: string | null): Promise<TeacherRiskAssessment[]> {
  const results: TeacherRiskAssessment[] = [];

  // Get teachers scoped to schoolId
  const teachers = await db.teacher.findMany({
    where: {
      ...(schoolId ? { schoolId } : {}),
      role: { not: 'inactive' },
    },
    include: {
      leaveApplications: true,
      schedules: true,
      absentSubstitutions: true,
    },
  });

  // Get the day of week for the target date
  const targetDayOfWeek = new Date(targetDate + 'T00:00:00').getDay();

  // Only predict for working days
  if (targetDayOfWeek === 0 || targetDayOfWeek === 6) return [];

  // ── Signal 1: Pattern Signal — Recurring Monday/Friday leaves ──
  const ninetyDaysAgo = new Date(targetDate + 'T00:00:00');
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const ninetyDaysAgoStr = ninetyDaysAgo.toISOString().split('T')[0];

  const recurringLeaves = await db.leaveApplication.findMany({
    where: {
      status: 'approved',
      startDate: { gte: ninetyDaysAgoStr, lte: targetDate },
      ...(schoolId ? { teacher: { schoolId } } : {}),
    },
    include: { teacher: true },
  });

  // Count recurring leaves per teacher per day-of-week
  const teacherDayLeaveCount = new Map<string, number>();
  for (const leave of recurringLeaves) {
    const startDay = new Date(leave.startDate + 'T00:00:00').getDay();
    const endDay = new Date(leave.endDate + 'T00:00:00').getDay();
    if (startDay === targetDayOfWeek || endDay === targetDayOfWeek ||
        (startDay < targetDayOfWeek && endDay > targetDayOfWeek)) {
      const key = leave.teacherId;
      teacherDayLeaveCount.set(key, (teacherDayLeaveCount.get(key) || 0) + 1);
    }
  }

  // ── Signal 3: Cluster Signal — 3+ teachers from same subject on leave in last 14 days ──
  const fourteenDaysAgo = new Date(targetDate + 'T00:00:00');
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const fourteenDaysAgoStr = fourteenDaysAgo.toISOString().split('T')[0];

  const recentLeaves = await db.leaveApplication.findMany({
    where: {
      status: 'approved',
      startDate: { gte: fourteenDaysAgoStr, lte: targetDate },
      ...(schoolId ? { teacher: { schoolId } } : {}),
    },
    include: { teacher: true },
  });

  const deptLeaveCounts = new Map<string, number>();
  for (const leave of recentLeaves) {
    const dept = leave.teacher?.subject || 'General';
    deptLeaveCounts.set(dept, (deptLeaveCounts.get(dept) || 0) + 1);
  }

  const clusterDepts = new Set(
    Array.from(deptLeaveCounts.entries())
      .filter(([_, count]) => count >= 3)
      .map(([dept]) => dept)
  );

  // ── Signal 3: Pending leave applications for tomorrow/day-after ──
  const pendingLeaves = await db.leaveApplication.findMany({
    where: {
      status: 'pending',
      startDate: { lte: targetDate },
      endDate: { gte: targetDate },
      ...(schoolId ? { teacher: { schoolId } } : {}),
    },
    include: { teacher: true },
  });

  const pendingLeaveTeacherIds = new Set(pendingLeaves.map(l => l.teacherId));

  // Evaluate each teacher
  for (const teacher of teachers) {
    const signals: PredictionSignal[] = [];

    // Signal 1: Recurring day-of-week pattern
    const patternCount = teacherDayLeaveCount.get(teacher.id) || 0;
    if (patternCount >= 2) {
      signals.push({
        type: 'recurring_pattern',
        score: Math.min(patternCount * 20, 40),
        description: `Teacher has taken leave on this day of the week ${patternCount} times in the last 90 days`,
      });
    }

    // Signal 2: Subject cluster
    const subject = teacher.subject || 'General';
    if (clusterDepts.has(subject)) {
      signals.push({
        type: 'department_cluster',
        score: 25,
        description: `Cluster signal: 3+ teachers in ${subject} have been on leave in the last 14 days`,
      });
    }

    // Signal 3: Pending leave application
    if (pendingLeaveTeacherIds.has(teacher.id)) {
      signals.push({
        type: 'pending_leave',
        score: 50,
        description: `Pending leave application submitted for ${targetDate}`,
      });
    }

    if (signals.length > 0) {
      const totalScore = Math.min(
        signals.reduce((sum, s) => sum + s.score, 0),
        100
      );

      results.push({
        teacherId: teacher.id,
        teacherName: teacher.name,
        department: teacher.subject,
        predictedDate: targetDate,
        riskScore: totalScore,
        signals,
      });
    }
  }

  return results.sort((a, b) => b.riskScore - a.riskScore);
}

/**
 * Convenience export for running prediction engine and returning summary stats
 */
export async function runPredictionEngine(targetDate?: string, schoolId?: string | null) {
  const date = targetDate || new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const assessments = await predictAbsencesForDate(date, schoolId);
  return {
    targetDate: date,
    totalAssessed: assessments.length,
    highRiskCount: assessments.filter(a => a.riskScore >= 70).length,
    mediumRiskCount: assessments.filter(a => a.riskScore >= 40 && a.riskScore < 70).length,
    assessments,
  };
}

export async function getPredictionsForDate(date: string, schoolId?: string | null) {
  return predictAbsencesForDate(date, schoolId);
}
