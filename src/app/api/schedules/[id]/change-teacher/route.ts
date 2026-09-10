export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { readList, teacherTeachesSection } from '@/lib/faculty';
import { getTenantSchoolId } from '@/lib/school-helper';
import { getDayConfig } from '@/lib/timetable-config';
import { checkSlotConflicts, isPeriodWithinDay } from '@/lib/timetable-constraints';
import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/authz';

type Ctx = { params: Promise<{ id: string }> };

/** Versions whose rows must not be edited in place. */
const LOCKED_STATUSES = ['approved', 'published', 'archived', 'superseded'];

async function loadSlot(id: string, schoolId: string) {
  const slot = await db.schedule.findFirst({ where: { id, schoolId } });
  if (!slot) return { slot: null, version: null };
  const version = slot.timetableVersionId
    ? await db.timetableVersion.findUnique({ where: { id: slot.timetableVersionId } }).catch(() => null)
    : null;
  return { slot, version };
}

/**
 * GET - candidate teachers for this slot.
 *
 * Returns everyone in the school with the facts an Admin needs to choose:
 * subjects, grades, whether they are free in this period, and their workload.
 * Unqualified and conflicting teachers are still listed, but flagged, so the
 * UI can show them greyed out rather than pretending they do not exist.
 */
function matchesSubject(teacherSubjects: string[], targetSubject: string): boolean {
  if (!targetSubject) return false;
  const target = targetSubject.trim().toLowerCase();
  return teacherSubjects.some((s) => {
    const clean = s.trim().toLowerCase();
    return clean === target || clean.replace(/\s+/g, '') === target.replace(/\s+/g, '');
  });
}

function matchesGrade(teacherGrades: string[], targetGrade: string): boolean {
  if (!teacherGrades || teacherGrades.length === 0) return false;
  const target = targetGrade.trim().toLowerCase();
  const targetNum = target.replace(/[^0-9]/g, '');
  return teacherGrades.some((g) => {
    const clean = g.trim().toLowerCase();
    if (clean === target) return true;
    const gNum = clean.replace(/[^0-9]/g, '');
    if (targetNum && gNum && gNum === targetNum) return true;
    if (clean === target.replace('grade ', '') || `grade ${clean}` === target) return true;
    return false;
  });
}

function matchesSection(teacherSections: unknown, targetSection: string, targetGrade?: string, targetSubject?: string): boolean {
  if (targetGrade) {
    return teacherTeachesSection(teacherSections, targetGrade, targetSection, targetSubject);
  }
  return teacherTeachesSection(teacherSections, '', targetSection, targetSubject);
}

export async function GET(request: Request, ctx: Ctx) {
  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const { slot, version } = await loadSlot(id, schoolId);
  if (!slot) return NextResponse.json({ error: 'Timetable slot not found.' }, { status: 404 });

  const [teachers, dayRows] = await Promise.all([
    db.teacher.findMany({
      where: { schoolId },
      select: { id: true, name: true, subject: true, subjects: true, grades: true, sections: true, role: true },
    }),
    db.schedule.findMany({
      where: { schoolId, day: slot.day },
      select: { id: true, teacherId: true, period: true, grade: true, section: true, subject: true },
    }),
  ]);

  const busyHere = new Map<string, { grade: string; section: string; subject: string }>();
  const dailyLoad = new Map<string, number>();
  for (const row of dayRows) {
    if (!row.teacherId) continue;
    dailyLoad.set(row.teacherId, (dailyLoad.get(row.teacherId) || 0) + 1);
    if (row.period === slot.period && row.id !== id) {
      busyHere.set(row.teacherId, { grade: row.grade, section: row.section, subject: row.subject });
    }
  }

  const candidates = teachers.map((t) => {
    const subjects = readList(t.subjects ?? t.subject);
    const grades = readList(t.grades);
    const sections = readList(t.sections);
    const conflict = busyHere.get(t.id) || null;
    const qualifiedSubject = matchesSubject(subjects, slot.subject);
    const qualifiedGrade = matchesGrade(grades, slot.grade);
    const qualifiedSection = matchesSection(sections, slot.section, slot.grade, slot.subject);
    const fullyQualified = qualifiedSubject && qualifiedGrade && qualifiedSection;
    const inactive = t.role === 'inactive';
    return {
      id: t.id,
      name: t.name,
      subjects,
      grades,
      sections,
      inactive,
      qualifiedSubject,
      qualifiedGrade,
      qualifiedSection,
      fullyQualified,
      available: !conflict && !inactive && fullyQualified,
      conflict,
      dailyWorkload: dailyLoad.get(t.id) || 0,
      isCurrent: t.id === slot.teacherId,
      // Higher is a better suggestion; negatives are not assignable automatically.
      score:
        (fullyQualified ? 200 : -200) +
        (qualifiedSubject ? 100 : -100) +
        (qualifiedGrade ? 50 : -100) +
        (qualifiedSection ? 50 : -100) +
        (conflict || inactive ? -1000 : 0) -
        (dailyLoad.get(t.id) || 0) * 2,
    };
  });

  candidates.sort((a, b) => b.score - a.score);

  return NextResponse.json({
    success: true,
    slot: {
      id: slot.id,
      grade: slot.grade,
      section: slot.section,
      day: slot.day,
      period: slot.period,
      subject: slot.subject,
      teacherId: slot.teacherId,
    },
    version: version
      ? { id: version.id, name: version.name, version: version.version, status: version.status }
      : null,
    editable: !version || !LOCKED_STATUSES.includes(version.status),
    lockReason:
      version && LOCKED_STATUSES.includes(version.status)
        ? `This slot belongs to a ${version.status} timetable (v${version.version}). Create a revision to change it.`
        : null,
    recommended: candidates.filter((c) => c.available && c.fullyQualified && !c.isCurrent).slice(0, 10),
    candidates,
  });
}

