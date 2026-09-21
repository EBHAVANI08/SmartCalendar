export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { getDayConfig, saveDayConfig } from '@/lib/timetable-config';
import { buildTeachingGrid, periodsForDay, workingDayNames } from '@/lib/timetable-constraints';
import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/authz';

const DEFAULT_GRADES = [
  'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5',
  'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10',
  'Grade 11', 'Grade 12'
];

async function getAvailableGrades(schoolId: string): Promise<string[]> {
  const [sections, schedules, subjects] = await Promise.all([
    db.classSection.findMany({ where: { schoolId, active: true }, select: { grade: true } }).catch(() => []),
    db.schedule.findMany({ where: { schoolId }, select: { grade: true } }).catch(() => []),
    db.gradeSubjectConfig.findMany({ where: { schoolId, active: true }, select: { grade: true } }).catch(() => []),
  ]);

  const unique = new Set<string>();
  for (const s of sections) if (s.grade?.trim()) unique.add(s.grade.trim());
  for (const s of schedules) if (s.grade?.trim()) unique.add(s.grade.trim());
  for (const s of subjects) if (s.grade?.trim()) unique.add(s.grade.trim());

  if (unique.size === 0) {
    return DEFAULT_GRADES;
  }

  return Array.from(unique).sort((a, b) => {
    const na = Number(a.replace(/\D/g, '')) || 0;
    const nb = Number(b.replace(/\D/g, '')) || 0;
    return na - nb || a.localeCompare(b);
  });
}

function describe(
  config: Awaited<ReturnType<typeof getDayConfig>>,
  schoolDefaultConfig?: Awaited<ReturnType<typeof getDayConfig>>,
  availableGrades: string[] = []
) {
  return {
    success: true,
    config,
    schoolDefaultConfig: schoolDefaultConfig || config,
    availableGrades,
    gradeConfigs: config.gradeConfigs || {},
    days: workingDayNames(config).map((day) => ({ day, periods: periodsForDay(day, config) })),
    totalWeeklyPeriods: buildTeachingGrid(config).length,
  };
}

export async function GET(request: Request) {
  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const grade = searchParams.get('grade') || undefined;

  const [resolvedConfig, baseConfig, grades] = await Promise.all([
    getDayConfig(schoolId, grade),
    getDayConfig(schoolId, null),
    getAvailableGrades(schoolId),
  ]);

  return NextResponse.json(describe(resolvedConfig, baseConfig, grades));
}

export async function PUT(request: Request) {
  const denied = requireCapability(request, 'school.dayconfig.write');
  if (denied) return denied;

  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const saved = await saveDayConfig(schoolId, body);
  const baseConfig = await getDayConfig(schoolId, null);
  const grades = await getAvailableGrades(schoolId);

  return NextResponse.json(describe(saved, baseConfig, grades));
}
