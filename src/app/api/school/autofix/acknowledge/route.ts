export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCapability } from '@/lib/authz';
import { getTenantSchoolId } from '@/lib/school-helper';

/** Dismisses tier 2 notices (`id`, or `ids` for several). The fixes stay applied (and undoable from School Setup). */
export async function POST(request: Request) {
  const denied = requireCapability(request, 'school.settings.write');
  if (denied) return denied;
  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const ids = (Array.isArray(body?.ids) ? body.ids : [body?.id]).map((value: unknown) => String(value || '')).filter(Boolean);
  if (!ids.length) return NextResponse.json({ error: 'Fix id is required.' }, { status: 400 });
  const result = await db.autoFixLog.updateMany({ where: { id: { in: ids }, schoolId, acknowledgedAt: null }, data: { acknowledgedAt: new Date() } });
  return NextResponse.json({ success: result.count === ids.length, dismissed: result.count });
}
