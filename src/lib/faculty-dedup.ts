import { db } from '@/lib/db';
import { looksLikeBinary, looksLikeEmail, mergeLists, normalizeEmail, normalizeEmployeeId, normalizeName, readList } from '@/lib/faculty';

/**
 * Faculty deduplication.
 *
 * One real teacher must be one faculty record. This finds records that refer to
 * the same person, picks a canonical one, plans the merge, and repoints every
 * reference before anything is deleted.
 *
 * Two safety rules run through the whole module:
 *  - Nothing is merged across schools. A tenant's faculty is its own.
 *  - Name similarity alone is never enough. Two people can share a name, so a
 *    name-only match is reported for review rather than merged.
 */

/** Every model that points at a Teacher, and the field that does the pointing. */
export const TEACHER_REFERENCES = [
  { model: 'schedule', field: 'teacherId', label: 'timetable rows' },
  { model: 'timetableSlot', field: 'teacherId', label: 'versioned timetable slots' },
  { model: 'substitution', field: 'absentTeacherId', label: 'substitutions (absent)' },
  { model: 'substitution', field: 'substituteId', label: 'substitutions (substitute)' },
  { model: 'leaveApplication', field: 'teacherId', label: 'leave records' },
  { model: 'biometricAttendance', field: 'teacherId', label: 'biometric attendance' },
  { model: 'teacherQualification', field: 'teacherId', label: 'teacher qualifications' },
  { model: 'teacherWorkloadRule', field: 'teacherId', label: 'workload rules' },
  { model: 'teacherAvailabilitySlot', field: 'teacherId', label: 'availability slots' },
  { model: 'substituteReservation', field: 'teacherId', label: 'substitute reservations' },
  { model: 'lessonPlan', field: 'teacherId', label: 'lesson plans' },
  { model: 'teacherNotification', field: 'teacherId', label: 'notifications' },
  { model: 'classSection', field: 'classTeacherId', label: 'class-teacher assignments' },
] as const;

export type MatchReason = 'employeeId' | 'email' | 'phone' | 'name+context';
export type Confidence = 'high' | 'review';

export interface FacultyRow {
  id: string;
  name: string;
  email: string | null;
  employeeId: string | null;
  phone: string | null;
  subject: string;
  subjects: string | null;
  grades: string;
  sections: string | null;
  availability: string;
  role: string;
  schoolId: string | null;
  createdAt: Date;
}

export interface RefCounts {
  total: number;
  byLabel: Record<string, number>;
}

export interface DuplicateGroup {
  key: string;
  matchedOn: MatchReason;
  confidence: Confidence;
  reason: string;
  canonical: FacultyRow;
  canonicalReason: string;
  duplicates: FacultyRow[];
  mergedSubjects: string[];
  mergedGrades: string[];
  mergedSections: string[];
  mergedEmployeeId: string | null;
  mergedEmail: string | null;
  refsToRepoint: RefCounts;
  /** Slots where the merge would put one teacher in two places at once. */
  clashesIntroduced: {
    day: string;
    period: number;
    versionKey: string;
    classes: { grade: string; section: string; subject: string; rowId: string }[];
  }[];
}

export interface CorruptRecord {
  teacher: FacultyRow;
  problems: string[];
  refs: RefCounts;
  resolution: 'needs-manual-review';
  note: string;
}

/** Digits only, last 10 kept, so +91-98765 43210 and 09876543210 compare equal. */
export function normalizePhone(value: unknown): string | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length < 7) return null;
  return digits.slice(-10);
}

/** The single definition of a corrupt faculty record, shared with the
 *  readiness scanner so the two can never report different counts. */
export function isCorrupt(t: FacultyRow): string[] {
  const problems: string[] = [];
  const name = String(t.name ?? '');
  if (looksLikeBinary(name)) problems.push('name is decoded binary');
  else if (looksLikeEmail(name)) problems.push('name is an email address');
  else if (!name.trim()) problems.push('name is empty');
  else if (/^r{3,}$/i.test(name.trim())) problems.push(`placeholder name "${name.trim()}"`);
  if (looksLikeBinary(t.subject)) problems.push('subject is decoded binary');
  else if (looksLikeEmail(t.subject)) problems.push('subject holds an email address');
  return problems;
}

