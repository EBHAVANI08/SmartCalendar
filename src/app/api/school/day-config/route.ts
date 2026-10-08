export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { getDayConfig, saveDayConfig } from '@/lib/timetable-config';
import { buildBellTimeline, buildTeachingGrid, periodTimingsForDay, periodsForDay, validateBellConfig, workingDayNames } from '@/lib/timetable-constraints';
import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/authz';
import { autofixAfterSave } from '@/lib/autofix';

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
    // Per-day period counts and times, all derived from the saved settings.
    days: workingDayNames(config).map((day) => ({
      day,
      periods: periodsForDay(day, config),
      timings: periodTimingsForDay(config, day),
    })),
    // The full day's bell including enabled breaks, for grids and exports.
    bellTimeline: buildBellTimeline(config),
    totalWeeklyPeriods: buildTeachingGrid(config).length,
    // Problems in the saved bell schedule (normally none: saves are validated).
    bellErrors: config.configured ? validateBellConfig(config, config.gradeName || 'School day') : [],
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
  if (!saved.ok) {
    return NextResponse.json(
      { error: saved.errors[0], errors: saved.errors, code: 'INVALID_BELL_SCHEDULE' },
      { status: 400 }
    );
  }
  // Correct what can be corrected (0-minute breaks, breaks outside the day,
  // break and lunch after the same period); each fix is logged and undoable.
  const autofix = await autofixAfterSave(schoolId, 'save:dayconfig', request.headers.get('x-user-email'));
  const [config, baseConfig, grades] = await Promise.all([
    getDayConfig(schoolId, body?.grade || null),
    getDayConfig(schoolId, null),
    getAvailableGrades(schoolId),
  ]);

  return NextResponse.json({ ...describe(config, baseConfig, grades), autofix });
}
