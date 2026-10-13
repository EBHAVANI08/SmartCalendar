export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { settingsImpact } from '@/lib/settings-impact';
import { requireCapability } from '@/lib/authz';
import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { schoolWeekShape, schoolWorkloadDefaults, validateCaps, type WorkloadCaps } from '@/lib/workload';

/**
 * The school's default teacher limits (periods per week, per day, in a row),
 * used for every teacher without a personal rule. Unset means "not entered":
 * the timetable generator then reports "workload limits missing".
 */
export async function GET(request: Request) {
  const denied = requireCapability(request, 'school.settings.read');
  if (denied) return denied;
  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });

  const [defaults, week, teachers, personal] = await Promise.all([
    schoolWorkloadDefaults(schoolId),
    schoolWeekShape(schoolId),
    db.teacher.count({ where: { schoolId, role: { not: 'inactive' } } }),
    db.teacherWorkloadRule.findMany({
      where: { schoolId, OR: [{ timetableVersionId: null }, { timetableVersionId: { isSet: false } }] },
      select: { teacherId: true },
      distinct: ['teacherId'],
    }),
  ]);
  return NextResponse.json({
    success: true,
    defaults,
    set: defaults.maxWeekly !== null || defaults.maxDaily !== null || defaults.maxConsecutive !== null,
    week,
    teachers: { active: teachers, withPersonalRule: personal.length },
  });
}

const toCap = (value: unknown): number | null => (value === null || value === undefined || value === '' ? null : Number(value));

export async function PUT(request: Request) {
  const denied = requireCapability(request, 'school.settings.write');
  if (denied) return denied;
  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const caps: WorkloadCaps = { maxWeekly: toCap(body.maxWeekly), maxDaily: toCap(body.maxDaily), maxConsecutive: toCap(body.maxConsecutive) };
  const errors = validateCaps(caps, await schoolWeekShape(schoolId), { allRequired: true });
  if (errors.length) return NextResponse.json({ error: errors.join(' '), errors }, { status: 400 });

  const before = await schoolWorkloadDefaults(schoolId);
  const data = { defaultMaxWeekly: caps.maxWeekly, defaultMaxDaily: caps.maxDaily, defaultMaxConsecutive: caps.maxConsecutive };
  await db.schoolPreferences.upsert({ where: { schoolId }, update: data, create: { schoolId, ...data } });
  await db.auditLog.create({
    data: {
      schoolId,
      actorId: request.headers.get('x-user-id') || 'unknown',
      actorRole: request.headers.get('x-user-role') || 'unknown',
      action: 'workload.defaults.update',
      entityType: 'SchoolPreferences',
      entityId: schoolId,
      before: { ...before },
      after: { ...caps },
    },
  }).catch(() => null);
  return NextResponse.json({ success: true, defaults: caps, impact: await settingsImpact(schoolId) });
}
