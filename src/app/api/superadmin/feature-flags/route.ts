import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { isSuperAdminRequest, unauthorized, writeAudit } from '@/lib/superadmin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!isSuperAdminRequest(request)) return unauthorized();

  const { searchParams } = new URL(request.url);
  const schoolId = searchParams.get('schoolId');
  if (!schoolId) return NextResponse.json({ error: 'schoolId required' }, { status: 400 });

  let flags = await db.schoolFeatureFlags.findUnique({ where: { schoolId } });
  if (!flags) {
    flags = await db.schoolFeatureFlags.create({ data: { schoolId } });
  }
  return NextResponse.json({ flags });
}

export async function PUT(request: Request) {
  if (!isSuperAdminRequest(request)) return unauthorized();

  const { searchParams } = new URL(request.url);
  const schoolId = searchParams.get('schoolId');
  if (!schoolId) return NextResponse.json({ error: 'schoolId required' }, { status: 400 });

  const body = await request.json();
  const allowed = [
    'aiTimetableEnabled', 'manualTimetableEnabled', 'bulkImportEnabled',
    'shortBreakEnabled', 'lunchBreakEnabled', 'ptPeriodsEnabled',
    'substitutionEnabled', 'autoSubstitutionEnabled', 'workloadAnalyticsEnabled',
    'teacherNotifyEnabled', 'maxGrades', 'maxTeachers', 'maxPeriodsPerDay',
    'planName', 'customNote', 'trialEndsAt',
  ];
  const data: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  const flags = await db.schoolFeatureFlags.upsert({
    where: { schoolId },
    create: { schoolId, ...data },
    update: data,
  });
  await writeAudit(request, 'featureFlags.update', 'school', schoolId);
  return NextResponse.json({ success: true, flags });
}