async function countRefs(teacherId: string): Promise<RefCounts> {
  const byLabel: Record<string, number> = {};
  let total = 0;
  for (const ref of TEACHER_REFERENCES) {
    try {
      const model = (db as unknown as Record<string, { count: (a: unknown) => Promise<number> }>)[ref.model];
      if (!model?.count) continue;
      const n = await model.count({ where: { [ref.field]: teacherId } });
      if (n > 0) {
        byLabel[ref.label] = (byLabel[ref.label] ?? 0) + n;
        total += n;
      }
    } catch {
      // A model that does not exist in this deployment is simply skipped.
    }
  }
  return { total, byLabel };
}

function completeness(t: FacultyRow): number {
  let score = 0;
  if (normalizeEmployeeId(t.employeeId)) score += 4;
  if (t.email && !t.email.endsWith('@faculty.local')) score += 3;
  if (normalizePhone(t.phone)) score += 1;
  if (readList(t.subjects ?? t.subject).length) score += 2;
  if (readList(t.grades).length) score += 2;
  if (readList(t.sections).length) score += 1;
  if (t.role !== 'inactive') score += 1;
  if (!isCorrupt(t).length) score += 5;
  return score;
}

/**
 * Pick the record to keep. Preference order: not corrupt, has an employee ID,
 * has a real email, most complete, most referenced, then oldest.
 */
function chooseCanonical(rows: FacultyRow[], refs: Map<string, RefCounts>): { canonical: FacultyRow; reason: string } {
  const scored = rows
    .map((t) => ({
      t,
      corrupt: isCorrupt(t).length > 0,
      complete: completeness(t),
      refs: refs.get(t.id)?.total ?? 0,
    }))
    .sort(
      (a, b) =>
        Number(a.corrupt) - Number(b.corrupt) ||
        b.complete - a.complete ||
        b.refs - a.refs ||
        a.t.createdAt.getTime() - b.t.createdAt.getTime()
    );

  const winner = scored[0];
  const bits: string[] = [];
  if (!winner.corrupt) bits.push('clean record');
  if (normalizeEmployeeId(winner.t.employeeId)) bits.push('has employee ID');
  if (winner.t.email && !winner.t.email.endsWith('@faculty.local')) bits.push('has real email');
  bits.push(`completeness ${winner.complete}`);
  bits.push(`${winner.refs} reference(s)`);
  return { canonical: winner.t, reason: bits.join(', ') };
}

/**
 * Clashes that only become visible once duplicates are merged: two records of
 * the same person each holding a lesson in the same version/day/period.
 */
