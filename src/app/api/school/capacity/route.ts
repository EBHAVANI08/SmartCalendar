export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/authz';
import { getTenantSchoolId } from '@/lib/school-helper';
import { describeCapacityProblem, gradeCapacityReport } from '@/lib/timetable-capacity';

/** Weekly demand vs. weekly teaching slots, per grade, for the caller's school. */
export async function GET(request: Request) {
  const denied = requireCapability(request, 'school.settings.read');
  if (denied) return denied;

  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }

  const grade = new URL(request.url).searchParams.get('grade') || undefined;
  const grades = await gradeCapacityReport(schoolId, grade);
  return NextResponse.json({
    success: true,
    grades: grades.map((capacity) => ({ ...capacity, problem: capacity.ok ? null : describeCapacityProblem(capacity) })),
    blocking: grades.filter((capacity) => !capacity.ok).length,
  });
}
