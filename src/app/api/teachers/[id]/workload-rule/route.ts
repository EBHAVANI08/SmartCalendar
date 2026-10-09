export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/authz';
import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { parseUnavailable, personalRules, schoolWeekShape, validateCaps, validateUnavailable, type WorkloadCaps } from '@/lib/workload';

/**
 * One teacher's personal limits and unavailable periods (a standing
 * TeacherWorkloadRule, used by every timetable version). PUT sets them;
 * DELETE removes them so the school's defaults apply again.
 */

async function context(request: Request, params: Promise<{ id: string }>) {
  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) return { error: NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 }) };
  const { id } = await params;
  const teacher = await db.teacher.findFirst({ where: { id, schoolId }, select: { id: true, name: true } });
  if (!teacher) return { error: NextResponse.json({ error: 'Teacher not found in this school.' }, { status: 404 }) };
  return { schoolId, teacher };
}

const toCap = (value: unknown): number | null => (value === null || value === undefined || value === '' ? null : Number(value));

const actor = (request: Request) => ({
  actorId: request.headers.get('x-user-id') || 'unknown',
  actorRole: request.headers.get('x-user-role') || 'unknown',
});

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireCapability(request, 'faculty.write');
  if (denied) return denied;
  const ctx = await context(request, params);
  if ('error' in ctx) return ctx.error;
  const { schoolId, teacher } = ctx;

  const body = await request.json().catch(() => ({}));
  const caps: WorkloadCaps = { maxWeekly: toCap(body.maxWeekly), maxDaily: toCap(body.maxDaily), maxConsecutive: toCap(body.maxConsecutive) };
  const unavailable = parseUnavailable(body.unavailableSlots);
  const week = await schoolWeekShape(schoolId);
  const errors = [...validateCaps(caps, week, { allRequired: true }), ...validateUnavailable(unavailable, week)];
  if (errors.length) return NextResponse.json({ error: errors.join(' '), errors }, { status: 400 });

  // One standing rule per teacher: update the newest, or create it.
  const existing = (await personalRules(schoolId, [teacher.id])).get(teacher.id);
  const data = {
    maxWeekly: caps.maxWeekly!, maxDaily: caps.maxDaily!, maxConsecutive: caps.maxConsecutive!,
    unavailableSlots: unavailable.map((u) => ({ day: u.day, period: u.period })),
  };
  const rule = existing
    ? await db.teacherWorkloadRule.update({ where: { id: existing.id }, data })
    : await db.teacherWorkloadRule.create({ data: { schoolId, teacherId: teacher.id, timetableVersionId: null, ...data } });

  await db.auditLog.create({
    data: {
      schoolId,
      ...actor(request),
      action: 'workload.rule.update',
      entityType: 'TeacherWorkloadRule',
      entityId: rule.id,
      before: existing
        ? { maxWeekly: existing.maxWeekly, maxDaily: existing.maxDaily, maxConsecutive: existing.maxConsecutive, unavailableSlots: (existing.unavailableSlots ?? []) as object }
        : undefined,
      after: data,
      reason: `Limits for ${teacher.name}`,
    },
  }).catch(() => null);

  return NextResponse.json({ success: true, rule: { ...caps, unavailable, source: 'personal' } });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireCapability(request, 'faculty.write');
  if (denied) return denied;
  const ctx = await context(request, params);
  if ('error' in ctx) return ctx.error;
  const { schoolId, teacher } = ctx;

  const removed = await db.teacherWorkloadRule.deleteMany({
    where: { schoolId, teacherId: teacher.id, OR: [{ timetableVersionId: null }, { timetableVersionId: { isSet: false } }] },
  });
  if (removed.count) {
    await db.auditLog.create({
      data: {
        schoolId,
        ...actor(request),
        action: 'workload.rule.remove',
        entityType: 'TeacherWorkloadRule',
        entityId: teacher.id,
        reason: `Limits for ${teacher.name} now follow the school defaults`,
      },
    }).catch(() => null);
  }
  return NextResponse.json({ success: true, removed: removed.count });
}
