export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { readList } from '@/lib/faculty';
import { getTenantSchoolId } from '@/lib/school-helper';
import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/authz';
import { isKnownRoomType } from '@/lib/room-types';

const PRIORITIES = ['Core', 'High', 'Normal', 'Low'];

/**
 * Grade-wise subject management, scoped to one school.
 *
 * Subjects are tenant-specific: there is no global hardcoded list, so two
 * schools can run entirely different curricula. GradeSubjectConfig carries the
 * scheduling rules the generator reads - weekly periods, max per day, whether
 * consecutive periods are allowed, and priority.
 */
export async function GET(request: Request) {
  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }

  const grade = new URL(request.url).searchParams.get('grade');

  const [catalogue, configs, teachers] = await Promise.all([
    db.subjectMaster.findMany({ where: { schoolId }, orderBy: { name: 'asc' } }),
    db.gradeSubjectConfig.findMany({
      where: { schoolId, ...(grade ? { grade } : {}) },
      orderBy: [{ grade: 'asc' }, { subjectName: 'asc' }],
    }),
    db.teacher.findMany({
      where: { schoolId, role: { not: 'inactive' } },
      select: { id: true, name: true, subject: true, subjects: true, grades: true },
    }),
  ]);

  // Active teachers actually mapped to each subject, and to that grade.
  const mappedTeachers = (subjectName: string, forGrade: string) =>
    teachers
      .filter((t) =>
        readList(t.subjects ?? t.subject).some((s) => s.toLowerCase() === subjectName.toLowerCase())
      )
      .filter((t) => {
        const grades = readList(t.grades);
        return !forGrade || grades.length === 0 || grades.includes(forGrade);
      })
      .map((t) => ({ id: t.id, name: t.name }));

  return NextResponse.json({
    success: true,
    grade: grade || null,
    catalogue: catalogue.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      category: s.category,
      active: s.active,
    })),
    subjects: configs.map((c) => ({
      id: c.id,
      grade: c.grade,
      subjectName: c.subjectName,
      weeklyPeriods: c.weeklyPeriods,
      maxPeriodsPerDay: c.maxPeriodsPerDay,
      allowConsecutive: c.allowConsecutive,
      priority: c.priority,
      active: c.active,
      teachers: mappedTeachers(c.subjectName, c.grade),
    })),
  });
}

/** Add a subject to the school catalogue and map it to a grade. */
export async function POST(request: Request) {
  const denied = requireCapability(request, 'subject.write');
  if (denied) return denied;

  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const subjectName = String(body.subjectName ?? '').trim();
  const rawGrades = Array.isArray(body.grades) && body.grades.length > 0 
    ? body.grades 
    : body.grade ? [body.grade] : [];
  const grades: string[] = Array.from(new Set(rawGrades.map((g: any) => String(g).trim()).filter(Boolean)));

  if (!subjectName || subjectName.length < 2) {
    return NextResponse.json({ error: 'Subject name is required.' }, { status: 400 });
  }
  if (/\S+@\S+/.test(subjectName)) {
    return NextResponse.json(
      { error: `"${subjectName}" is an email address, not a subject.` },
      { status: 400 }
    );
  }
  if (grades.length === 0) {
    return NextResponse.json({ error: 'At least one grade is required.' }, { status: 400 });
  }

  const priority = PRIORITIES.includes(body.priority) ? body.priority : 'Normal';
  const weeklyPeriods = Math.min(20, Math.max(0, Number(body.weeklyPeriods ?? 4)));
  const maxPeriodsPerDay = Math.min(8, Math.max(1, Number(body.maxPeriodsPerDay ?? 2)));
  const requiredRoomType = body.requiredRoomType && isKnownRoomType(body.requiredRoomType) ? body.requiredRoomType : null;

  if (weeklyPeriods > 0 && maxPeriodsPerDay > weeklyPeriods) {
    return NextResponse.json(
      { error: `Max ${maxPeriodsPerDay}/day exceeds the weekly total of ${weeklyPeriods}.` },
      { status: 400 }
    );
  }

  // Register in the school catalogue if this is a new custom subject.
  const code = subjectName.toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 24);
  await db.subjectMaster
    .upsert({
      where: { schoolId_name: { schoolId, name: subjectName } },
      update: { active: true },
      create: { schoolId, name: subjectName, code, category: body.category || 'academic' },
    })
    .catch(() => null);

  const createdList: any[] = [];
  const skippedList: string[] = [];

  for (const g of grades) {
    const existing = await db.gradeSubjectConfig.findFirst({ where: { schoolId, grade: g, subjectName } });
    if (existing) {
      skippedList.push(g);
      continue;
    }

    const config = await db.gradeSubjectConfig.create({
      data: {
        schoolId,
        grade: g,
        subjectName,
        weeklyPeriods,
        maxPeriodsPerDay,
        allowConsecutive: Boolean(body.allowConsecutive),
        priority,
        requiredRoomType,
        active: body.active !== false,
      },
    });
    createdList.push(config);
  }

  if (createdList.length === 0 && skippedList.length > 0) {
    return NextResponse.json(
      {
        error: `${subjectName} is already configured for the selected grade(s) (${skippedList.join(', ')}).`,
        code: 'ALREADY_MAPPED',
      },
      { status: 409 }
    );
  }

  return NextResponse.json({
    success: true,
    createdCount: createdList.length,
    skippedGrades: skippedList,
    subject: createdList[0],
    subjects: createdList,
  });
}

