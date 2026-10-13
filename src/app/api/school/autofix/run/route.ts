export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/authz';
import { getTenantSchoolId } from '@/lib/school-helper';
import { isAutofixEnabled, runAutofix } from '@/lib/autofix';

/**
 * Runs the setup checks now.
 *  - `{ "apply": false }` previews without writing.
 *  - `{ "balance": true, "grade": "...", "protect": ["<configId>"] }` is the
 *    Subjects tab's Auto-balance: tier 1 plus balancing for that grade, never
 *    changing the protected rows (the one the admin just edited).
 * Applying requires automatic fixes to be switched on for the school.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const apply = body?.apply !== false;
  const denied = requireCapability(request, apply ? 'school.settings.write' : 'school.settings.read');
  if (denied) return denied;
  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  if (apply && !(await isAutofixEnabled(schoolId))) {
    return NextResponse.json({ error: 'Automatic fixes are switched off for this school.', code: 'AUTOFIX_DISABLED' }, { status: 409 });
  }

  const balance = body?.balance === true;
  const run = await runAutofix(schoolId, {
    apply,
    trigger: balance ? 'manual:balance' : 'manual',
    actor: request.headers.get('x-user-email'),
    tiers: balance ? [1, 2] : [1],
    ...(balance ? { rules: ['merge_rule', 'duplicate_grade', 'duplicate_subject', 'display_name', 'daily_cap_too_low', 'bell', 'over_capacity'] } : {}),
    onlyGrade: typeof body?.grade === 'string' && body.grade ? body.grade : undefined,
    protectedConfigIds: Array.isArray(body?.protect) ? body.protect.map(String) : [],
  });
  return NextResponse.json({
    success: true,
    applied: apply ? run.logIds.length : 0,
    fixes: run.fixes.map(({ rule, tier, entity, summary, before, after }) => ({ rule, tier, entity, summary, before, after })),
    unfixable: run.unfixable,
    suppressed: run.suppressed.map(({ rule, entity, summary }) => ({ rule, entity, summary })),
  });
}
