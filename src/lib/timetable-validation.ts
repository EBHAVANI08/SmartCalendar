import { db } from '@/lib/db';
import { getDayConfig } from '@/lib/timetable-config';
import { isPeriodWithinDay, periodsForDay, workingDayNames } from '@/lib/timetable-constraints';

/**
 * Validate a school's actual timetable rows.
 *
 * This scans the live `Schedule` collection, which is what every school really
 * runs on - including the ones that never created a version. The pre-existing
 * validate endpoint only looked at Engine A (`TimetableSlot`, `SubjectRequirement`),
 * and those collections are empty for every tenant, so the publish gate that
 * reads its output has never once fired.
 *
 * Nothing here writes to the timetable. It reports.
 */

export type Severity = 'error' | 'warning';

export interface TimetableIssue {
  severity: Severity;
  code: string;
  message: string;
  grade?: string | null;
  section?: string | null;
  day?: string | null;
  period?: number | null;
  subject?: string | null;
  teacherId?: string | null;
  teacherName?: string | null;
}

export interface ScanResult {
  issues: TimetableIssue[];
  scanned: number;
  errors: number;
  warnings: number;
  byCode: Record<string, number>;
}

/**
 * `versionId` scopes the scan:
 *   a string  - that version's rows
 *   null      - unversioned legacy rows only
 *   undefined - every row for the school
 */
