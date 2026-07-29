/**
 * Fairness & Wellbeing Engine — Feature 1.4
 *
 * Computes per-teacher wellbeing metrics, stress scores,
 * and integrates fairness penalties into the AI agent.
 */

import { db } from '@/lib/db';

export interface TeacherWellbeing {
  teacherId: string;
  teacherName: string;
  department: string | null;
  totalSubstitutions30d: number;
  consecutiveDayStreak: number;
  meanPeriodsPerDay: number;
  refusalRate: number;
  timeSinceLastFreePeriod: number; // in days
  stressScore: number; // 0-100
  badges: string[];
  recentSubs: {
    date: string;
    subject: string;
    grade: string;
    section: string;
  }[];
}

/**
 * Compute wellbeing metrics for all teachers (rolling 30 days).
 */
export async function computeAllWellbeingMetrics(baseDate?: string): Promise<TeacherWellbeing[]> {
  const today = baseDate || new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(today + 'T00:00:00');
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

  const teachers = await db.teacher.findMany({
    where: { isActive: true },
    include: {
      substitutionsAsSubstitute: {
        where: {
          status: { in: ['ACCEPTED', 'DRAFT'] },
          createdAt: { gte: new Date(thirtyDaysAgoStr) },
        },
        include: {
          substitutionRequest: {
            include: {
              subject: true,
              schedule: { include: { grade: true, section: true } },
            },
          },
        },
      },
      schedules: true,
      leaves: {
        where: { status: 'APPROVED', startDate: { gte: thirtyDaysAgoStr } },
      },
    },
  });

  const results: TeacherWellbeing[] = [];

  for (const teacher of teachers) {
    const totalSubs = teacher.substitutionsAsSubstitute.length;

    // Recent subs list
    const recentSubs = teacher.substitutionsAsSubstitute.map(s => ({
      date: s.substitutionRequest.date,
      subject: s.substitutionRequest.subject.name,
      grade: s.substitutionRequest.schedule.grade.name,
      section: s.substitutionRequest.schedule.section.name,
    }));

    // Consecutive day streak: count how many consecutive working days up to today the teacher had sub duty
    let consecutiveStreak = 0;
    const subDates = new Set(teacher.substitutionsAsSubstitute.map(s => s.substitutionRequest.date));
    const checkDate = new Date(today + 'T00:00:00');
    for (let i = 0; i < 30; i++) {
      const dow = checkDate.getDay();
      if (dow >= 1 && dow <= 5) {
        const dateStr = checkDate.toISOString().split('T')[0];
        if (subDates.has(dateStr)) {
          consecutiveStreak++;
        } else {
          break;
        }
      }
      checkDate.setDate(checkDate.getDate() - 1);
    }

    // Mean periods per day (for days when they had subs)
    const subsByDate = new Map<string, number>();
    for (const sub of teacher.substitutionsAsSubstitute) {
      const d = sub.substitutionRequest.date;
      subsByDate.set(d, (subsByDate.get(d) || 0) + 1);
    }
    const meanPeriods = subsByDate.size > 0
      ? Array.from(subsByDate.values()).reduce((a, b) => a + b, 0) / subsByDate.size
      : 0;

    // Refusal rate: count rejections vs total assignments
    const totalAssignments = await db.substitutionAssignment.count({
      where: {
        substituteTeacherId: teacher.id,
        createdAt: { gte: new Date(thirtyDaysAgoStr) },
      },
    });
    const rejections = await db.substitutionAssignment.count({
      where: {
        substituteTeacherId: teacher.id,
        status: 'REJECTED',
        createdAt: { gte: new Date(thirtyDaysAgoStr) },
      },
    });
    const refusalRate = totalAssignments > 0 ? (rejections / totalAssignments) * 100 : 0;

    // Time since last free period: find the most recent day with no sub duties
    let lastFreeDay = 0;
    const sortedSubDates = Array.from(subDates.keys()).sort().reverse();
    for (let i = 1; i <= 30; i++) {
      const d = new Date(today + 'T00:00:00');
      d.setDate(d.getDate() - i);
      const dow = d.getDay();
      if (dow >= 1 && dow <= 5) {
        const dateStr = d.toISOString().split('T')[0];
        if (!subDates.has(dateStr)) {
          lastFreeDay = i;
          break;
        }
      }
    }

    // ── Compute Stress Score (0-100) ──
    let stressScore = 0;

    // Total subs (0-30 pts): more subs = more stress
    if (totalSubs >= 8) stressScore += 30;
    else if (totalSubs >= 5) stressScore += 20;
    else if (totalSubs >= 3) stressScore += 10;

    // Consecutive streak (0-25 pts): streak = burnout risk
    if (consecutiveStreak >= 4) stressScore += 25;
    else if (consecutiveStreak >= 3) stressScore += 18;
    else if (consecutiveStreak >= 2) stressScore += 10;

    // Mean periods per day (0-20 pts): heavy days are stressful
    if (meanPeriods >= 3) stressScore += 20;
    else if (meanPeriods >= 2) stressScore += 12;
    else if (meanPeriods >= 1) stressScore += 5;

    // Time since last free period (0-15 pts): no break = stressful
    if (lastFreeDay >= 10) stressScore += 15;
    else if (lastFreeDay >= 5) stressScore += 10;
    else if (lastFreeDay >= 3) stressScore += 5;

    // Refusal rate (0-10 pts): declining subs suggests overwhelm
    if (refusalRate >= 50) stressScore += 10;
    else if (refusalRate >= 25) stressScore += 5;

    stressScore = Math.min(100, stressScore);

    // ── Compute Badges ──
    const badges: string[] = [];
    if (totalSubs >= 5 && refusalRate <= 10) badges.push('Reliable Sub');
    if (totalSubs >= 3 && meanPeriods <= 1.5) badges.push('Flexible Helper');
    if (consecutiveStreak >= 3) badges.push('Overworked');
    if (stressScore >= 70) badges.push('Needs Break');

    results.push({
      teacherId: teacher.id,
      teacherName: teacher.name,
      department: teacher.department,
      totalSubstitutions30d: totalSubs,
      consecutiveDayStreak: consecutiveStreak,
      meanPeriodsPerDay: Math.round(meanPeriods * 10) / 10,
      refusalRate: Math.round(refusalRate * 10) / 10,
      timeSinceLastFreePeriod: lastFreeDay,
      stressScore,
      badges,
      recentSubs: recentSubs.slice(0, 10),
    });
  }

  // Sort by stress score descending (most stressed first)
  results.sort((a, b) => b.stressScore - a.stressScore);

  return results;
}

