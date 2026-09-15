export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { parseSubjectGradeSectionsMap, readList } from '@/lib/faculty';
import { getTenantSchoolId } from '@/lib/school-helper';
import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/authz';

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
      where: { schoolId },
      select: { grade: true, subjectName: true },
    }),
  ]);

  const existingConfigSet = new Set<string>();
  for (const c of existingConfigs) {
    existingConfigSet.add(`${c.grade.toLowerCase().trim()}::${c.subjectName.toLowerCase().trim()}`);
  }

  const pairMap = new Map<string, { grade: string; subject: string }>();

  // 1. From teachers
  for (const t of teachers) {
    const subs = readList(t.subjects ?? t.subject);
    const grs = readList(t.grades);
    const mapping = parseSubjectGradeSectionsMap(t.sections, subs, grs);

    for (const sub of subs) {
      const cleanSub = sub.trim();
      if (!cleanSub) continue;

      const subjGrades = mapping[cleanSub]?.grades || [];
      const effectiveGrades = subjGrades.length > 0 ? subjGrades : (grs.length > 0 ? grs : ['Grade 10']);

      for (const g of effectiveGrades) {
        const cleanG = g.trim();
        if (!cleanG) continue;
        const key = `${cleanG.toLowerCase()}::${cleanSub.toLowerCase()}`;
        if (!pairMap.has(key)) {
          pairMap.set(key, { grade: cleanG, subject: cleanSub });
        }
      }
    }
  }

  // 2. From schedule
  for (const s of schedules) {
    if (s.grade && s.subject) {
      const cleanG = s.grade.trim();
      const cleanSub = s.subject.trim();
      const key = `${cleanG.toLowerCase()}::${cleanSub.toLowerCase()}`;
      if (!pairMap.has(key)) {
        pairMap.set(key, { grade: cleanG, subject: cleanSub });
      }
    }
  }

  let createdConfigsCount = 0;

  for (const { grade, subject } of pairMap.values()) {
    // Ensure subject master exists
    const code = subject.toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 24);
    await db.subjectMaster
      .upsert({
        where: { schoolId_name: { schoolId, name: subject } },
        update: { active: true },
        create: { schoolId, name: subject, code, category: 'academic' },
      })
      .catch(() => null);

    // Ensure gradeSubjectConfig exists
    const configKey = `${grade.toLowerCase()}::${subject.toLowerCase()}`;
    if (!existingConfigSet.has(configKey)) {
      await db.gradeSubjectConfig.create({
        data: {
          schoolId,
          grade,
          subjectName: subject,
          weeklyPeriods: 4,
          maxPeriodsPerDay: 2,
          allowConsecutive: false,
          priority: 'Normal',
          requiredRoomType: null,
          active: true,
        },
      }).catch(() => null);
      existingConfigSet.add(configKey);
      createdConfigsCount++;
    }
  }

  return NextResponse.json({
    success: true,
    createdConfigsCount,
    totalDiscoveredPairs: pairMap.size,
    message: createdConfigsCount > 0
      ? `Successfully synced ${createdConfigsCount} new subject mapping(s) from Faculty Directory into curriculum.`
      : `All subjects and grades from Faculty Directory are already synchronized.`,
  });
}