/**
 * POST - change the teacher on this slot.
 *
 * Runs the same shared constraint service the generator uses. A busy teacher
 * is always blocked. A teacher who is not mapped to the subject is refused
 * unless the caller passes an explicit manualOverride, which is recorded in
 * the audit log.
 */
export async function POST(request: Request, ctx: Ctx) {
  const denied = requireCapability(request, 'timetable.write');
  if (denied) return denied;

  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const teacherId = body.teacherId ? String(body.teacherId) : null;
  const manualOverride = body.manualOverride === true;

  const { slot, version } = await loadSlot(id, schoolId);
  if (!slot) return NextResponse.json({ error: 'Timetable slot not found.' }, { status: 404 });

  // A published or approved timetable is not edited in place.
  if (version && LOCKED_STATUSES.includes(version.status)) {
    return NextResponse.json(
      {
        error: `This timetable is ${version.status} (v${version.version}) and cannot be edited directly. Create a revision, change it there, then approve and publish.`,
        code: 'VERSION_LOCKED',
        versionId: version.id,
        status: version.status,
      },
      { status: 409 }
    );
  }

  const config = await getDayConfig(schoolId);
  if (config.configured && !isPeriodWithinDay(slot.day, slot.period, config)) {
    return NextResponse.json(
      {
        error: `${slot.day} is not configured for period ${slot.period}.`,
        code: 'PERIOD_OUT_OF_RANGE',
      },
      { status: 409 }
    );
  }

  const teacher = teacherId
    ? await db.teacher.findFirst({ where: { id: teacherId, schoolId } })
    : null;
  if (teacherId && !teacher) {
    return NextResponse.json({ error: 'That teacher does not belong to this school.' }, { status: 404 });
  }

  // Hard constraints - identical to generation and substitution.
  const check = await checkSlotConflicts({
    schoolId,
    grade: slot.grade,
    section: slot.section,
    day: slot.day,
    period: slot.period,
    teacherId,
    timetableVersionId: slot.timetableVersionId,
    ignoreScheduleId: id,
    config: config.configured ? config : undefined,
  });

  if (!check.ok) {
    return NextResponse.json(
      { error: check.message, code: check.code, conflictWith: check.conflictWith },
      { status: 409 }
    );
  }

  // Faculty Directory qualification - refused unless explicitly overridden.
  let overrideApplied = false;
  if (teacher) {
    const subjects = readList(teacher.subjects ?? teacher.subject);
    const grades = readList(teacher.grades);
    const sections = readList(teacher.sections);

    const qualifiedSubject = matchesSubject(subjects, slot.subject);
    const qualifiedGrade = matchesGrade(grades, slot.grade);
    const qualifiedSection = matchesSection(teacher.sections, slot.section, slot.grade, slot.subject);

    if (!qualifiedSubject || !qualifiedGrade || !qualifiedSection) {
      const issues: string[] = [];
      if (!qualifiedSubject) issues.push(`subject '${slot.subject}' (teaches: ${subjects.join(', ') || 'None'})`);
      if (!qualifiedGrade) issues.push(`grade '${slot.grade}' (assigned grades: ${grades.join(', ') || 'None'})`);
      if (!qualifiedSection) issues.push(`section '${slot.section}' (assigned sections: ${sections.join(', ')})`);

      if (!manualOverride) {
        return NextResponse.json(
          {
            error: `${teacher.name} is not mapped in Faculty Directory for ${issues.join('; ')}. Continue with manual override?`,
            code: 'NOT_QUALIFIED',
            requiresOverride: true,
            teacher: { id: teacher.id, name: teacher.name, subjects, grades, sections },
            subject: slot.subject,
            issues,
          },
          { status: 409 }
        );
      }
      overrideApplied = true;
    }
  }

  const previousTeacherId = slot.teacherId;
  const updated = await db.schedule.update({
    where: { id },
    data: { teacherId },
  });

  const previous = previousTeacherId
    ? await db.teacher.findUnique({ where: { id: previousTeacherId }, select: { name: true } }).catch(() => null)
    : null;

  await db.auditLog
    .create({
      data: {
        schoolId,
        actorId: request.headers.get('x-user-id') || 'unknown',
        actorRole: request.headers.get('x-user-role') || 'unknown',
        action: overrideApplied ? 'timetable.change_teacher.override' : 'timetable.change_teacher',
        entityType: 'Schedule',
        entityId: id,
        before: { teacherId: previousTeacherId, teacherName: previous?.name ?? null },
        after: { teacherId, teacherName: teacher?.name ?? null },
        reason: overrideApplied
          ? `Manual override: ${teacher?.name} is not mapped to ${slot.subject}.${body.overrideReason ? ' ' + String(body.overrideReason) : ''}`
          : body.reason ? String(body.reason) : null,
      },
    })
    .catch(() => null);

  return NextResponse.json({
    success: true,
    message: teacher
      ? `${slot.grade} ${slot.section} ${slot.day} P${slot.period} ${slot.subject} reassigned to ${teacher.name}.`
      : `Teacher cleared from ${slot.grade} ${slot.section} ${slot.day} P${slot.period}.`,
    manualOverride: overrideApplied,
    slot: updated,
  });
}