/**
 * Compute wellbeing penalty for a specific teacher.
 * Teachers with stress >70 get a -25 penalty.
 * Teachers with 4+ subs in prior 7 days are vetoed unless no alternatives.
 */
export async function getWellbeingPenalty(teacherId: string): Promise<{
  penalty: number;
  veto: boolean;
  stressScore: number;
  reason: string;
}> {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toISOString().split('T')[0];

  const weekSubs = await db.substitutionAssignment.count({
    where: {
      substituteTeacherId: teacherId,
      status: { in: ['ACCEPTED', 'DRAFT'] },
      createdAt: { gte: new Date(weekAgoStr) },
    },
  });

  // Get stress score from metrics
  const allMetrics = await computeAllWellbeingMetrics();
  const teacherMetric = allMetrics.find(m => m.teacherId === teacherId);

  const stressScore = teacherMetric?.stressScore || 0;
  const veto = weekSubs >= 4;
  const penalty = stressScore >= 70 ? -25 : stressScore >= 50 ? -10 : 0;
  const reason = veto
    ? `VETO: ${weekSubs} substitutions in the last 7 days (overload protection)`
    : penalty < 0
      ? `Stress score ${stressScore}/100 — wellbeing penalty applied`
      : 'No wellbeing concerns';

  return { penalty, veto, stressScore, reason };
}

/**
 * Compute fairness report data (Gini coefficient + distribution).
 */
export async function computeFairnessReport(): Promise<{
  giniCoefficient: number;
  totalSubs: number;
  distribution: { teacherName: string; department: string | null; subs: number }[];
  overloadedCount: number;
  underloadedCount: number;
}> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

  const teachers = await db.teacher.findMany({
    where: { isActive: true },
    include: {
      substitutionsAsSubstitute: {
        where: {
          status: { in: ['ACCEPTED', 'DRAFT'] },
          createdAt: { gte: new Date(thirtyDaysAgoStr) },
        },
      },
    },
  });

  const distribution = teachers.map(t => ({
    teacherName: t.name,
    department: t.department,
    subs: t.substitutionsAsSubstitute.length,
  })).sort((a, b) => b.subs - a.subs);

  const totalSubs = distribution.reduce((sum, d) => sum + d.subs, 0);

  // Compute Gini coefficient
  const values = distribution.map(d => d.subs).sort((a, b) => a - b);
  const n = values.length;
  let sumOfDifferences = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sumOfDifferences += Math.abs(values[i] - values[j]);
    }
  }
  const meanValue = totalSubs / n;
  const giniCoefficient = meanValue > 0 ? (sumOfDifferences / (2 * n * n * meanValue)) : 0;

  const mean = totalSubs / n;
  const overloadedCount = distribution.filter(d => d.subs > mean * 1.5).length;
  const underloadedCount = distribution.filter(d => d.subs < mean * 0.5).length;

  return {
    giniCoefficient: Math.round(giniCoefficient * 1000) / 1000,
    totalSubs,
    distribution,
    overloadedCount,
    underloadedCount,
  };
}
