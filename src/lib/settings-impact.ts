import { db } from '@/lib/db';
import { auditVersion } from '@/lib/timetable-audit';
import { getPublishedVersion } from '@/lib/timetable-lifecycle';

/**
 * After a setting is saved: how many problems the draft and the live
 * (published) timetable now have against the school's current settings.
 * Nothing is changed; the admin decides whether to fix the draft or start a
 * revision of the live timetable.
 */
export interface SettingsImpact {
  draft: { versionId: string; version: number; problems: number } | null;
  live: { versionId: string; version: number; problems: number } | null;
}

export async function settingsImpact(schoolId: string): Promise<SettingsImpact> {
  const [draft, live] = await Promise.all([
    db.timetableVersion.findFirst({ where: { schoolId, status: { in: ['draft', 'review', 'approved'] } }, orderBy: { version: 'desc' }, select: { id: true, version: true } }),
    getPublishedVersion(schoolId),
  ]);
  const count = async (v: { id: string; version: number } | null) =>
    v ? { versionId: v.id, version: v.version, problems: (await auditVersion(schoolId, v.id)).errors } : null;
  const [draftImpact, liveImpact] = await Promise.all([count(draft), count(live)]);
  return { draft: draftImpact, live: liveImpact };
}
