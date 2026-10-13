export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/authz';
import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { auditVersion } from '@/lib/timetable-audit';
import { changedAreas, fingerprintOf } from '@/lib/settings-fingerprint';
import { loadSolverInput } from '@/lib/solver/load';

/**
 * Everything the Studio's Problems panel shows for one version: the
 * independent validator's issues (with the rows to mark red), the periods the
 * generator could not place, and the automatic changes made at generation
 * (with whether each is still applied, for Undo). Read only.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = requireCapability(request, 'timetable.version.read');
  if (denied) return denied;
  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  const { id } = await context.params;

  const version = await db.timetableVersion.findFirst({
    where: { id, schoolId },
    select: { id: true, version: true, status: true, generationConfig: true, approvedBy: true, approvedAt: true },
  });
  if (!version) return NextResponse.json({ error: 'Timetable version not found.' }, { status: 404 });

  const audit = await auditVersion(schoolId, id);
  const config = (version.generationConfig ?? {}) as {
    engine?: string; mode?: string; generatedAt?: string; unallocated?: unknown[]; skipped?: unknown[]; autofix?: { logIds?: string[] };
    settingsFingerprint?: unknown;
  };
  // Settings changed since this version was generated (only versions made by the solver record them).
  const changed = config.settingsFingerprint
    ? changedAreas(config.settingsFingerprint, fingerprintOf((await loadSolverInput(schoolId, { versionId: id })).input))
    : [];
  const logIds = Array.isArray(config.autofix?.logIds) ? config.autofix!.logIds! : [];
  const changes = logIds.length
    ? await db.autoFixLog.findMany({
      where: { schoolId, id: { in: logIds } },
      select: { id: true, rule: true, tier: true, summary: true, appliedAt: true, undoneAt: true },
      orderBy: { appliedAt: 'asc' },
    })
    : [];

  return NextResponse.json({
    success: true,
    version: { id: version.id, version: version.version, status: version.status, approvedBy: version.approvedBy, approvedAt: version.approvedAt },
    engine: config.engine ?? null,
    generatedAt: config.generatedAt ?? null,
    mode: config.mode ?? 'generate',
    settingsChanged: changed,
    audit: { lessons: audit.slots, errors: audit.errors, warnings: audit.warnings, byRule: audit.byRule, issues: audit.issues },
    unallocated: Array.isArray(config.unallocated) ? config.unallocated : [],
    skipped: Array.isArray(config.skipped) ? config.skipped : [],
    autoChanges: changes,
  });
}
