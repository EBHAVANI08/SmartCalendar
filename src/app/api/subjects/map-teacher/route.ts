export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { mergeLists, parseSubjectGradeSectionsMap, readList, serializeSubjectGradeSectionsMap } from '@/lib/faculty';
import { getTenantSchoolId } from '@/lib/school-helper';
import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/authz';

/**
 * Map a teacher to a grade+subject, or unmap them.
 *
 * Qualification lives on the faculty record (subjects + grades + sections), which is the
 * single source the generator, change-teacher and substitution all read.
 */
export async function POST(request: Request) {
  const denied = requireCapability(request, 'subject.write');
  if (denied) return denied;

  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const teacherId = String(body.teacherId ?? '');
  const subjectName = String(body.subjectName ?? '').trim();
  const grade = String(body.grade ?? '').trim();
  const remove = body.remove === true;

  if (!teacherId || !subjectName) {
    return NextResponse.json({ error: 'teacherId and subjectName are required.' }, { status: 400 });
  }

  const teacher = await db.teacher.findFirst({ where: { id: teacherId, schoolId } });
  if (!teacher) {
    return NextResponse.json({ error: 'Teacher not found in this school.' }, { status: 404 });
  }

  const currentSubjects = readList(teacher.subjects ?? teacher.subject);
  const currentGrades = readList(teacher.grades);
  const mapping = parseSubjectGradeSectionsMap(teacher.sections, currentSubjects, currentGrades);

  let subjects = currentSubjects;

  if (remove) {
    // If grade is specified and mapping has grades for this subject:
    if (grade && mapping[subjectName] && mapping[subjectName].grades.length > 1) {
      // Just remove that grade from this subject
      mapping[subjectName].grades = mapping[subjectName].grades.filter(
        (g) => g.toLowerCase() !== grade.toLowerCase()
      );
      delete mapping[subjectName].sections[grade];
    } else {
      // Remove the subject entirely
      subjects = currentSubjects.filter((s) => s.toLowerCase() !== subjectName.toLowerCase());
      delete mapping[subjectName];
      for (const k of Object.keys(mapping)) {
        if (k.toLowerCase() === subjectName.toLowerCase()) {
          delete mapping[k];
        }
      }
    }
  } else {
    subjects = mergeLists(currentSubjects, [subjectName]);
    if (!mapping[subjectName]) {
      mapping[subjectName] = { grades: [], sections: {} };
    }
    if (grade && !mapping[subjectName].grades.some((g) => g.toLowerCase() === grade.toLowerCase())) {
      mapping[subjectName].grades.push(grade);
    }
    if (grade && (!mapping[subjectName].sections[grade] || mapping[subjectName].sections[grade].length === 0)) {
      mapping[subjectName].sections[grade] = ['A'];
    }
  }

  // Derive updated grades across all subjects in the mapping
  const allMappedGrades: string[] = [];
  for (const data of Object.values(mapping)) {
    for (const g of data.grades) {
      if (!allMappedGrades.includes(g)) allMappedGrades.push(g);
    }
  }
  const grades = allMappedGrades.length > 0 ? allMappedGrades : (remove || !grade ? currentGrades : mergeLists(currentGrades, [grade]));

  if (!remove && subjects.length === 0) {
    return NextResponse.json({ error: 'A teacher must keep at least one subject.' }, { status: 400 });
  }

  const updatedSections = serializeSubjectGradeSectionsMap(mapping);

  const updated = await db.teacher.update({
    where: { id: teacherId },
    data: {
      subject: subjects[0] ?? teacher.subject,
      subjects: JSON.stringify(subjects),
      grades: JSON.stringify(grades),
      sections: JSON.stringify(updatedSections),
    },
  });

  // Also ensure GradeSubjectConfig has this subject if mapped
  if (!remove && grade) {
    const existingConfig = await db.gradeSubjectConfig.findFirst({
      where: { schoolId, grade, subjectName },
    });
    if (!existingConfig) {
      await db.gradeSubjectConfig.create({
        data: {
          schoolId,
          grade,
          subjectName,
          weeklyPeriods: 4,
          maxPeriodsPerDay: 2,
          allowConsecutive: false,
          priority: 'Normal',
          requiredRoomType: null,
          active: true,
        },
      }).catch(() => null);
    }
  }

  return NextResponse.json({
    success: true,
    message: remove
      ? `${teacher.name} is no longer mapped to ${subjectName}${grade ? ` for ${grade}` : ''}.`
      : `${teacher.name} is now mapped to teach ${subjectName}${grade ? ` for ${grade}` : ''}.`,
    teacher: { id: updated.id, name: updated.name, subjects, grades },
  });
}
