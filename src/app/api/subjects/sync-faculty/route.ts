export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { hasScopedSections, parseSubjectGradeSectionsMap, readList } from '@/lib/faculty';
import { getTenantSchoolId } from '@/lib/school-helper';
import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/authz';
import { canonicalGrade, resolveSubjectName, schoolGradeNames, schoolSubjectNames } from '@/lib/master-data';
import { gradeKey, subjectKey } from '@/lib/name-normalize';
import { NOT_ARCHIVED } from '@/lib/soft-delete';
import { autofixAfterSave } from '@/lib/autofix';

export async function POST(request: Request) {
  const denied = requireCapability(request, 'subject.write');
  if (denied) return denied;

  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }

  const [teachers, schedules, existingConfigs] = await Promise.all([
    db.teacher.findMany({
      where: { schoolId, role: { not: 'inactive' } },
      select: { id: true, name: true, subject: true, subjects: true, grades: true, sections: true },
    }),
    db.schedule.findMany({
      where: { schoolId },
      select: { grade: true, subject: true },
      distinct: ['grade', 'subject'],
    }),
    db.gradeSubjectConfig.findMany({
      where: { schoolId, AND: [NOT_ARCHIVED] },
      select: { grade: true, subjectName: true },
    }),
  ]);

  // Pairs are keyed by normalised grade and subject, and stored under the
  // school's existing spelling, so syncing never creates "grade 1" beside
  // "Grade 1" or "computer science" beside "Computer Science".
  const gradeNames = [...new Set([...(await schoolGradeNames(schoolId)), ...existingConfigs.map((c) => c.grade)])];
  const subjectNames = await schoolSubjectNames(schoolId);
  const pairKey = (grade: string, subject: string) => `${gradeKey(grade)}::${subjectKey(subject)}`;
  const existingConfigSet = new Set(existingConfigs.map((c) => pairKey(c.grade, c.subjectName)));

  const pairMap = new Map<string, { grade: string; subject: string }>();
  const conflicts = new Map<string, string>();
  let teachersWithoutGrades = 0;

  const addPair = (rawGrade: string, rawSubject: string) => {
    const cleanGrade = rawGrade.trim();
    const cleanSubject = rawSubject.trim();
    if (!cleanGrade || !cleanSubject) return;
    const resolution = resolveSubjectName(cleanSubject, subjectNames);
    if (resolution.kind === 'conflict') {
      conflicts.set(resolution.name, resolution.existing);
      return;
    }
    if (resolution.kind === 'new') subjectNames.push(resolution.name);
    const grade = canonicalGrade(cleanGrade, gradeNames);
    if (!gradeNames.includes(grade)) gradeNames.push(grade);
    const key = pairKey(grade, resolution.name);
    if (!pairMap.has(key)) pairMap.set(key, { grade, subject: resolution.name });
  };

  // 1. From teachers. A teacher with no grade mapping contributes nothing:
  // guessing a grade would invent curriculum.
  for (const t of teachers) {
    const subs = readList(t.subjects ?? t.subject);
    const grs = readList(t.grades);
    // Only real grade assignments; the parser's example grade is not one.
    const mapping = hasScopedSections(t.sections) ? parseSubjectGradeSectionsMap(t.sections, subs, grs) : {};
    let contributed = false;
    for (const sub of subs) {
      const subjGrades = mapping[sub.trim()]?.grades || [];
      const effectiveGrades = subjGrades.length > 0 ? subjGrades : grs;
      for (const g of effectiveGrades) { addPair(g, sub); contributed = true; }
    }
    if (subs.length > 0 && !contributed) teachersWithoutGrades++;
  }

  // 2. From schedule
  for (const s of schedules) {
    if (s.grade && s.subject) addPair(s.grade, s.subject);
  }

  let createdConfigsCount = 0;

  for (const [key, { grade, subject }] of pairMap.entries()) {
    // Ensure subject master exists
    const code = subject.toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 24);
    await db.subjectMaster
      .upsert({
        where: { schoolId_name: { schoolId, name: subject } },
        update: { active: true, archivedAt: null },
        create: { schoolId, name: subject, code, category: 'academic' },
      })
      .catch(() => null);

    // New mappings start with weeklyPeriods 0 ("not set"): the quota is the
    // school's decision and is entered in the Subjects tab.
    if (!existingConfigSet.has(key)) {
      const created = await db.gradeSubjectConfig.create({
        data: {
          source: 'sync',
          schoolId,
          grade,
          subjectName: subject,
          weeklyPeriods: 0,
          maxPeriodsPerDay: 1,
          allowConsecutive: false,
          priority: 'Normal',
          requiredRoomType: null,
          active: true,
        },
      }).catch(() => null);
      existingConfigSet.add(key);
      if (created) createdConfigsCount++;
    }
  }

  return NextResponse.json({
    success: true,
    autofix: await autofixAfterSave(schoolId, 'save:subjects', request.headers.get('x-user-email')),
    createdConfigsCount,
    totalDiscoveredPairs: pairMap.size,
    teachersWithoutGrades,
    nameConflicts: [...conflicts.entries()].map(([name, existing]) => ({ name, existing })),
    message: (createdConfigsCount > 0
      ? `Synced ${createdConfigsCount} new subject mapping(s) from Faculty Directory. Set their weekly periods in the Subjects tab.`
      : `All subjects and grades from Faculty Directory are already synchronized.`)
      + (teachersWithoutGrades > 0 ? ` ${teachersWithoutGrades} teacher(s) have no grade mapping and were skipped.` : '')
      + (conflicts.size > 0 ? ` ${conflicts.size} subject name(s) look like existing subjects and were not added.` : ''),
  });
}
