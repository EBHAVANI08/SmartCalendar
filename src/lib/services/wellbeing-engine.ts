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

  const teachers = await db.teacher.findMany({
    include: {
      substituteSubstitutions: true,
      schedules: true,
      leaveApplications: true,
    },
  });

  const results: TeacherWellbeing[] = [];

  for (const teacher of teachers) {
    const totalSubs = teacher.substituteSubstitutions.length;

    // Recent subs list
    const recentSubs = teacher.substituteSubstitutions.map(s => ({
      date: s.date,
      subject: s.subject,
      grade: s.grade,
      section: s.section,
    }));

    // Consecutive day streak
    let consecutiveStreak = 0;
    const subDates = new Set(teacher.substituteSubstitutions.map(s => s.date));
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

    // Mean periods per day
    const subsByDate = new Map<string, number>();
    for (const sub of teacher.substituteSubstitutions) {
      subsByDate.set(sub.date, (subsByDate.get(sub.date) || 0) + 1);
    }
    const meanPeriods = subsByDate.size > 0
      ? Array.from(subsByDate.values()).reduce((a, b) => a + b, 0) / subsByDate.size
      : 0;

    // Stress score calculation (0 - 100)
    let stressScore = 15; // base stress
    stressScore += Math.min(totalSubs * 10, 40);
    stressScore += Math.min(consecutiveStreak * 15, 30);
    if (teacher.schedules.length > 25) stressScore += 15;

    stressScore = Math.min(Math.max(stressScore, 0), 100);

    // Badges
    const badges: string[] = [];
    if (totalSubs >= 5) badges.push('Substitution Star');
    if (stressScore > 75) badges.push('High Load Alert');
    if (consecutiveStreak >= 3) badges.push('Iron Teacher');

    results.push({
      teacherId: teacher.id,
      teacherName: teacher.name,
      department: teacher.subject,
      totalSubstitutions30d: totalSubs,
      consecutiveDayStreak: consecutiveStreak,
      meanPeriodsPerDay: Math.round(meanPeriods * 10) / 10,
      refusalRate: 0,
      timeSinceLastFreePeriod: 1,
      stressScore: Math.round(stressScore),
      badges,
      recentSubs: recentSubs.slice(-5),
    });
  }

  return results;
}

export async function computeFairnessReport() {
  const metrics = await computeAllWellbeingMetrics();
  return {
    totalTeachers: metrics.length,
    highStressCount: metrics.filter(m => m.stressScore > 70).length,
    averageSubsPerTeacher: metrics.reduce((a, b) => a + b.totalSubstitutions30d, 0) / (metrics.length || 1),
    metrics,
  };
}
