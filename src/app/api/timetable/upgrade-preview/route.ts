export const dynamic = 'force-dynamic';

import { getTenantSchoolId } from '@/lib/school-helper';
import { requireCapability } from '@/lib/authz';
import { buildUpgradePreview } from '@/lib/migration-issues';
import { NextResponse } from 'next/server';

/**
 * Upgrade Existing Timetable — PREVIEW ONLY.
 *
 * Answers "what would happen if I created a clean revision from my legacy
 * timetable right now": which rows transfer, which are held back, and what a
 * person has to decide first.
 *
 * There is deliberately **no POST**. Nothing here creates a version, copies a
 * row, or modifies the legacy timetable. Execution is a separate, approved step.
 */
export async function GET(request: Request) {
  const denied = requireCapability(request, 'timetable.version.read');
  if (denied) return denied;

  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }

  try {
    const preview = await buildUpgradePreview(schoolId);
    return NextResponse.json({
      success: true,
      mode: 'preview',
      readOnly: true,
      ...preview,
    });
  } catch (error) {
    console.error('[UPGRADE PREVIEW]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upgrade preview failed.' },
      { status: 500 }
    );
  }
}