async function clashesAfterMerge(ids: string[]) {
  const rows = await db.schedule.findMany({
    where: { teacherId: { in: ids } },
    select: { id: true, grade: true, section: true, day: true, period: true, subject: true, timetableVersionId: true },
  });
  const buckets = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = `${r.timetableVersionId ?? 'LEGACY'}|${r.day}|${r.period}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(r);
  }
  return [...buckets.entries()]
    .filter(([, v]) => v.length > 1)
    .map(([key, v]) => {
      const [versionKey, day, period] = key.split('|');
      return {
        day,
        period: Number(period),
        versionKey,
        classes: v.map((r) => ({ grade: r.grade, section: r.section, subject: r.subject, rowId: r.id })),
      };
    });
}

export interface DedupPlan {
  schoolId: string;
  schoolCode: string;
  totalFaculty: number;
  groups: DuplicateGroup[];
  corrupt: CorruptRecord[];
  summary: {
    highConfidenceGroups: number;
    reviewGroups: number;
    recordsToRemove: number;
    referencesToRepoint: number;
    timetableRowsAffected: number;
    clashesIntroduced: number;
  };
}

/**
 * Build the merge plan for one school. Read-only: nothing is written.
 */
export async function buildDedupPlan(schoolId: string): Promise<DedupPlan> {
  const school = await db.school.findUnique({ where: { id: schoolId }, select: { code: true } });
  const teachers = (await db.teacher.findMany({
    where: { schoolId },
    select: {
      id: true, name: true, email: true, employeeId: true, phone: true, subject: true,
      subjects: true, grades: true, sections: true, availability: true, role: true,
      schoolId: true, createdAt: true,
    },
  })) as FacultyRow[];

  const refs = new Map<string, RefCounts>();
  for (const t of teachers) refs.set(t.id, await countRefs(t.id));

  const corruptRows = teachers.filter((t) => isCorrupt(t).length > 0);
  const claimed = new Set<string>();
  const groups: DuplicateGroup[] = [];

  // Buckets, strongest signal first. A record already claimed by a stronger
  // signal is not reconsidered by a weaker one.
  const buckets: { reason: MatchReason; confidence: Confidence; keyOf: (t: FacultyRow) => string | null; describe: (k: string) => string }[] = [
    { reason: 'employeeId', confidence: 'high', keyOf: (t) => normalizeEmployeeId(t.employeeId), describe: (k) => `same employee ID "${k}"` },
    { reason: 'email', confidence: 'high', keyOf: (t) => { const e = normalizeEmail(t.email); return e && !e.endsWith('@faculty.local') ? e : null; }, describe: (k) => `same email "${k}"` },
    { reason: 'phone', confidence: 'review', keyOf: (t) => normalizePhone(t.phone), describe: (k) => `same phone ending ${k.slice(-4)}` },
    { reason: 'name+context', confidence: 'review', keyOf: (t) => normalizeName(t.name) || null, describe: (k) => `same normalised name "${k}"` },
  ];

  for (const bucket of buckets) {
    const map = new Map<string, FacultyRow[]>();
    for (const t of teachers) {
      if (claimed.has(t.id)) continue;
      // A corrupt record is never grouped by a weak signal.
      if (bucket.reason === 'name+context' && isCorrupt(t).length) continue;
      const key = bucket.keyOf(t);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }

    for (const [key, rows] of map) {
      if (rows.length < 2) continue;

      // Different employee IDs mean different people, whatever the name says.
      if (bucket.reason === 'name+context') {
        const ids = new Set(rows.map((r) => normalizeEmployeeId(r.employeeId)).filter(Boolean));
        if (ids.size > 1) continue;
      }

      const { canonical, reason: canonicalReason } = chooseCanonical(rows, refs);
      const duplicates = rows.filter((r) => r.id !== canonical.id);

      // Name matches are only "probable": require overlapping subject or grade
      // context, and still mark them for review rather than auto-merge.
      let confidence: Confidence = bucket.confidence;
      let reason = bucket.describe(key);

      // A shared phone number is only identity evidence when the names agree.
      // Sample and seeded rosters routinely reuse one placeholder number
      // across unrelated staff, and merging on that alone would fuse two
      // different teachers into one record.
      if (bucket.reason === 'phone') {
        const names = new Set(rows.map((r) => normalizeName(r.name)).filter(Boolean));
        if (names.size === 1) {
          confidence = 'high';
          reason += ', and identical names';
        } else {
          reason += `, but ${names.size} different names (${[...names].join(' / ')}) - likely a shared or placeholder number`;
        }
      }
      if (bucket.reason === 'name+context') {
        const ctx = (t: FacultyRow) => new Set([...readList(t.subjects ?? t.subject), ...readList(t.grades)].map((x) => x.toLowerCase()));
        const canonCtx = ctx(canonical);
        const overlaps = duplicates.some((d) => [...ctx(d)].some((x) => canonCtx.has(x)));
        reason += overlaps ? ', overlapping subject/grade context' : ', no overlapping context';
        confidence = 'review';
      }

      const all = [canonical, ...duplicates];
      const byLabel: Record<string, number> = {};
      let total = 0;
      for (const d of duplicates) {
        const r = refs.get(d.id)!;
        total += r.total;
        for (const [k, v] of Object.entries(r.byLabel)) byLabel[k] = (byLabel[k] ?? 0) + v;
      }

      groups.push({
        key,
        matchedOn: bucket.reason,
        confidence,
        reason,
        canonical,
        canonicalReason,
        duplicates,
        mergedSubjects: all.reduce<string[]>((acc, t) => mergeLists(acc, readList(t.subjects ?? t.subject)), []),
        mergedGrades: all.reduce<string[]>((acc, t) => mergeLists(acc, readList(t.grades)), []),
        mergedSections: all.reduce<string[]>((acc, t) => mergeLists(acc, readList(t.sections)), []),
        mergedEmployeeId: all.map((t) => normalizeEmployeeId(t.employeeId)).find(Boolean) ?? null,
        mergedEmail: all.map((t) => normalizeEmail(t.email)).find((e) => e && !e.endsWith('@faculty.local')) ?? canonical.email,
        refsToRepoint: { total, byLabel },
        clashesIntroduced: await clashesAfterMerge(all.map((t) => t.id)),
      });

      for (const r of rows) claimed.add(r.id);
    }
  }

  const corrupt: CorruptRecord[] = corruptRows
    .filter((t) => !claimed.has(t.id))
    .map((t) => {
      const r = refs.get(t.id)!;
      return {
        teacher: t,
        problems: isCorrupt(t),
        refs: r,
        resolution: 'needs-manual-review' as const,
        note: r.total > 0
          ? `Holds ${r.total} reference(s); those must be reassigned to a real faculty member before this record can be removed.`
          : 'Holds no references, so it can be removed once you confirm it is not a real teacher.',
      };
    });

  return {
    schoolId,
    schoolCode: school?.code?.trim() ?? schoolId,
    totalFaculty: teachers.length,
    groups,
    corrupt,
    summary: {
      highConfidenceGroups: groups.filter((g) => g.confidence === 'high').length,
      reviewGroups: groups.filter((g) => g.confidence === 'review').length,
      recordsToRemove: groups.filter((g) => g.confidence === 'high').reduce((n, g) => n + g.duplicates.length, 0),
      referencesToRepoint: groups.filter((g) => g.confidence === 'high').reduce((n, g) => n + g.refsToRepoint.total, 0),
      timetableRowsAffected: groups
        .filter((g) => g.confidence === 'high')
        .reduce((n, g) => n + (g.refsToRepoint.byLabel['timetable rows'] ?? 0), 0),
      clashesIntroduced: groups.filter((g) => g.confidence === 'high').reduce((n, g) => n + g.clashesIntroduced.length, 0),
    },
  };
}

export interface MergeOutcome {
  groupKey: string;
  canonicalId: string;
  canonicalName: string;
  removedIds: string[];
  repointed: Record<string, number>;
  skippedDuplicateRows: number;
}

/**
 * Execute one merge group.
 *
 * References are repointed first and the duplicate is only deleted once nothing
 * points at it, so history is never orphaned. Where repointing would violate a
 * uniqueness constraint (the same person already has that exact slot), the
 * redundant row is removed instead of being duplicated onto the canonical id.
 */
export async function executeMerge(group: DuplicateGroup): Promise<MergeOutcome> {
  const canonicalId = group.canonical.id;
  const repointed: Record<string, number> = {};
  let skipped = 0;

  for (const dup of group.duplicates) {
    for (const ref of TEACHER_REFERENCES) {
      const model = (db as unknown as Record<string, any>)[ref.model];
      if (!model?.updateMany) continue;
      try {
        const res = await model.updateMany({
          where: { [ref.field]: dup.id },
          data: { [ref.field]: canonicalId },
        });
        if (res.count) repointed[ref.label] = (repointed[ref.label] ?? 0) + res.count;
      } catch {
        // A unique constraint means the canonical record already holds an
        // equivalent row. Move them one at a time and drop the redundant ones.
        const rows = await model.findMany({ where: { [ref.field]: dup.id }, select: { id: true } });
        for (const row of rows) {
          try {
            await model.update({ where: { id: row.id }, data: { [ref.field]: canonicalId } });
            repointed[ref.label] = (repointed[ref.label] ?? 0) + 1;
          } catch {
            await model.delete({ where: { id: row.id } }).catch(() => null);
            skipped++;
          }
        }
      }
    }
  }

  // Merge the profile onto the canonical record, never overwriting a good value
  // with an empty or corrupt one.
  await db.teacher.update({
    where: { id: canonicalId },
    data: {
      subject: group.mergedSubjects[0] ?? group.canonical.subject,
      subjects: JSON.stringify(group.mergedSubjects),
      grades: JSON.stringify(group.mergedGrades),
      sections: JSON.stringify(group.mergedSections),
      ...(group.mergedEmployeeId ? { employeeId: group.mergedEmployeeId } : {}),
      ...(group.mergedEmail ? { email: group.mergedEmail } : {}),
    },
  });

  // Verify nothing still points at the duplicates before deleting them.
  const removed: string[] = [];
  for (const dup of group.duplicates) {
    const still = await countRefs(dup.id);
    if (still.total > 0) continue;
    await db.teacher.delete({ where: { id: dup.id } }).catch(() => null);
    removed.push(dup.id);
  }

  return {
    groupKey: group.key,
    canonicalId,
    canonicalName: group.canonical.name,
    removedIds: removed,
    repointed,
    skippedDuplicateRows: skipped,
  };
}
