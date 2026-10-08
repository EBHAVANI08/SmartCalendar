export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/authz';
import { getTenantSchoolId } from '@/lib/school-helper';
import { runAutofix } from '@/lib/autofix';

/**
 * Runs the setup checks now. `{ "apply": false }` previews what would change
 * without writing anything; otherwise fixes are applied and logged.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const apply = body?.apply !== false;
  const denied = requireCapability(request, apply ? 'school.settings.write' : 'school.settings.read');
  if (denied) return denied;
  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });

  const run = await runAutofix(schoolId, { apply, trigger: 'manual', actor: request.headers.get('x-user-email') });
  return NextResponse.json({
    success: true,
    applied: apply ? run.logIds.length : 0,
    fixes: run.fixes.map(({ rule, tier, entity, summary, before, after }) => ({ rule, tier, entity, summary, before, after })),
    unfixable: run.unfixable,
    suppressed: run.suppressed.map(({ rule, entity, summary }) => ({ rule, entity, summary })),
  });
}
