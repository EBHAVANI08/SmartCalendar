export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/authz';
import { getTenantSchoolId } from '@/lib/school-helper';
import { undoFix } from '@/lib/autofix';

/** Restores the rows an automatic fix changed. The same fix is not re-applied to the same data. */
export async function POST(request: Request) {
  const denied = requireCapability(request, 'school.settings.write');
  if (denied) return denied;
  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const id = String(body?.id || '');
  if (!id) return NextResponse.json({ error: 'Fix id is required.' }, { status: 400 });

  const result = await undoFix(schoolId, id, request.headers.get('x-user-email'));
  if (result.ok) return NextResponse.json({ success: true });
  const messages = {
    not_found: 'That fix was not found in this school.',
    already_undone: 'That fix was already undone.',
    conflict: 'These settings were changed after the fix, so it cannot be undone automatically. Undo the newer fixes first, or edit the settings directly.',
  } as const;
  return NextResponse.json({ error: messages[result.reason], conflicts: result.conflicts ?? [] }, { status: result.reason === 'not_found' ? 404 : 409 });
}
