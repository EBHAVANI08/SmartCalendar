export const dynamic = 'force-dynamic';

import { getTenantSchoolId } from '@/lib/school-helper';
import { requireCapability } from '@/lib/authz';
import { scanLegacyReadiness } from '@/lib/legacy-readiness';
import { NextResponse } from 'next/server';

/**
 * Legacy Data Readiness — read-only.
 *
 * Reports what a tenant's existing data would do under the newer architecture:
 * what can migrate deterministically, what a person has to decide, and what is
 * blocked. It writes nothing, so running it against a live school is safe.
 *
 * Tenant-scoped like everything else; a platform owner may pass ?schoolId to
 * inspect a specific tenant.
 */
export async function GET(request: Request) {
  const denied = requireCapability(request, 'school.settings.read');
  if (denied) return denied;

  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }

  try {
    const report = await scanLegacyReadiness(schoolId);
    return NextResponse.json({ success: true, ...report });
  } catch (error) {
    console.error('[READINESS]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Readiness scan failed.' },
      { status: 500 }
    );
  }
}
