import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Validation issues raised against a timetable version.
 *
 * Scoped to the caller's school. It previously took ?schoolId straight from the
 * query string with no session check, so any signed-in user could read another
 * school's issue list by guessing its id.
 */
export async function GET(request: Request) {
  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) return NextResponse.json({ error: 'No school in session' }, { status: 401 });

  const timetableVersionId = new URL(request.url).searchParams.get('versionId');
  const issues = await db.validationIssue.findMany({
    where: { schoolId, ...(timetableVersionId ? { timetableVersionId } : {}) },
    orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
  });
  return NextResponse.json({ success: true, issues });
}
