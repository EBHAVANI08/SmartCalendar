import { db } from '@/lib/db';
import { getDayConfig } from '@/lib/timetable-config';
import { isPeriodWithinDay, periodsForDay, workingDayNames } from '@/lib/timetable-constraints';
import { isCorrupt, buildDedupPlan } from '@/lib/faculty-dedup';
import { isLegacyRoomString } from '@/lib/room-types';
import { scanQualificationReadiness } from '@/lib/qualification-readiness';

/**
 * Migration issues: what stops a legacy timetable row becoming part of a
 * validated, versioned timetable.
 *
 * These are deliberately a distinct concept from ordinary timetable warnings.
 * A warning says "this is worth a look on a timetable you are already running".
 * A migration issue says "this row cannot cross into the new architecture until
 * a person decides something". They share the `ValidationIssue` table but never
 * the same reader, so day-to-day warnings do not drown out migration blockers.
 *
 * STRICTLY READ-ONLY. Nothing here writes, moves or deletes a single row.
 */

export const MIGRATION_ISSUE_CODES = [
  'TEACHER_CLASH',
  'CLASS_CLASH',
  'CORRUPT_FACULTY',
  'DUPLICATE_FACULTY_REVIEW',
  'SUBJECT_NOT_CONFIGURED',
  'TEACHER_NOT_MAPPED',
  'PERIOD_OUT_OF_RANGE',
  'NON_WORKING_DAY',
  'LEGACY_ROOM_UNMAPPED',
  'TEACHER_QUALIFICATION_REVIEW',
  'ORPHAN_REFERENCE',
  'UNKNOWN',
] as const;

export type MigrationIssueCode = (typeof MIGRATION_ISSUE_CODES)[number];

/** blocker = the row cannot transfer. review = it transfers, but confirm it. */
export type MigrationSeverity = 'blocker' | 'review';

export const ISSUE_SEVERITY: Record<MigrationIssueCode, MigrationSeverity> = {
  TEACHER_CLASH: 'blocker',
  CLASS_CLASH: 'blocker',
  CORRUPT_FACULTY: 'blocker',
  PERIOD_OUT_OF_RANGE: 'blocker',
  NON_WORKING_DAY: 'blocker',
  ORPHAN_REFERENCE: 'blocker',
  DUPLICATE_FACULTY_REVIEW: 'review',
  SUBJECT_NOT_CONFIGURED: 'review',
  TEACHER_NOT_MAPPED: 'review',
  LEGACY_ROOM_UNMAPPED: 'review',
  TEACHER_QUALIFICATION_REVIEW: 'review',
  UNKNOWN: 'review',
};

export const SUGGESTED_ACTION: Record<MigrationIssueCode, string> = {
  TEACHER_CLASH: 'Reassign one of the clashing periods in Timetable Studio, or leave it unallocated.',
  CLASS_CLASH: 'Remove the duplicate lesson for that class and period.',
  CORRUPT_FACULTY: 'Repair the record, or map it to real faculty in Faculty Directory → Data Issues.',
  DUPLICATE_FACULTY_REVIEW: 'Confirm or reject the duplicate group in Faculty Directory → Review Duplicate Faculty.',
  SUBJECT_NOT_CONFIGURED: 'Add the subject in Subject Management, or change the lesson to a configured subject.',
  TEACHER_NOT_MAPPED: 'Map the teacher to this subject, or assign a qualified teacher.',
  PERIOD_OUT_OF_RANGE: 'Move the lesson into a configured period, or extend that day in Day & Period Setup.',
  NON_WORKING_DAY: 'Add the day in Day & Period Setup, or move the lesson.',
  LEGACY_ROOM_UNMAPPED: 'Map the legacy room value to a real room, or leave the room unassigned.',
  TEACHER_QUALIFICATION_REVIEW: 'Confirm which grades this teacher covers for each subject.',
  ORPHAN_REFERENCE: 'Repoint the reference to existing faculty before migrating.',
  UNKNOWN: 'Review manually.',
};

export interface MigrationIssue {
  code: MigrationIssueCode;
  severity: MigrationSeverity;
  message: string;
  /** How many timetable rows this single issue affects. */
  affectedRows: number;
  grade?: string | null;
  section?: string | null;
  day?: string | null;
  period?: number | null;
  subject?: string | null;
  teacherId?: string | null;
  teacherName?: string | null;
  /** The legacy value at the heart of the issue, e.g. a synthetic room string. */
  legacyValue?: string | null;
  suggestedAction: string;
  /** Always 'open' in preview mode; resolution tracking arrives with execution. */
  status: 'open';
}

export interface UpgradePreview {
  schoolId: string;
  generatedAt: string;
  /** Rows considered — the legacy, unversioned timetable. */
  totalRows: number;
  /** Rows that would transfer into a clean draft as-is. */
  transferable: number;
  /** Rows held back because a blocker touches them. */
  blocked: number;
  /** Rows that would transfer but carry something to confirm. */
  withReview: number;
  issues: MigrationIssue[];
  countsByCode: Record<string, number>;
  blockerCount: number;
  reviewCount: number;
  canCreateCleanRevision: boolean;
}

