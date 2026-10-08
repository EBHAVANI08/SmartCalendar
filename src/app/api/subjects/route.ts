export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { readList } from '@/lib/faculty';
import { gradeKey, subjectKey } from '@/lib/name-normalize';
import { staffingReport, teacherQualifiedFor } from '@/lib/staffing';
import { describeCapacityProblem, gradeCapacityReport } from '@/lib/timetable-capacity';
import { getTenantSchoolId } from '@/lib/school-helper';
import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/authz';
import { isKnownRoomType } from '@/lib/room-types';
import { canonicalGrade, resolveSubjectName, schoolGradeNames, schoolSubjectNames, subjectConflictMessage } from '@/lib/master-data';
import { NOT_ARCHIVED } from '@/lib/soft-delete';
import { autofixAfterSave } from '@/lib/autofix';
import { isAutofixEnabled } from '@/lib/autofix';

const PRIORITIES = ['Core', 'High', 'Normal', 'Low'];

/**
 * Grade-wise subject management, scoped to one school.
 *
 * Automatically discovers subjects from Faculty Directory (active teachers)
 * and timetable schedules so every subject configured in the school is accessible.
 */
export async function GET(request: Request) {
  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }

  const gradeParam = new URL(request.url).searchParams.get('grade')?.trim() || null;
  // Any spelling of the selected grade ("Grade 1", "grade 1", "Grade I").
  const target = gradeParam ? gradeKey(gradeParam) : null;
  const inGrade = (grade: string) => !target || gradeKey(grade) === target;

  const [catalogue, allConfigRows, teachers, scheduleRows, classSections, staffing, capacity] = await Promise.all([
    db.subjectMaster.findMany({ where: { schoolId, AND: [NOT_ARCHIVED] }, orderBy: { name: 'asc' } }),
    db.gradeSubjectConfig.findMany({ where: { schoolId, AND: [NOT_ARCHIVED] }, orderBy: [{ grade: 'asc' }, { subjectName: 'asc' }] }),
    db.teacher.findMany({
      where: { schoolId, role: { not: 'inactive' } },
      select: { id: true, name: true, subject: true, subjects: true, grades: true, sections: true },
    }),
    db.schedule.findMany({ where: { schoolId }, select: { grade: true, subject: true }, distinct: ['grade', 'subject'] }),
    db.classSection.findMany({ where: { schoolId, active: true }, select: { grade: true }, distinct: ['grade'] }),
    gradeParam ? staffingReport(schoolId, gradeParam) : Promise.resolve(null),
    gradeParam ? gradeCapacityReport(schoolId) : Promise.resolve([]),
  ]);
  const configs = allConfigRows.filter((c) => inGrade(c.grade));

  // Grades come from the school's own structure; nothing is invented.
  const gradeSet = new Set<string>();
  for (const cs of classSections) if (cs.grade?.trim()) gradeSet.add(cs.grade.trim());
  if (gradeSet.size === 0) {
    for (const c of allConfigRows) if (c.grade?.trim()) gradeSet.add(c.grade.trim());
    for (const s of scheduleRows) if (s.grade?.trim()) gradeSet.add(s.grade.trim());
  }
  const availableGrades = Array.from(gradeSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const mappedTeachers = (subjectName: string, forGrade: string | null) =>
    teachers
      .filter((t) => teacherQualifiedFor(t, subjectName, forGrade))
      .map((t) => ({ id: t.id, name: t.name }));

  type SubjectRow = {
    id: string;
    grade: string;
    subjectName: string;
    weeklyPeriods: number;
    maxPeriodsPerDay: number;
    allowConsecutive: boolean;
    priority: string;
    requiredRoomType: string | null;
    active: boolean;
    isVirtual: boolean;
    teachers: { id: string; name: string }[];
  };
  const subjectMap = new Map<string, SubjectRow>();

  for (const c of configs) {
    subjectMap.set(subjectKey(c.subjectName), {
      id: c.id,
      grade: c.grade,
      subjectName: c.subjectName,
      weeklyPeriods: c.weeklyPeriods,
      maxPeriodsPerDay: c.maxPeriodsPerDay,
      allowConsecutive: c.allowConsecutive,
      priority: c.priority,
      requiredRoomType: c.requiredRoomType,
      active: c.active,
      isVirtual: false,
      teachers: mappedTeachers(c.subjectName, c.grade),
    });
  }

  // Subjects seen in Faculty Directory or past timetables but not configured
  // for this grade are offered as unsaved suggestions. They carry no quota
  // (weeklyPeriods 0) until the school sets one, so they never inflate demand.
  if (gradeParam) {
    const suggest = (name: string) => {
      const clean = name.trim();
      const key = subjectKey(clean);
      if (!clean || subjectMap.has(key)) return;
      subjectMap.set(key, {
        id: `virtual-${gradeParam.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${key.replace(/[^a-z0-9]/g, '-')}`,
        grade: gradeParam,
        subjectName: clean,
        weeklyPeriods: 0,
        maxPeriodsPerDay: 1,
        allowConsecutive: false,
        priority: 'Normal',
        requiredRoomType: null,
        active: true,
        isVirtual: true,
        teachers: mappedTeachers(clean, gradeParam),
      });
    };
    for (const t of teachers) {
      for (const sub of readList(t.subjects ?? t.subject)) if (teacherQualifiedFor(t, sub, gradeParam)) suggest(sub);
    }
    for (const s of scheduleRows) if (s.subject && inGrade(s.grade)) suggest(s.subject);
    if (subjectMap.size === 0) for (const cat of catalogue) if (cat.name && cat.active !== false) suggest(cat.name);
  }

  const gradeCapacity = gradeParam ? capacity.find((c) => gradeKey(c.grade) === target) ?? null : null;

  return NextResponse.json({
    success: true,
    grade: gradeParam,
    availableGrades,
    catalogue: catalogue.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      category: s.category,
      active: s.active,
    })),
    subjects: Array.from(subjectMap.values()),
    // Same calculation as the setup checklist (src/lib/staffing.ts).
    staffing: staffing
      ? {
          required: staffing.required.length,
          unstaffed: staffing.unstaffed.map((row) => ({ grade: row.grade, subjectName: row.subjectName })),
        }
      : null,
    // Weekly demand vs. teaching slots for this grade (src/lib/timetable-capacity.ts).
    autofixEnabled: await isAutofixEnabled(schoolId),
    capacity: gradeCapacity
      ? { ...gradeCapacity, problem: gradeCapacity.ok ? null : describeCapacityProblem(gradeCapacity) }
      : null,
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
  let subjectName = String(body.subjectName ?? '').trim();
  const rawGrades = Array.isArray(body.grades) && body.grades.length > 0 
    ? body.grades 
    : body.grade ? [body.grade] : [];
  let grades: string[] = Array.from(new Set(rawGrades.map((g: any) => String(g).trim()).filter(Boolean)));

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

  // One spelling per subject and grade: reuse the existing names instead of
  // creating "computer science" next to "Computer Science".
  const [gradeNames, subjectNames] = await Promise.all([schoolGradeNames(schoolId), schoolSubjectNames(schoolId)]);
  const resolution = resolveSubjectName(subjectName, subjectNames);
  if (resolution.kind === 'conflict') {
    return NextResponse.json(
      { error: subjectConflictMessage(resolution), code: 'DUPLICATE_SUBJECT', existing: resolution.existing },
      { status: 409 }
    );
  }
  subjectName = resolution.name;
  grades = Array.from(new Set(grades.map((g) => canonicalGrade(g, gradeNames))));

  // Register in the school catalogue if this is a new custom subject.
  const code = subjectName.toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 24);
  await db.subjectMaster
    .upsert({
      where: { schoolId_name: { schoolId, name: subjectName } },
      update: { active: true, archivedAt: null },
      create: { schoolId, name: subjectName, code, category: body.category || 'academic' },
    })
    .catch(() => null);

  const createdList: any[] = [];
  const skippedList: string[] = [];

  for (const g of grades) {
    const existing = await db.gradeSubjectConfig.findFirst({ where: { schoolId, grade: g, subjectName, AND: [NOT_ARCHIVED] } });
    if (existing) {
      skippedList.push(g);
      continue;
    }

    const config = await db.gradeSubjectConfig.create({
      data: {
        source: 'user',
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
    autofix: await autofixAfterSave(schoolId, 'save:subjects', request.headers.get('x-user-email')),
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
  let subjectName = String(body.subjectName ?? '').trim();
  let grade = String(body.grade ?? '').trim();
  if (subjectName && grade) {
    const [gradeNames, subjectNames] = await Promise.all([schoolGradeNames(schoolId), schoolSubjectNames(schoolId)]);
    const resolution = resolveSubjectName(subjectName, subjectNames);
    if (resolution.kind === 'conflict') {
      return NextResponse.json(
        { error: subjectConflictMessage(resolution), code: 'DUPLICATE_SUBJECT', existing: resolution.existing },
        { status: 409 }
      );
    }
    subjectName = resolution.name;
    grade = canonicalGrade(grade, gradeNames);
  }

  let current = id && !id.startsWith('virtual-')
    ? await db.gradeSubjectConfig.findFirst({ where: { id, schoolId, AND: [NOT_ARCHIVED] } })
    : null;

  if (!current && subjectName && grade) {
    current = await db.gradeSubjectConfig.findFirst({
      where: { schoolId, grade, subjectName, AND: [NOT_ARCHIVED] }
    });
  }

  const weeklyPeriods =
    body.weeklyPeriods !== undefined
      ? Math.min(20, Math.max(0, Number(body.weeklyPeriods)))
      : (current ? current.weeklyPeriods : 4);
  const maxPeriodsPerDay =
    body.maxPeriodsPerDay !== undefined
      ? Math.min(8, Math.max(1, Number(body.maxPeriodsPerDay)))
      : (current ? current.maxPeriodsPerDay : 2);

  if (weeklyPeriods > 0 && maxPeriodsPerDay > weeklyPeriods) {
    return NextResponse.json(
      { error: `Max ${maxPeriodsPerDay}/day exceeds the weekly total of ${weeklyPeriods}.` },
      { status: 400 }
    );
  }

  // If the subject was virtual / discovered, upsert it into database
  if (!current) {
    if (!subjectName || !grade) {
      return NextResponse.json({ error: 'Subject config not found in this school.' }, { status: 404 });
    }

    const code = subjectName.toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 24);
    await db.subjectMaster
      .upsert({
        where: { schoolId_name: { schoolId, name: subjectName } },
        update: { active: true, archivedAt: null },
        create: { schoolId, name: subjectName, code, category: 'academic' },
      })
      .catch(() => null);

    const created = await db.gradeSubjectConfig.create({
      data: {
        source: 'user',
        schoolId,
        grade,
        subjectName,
        weeklyPeriods,
        maxPeriodsPerDay,
        allowConsecutive: Boolean(body.allowConsecutive),
        priority: body.priority && PRIORITIES.includes(body.priority) ? body.priority : 'Normal',
        requiredRoomType: body.requiredRoomType && isKnownRoomType(body.requiredRoomType) ? body.requiredRoomType : null,
        active: body.active !== false,
      },
    });

    return NextResponse.json({ success: true, autofix: await autofixAfterSave(schoolId, 'save:subjects', request.headers.get('x-user-email')), subject: created });
  }

  const updated = await db.gradeSubjectConfig.update({
    where: { id: current.id },
    data: {
      weeklyPeriods,
      maxPeriodsPerDay,
      // A quota the admin set by hand is balanced only as a last resort.
      ...(body.weeklyPeriods !== undefined && weeklyPeriods !== current.weeklyPeriods ? { quotaEditedAt: new Date() } : {}),
      ...(body.allowConsecutive !== undefined
        ? { allowConsecutive: Boolean(body.allowConsecutive) }
        : {}),
      ...(body.priority && PRIORITIES.includes(body.priority) ? { priority: body.priority } : {}),
      ...(body.active !== undefined ? { active: Boolean(body.active) } : {}),
      ...(body.requiredRoomType !== undefined
        ? { requiredRoomType: body.requiredRoomType && isKnownRoomType(body.requiredRoomType) ? body.requiredRoomType : null }
        : {}),
    },
  });

  return NextResponse.json({ success: true, autofix: await autofixAfterSave(schoolId, 'save:subjects', request.headers.get('x-user-email')), subject: updated });
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

  if (id.startsWith('virtual-')) {
    return NextResponse.json({ success: true, autofix: await autofixAfterSave(schoolId, 'save:subjects', request.headers.get('x-user-email')), message: 'Subject dismissed.' });
  }

  const existing = await db.gradeSubjectConfig.findFirst({ where: { id, schoolId } });
  if (!existing) {
    return NextResponse.json({ error: 'Subject config not found in this school.' }, { status: 404 });
  }

  await db.gradeSubjectConfig.delete({ where: { id } });
  return NextResponse.json({ success: true, autofix: await autofixAfterSave(schoolId, 'save:subjects', request.headers.get('x-user-email')), message: `Removed ${existing.subjectName} from ${existing.grade}.` });
}
