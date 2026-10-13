import { db } from '@/lib/db';
import { compareSubjects, gradeKey, subjectKey } from '@/lib/name-normalize';
import { NOT_ARCHIVED } from '@/lib/soft-delete';

/**
 * One canonical spelling per grade and per subject within a school.
 *
 * Writers call these before creating or renaming, so "grade 1" is stored as the
 * existing "Grade 1" and "computer science" as the existing "Computer Science",
 * instead of becoming a second record.
 */

export async function schoolGradeNames(schoolId: string): Promise<string[]> {
  const [sections, configs] = await Promise.all([
    db.classSection.findMany({ where: { schoolId, AND: [NOT_ARCHIVED] }, select: { grade: true }, distinct: ['grade'] }),
    db.gradeSubjectConfig.findMany({ where: { schoolId, AND: [NOT_ARCHIVED] }, select: { grade: true }, distinct: ['grade'] }),
  ]);
  return [...new Set([...sections, ...configs].map((row) => row.grade.trim()).filter(Boolean))];
}

export async function schoolSubjectNames(schoolId: string): Promise<string[]> {
  const [masters, configs] = await Promise.all([
    db.subjectMaster.findMany({ where: { schoolId, AND: [NOT_ARCHIVED] }, select: { name: true } }),
    db.gradeSubjectConfig.findMany({ where: { schoolId, AND: [NOT_ARCHIVED] }, select: { subjectName: true }, distinct: ['subjectName'] }),
  ]);
  return [...new Set([...masters.map((row) => row.name), ...configs.map((row) => row.subjectName)].map((name) => name.trim()).filter(Boolean))];
}

/** The existing spelling of this grade, or the input trimmed when it is new. */
export function canonicalGrade(input: string, existing: string[]): string {
  const key = gradeKey(input);
  const match = existing.find((name) => gradeKey(name) === key);
  return match ?? input.trim();
}

export type SubjectResolution =
  | { kind: 'new'; name: string }
  | { kind: 'existing'; name: string }
  /** Same subject under a different name (abbreviation vs long form); needs a human decision. */
  | { kind: 'conflict'; name: string; existing: string };

/**
 * Exact matches (case, spacing, punctuation, "&"/"and") resolve to the existing
 * spelling. An abbreviation/long-form match is reported as a conflict instead of
 * being merged silently. Merely similar names ("Art" / "Art & Craft") are new.
 */
export function resolveSubjectName(input: string, existing: string[]): SubjectResolution {
  const name = input.trim();
  const key = subjectKey(name);
  const exact = existing.find((candidate) => subjectKey(candidate) === key);
  if (exact) return { kind: 'existing', name: exact };
  const alias = existing.find((candidate) => compareSubjects(name, candidate) === 'alias');
  if (alias) return { kind: 'conflict', name, existing: alias };
  return { kind: 'new', name };
}

export function subjectConflictMessage(resolution: { name: string; existing: string }): string {
  return `"${resolution.name}" looks like the existing subject "${resolution.existing}". Use "${resolution.existing}", or rename one of them so they are clearly different.`;
}