export async function scanTimetable(schoolId: string, versionId?: string | null): Promise<ScanResult> {
  const versionScope =
    versionId === undefined
      ? {}
      : versionId === null
        ? { OR: [{ timetableVersionId: null }, { timetableVersionId: { isSet: false } }] }
        : { timetableVersionId: versionId };

  const [rows, config, teachers, subjectConfigs] = await Promise.all([
    db.schedule.findMany({
      where: { schoolId, ...versionScope },
      select: {
        id: true, grade: true, section: true, day: true, period: true,
        subject: true, teacherId: true,
      },
    }),
    getDayConfig(schoolId),
    db.teacher.findMany({ where: { schoolId }, select: { id: true, name: true, role: true, subjects: true, subject: true } }),
    db.gradeSubjectConfig.findMany({ where: { schoolId }, select: { grade: true, subjectName: true, active: true } }).catch(() => []),
  ]);

  const issues: TimetableIssue[] = [];
  const teacherById = new Map(teachers.map((t) => [t.id, t]));
  const workingDays = new Set(workingDayNames(config) as string[]);

  const configuredByGrade = new Map<string, Set<string>>();
  for (const c of subjectConfigs) {
    if (c.active === false) continue;
    const set = configuredByGrade.get(c.grade) ?? new Set<string>();
    set.add(c.subjectName.toLowerCase());
    configuredByGrade.set(c.grade, set);
  }
  const schoolHasSubjectConfig = configuredByGrade.size > 0;

  const teacherSubjects = (t: { subjects?: string | null; subject?: string | null }) => {
    const raw = t.subjects || t.subject || '';
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x).toLowerCase());
    } catch {
      /* legacy single value */
    }
    return raw ? [String(raw).toLowerCase()] : [];
  };

  // Occupancy maps, to find genuine double-bookings by canonical teacher id.
  const teacherSlots = new Map<string, typeof rows>();
  const classSlots = new Map<string, typeof rows>();

  for (const r of rows) {
    const ctx = {
      grade: r.grade, section: r.section, day: r.day, period: r.period, subject: r.subject,
      teacherId: r.teacherId,
      teacherName: r.teacherId ? teacherById.get(r.teacherId)?.name ?? null : null,
    };

    // Day must be a working day for this school.
    if (!workingDays.has(r.day)) {
      issues.push({
        ...ctx, severity: 'error', code: 'NON_TEACHING_DAY',
        message: `${r.day} is not a working day in Day & Period Setup.`,
      });
    } else if (!isPeriodWithinDay(r.day, r.period, config)) {
      issues.push({
        ...ctx, severity: 'error', code: 'PERIOD_OUT_OF_RANGE',
        message: `${r.day} is configured for ${periodsForDay(r.day, config)} period(s); this lesson is at period ${r.period}.`,
      });
    }

    if (r.teacherId) {
      const t = teacherById.get(r.teacherId);
      if (!t) {
        issues.push({
          ...ctx, severity: 'error', code: 'ORPHAN_TEACHER_REFERENCE',
          message: 'This period points at a faculty record that no longer exists in this school.',
        });
      } else {
        if (t.role === 'inactive') {
          issues.push({
            ...ctx, severity: 'error', code: 'TEACHER_INACTIVE',
            message: `${t.name} is deactivated but still assigned to this period.`,
          });
        }
        const subs = teacherSubjects(t);
        if (subs.length && !subs.includes(r.subject.toLowerCase())) {
          issues.push({
            ...ctx, severity: 'warning', code: 'NOT_SUBJECT_QUALIFIED',
            message: `${t.name} is not mapped to ${r.subject}.`,
          });
        }
      }
      const key = `${r.teacherId}|${r.day}|${r.period}`;
      teacherSlots.set(key, [...(teacherSlots.get(key) ?? []), r]);
    } else {
      issues.push({
        ...ctx, severity: 'warning', code: 'UNALLOCATED_PERIOD',
        message: 'No teacher is assigned to this period.',
      });
    }

    // Subject must be configured, once the school configures subjects at all.
    if (schoolHasSubjectConfig) {
      const set = configuredByGrade.get(r.grade);
      if (set && set.size > 0 && !set.has(r.subject.toLowerCase())) {
        issues.push({
          ...ctx, severity: 'warning', code: 'SUBJECT_NOT_CONFIGURED',
          message: `"${r.subject}" is scheduled for ${r.grade} but is not in Subject Management.`,
        });
      }
    }

    const ckey = `${r.grade}|${r.section}|${r.day}|${r.period}`;
    classSlots.set(ckey, [...(classSlots.get(ckey) ?? []), r]);
  }

  // One teacher, one place. Compared by canonical teacher id, never by name.
  for (const [key, group] of teacherSlots) {
    if (group.length < 2) continue;
    const [teacherId, day, period] = key.split('|');
    const where = group.map((g) => `${g.grade} ${g.section}`).join(' and ');
    issues.push({
      severity: 'error', code: 'TEACHER_DOUBLE_BOOKED',
      message: `${teacherById.get(teacherId)?.name ?? 'This teacher'} is assigned to ${group.length} classes in ${day} period ${period}: ${where}.`,
      grade: group[0].grade, section: group[0].section, day, period: Number(period),
      subject: group[0].subject, teacherId, teacherName: teacherById.get(teacherId)?.name ?? null,
    });
  }

  for (const [key, group] of classSlots) {
    if (group.length < 2) continue;
    const [grade, section, day, period] = key.split('|');
    issues.push({
      severity: 'error', code: 'CLASS_DOUBLE_BOOKED',
      message: `${grade} ${section} has ${group.length} lessons in ${day} period ${period}: ${group.map((g) => g.subject).join(', ')}.`,
      grade, section, day, period: Number(period), subject: group[0].subject,
      teacherId: group[0].teacherId, teacherName: group[0].teacherId ? teacherById.get(group[0].teacherId)?.name ?? null : null,
    });
  }

  const byCode: Record<string, number> = {};
  for (const i of issues) byCode[i.code] = (byCode[i.code] ?? 0) + 1;

  return {
    issues,
    scanned: rows.length,
    errors: issues.filter((i) => i.severity === 'error').length,
    warnings: issues.filter((i) => i.severity === 'warning').length,
    byCode,
  };
}

/** Codes a school may acknowledge. Hard constraint violations are never here. */
export const ACKNOWLEDGEABLE_CODES = new Set([
  'NOT_SUBJECT_QUALIFIED',
  'UNALLOCATED_PERIOD',
  'SUBJECT_NOT_CONFIGURED',
]);