export async function PUT(request: Request) {
  const denied = requireCapability(request, 'subject.write');
  if (denied) return denied;

  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? '');
  if (!id) return NextResponse.json({ error: 'Subject config id is required.' }, { status: 400 });

  const current = await db.gradeSubjectConfig.findFirst({ where: { id, schoolId } });
  if (!current) {
    return NextResponse.json({ error: 'Subject config not found in this school.' }, { status: 404 });
  }

  const weeklyPeriods =
    body.weeklyPeriods !== undefined
      ? Math.min(20, Math.max(0, Number(body.weeklyPeriods)))
      : current.weeklyPeriods;
  const maxPeriodsPerDay =
    body.maxPeriodsPerDay !== undefined
      ? Math.min(8, Math.max(1, Number(body.maxPeriodsPerDay)))
      : current.maxPeriodsPerDay;

  if (weeklyPeriods > 0 && maxPeriodsPerDay > weeklyPeriods) {
    return NextResponse.json(
      { error: `Max ${maxPeriodsPerDay}/day exceeds the weekly total of ${weeklyPeriods}.` },
      { status: 400 }
    );
  }

  const updated = await db.gradeSubjectConfig.update({
    where: { id },
    data: {
      weeklyPeriods,
      maxPeriodsPerDay,
      ...(body.allowConsecutive !== undefined
        ? { allowConsecutive: Boolean(body.allowConsecutive) }
        : {}),
      ...(body.priority && PRIORITIES.includes(body.priority) ? { priority: body.priority } : {}),
      ...(body.active !== undefined ? { active: Boolean(body.active) } : {}),
      // Rooms Stage 1: which kind of room this subject needs for this grade.
      // Empty string clears the requirement; an unknown type is rejected.
      ...(body.requiredRoomType !== undefined
        ? { requiredRoomType: body.requiredRoomType && isKnownRoomType(body.requiredRoomType) ? body.requiredRoomType : null }
        : {}),
    },
  });

  return NextResponse.json({ success: true, subject: updated });
}

export async function DELETE(request: Request) {
  const denied = requireCapability(request, 'subject.write');
  if (denied) return denied;

  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Subject config ID is required.' }, { status: 400 });
  }

  const existing = await db.gradeSubjectConfig.findFirst({ where: { id, schoolId } });
  if (!existing) {
    return NextResponse.json({ error: 'Subject config not found in this school.' }, { status: 404 });
  }

  await db.gradeSubjectConfig.delete({ where: { id } });
  return NextResponse.json({ success: true, message: `Removed ${existing.subjectName} from ${existing.grade}.` });
}

