export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { mergeLists, readList } from '@/lib/faculty';
import { getTenantSchoolId } from '@/lib/school-helper';
import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/authz';

/**
 * Map a teacher to a grade+subject, or unmap them.
 *
 * Qualification lives on the faculty record (subjects + grades), which is the
 * single source the generator, change-teacher and substitution all read. This
 * edits that record rather than introducing a second mapping table.
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

  const subjects = remove
    ? currentSubjects.filter((s) => s.toLowerCase() !== subjectName.toLowerCase())
    : mergeLists(currentSubjects, [subjectName]);

  // Removing a subject never strips grades: the teacher may still take other
  // subjects for those grades.
  const grades = remove || !grade ? currentGrades : mergeLists(currentGrades, [grade]);

  if (!remove && subjects.length === 0) {
    return NextResponse.json({ error: 'A teacher must keep at least one subject.' }, { status: 400 });
  }

  const updated = await db.teacher.update({
    where: { id: teacherId },
    data: {
      subject: subjects[0] ?? teacher.subject,
      subjects: JSON.stringify(subjects),
      grades: JSON.stringify(grades),
    },
  });

  return NextResponse.json({
    success: true,
    message: remove
      ? `${teacher.name} is no longer mapped to ${subjectName}.`
      : `${teacher.name} can now teach ${subjectName}${grade ? ` for ${grade}` : ''}.`,
    teacher: { id: updated.id, name: updated.name, subjects, grades },
  });
}
