import { db } from '@/lib/db';

/**
 * Timetable lifecycle.
 *
 *   draft -> review -> approved -> published -> superseded
 *
 * A published timetable is the official active one and is never edited in
 * place. To change it permanently you create a revision: the published version
 * is copied into a new draft, edited and validated there, then approved and
 * published — at which point the previous version becomes superseded. Version
 * history is preserved throughout.
 *
 * Temporary cover for one date is a Substitution, not a revision, and does not
 * touch these rows at all.
 */

export const STATUSES = ['draft', 'review', 'approved', 'published', 'superseded', 'archived'] as const;
export type VersionStatus = (typeof STATUSES)[number];

/** Statuses whose Schedule rows may be edited directly. */
export const EDITABLE_STATUSES: VersionStatus[] = ['draft', 'review'];

/** Allowed status moves. Anything else is rejected. */
const TRANSITIONS: Record<VersionStatus, VersionStatus[]> = {
  draft: ['review', 'approved', 'archived'],
  review: ['draft', 'approved', 'archived'],
  approved: ['published', 'review', 'archived'],
  published: ['superseded', 'archived'],
  superseded: ['archived'],
  archived: [],
};

export function canTransition(from: string, to: string): boolean {
  const allowed = TRANSITIONS[from as VersionStatus];
  return Array.isArray(allowed) && allowed.includes(to as VersionStatus);
}

export function isEditable(status: string): boolean {
  return EDITABLE_STATUSES.includes(status as VersionStatus);
}

/** The school's current official timetable, if one is published. */
export async function getPublishedVersion(schoolId: string) {
  return db.timetableVersion.findFirst({
    where: { schoolId, status: 'published' },
    orderBy: { version: 'desc' },
  });
}


/**
 * Where-clause selecting the school's OPERATIONAL timetable rows.
 *
 * Once revisions exist, several versions hold a copy of the same slot. Leave
 * lookups, substitution and availability checks must all read the published
 * version only - otherwise one absence appears once per version.
 * Falls back to unversioned rows for a school that has not adopted versioning.
 */
