export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/authz';
import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { operationalScheduleFilter } from '@/lib/timetable-lifecycle';
import { capViolations, effectiveWorkloads, schoolWeekShape, schoolWorkloadDefaults, teacherLoad } from '@/lib/workload';

/**
 * Every teacher's limits (personal rule, school default or missing) and their
 * actual load in the timetable teachers use now (the published version, or the
 * school's live timetable), with the limits each one breaks.
 */
export async function GET(request: Request) {
  const denied = requireCapability(request, 'faculty.read');
  if (denied) return denied;
  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });

  const scope = await operationalScheduleFilter(schoolId);
  const [teachers, rows, defaults, week] = await Promise.all([
    db.teacher.findMany({ where: { schoolId }, select: { id: true, name: true, role: true }, orderBy: { name: 'asc' } }),
    db.schedule.findMany({ where: { ...scope, teacherId: { not: null } }, select: { teacherId: true, day: true, period: true } }),
    schoolWorkloadDefaults(schoolId),
    schoolWeekShape(schoolId),
  ]);
  const limits = await effectiveWorkloads(schoolId, teachers.map((t) => t.id));
  const rowsByTeacher = new Map<string, { day: string; period: number }[]>();
  for (const row of rows) rowsByTeacher.set(row.teacherId!, [...(rowsByTeacher.get(row.teacherId!) ?? []), row]);

  const items = teachers.map((teacher) => {
    const limit = limits.get(teacher.id)!;
    const taught = rowsByTeacher.get(teacher.id) ?? [];
    const load = teacherLoad(taught);
    const inUnavailable = taught
      .filter((r) => limit.unavailable.some((u) => u.day === r.day && u.period === r.period))
      .map((r) => `${r.day} P${r.period}`);
    const problems = [
      ...capViolations(load, limit),
      ...(inUnavailable.length ? [`teaches in unavailable periods: ${inUnavailable.join(', ')}`] : []),
    ];
    return { id: teacher.id, name: teacher.name, active: teacher.role !== 'inactive', limits: limit, load, problems, overloaded: problems.length > 0 };
  });

  const active = items.filter((t) => t.active);
  return NextResponse.json({
    success: true,
    versionId: 'timetableVersionId' in scope ? scope.timetableVersionId ?? null : null,
    defaults,
    defaultsSet: defaults.maxWeekly !== null || defaults.maxDaily !== null || defaults.maxConsecutive !== null,
    week,
    teachers: items,
    summary: {
      teachers: active.length,
      overloaded: active.filter((t) => t.overloaded).length,
      missingLimits: active.filter((t) => t.limits.source === 'missing').length,
      personalRules: items.filter((t) => t.limits.source === 'personal').length,
    },
  });
}