/**
 * Build the preview for "Upgrade Existing Timetable".
 *
 * Nothing is created. This answers: if you chose Option 2 right now, which rows
 * would move, which would be held back, and why.
 */
export async function buildUpgradePreview(schoolId: string): Promise<UpgradePreview> {
  const [rows, config, teachers, subjectConfigs, rooms] = await Promise.all([
    db.schedule.findMany({
      where: {
        schoolId,
        OR: [{ timetableVersionId: null }, { timetableVersionId: { isSet: false } }],
      },
      select: {
        id: true, grade: true, section: true, day: true, period: true,
        subject: true, teacherId: true, roomId: true,
      },
    }),
    getDayConfig(schoolId),
    db.teacher.findMany({
      where: { schoolId },
      select: {
        id: true, name: true, email: true, employeeId: true, phone: true, subject: true,
        subjects: true, grades: true, sections: true, role: true, availability: true,
        schoolId: true, createdAt: true,
      },
    }),
    db.gradeSubjectConfig.findMany({ where: { schoolId }, select: { grade: true, subjectName: true, active: true } }).catch(() => []),
    db.room.findMany({ where: { schoolId }, select: { id: true } }),
  ]);

  const issues: MigrationIssue[] = [];
  const blockedRowIds = new Set<string>();
  const reviewRowIds = new Set<string>();

  const teacherById = new Map(teachers.map((t) => [t.id, t]));
  const corruptIds = new Set(teachers.filter((t) => isCorrupt(t).length > 0).map((t) => t.id));
  const workingDays = new Set(workingDayNames(config) as string[]);
  const roomIds = new Set(rooms.map((r) => r.id));

  const configuredByGrade = new Map<string, Set<string>>();
  for (const c of subjectConfigs) {
    if (c.active === false) continue;
    const set = configuredByGrade.get(c.grade) ?? new Set<string>();
    set.add(c.subjectName.toLowerCase());
    configuredByGrade.set(c.grade, set);
  }
  const schoolConfiguresSubjects = configuredByGrade.size > 0;

  const teacherSubjects = (t: { subjects?: string | null; subject?: string | null }) => {
    const raw = t.subjects || t.subject || '';
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x).toLowerCase());
    } catch { /* legacy single value */ }
    return raw ? [String(raw).toLowerCase()] : [];
  };

  const push = (code: MigrationIssueCode, partial: Omit<MigrationIssue, 'code' | 'severity' | 'suggestedAction' | 'status'>) => {
    issues.push({
      code,
      severity: ISSUE_SEVERITY[code],
      suggestedAction: SUGGESTED_ACTION[code],
      status: 'open',
      ...partial,
    });
  };

  const mark = (code: MigrationIssueCode, ids: string[]) => {
    const target = ISSUE_SEVERITY[code] === 'blocker' ? blockedRowIds : reviewRowIds;
    for (const id of ids) target.add(id);
  };

  // ── Per-row checks ────────────────────────────────────────────────────────
  const teacherSlots = new Map<string, typeof rows>();
  const classSlots = new Map<string, typeof rows>();
  const legacyRooms = new Map<string, typeof rows>();

  for (const r of rows) {
    const t = r.teacherId ? teacherById.get(r.teacherId) : null;
    const ctx = {
      grade: r.grade, section: r.section, day: r.day, period: r.period, subject: r.subject,
      teacherId: r.teacherId, teacherName: t?.name ?? null,
    };

    if (!workingDays.has(r.day)) {
      push('NON_WORKING_DAY', { ...ctx, affectedRows: 1, legacyValue: r.day, message: `${r.day} is not a working day in Day & Period Setup.` });
      mark('NON_WORKING_DAY', [r.id]);
    } else if (!isPeriodWithinDay(r.day, r.period, config)) {
      push('PERIOD_OUT_OF_RANGE', {
        ...ctx, affectedRows: 1, legacyValue: `${r.day} P${r.period}`,
        message: `${r.day} is configured for ${periodsForDay(r.day, config)} period(s); this lesson is at period ${r.period}.`,
      });
      mark('PERIOD_OUT_OF_RANGE', [r.id]);
    }

    if (r.teacherId && !t) {
      push('ORPHAN_REFERENCE', { ...ctx, affectedRows: 1, legacyValue: r.teacherId, message: 'This period points at a faculty record that no longer exists.' });
      mark('ORPHAN_REFERENCE', [r.id]);
    } else if (r.teacherId && corruptIds.has(r.teacherId)) {
      push('CORRUPT_FACULTY', { ...ctx, affectedRows: 1, legacyValue: String(t?.name ?? '').slice(0, 24), message: 'This period is taught by a corrupt faculty record.' });
      mark('CORRUPT_FACULTY', [r.id]);
    } else if (t) {
      const subs = teacherSubjects(t);
      if (subs.length && !subs.includes(r.subject.toLowerCase())) {
        push('TEACHER_NOT_MAPPED', { ...ctx, affectedRows: 1, message: `${t.name} is not mapped to ${r.subject}.` });
        mark('TEACHER_NOT_MAPPED', [r.id]);
      }
    }

    if (schoolConfiguresSubjects) {
      const set = configuredByGrade.get(r.grade);
      if (!set || !set.has(r.subject.toLowerCase())) {
        push('SUBJECT_NOT_CONFIGURED', { ...ctx, affectedRows: 1, legacyValue: r.subject, message: `"${r.subject}" is not configured for ${r.grade}.` });
        mark('SUBJECT_NOT_CONFIGURED', [r.id]);
      }
    }

    if (r.roomId && isLegacyRoomString(r.roomId) && !roomIds.has(r.roomId)) {
      legacyRooms.set(r.roomId, [...(legacyRooms.get(r.roomId) ?? []), r]);
    }

    if (r.teacherId) {
      const k = `${r.teacherId}|${r.day}|${r.period}`;
      teacherSlots.set(k, [...(teacherSlots.get(k) ?? []), r]);
    }
    const ck = `${r.grade}|${r.section}|${r.day}|${r.period}`;
    classSlots.set(ck, [...(classSlots.get(ck) ?? []), r]);
  }

  // ── Clashes, by canonical teacher id ──────────────────────────────────────
  for (const [key, group] of teacherSlots) {
    if (group.length < 2) continue;
    const [teacherId, day, period] = key.split('|');
    push('TEACHER_CLASH', {
      affectedRows: group.length,
      grade: group[0].grade, section: group[0].section, day, period: Number(period),
      subject: group[0].subject, teacherId, teacherName: teacherById.get(teacherId)?.name ?? null,
      legacyValue: group.map((g) => `${g.grade} ${g.section}`).join(' + '),
      message: `${teacherById.get(teacherId)?.name ?? 'This teacher'} is assigned to ${group.length} classes in ${day} period ${period}.`,
    });
    mark('TEACHER_CLASH', group.map((g) => g.id));
  }

  for (const [key, group] of classSlots) {
    if (group.length < 2) continue;
    const [grade, section, day, period] = key.split('|');
    push('CLASS_CLASH', {
      affectedRows: group.length,
      grade, section, day, period: Number(period), subject: group[0].subject,
      teacherId: group[0].teacherId, teacherName: group[0].teacherId ? teacherById.get(group[0].teacherId)?.name ?? null : null,
      legacyValue: group.map((g) => g.subject).join(' + '),
      message: `${grade} ${section} has ${group.length} lessons in ${day} period ${period}.`,
    });
    mark('CLASS_CLASH', group.map((g) => g.id));
  }

  // ── Legacy room strings, grouped by value ─────────────────────────────────
  for (const [value, group] of legacyRooms) {
    push('LEGACY_ROOM_UNMAPPED', {
      affectedRows: group.length,
      grade: group[0].grade, section: group[0].section, day: null, period: null,
      subject: null, teacherId: null, teacherName: null,
      legacyValue: value,
      message: `"${value}" is a generator-invented room string, not a room record. It appears on ${group.length} period(s).`,
    });
    mark('LEGACY_ROOM_UNMAPPED', group.map((g) => g.id));
  }

  // ── School-level issues, not tied to one row ──────────────────────────────
  try {
    const plan = await buildDedupPlan(schoolId);
    for (const g of plan.groups.filter((x) => x.confidence === 'review')) {
      push('DUPLICATE_FACULTY_REVIEW', {
        affectedRows: 0, grade: null, section: null, day: null, period: null,
        subject: null, teacherId: null, teacherName: null, legacyValue: g.key,
        message: `Possible duplicate faculty group "${g.key}" needs a human decision before identities are merged.`,
      });
    }
  } catch { /* best effort in a read-only preview */ }

  const qual = await scanQualificationReadiness(schoolId);
  for (const p of qual.plans.filter((x) => x.classification === 'AMBIGUOUS' || x.undeclaredSubjects.length > 0)) {
    push('TEACHER_QUALIFICATION_REVIEW', {
      affectedRows: 0, grade: null, section: null, day: null, period: null,
      subject: null, teacherId: p.teacherId, teacherName: p.teacherName,
      legacyValue: p.declaredSubjects.join(', '),
      message: p.undeclaredSubjects.length
        ? `${p.teacherName} is scheduled to teach ${p.undeclaredSubjects.slice(0, 4).join(', ')} but is only mapped to ${p.declaredSubjects.join(', ')}.`
        : p.reason,
    });
  }

  const countsByCode: Record<string, number> = {};
  for (const i of issues) countsByCode[i.code] = (countsByCode[i.code] ?? 0) + 1;

  const reviewOnly = new Set([...reviewRowIds].filter((id) => !blockedRowIds.has(id)));

  return {
    schoolId,
    generatedAt: new Date().toISOString(),
    totalRows: rows.length,
    transferable: rows.length - blockedRowIds.size,
    blocked: blockedRowIds.size,
    withReview: reviewOnly.size,
    issues,
    countsByCode,
    blockerCount: issues.filter((i) => i.severity === 'blocker').length,
    reviewCount: issues.filter((i) => i.severity === 'review').length,
    // A clean revision is worth offering as soon as anything at all would move.
    canCreateCleanRevision: rows.length > 0 && rows.length - blockedRowIds.size > 0,
  };
}
