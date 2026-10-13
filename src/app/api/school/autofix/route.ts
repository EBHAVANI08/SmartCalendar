export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCapability } from '@/lib/authz';
import { getTenantSchoolId } from '@/lib/school-helper';

const LIST_LIMIT = 200;

/** The school's automatic setup corrections, newest first. */
export async function GET(request: Request) {
  const denied = requireCapability(request, 'school.settings.read');
  if (denied) return denied;
  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });

  const notices = new URL(request.url).searchParams.get('notices') === '1';
  const logs = await db.autoFixLog.findMany({
    // Notices: tier 2 fixes still applied and not yet dismissed.
    where: notices ? { schoolId, tier: 2, undoneAt: null, acknowledgedAt: null } : { schoolId },
    orderBy: { appliedAt: 'desc' },
    take: LIST_LIMIT,
    select: { id: true, rule: true, tier: true, entity: true, summary: true, before: true, after: true, trigger: true, appliedAt: true, appliedBy: true, undoneAt: true, undoneBy: true, acknowledgedAt: true },
  });
  const active = await db.autoFixLog.count({ where: { schoolId, undoneAt: null } });
  return NextResponse.json({ success: true, fixes: logs, activeCount: active });
}
