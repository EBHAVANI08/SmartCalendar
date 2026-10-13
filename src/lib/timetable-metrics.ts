import { gradeKey, subjectKey } from '@/lib/name-normalize';
import { teacherRequirementOf } from '@/lib/teacher-requirement';
import type { AuditInput } from '@/lib/timetable-audit';

/**
 * Plain quality figures for one timetable, for comparing two of them side by
 * side (e.g. the published version and a simulation). Pure; the rules come
 * from the same AuditInput the validator reads.
 */
export interface TimetableMetrics {
  lessons: number;
  /** Class + subject + day groups with the subject more than once that day. */
  repeatCases: number;
  /** ...of which three or more times. */
  repeatCases3: number;
  /** Most times one subject appears in one class on one day. */
  maxRepeat: number;
  teachersOverWeekly: number;
  teachersOverDaily: number;
  teachersOverConsecutive: number;
  /** Teachers over any of their caps; teachers without any cap are counted separately. */
  teachersOverAnyCap: number;
  teachersWithoutCaps: number;
  /** Longest run of back-to-back periods any teacher has. */
  maxConsecutive: number;
  /** Lessons of subjects that require a teacher but have none. */
  missingRequiredTeacher: number;
  classesCovered: number;
  classesTotal: number;
  /** Class + subject pairs whose weekly count equals the quota exactly, of all quota pairs. */
  quotasExact: number;
  quotasTotal: number;
}

function longestRun(periods: number[]): number {
  const sorted = [...new Set(periods)].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < sorted.length; i++) {
    run = i > 0 && sorted[i] === sorted[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

export function timetableMetrics(input: AuditInput): TimetableMetrics {
  const count = <K>(map: Map<K, number>, key: K) => map.set(key, (map.get(key) ?? 0) + 1);
  const ruleFor = (grade: string, subject: string) => {
    const matching = input.subjectRules.filter((r) => r.active && gradeKey(r.grade) === gradeKey(grade) && subjectKey(r.subjectName) === subjectKey(subject));
    return matching.find((r) => r.grade === grade) ?? matching[0];
  };

  const perDay = new Map<string, number>();
  for (const s of input.slots) count(perDay, `${s.grade}|${s.section}|${subjectKey(s.subject)}|${s.day}`);
  const repeats = [...perDay.values()];

  const teacherById = new Map(input.teachers.map((t) => [t.id, t]));
  const byTeacher = new Map<string, typeof input.slots>();
  for (const s of input.slots.filter((x) => x.teacherId)) byTeacher.set(s.teacherId!, [...(byTeacher.get(s.teacherId!) ?? []), s]);
  let overWeekly = 0, overDaily = 0, overConsecutive = 0, overAny = 0, withoutCaps = 0, maxConsecutive = 0;
  for (const [id, rows] of byTeacher) {
    const days = new Map<string, number[]>();
    for (const r of rows) days.set(r.day, [...(days.get(r.day) ?? []), r.period]);
    const busiest = Math.max(...[...days.values()].map((p) => p.length));
    const run = Math.max(...[...days.values()].map(longestRun));
    maxConsecutive = Math.max(maxConsecutive, run);
    const t = teacherById.get(id);
    if (!t || t.limitSource === 'missing') { withoutCaps++; continue; }
    const w = t.maxWeekly !== null && rows.length > t.maxWeekly;
    const d = t.maxDaily !== null && busiest > t.maxDaily;
    const c = t.maxConsecutive !== null && run > t.maxConsecutive;
    overWeekly += Number(w); overDaily += Number(d); overConsecutive += Number(c); overAny += Number(w || d || c);
  }

  const missingRequiredTeacher = input.slots.filter((s) => !s.teacherId && teacherRequirementOf(ruleFor(s.grade, s.subject)?.teacherRequirement) === 'required').length;

  const covered = new Set(input.slots.map((s) => `${gradeKey(s.grade)}|${s.section}`));
  const classesCovered = input.sections.filter((c) => covered.has(`${gradeKey(c.grade)}|${c.section}`)).length;

  const weekly = new Map<string, number>();
  for (const s of input.slots) count(weekly, `${gradeKey(s.grade)}|${s.section}|${subjectKey(s.subject)}`);
  let quotasExact = 0, quotasTotal = 0;
  for (const section of input.sections) {
    const seen = new Set<string>();
    for (const rule of input.subjectRules.filter((r) => r.active && r.weeklyPeriods > 0 && gradeKey(r.grade) === gradeKey(section.grade))) {
      const key = subjectKey(rule.subjectName);
      if (seen.has(key)) continue;
      seen.add(key);
      const chosen = ruleFor(section.grade, rule.subjectName)!;
      quotasTotal++;
      if ((weekly.get(`${gradeKey(section.grade)}|${section.section}|${key}`) ?? 0) === chosen.weeklyPeriods) quotasExact++;
    }
  }

  return {
    lessons: input.slots.length,
    repeatCases: repeats.filter((n) => n > 1).length,
    repeatCases3: repeats.filter((n) => n > 2).length,
    maxRepeat: repeats.length ? Math.max(...repeats) : 0,
    teachersOverWeekly: overWeekly,
    teachersOverDaily: overDaily,
    teachersOverConsecutive: overConsecutive,
    teachersOverAnyCap: overAny,
    teachersWithoutCaps: withoutCaps,
    maxConsecutive,
    missingRequiredTeacher,
    classesCovered,
    classesTotal: input.sections.length,
    quotasExact,
    quotasTotal,
  };
}
