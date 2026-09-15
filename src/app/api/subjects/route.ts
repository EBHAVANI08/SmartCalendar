export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { parseSubjectGradeSectionsMap, readList } from '@/lib/faculty';
import { getTenantSchoolId } from '@/lib/school-helper';
import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/authz';
import { isKnownRoomType } from '@/lib/room-types';

const PRIORITIES = ['Core', 'High', 'Normal', 'Low'];

/**
 * Check if a teacher is qualified / mapped to teach a given subject in a specific grade.
 */
function teacherTeachesSubjectForGrade(
  teacher: {
    id: string;
    name: string;
    subject?: string | null;
    subjects?: string | null;
    grades?: string | null;
    sections?: string | null;
  },
  subjectName: string,
  forGrade?: string | null
): boolean {
  const subs = readList(teacher.subjects ?? teacher.subject);
  const grs = readList(teacher.grades);
  const normSubj = subjectName.trim().toLowerCase();

  const matchedSubj = subs.find(
    (s) =>
      s.trim().toLowerCase() === normSubj ||
      s.replace(/\s+/g, '').toLowerCase() === normSubj.replace(/\s+/g, '')
  );
  if (!matchedSubj) return false;

  if (!forGrade) return true;

  const normForGrade = forGrade.replace(/^Grade\s*/i, '').trim().toLowerCase();

  // Parse subject-specific grade mapping from sections
  const mapping = parseSubjectGradeSectionsMap(teacher.sections, subs, grs);
  const subjGrades = mapping[matchedSubj]?.grades || [];

  if (subjGrades.length > 0) {
    return subjGrades.some((g) => {
      const normG = g.replace(/^Grade\s*/i, '').trim().toLowerCase();
      return normG === normForGrade;
    });
  }

  // If no subject-specific scoping, fall back to teacher's general grades
  if (grs.length === 0) return true; // Qualified for all grades
  return grs.some((g) => {
    const normG = g.replace(/^Grade\s*/i, '').trim().toLowerCase();
    return normG === normForGrade;
  });
}

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

  const gradeParam = new URL(request.url).searchParams.get('grade');
  const gradeVariants = gradeParam
    ? Array.from(new Set([
        gradeParam.trim(),
        gradeParam.replace(/^Grade\s*/i, '').trim(),
        `Grade ${gradeParam.replace(/^Grade\s*/i, '').trim()}`,
      ])).filter(Boolean)
    : [];

  const [catalogue, configs, teachers, scheduleSubjects, classSections, allConfigs, allSchedules] = await Promise.all([
    db.subjectMaster.findMany({ where: { schoolId }, orderBy: { name: 'asc' } }),
    db.gradeSubjectConfig.findMany({
      where: {
        schoolId,
        ...(gradeVariants.length > 0 ? { grade: { in: gradeVariants } } : {}),
      },
      orderBy: [{ grade: 'asc' }, { subjectName: 'asc' }],
    }),
    db.teacher.findMany({
      where: { schoolId, role: { not: 'inactive' } },
      select: { id: true, name: true, subject: true, subjects: true, grades: true, sections: true },
    }),
    gradeVariants.length > 0
      ? db.schedule.findMany({
          where: { schoolId, grade: { in: gradeVariants } },
          select: { subject: true },
          distinct: ['subject'],
        })
      : Promise.resolve([]),
    db.classSection.findMany({
      where: { schoolId, active: true },
      select: { grade: true },
      distinct: ['grade'],
    }),
    db.gradeSubjectConfig.findMany({
      where: { schoolId },
      select: { grade: true },
      distinct: ['grade'],
    }),
    db.schedule.findMany({
      where: { schoolId },
      select: { grade: true },
      distinct: ['grade'],
    }),
  ]);

  const gradeSet = new Set<string>();
  for (const cs of classSections) {
    if (cs.grade && cs.grade.trim()) gradeSet.add(cs.grade.trim());
  }
  if (gradeSet.size === 0) {
    for (const c of allConfigs) {
      if (c.grade && c.grade.trim()) gradeSet.add(c.grade.trim());
    }
    for (const s of allSchedules) {
      if (s.grade && s.grade.trim()) gradeSet.add(s.grade.trim());
    }
  }
  const availableGrades = gradeSet.size > 0
    ? Array.from(gradeSet).sort((a, b) => {
        const na = Number(a.replace(/\D/g, '')) || 0;
        const nb = Number(b.replace(/\D/g, '')) || 0;
        return na - nb || a.localeCompare(b);
      })
    : Array.from({ length: 10 }, (_, i) => `Grade ${i + 1}`);

  // Active teachers accurately mapped to this subject and grade
  const mappedTeachers = (subjectName: string, forGrade: string | null) =>
    teachers
      .filter((t) => teacherTeachesSubjectForGrade(t, subjectName, forGrade))
      .map((t) => ({ id: t.id, name: t.name }));

  // Collect configured subjects
  const subjectMap = new Map<
    string,
    {
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
    }
  >();

  for (const c of configs) {
    const key = c.subjectName.toLowerCase().trim();
    subjectMap.set(key, {
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

  // Discover and merge subjects taught by faculty for this grade (or all grades)
  for (const t of teachers) {
    const subs = readList(t.subjects ?? t.subject);
    for (const sub of subs) {
      const cleanSub = sub.trim();
      if (!cleanSub) continue;
      const key = cleanSub.toLowerCase();

      if (!subjectMap.has(key)) {
        if (!gradeParam || teacherTeachesSubjectForGrade(t, cleanSub, gradeParam)) {
          const effectiveGrade = gradeParam || 'Grade 10';
          subjectMap.set(key, {
            id: `virtual-${effectiveGrade.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${key.replace(/[^a-z0-9]/g, '-')}`,
            grade: effectiveGrade,
            subjectName: cleanSub,
            weeklyPeriods: 4,
            maxPeriodsPerDay: 2,
            allowConsecutive: false,
            priority: 'Normal',
            requiredRoomType: null,
            active: true,
            isVirtual: true,
            teachers: mappedTeachers(cleanSub, gradeParam),
          });
        }
      }
    }
  }

  // Discover and merge historical schedule subjects for this grade
  for (const s of scheduleSubjects || []) {
    if (s.subject && s.subject.trim()) {
      const cleanSub = s.subject.trim();
      const key = cleanSub.toLowerCase();
      if (!subjectMap.has(key)) {
        const effectiveGrade = gradeParam || 'Grade 10';
        subjectMap.set(key, {
          id: `virtual-${effectiveGrade.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${key.replace(/[^a-z0-9]/g, '-')}`,
          grade: effectiveGrade,
          subjectName: cleanSub,
          weeklyPeriods: 4,
          maxPeriodsPerDay: 2,
          allowConsecutive: false,
          priority: 'Normal',
          requiredRoomType: null,
          active: true,
          isVirtual: true,
          teachers: mappedTeachers(cleanSub, gradeParam),
        });
      }
    }
  }

  // If still empty and catalogue exists, populate catalogue items
  if (subjectMap.size === 0 && gradeParam) {
    for (const cat of catalogue) {
      if (cat.name && cat.active !== false) {
        const cleanSub = cat.name.trim();
        const key = cleanSub.toLowerCase();
        if (!subjectMap.has(key)) {
          subjectMap.set(key, {
            id: `virtual-${gradeParam.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${key.replace(/[^a-z0-9]/g, '-')}`,
            grade: gradeParam,
            subjectName: cleanSub,
            weeklyPeriods: 4,
            maxPeriodsPerDay: 2,
            allowConsecutive: false,
            priority: 'Normal',
            requiredRoomType: null,
            active: true,
            isVirtual: true,
            teachers: mappedTeachers(cleanSub, gradeParam),
          });
        }
      }
    }
  }

  const finalSubjects = Array.from(subjectMap.values());

  return NextResponse.json({
    success: true,
    grade: gradeParam || null,
    availableGrades,
    catalogue: catalogue.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      category: s.category,
      active: s.active,
    })),
    subjects: finalSubjects,
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
  const subjectName = String(body.subjectName ?? '').trim();
  const grade = String(body.grade ?? '').trim();

  let current = id && !id.startsWith('virtual-')
    ? await db.gradeSubjectConfig.findFirst({ where: { id, schoolId } })
    : null;

  if (!current && subjectName && grade) {
    current = await db.gradeSubjectConfig.findFirst({
      where: { schoolId, grade, subjectName }
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
        update: { active: true },
        create: { schoolId, name: subjectName, code, category: 'academic' },
      })
      .catch(() => null);

    const created = await db.gradeSubjectConfig.create({
      data: {
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

    return NextResponse.json({ success: true, subject: created });
  }

  const updated = await db.gradeSubjectConfig.update({
    where: { id: current.id },
    data: {
      weeklyPeriods,
      maxPeriodsPerDay,
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

  if (id.startsWith('virtual-')) {
    return NextResponse.json({ success: true, message: 'Subject dismissed.' });
  }

  const existing = await db.gradeSubjectConfig.findFirst({ where: { id, schoolId } });
  if (!existing) {
    return NextResponse.json({ error: 'Subject config not found in this school.' }, { status: 404 });
  }

  await db.gradeSubjectConfig.delete({ where: { id } });
  return NextResponse.json({ success: true, message: `Removed ${existing.subjectName} from ${existing.grade}.` });
}
