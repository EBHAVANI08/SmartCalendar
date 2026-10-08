/**
 * Auto-fix engine types.
 *
 * The engine reads one school's setup into a Snapshot, runs rules over it in
 * memory and produces Fixes. A Fix is a list of field patches (before/after)
 * on concrete rows, so it can be written to the database, logged and undone
 * exactly. Nothing here is specific to any school: every rule works from the
 * snapshot's own data.
 */

export type ModelName =
  | 'gradeSubjectConfig'
  | 'subjectMaster'
  | 'classSection'
  | 'teacher'
  | 'schedule'
  | 'teacherQualification'
  | 'schoolDayPeriodConfig';

/** One row's fields before and after a fix. Only the listed fields change. */
export interface Change {
  model: ModelName;
  id: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

export type RuleId =
  | 'auto_created_rows'
  | 'duplicate_grade'
  | 'duplicate_subject'
  | 'display_name'
  | 'daily_cap_too_low'
  | 'break_zero_minutes'
  | 'break_out_of_range'
  | 'break_same_period'
  | 'over_capacity';

export interface Fix {
  rule: RuleId;
  /** 1 = silent (logged, undoable); 2 = applied and shown to the admin with Undo. */
  tier: 1 | 2;
  /** e.g. "grade:Grade 1", "subject:Information Technology", "bell:school". */
  entity: string;
  summary: string;
  /** Human-readable values for the log and the UI. */
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  changes: Change[];
  /** Identifies this issue on this data; an undone fix with the same key is not re-applied. */
  suppressKey: string;
  /** Reported instead when this fix is suppressed (an admin undid it before). */
  ifSuppressed?: Unfixable;
}

/** A problem the engine found but must not or cannot fix automatically. */
export interface Unfixable {
  rule: RuleId | 'bell_times' | 'day_config_missing';
  entity: string;
  message: string;
  /** True when generation cannot run for `grade` (or for any grade when grade is absent). */
  blocking: boolean;
  grade?: string;
}

export interface SubjectConfigRow {
  id: string;
  grade: string;
  subjectName: string;
  weeklyPeriods: number;
  maxPeriodsPerDay: number;
  priority: string;
  allowConsecutive: boolean;
  active: boolean;
  archivedAt: string | null;
  source: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubjectMasterRow {
  id: string;
  name: string;
  code: string;
  active: boolean;
  archivedAt: string | null;
}

export interface ClassSectionRow {
  id: string;
  grade: string;
  section: string;
  code: string;
  academicYearId: string;
  active: boolean;
  archivedAt: string | null;
}

export interface TeacherRow {
  id: string;
  subject: string;
  subjects: string | null;
  grades: string;
  sections: string | null;
}

/** Timetable rows the engine may rename: only draft/review versions. */
export interface EditableScheduleRow {
  id: string;
  timetableVersionId: string;
  grade: string;
  section: string;
  day: string;
  period: number;
  subject: string;
}

export interface TeacherQualificationRow {
  id: string;
  teacherId: string;
  subjectId: string;
}

/** The stored SchoolDayPeriodConfig row, gradeConfigs kept as its JSON string. */
export interface DayConfigRow {
  id: string;
  workingDays: number;
  perDayPeriods: string;
  startTime: string;
  endTime: string;
  breakEnabled: boolean | null;
  breakAfter: number;
  breakMinutes: number;
  lunchEnabled: boolean | null;
  lunchAfter: number;
  lunchMinutes: number;
  gradeConfigs: string | null;
}

export interface Snapshot {
  schoolId: string;
  dayConfig: DayConfigRow | null;
  subjectConfigs: SubjectConfigRow[];
  subjectMasters: SubjectMasterRow[];
  classSections: ClassSectionRow[];
  teachers: TeacherRow[];
  editableSchedules: EditableScheduleRow[];
  teacherQualifications: TeacherQualificationRow[];
  /**
   * Grade names used by rows the engine must never change (published,
   * superseded and unversioned timetables). Merging such a grade away would
   * detach the live timetable from its class, so it is reported instead.
   */
  frozenGrades: string[];
  /** suppressKeys of fixes an admin undid. */
  suppressed: string[];
}

export interface EngineResult {
  fixes: Fix[];
  unfixable: Unfixable[];
  /** Fixes the engine would have made but an admin had undone before. */
  suppressed: Fix[];
  /** The snapshot with every fix applied. */
  after: Snapshot;
}
