import { db } from '@/lib/db';
import { parseSubjectGradeSectionsMap, readList } from '@/lib/faculty';
import { gradeKey, sameSubject } from '@/lib/name-normalize';

/**
 * "Does this subject have a qualified teacher in this grade?"
 *
 * One calculation for every screen: the Subjects tab ("Fully Staffed"), the
 * setup checklist and diagnostics all read it from here, so they cannot
 * disagree.
 */

export interface StaffingTeacher {
  id: string;
  name: string;
  subject?: string | null;
  subjects?: string | null;
  grades?: string | null;
  sections?: string | null;
}

/**
 * True when the teacher teaches `subjectName` in `grade` (any grade when null).
 * Subject names match on normalised keys; a subject-specific grade mapping
 * wins over the teacher's general grades; no grades at all means every grade.
 */
export function teacherQualifiedFor(teacher: StaffingTeacher, subjectName: string, grade: string | null): boolean {
  const subjects = readList(teacher.subjects ?? teacher.subject);
  const grades = readList(teacher.grades);
  const matched = subjects.find((subject) => sameSubject(subject, subjectName));
  if (!matched) return false;
  if (!grade) return true;

  const target = gradeKey(grade);
  const mapping = parseSubjectGradeSectionsMap(teacher.sections, subjects, grades);
  const subjectGrades = mapping[matched]?.grades || [];
  if (subjectGrades.length > 0) return subjectGrades.some((g) => gradeKey(g) === target);
  if (grades.length === 0) return true;
  return grades.some((g) => gradeKey(g) === target);
}

export interface StaffingRow {
  grade: string;
  subjectName: string;
  weeklyPeriods: number;
  teachers: { id: string; name: string }[];
}

/**
 * Every required (grade, subject) pair, with its qualified active teachers.
 * Required means an active GradeSubjectConfig with weeklyPeriods > 0.
 */
export async function staffingReport(schoolId: string, grade?: string | null): Promise<{ required: StaffingRow[]; unstaffed: StaffingRow[] }> {
  const [configs, teachers] = await Promise.all([
    db.gradeSubjectConfig.findMany({
      where: { schoolId, active: true, weeklyPeriods: { gt: 0 } },
      select: { grade: true, subjectName: true, weeklyPeriods: true },
      orderBy: [{ grade: 'asc' }, { subjectName: 'asc' }],
    }),
    db.teacher.findMany({
      where: { schoolId, role: { not: 'inactive' } },
      select: { id: true, name: true, subject: true, subjects: true, grades: true, sections: true },
    }),
  ]);
  const target = grade ? gradeKey(grade) : null;
  const required = configs
    .filter((config) => !target || gradeKey(config.grade) === target)
    .map((config) => ({
      ...config,
      teachers: teachers
        .filter((teacher) => teacherQualifiedFor(teacher, config.subjectName, config.grade))
        .map((teacher) => ({ id: teacher.id, name: teacher.name })),
    }));
  return { required, unstaffed: required.filter((row) => row.teachers.length === 0) };
}
