import { db } from '@/lib/db';
import { getDayConfig } from '@/lib/timetable-config';
import { buildTeachingGrid, workingDayNames, type DayPeriodConfig } from '@/lib/timetable-constraints';

/**
 * Does each grade's weekly subject demand fit its week?
 *
 * Demand is the sum of weeklyPeriods over the grade's active GradeSubjectConfig
 * rows; supply is the number of teaching slots in the grade's week (school day
 * config with the grade's override applied). A grade whose demand exceeds its
 * slots cannot be timetabled, so this is a blocking error for setup and for
 * generation.
 */

export interface CapacitySubject {
  subjectName: string;
  weeklyPeriods: number;
  maxPeriodsPerDay: number;
}

export interface SubjectCapIssue {
  subjectName: string;
  weeklyPeriods: number;
  maxPeriodsPerDay: number;
  workingDays: number;
  /** Most periods the per-day cap allows in this week. */
  maxPlaceable: number;
}

export interface GradeCapacity {
  grade: string;
  /** Σ weeklyPeriods of active subjects. */
  demand: number;
  /** Teaching slots in this grade's week. */
  slots: number;
  /** demand − slots when positive. */
  overBy: number;
  /** Subjects whose weekly quota is above maxPeriodsPerDay × working days. */
  subjectIssues: SubjectCapIssue[];
  /** The school has not saved a day & period setup; nothing can be checked or generated. */
  dayConfigMissing?: boolean;
  /** True when the grade can, on these numbers, be fully timetabled. */
  ok: boolean;
  subjects: CapacitySubject[];
}

/** Pure evaluation for one grade; no database access. */
export function evaluateGradeCapacity(grade: string, subjects: CapacitySubject[], week: DayPeriodConfig): GradeCapacity {
  const counted = subjects.filter((subject) => subject.weeklyPeriods > 0);
  const demand = counted.reduce((sum, subject) => sum + subject.weeklyPeriods, 0);
  const slots = buildTeachingGrid(week).length;
  const workingDays = workingDayNames(week).length;
  const subjectIssues = counted
    .filter((subject) => subject.weeklyPeriods > subject.maxPeriodsPerDay * workingDays)
    .map((subject) => ({
      subjectName: subject.subjectName,
      weeklyPeriods: subject.weeklyPeriods,
      maxPeriodsPerDay: subject.maxPeriodsPerDay,
      workingDays,
      maxPlaceable: subject.maxPeriodsPerDay * workingDays,
    }));
  const overBy = Math.max(0, demand - slots);
  return { grade, demand, slots, overBy, subjectIssues, ok: overBy === 0 && subjectIssues.length === 0, subjects: counted };
}

/** Capacity of every grade that has active subject configuration, for one school. */
export async function gradeCapacityReport(schoolId: string, onlyGrade?: string): Promise<GradeCapacity[]> {
  const configs = await db.gradeSubjectConfig.findMany({
    where: { schoolId, active: true, ...(onlyGrade ? { grade: onlyGrade } : {}) },
    select: { grade: true, subjectName: true, weeklyPeriods: true, maxPeriodsPerDay: true },
    orderBy: [{ grade: 'asc' }, { subjectName: 'asc' }],
  });
  const byGrade = new Map<string, CapacitySubject[]>();
  for (const config of configs) {
    if (!byGrade.has(config.grade)) byGrade.set(config.grade, []);
    byGrade.get(config.grade)!.push(config);
  }
  const report: GradeCapacity[] = [];
  for (const [grade, subjects] of byGrade) {
    const week = await getDayConfig(schoolId, grade);
    const capacity = evaluateGradeCapacity(grade, subjects, week);
    // Without a saved week there is nothing real to compare against.
    report.push(week.configured ? capacity : { ...capacity, dayConfigMissing: true, ok: false });
  }
  return report.sort((a, b) => a.grade.localeCompare(b.grade, undefined, { numeric: true }));
}

/** One-line description of why a grade fails, for checklists and errors. */
export function describeCapacityProblem(capacity: GradeCapacity): string {
  const parts: string[] = [];
  if (capacity.dayConfigMissing) return `${capacity.grade}: the day & period setup has not been saved yet`;
  if (capacity.overBy > 0) {
    parts.push(`${capacity.grade} needs ${capacity.demand} periods/week but its week has ${capacity.slots} (${capacity.overBy} over)`);
  }
  for (const issue of capacity.subjectIssues) {
    parts.push(`${capacity.grade} ${issue.subjectName}: ${issue.weeklyPeriods}/week but at most ${issue.maxPeriodsPerDay}/day × ${issue.workingDays} days = ${issue.maxPlaceable}`);
  }
  return parts.join('; ');
}
