/**
 * Solver input and output. Everything a school decides arrives here as data
 * (week shape, quotas, daily limits, double-period permission, room needs,
 * teacher caps and availability); the solver itself holds no school rules.
 */

export interface SolverClass {
  /** Stable key, e.g. "<grade>|<section>". */
  key: string;
  grade: string;
  section: string;
  /** Teaching periods per working day for this class's grade, in day order. */
  days: { day: string; periods: number }[];
  /** The section's own room, used for lessons without a specialised room need. */
  homeRoomId: string | null;
}

export interface SolverRequirement {
  classKey: string;
  subject: string;
  weeklyPeriods: number;
  /** At most this many periods of the subject per day (the audit's limit). */
  maxPerDay: number;
  /** Two periods of the subject may be adjacent, as a pair only. */
  allowConsecutive: boolean;
  requiredRoomType: string | null;
  /** Placed earlier in the day (soft). */
  core: boolean;
  /** Teachers allowed to teach this class this subject, in preference order. */
  teacherIds: string[];
}

export interface SolverTeacher {
  id: string;
  name: string;
  /** Null caps mean "not set": the teacher cannot be scheduled (rule missing). */
  maxWeekly: number | null;
  maxDaily: number | null;
  maxConsecutive: number | null;
  unavailable: { day: string; period: number }[];
}

export interface SolverRoom {
  id: string;
  type: string;
}

export interface SolverLesson {
  classKey: string;
  day: string;
  period: number;
  subject: string;
  teacherId: string;
  roomId: string | null;
  locked: boolean;
}

export interface SolverInput {
  classes: SolverClass[];
  requirements: SolverRequirement[];
  teachers: SolverTeacher[];
  rooms: SolverRoom[];
  /** Admin-locked lessons: kept exactly as they are. */
  locked: SolverLesson[];
}

export type UnallocatedReason =
  | 'no_qualified_teacher'
  | 'workload_rule_missing'
  | 'teacher_capacity'
  | 'no_room_of_type'
  | 'grade_over_capacity'
  | 'daily_limit_too_low'
  | 'no_feasible_slot';

export interface Unallocated {
  classKey: string;
  subject: string;
  periods: number;
  reason: UnallocatedReason;
  detail: string;
}

export interface SolverResult {
  lessons: SolverLesson[];
  unallocated: Unallocated[];
  /** Soft-constraint score; higher is better. */
  score: number;
  stats: { placed: number; required: number; repairs: number };
}
