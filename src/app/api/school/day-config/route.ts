export const dynamic = 'force-dynamic';

import { getTenantSchoolId } from '@/lib/school-helper';
import { getDayConfig, saveDayConfig } from '@/lib/timetable-config';
import { buildTeachingGrid, periodsForDay, workingDayNames } from '@/lib/timetable-constraints';
import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/authz';

function describe(config: Awaited<ReturnType<typeof getDayConfig>>) {
  return {
    success: true,
    config,
    days: workingDayNames(config).map((day) => ({ day, periods: periodsForDay(day, config) })),
    totalWeeklyPeriods: buildTeachingGrid(config).length,
  };
}

export async function GET(request: Request) {
  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }
  return NextResponse.json(describe(await getDayConfig(schoolId)));
}

export async function PUT(request: Request) {
  const denied = requireCapability(request, 'school.dayconfig.write');
  if (denied) return denied;

  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  return NextResponse.json(describe(await saveDayConfig(schoolId, body)));
}