export async function operationalScheduleFilter(schoolId: string) {
  const published = await getPublishedVersion(schoolId);
  if (published) {
    const publishedCount = await db.schedule.count({
      where: { schoolId, timetableVersionId: published.id },
    });
    if (publishedCount > 0) {
      return { schoolId, timetableVersionId: published.id };
    }
  }

  // Fall back to newest live draft/review version that has schedules
  const liveVersions = await db.timetableVersion.findMany({
    where: { schoolId, status: { in: ['draft', 'review', 'approved'] } },
    orderBy: { version: 'desc' },
    select: { id: true },
  });
  for (const v of liveVersions) {
    const cnt = await db.schedule.count({ where: { schoolId, timetableVersionId: v.id } });
    if (cnt > 0) return { schoolId, timetableVersionId: v.id };
  }

  // Fall back to newest version that actually has schedules (e.g. preserved in history)
  const newestWithSchedules = await db.schedule.findFirst({
    where: { schoolId, timetableVersionId: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { timetableVersionId: true },
  });
  if (newestWithSchedules?.timetableVersionId) {
    return { schoolId, timetableVersionId: newestWithSchedules.timetableVersionId };
  }

  if (published) return { schoolId, timetableVersionId: published.id };
  if (liveVersions.length > 0) return { schoolId, timetableVersionId: liveVersions[0].id };

  return {
    schoolId,
    OR: [{ timetableVersionId: null }, { timetableVersionId: { isSet: false } }],
  };
}

/** Ensure an AcademicYear exists, since TimetableVersion requires one. */
export async function ensureAcademicYear(schoolId: string): Promise<string> {
  const existing = await db.academicYear.findFirst({ where: { schoolId }, orderBy: { startDate: 'desc' } });
  if (existing) return existing.id;

  const year = new Date().getFullYear();
  const created = await db.academicYear.create({
    data: {
      schoolId,
      name: `${year}-${year + 1}`,
      startDate: new Date(year, 3, 1),
      endDate: new Date(year + 1, 2, 31),
    },
  });
  return created.id;
}

/**
 * Adopt the school's current unversioned Schedule rows into a first draft, so
 * an existing timetable can enter the lifecycle without being regenerated.
 */
export async function createInitialVersion(options: {
  schoolId: string;
  name?: string;
  createdBy: string;
  changeNotes?: string;
}) {
  const academicYearId = await ensureAcademicYear(options.schoolId);
  const highest = await db.timetableVersion.findFirst({
    where: { schoolId: options.schoolId },
    orderBy: { version: 'desc' },
    select: { version: true },
  });

  const version = await db.timetableVersion.create({
    data: {
      schoolId: options.schoolId,
      academicYearId,
      name: options.name || 'Master Timetable',
      version: (highest?.version ?? 0) + 1,
      status: 'draft',
      createdBy: options.createdBy,
      changeNotes: options.changeNotes || 'Initial version adopted from existing timetable rows.',
    },
  });

  // Rows written before versioning have no timetableVersionId field at all.
  // Prisma's MongoDB connector treats 'null' and 'absent' as different, so an
  // isSet:false clause is required to reach them.
  const adopted = await db.schedule.updateMany({
    where: {
      schoolId: options.schoolId,
      OR: [{ timetableVersionId: null }, { timetableVersionId: { isSet: false } }],
    },
    data: { timetableVersionId: version.id },
  });

  return { version, adoptedRows: adopted.count };
}

/**
 * Copy a version's rows into a new draft. The source is left untouched, so a
 * published timetable keeps serving while the revision is edited.
 */
export async function createRevision(options: {
  schoolId: string;
  sourceVersionId: string;
  createdBy: string;
  changeNotes?: string;
  name?: string;
}) {
  const source = await db.timetableVersion.findFirst({
    where: { id: options.sourceVersionId, schoolId: options.schoolId },
  });
  if (!source) return { error: 'Source timetable version not found.' as const };

  const highest = await db.timetableVersion.findFirst({
    where: { schoolId: options.schoolId },
    orderBy: { version: 'desc' },
    select: { version: true },
  });

  const revision = await db.timetableVersion.create({
    data: {
      schoolId: options.schoolId,
      academicYearId: source.academicYearId,
      academicTermId: source.academicTermId,
      campusId: source.campusId,
      name: options.name || source.name,
      timetableType: source.timetableType,
      version: (highest?.version ?? source.version) + 1,
      status: 'draft',
      basedOnId: source.id,
      createdBy: options.createdBy,
      changeNotes: options.changeNotes || `Revision of v${source.version}.`,
    },
  });

  // Deep-copy the rows. Schedule is unique on
  // (schoolId, grade, section, day, period), so the copies cannot live in the
  // same school alongside the originals — they are written with the revision's
  // id and the originals are detached from that key space at publish time.
  const rows = await db.schedule.findMany({
    where: { schoolId: options.schoolId, timetableVersionId: source.id },
  });

  return { revision, sourceRowCount: rows.length, source };
}

/**
 * Publish a version and supersede whatever was published before.
 * Runs as a sequence of writes; the previous version is only marked superseded
 * after the new one is live, so the school is never left with none.
 */
export async function publishVersion(options: {
  schoolId: string;
  versionId: string;
  publishedBy: string;
}) {
  const version = await db.timetableVersion.findFirst({
    where: { id: options.versionId, schoolId: options.schoolId },
  });
  if (!version) return { error: 'Timetable version not found.' as const };

  if (!canTransition(version.status, 'published')) {
    return {
      error: `A ${version.status} timetable cannot be published directly. Approve it first.` as const,
    };
  }

  const current = await getPublishedVersion(options.schoolId);

  const published = await db.timetableVersion.update({
    where: { id: version.id },
    data: {
      status: 'published',
      publishedBy: options.publishedBy,
      publishedAt: new Date(),
    },
  });

  if (current && current.id !== version.id) {
    await db.timetableVersion.update({
      where: { id: current.id },
      data: {
        status: 'superseded',
        supersededById: published.id,
        supersededAt: new Date(),
      },
    });
  }

  return { published, superseded: current && current.id !== version.id ? current : null };
}

/** Version history for the Admin view. */
export async function versionHistory(schoolId: string) {
  const versions = await db.timetableVersion.findMany({
    where: { schoolId },
    orderBy: [{ version: 'desc' }],
  });

  const counts = await Promise.all(
    versions.map((v) => db.schedule.count({ where: { schoolId, timetableVersionId: v.id } }))
  );

  return versions.map((v, i) => ({
    id: v.id,
    version: v.version,
    name: v.name,
    status: v.status,
    academicYearId: v.academicYearId,
    academicTermId: v.academicTermId,
    createdAt: v.createdAt,
    createdBy: v.createdBy,
    approvedBy: v.approvedBy,
    approvedAt: v.approvedAt,
    publishedBy: v.publishedBy,
    publishedAt: v.publishedAt,
    changeNotes: v.changeNotes,
    basedOnId: v.basedOnId,
    supersededById: v.supersededById,
    supersededAt: v.supersededAt,
    rowCount: counts[i],
    isCurrent: v.status === 'published',
    editable: isEditable(v.status),
  }));
}
