import { db } from '@/lib/db';
import { readList } from '@/lib/faculty';

/**
 * How safely `Teacher.subjects` / `Teacher.grades` could become
 * `TeacherQualification` rows.
 *
 * The naive conversion is a Cartesian product, and it is wrong. A teacher with
 * subjects [Physics, Mathematics] and grades [8, 9, 10] does **not** necessarily
 * teach all six combinations — the flat lists never recorded which subject goes
 * with which grade.
 *
 * So two independent sources are compared:
 *
 *   DECLARED  the flat lists on the Teacher record
 *   OBSERVED  the subject/grade pairs that teacher is actually scheduled to teach
 *
 * Observation is the stronger signal. A teacher who has taught Physics to Grade 9
 * all year demonstrably qualifies for it; a Cartesian guess does not.
 *
 * READ-ONLY. This writes nothing.
 */

export type QualClass =
  /** One subject, or one grade. The pairing is unambiguous. */
  | 'DETERMINISTIC'
  /** Several subjects AND several grades, but the timetable resolves the pairs. */
  | 'EVIDENCE_BACKED'
  /** Several subjects AND several grades, with no timetable evidence. */
  | 'AMBIGUOUS'
  /** Declares nothing usable. */
  | 'INSUFFICIENT';

export interface TeacherQualPlan {
  teacherId: string;
  teacherName: string;
  classification: QualClass;
  declaredSubjects: string[];
  declaredGrades: string[];
  /** Pairs the timetable shows this teacher actually teaching. */
  observedPairs: { subject: string; grade: string; periods: number }[];
  /** What would be written, if anything. Empty for AMBIGUOUS and INSUFFICIENT. */
  proposed: { subject: string; grades: string[] }[];
  /** Subjects they are scheduled to teach but are not mapped to. */
  undeclaredSubjects: string[];
  reason: string;
}

export interface QualReadiness {
  total: number;
  counts: Record<QualClass, number>;
  proposedRows: number;
  /** Faculty whose timetable shows subjects their record never declared. */
  withUndeclaredSubjects: number;
  plans: TeacherQualPlan[];
}

const norm = (s: string) => s.trim().toLowerCase();

export async function scanQualificationReadiness(schoolId: string): Promise<QualReadiness> {
  const [teachers, schedules] = await Promise.all([
    db.teacher.findMany({
      where: { schoolId },
      select: { id: true, name: true, subject: true, subjects: true, grades: true, role: true },
    }),
    db.schedule.findMany({
      where: { schoolId, teacherId: { not: null } },
      select: { teacherId: true, subject: true, grade: true },
    }),
  ]);

  // What each teacher is actually scheduled to teach.
  const observed = new Map<string, Map<string, number>>(); // teacherId -> "subject|grade" -> periods
  for (const row of schedules) {
    if (!row.teacherId) continue;
    const inner = observed.get(row.teacherId) ?? new Map<string, number>();
    const key = `${row.subject}|${row.grade}`;
    inner.set(key, (inner.get(key) ?? 0) + 1);
    observed.set(row.teacherId, inner);
  }

  const plans: TeacherQualPlan[] = [];

  for (const t of teachers) {
    const declaredSubjects = readList(t.subjects).length
      ? readList(t.subjects)
      : t.subject
        ? [t.subject]
        : [];
    const declaredGrades = readList(t.grades);

    const observedPairs = [...(observed.get(t.id) ?? new Map()).entries()]
      .map(([key, periods]) => {
        const [subject, grade] = key.split('|');
        return { subject, grade, periods: periods as number };
      })
      .sort((a, b) => b.periods - a.periods);

    const declaredSet = new Set(declaredSubjects.map(norm));
    const undeclaredSubjects = [
      ...new Set(observedPairs.filter((p) => !declaredSet.has(norm(p.subject))).map((p) => p.subject)),
    ];

    let classification: QualClass;
    let proposed: { subject: string; grades: string[] }[] = [];
    let reason: string;

    if (declaredSubjects.length === 0 || declaredGrades.length === 0) {
      classification = 'INSUFFICIENT';
      reason = declaredSubjects.length === 0
        ? 'No subject recorded, so no qualification can be derived.'
        : 'No grade recorded, so eligibility cannot be derived.';
    } else if (declaredSubjects.length === 1) {
      classification = 'DETERMINISTIC';
      proposed = [{ subject: declaredSubjects[0], grades: declaredGrades }];
      reason = `One subject across ${declaredGrades.length} grade(s) — the pairing is unambiguous.`;
    } else if (declaredGrades.length === 1) {
      classification = 'DETERMINISTIC';
      proposed = declaredSubjects.map((s) => ({ subject: s, grades: declaredGrades }));
      reason = `${declaredSubjects.length} subjects in a single grade — the pairing is unambiguous.`;
    } else {
      // Several subjects AND several grades. Only the timetable can resolve it.
      const bySubject = new Map<string, Set<string>>();
      for (const p of observedPairs) {
        if (!declaredSet.has(norm(p.subject))) continue;
        const set = bySubject.get(p.subject) ?? new Set<string>();
        set.add(p.grade);
        bySubject.set(p.subject, set);
      }

      if (bySubject.size === declaredSubjects.length) {
        classification = 'EVIDENCE_BACKED';
        proposed = [...bySubject.entries()].map(([subject, grades]) => ({ subject, grades: [...grades] }));
        reason =
          `${declaredSubjects.length} subjects across ${declaredGrades.length} grades, but the timetable shows exactly ` +
          `which grades each subject is taught to — ${proposed.map((p) => `${p.subject}: ${p.grades.length}`).join(', ')}. ` +
          'Derived from evidence, not from a Cartesian guess.';
      } else {
        classification = 'AMBIGUOUS';
        reason =
          `${declaredSubjects.length} subjects x ${declaredGrades.length} grades = ` +
          `${declaredSubjects.length * declaredGrades.length} possible pairs, and the timetable resolves ` +
          `${bySubject.size} of ${declaredSubjects.length}. Expanding the rest would assert eligibility nobody stated.`;
      }
    }

    plans.push({
      teacherId: t.id,
      teacherName: t.name,
      classification,
      declaredSubjects,
      declaredGrades,
      observedPairs,
      proposed,
      undeclaredSubjects,
      reason,
    });
  }

  const counts: Record<QualClass, number> = {
    DETERMINISTIC: 0, EVIDENCE_BACKED: 0, AMBIGUOUS: 0, INSUFFICIENT: 0,
  };
  for (const p of plans) counts[p.classification]++;

  return {
    total: teachers.length,
    counts,
    proposedRows: plans.reduce((n, p) => n + p.proposed.length, 0),
    withUndeclaredSubjects: plans.filter((p) => p.undeclaredSubjects.length > 0).length,
    plans,
  };
}
