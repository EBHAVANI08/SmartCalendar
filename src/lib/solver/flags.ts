import { db } from '@/lib/db';

/**
 * Whether a school generates with the constraint solver and publishes through
 * the validator gate (SchoolFeatureFlags.solverV2Enabled). Off (null/false)
 * means the legacy generator and publish flow, unchanged.
 */
export async function isSolverV2Enabled(schoolId: string): Promise<boolean> {
  const flags = await db.schoolFeatureFlags.findUnique({ where: { schoolId }, select: { solverV2Enabled: true } }).catch(() => null);
  return flags?.solverV2Enabled === true;
}
