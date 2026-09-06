import { db } from '@/lib/db';
import { getDayConfig } from '@/lib/timetable-config';
import { periodsForDay, workingDayNames } from '@/lib/timetable-constraints';
import { readList } from '@/lib/faculty';
import { buildDedupPlan, isCorrupt } from '@/lib/faculty-dedup';
import { isKnownRoomType, isLegacyRoomString, suggestRoomType } from '@/lib/room-types';
import { scanTimetable } from '@/lib/timetable-validation';
import { scanQualificationReadiness } from '@/lib/qualification-readiness';
import { operationalScheduleFilter } from '@/lib/timetable-lifecycle';

/**
 * Legacy Data Readiness.
 *
 * STRICTLY READ-ONLY. Nothing in this file writes, updates or deletes. It looks
 * at a tenant as it stands and says what could migrate safely, what a person has
 * to decide, and what is blocked.
 *
 * The classification is the whole point:
 *
 *   READY            already in the target shape, nothing to do
 *   AUTO_MIGRATABLE  deterministic mapping, no ambiguity  (class A)
 *   NEEDS_REVIEW     a mapping can be suggested, not decided  (class B)
 *   BLOCKED          ambiguous, corrupt or conflicting  (class C)
 *
 * A tenant that has been running for a year is a first-class case here, not an
 * afterthought. "This only applies to new schools" is not an answer.
 */

export type Readiness = 'READY' | 'AUTO_MIGRATABLE' | 'NEEDS_REVIEW' | 'BLOCKED';

export interface AreaReport {
  area: string;
  status: Readiness;
  count: number;
  reason: string;
  /** Concrete examples, capped, so the Admin can see what is meant. */
  samples?: string[];
}

export interface ReadinessReport {
  schoolId: string;
  schoolName: string;
  generatedAt: string;
  areas: AreaReport[];
  summary: Record<Readiness, number>;
}

const sample = <T>(items: T[], n = 5) => items.slice(0, n);

export async function scanLegacyReadiness(schoolId: string): Promise<ReadinessReport> {
  const school = await db.school.findUnique({
    where: { id: schoolId },
    select: { id: true, name: true, code: true, phone: true, board: true, address: true },
  });
  if (!school) throw new Error('School not found');

  const areas: AreaReport[] = [];
  const add = (a: AreaReport) => areas.push(a);

  const [
    teachers, schedules, versions, rooms, leaves, substitutions,
    attendance, calendarEvents, lessonPlans, qualifications, subjectConfigs, dayConfig,
  ] = await Promise.all([
    db.teacher.findMany({
      where: { schoolId },
      // Full shape, so the shared isCorrupt() can be reused verbatim.
      select: { id: true, name: true, email: true, employeeId: true, phone: true, subject: true, subjects: true, grades: true, sections: true, role: true, availability: true, schoolId: true, createdAt: true },
    }),
    db.schedule.findMany({
      where: { schoolId },
      select: { id: true, grade: true, section: true, day: true, period: true, subject: true, teacherId: true, roomId: true, timetableVersionId: true },
    }),
    db.timetableVersion.findMany({ where: { schoolId }, select: { id: true, name: true, status: true } }),
    db.room.findMany({ where: { schoolId }, select: { id: true, code: true, name: true, type: true } }),
    db.leaveApplication.findMany({ where: { teacher: { schoolId } }, select: { id: true, status: true, teacherId: true, startDate: true, endDate: true } }).catch(() => []),
    db.substitution.findMany({
      where: { schoolId, absentTeacher: { schoolId } },
      select: { id: true, absentTeacherId: true, substituteId: true, scheduleId: true, date: true, absentTeacher: { select: { schoolId: true } }, substitute: { select: { schoolId: true } } },
    }).catch(() => []),
    db.biometricAttendance.count({ where: { teacher: { schoolId } } }).catch(() => 0),
    db.calendarEvent.count({ where: { schoolId } }).catch(() => 0),
    db.lessonPlan.count({ where: { teacher: { schoolId } } }).catch(() => 0),
    db.teacherQualification.count({ where: { schoolId } }).catch(() => 0),
    db.gradeSubjectConfig.findMany({ where: { schoolId }, select: { grade: true, subjectName: true, active: true, requiredRoomType: true } }).catch(() => []),
    getDayConfig(schoolId),
  ]);

  const teacherById = new Map(teachers.map((t) => [t.id, t]));

  // ── School profile ────────────────────────────────────────────────────────
  const missingProfile = [
    school.phone ? null : 'phone',
    school.board ? null : 'board',
    school.address ? null : 'address',
  ].filter(Boolean) as string[];
  add({
    area: 'School profile',
    status: missingProfile.length ? 'NEEDS_REVIEW' : 'READY',
    count: missingProfile.length,
    reason: missingProfile.length
      ? `Missing ${missingProfile.join(', ')}. Optional fields an Admin fills in; nothing blocks on them.`
      : 'Complete.',
  });

  // ── Faculty ───────────────────────────────────────────────────────────────
  const active = teachers.filter((t) => t.role !== 'inactive');
  add({
    area: 'Faculty records',
    status: teachers.length ? 'READY' : 'NEEDS_REVIEW',
    count: teachers.length,
    reason: teachers.length
      ? `${active.length} active, ${teachers.length - active.length} deactivated.`
      : 'No faculty yet.',
  });

  // ── Corrupt faculty ───────────────────────────────────────────────────────
  // Uses the same isCorrupt() the Data Issues panel uses, so the counts agree.
  const corrupt = teachers.filter((t) => isCorrupt(t).length > 0);
  add({
    area: 'Corrupt faculty records',
    status: corrupt.length ? 'BLOCKED' : 'READY',
    count: corrupt.length,
    reason: corrupt.length
      ? 'Unreadable name or subject, most likely a spreadsheet parsed as raw bytes. Repair or remap each one by hand; never auto-migrate.'
      : 'None found.',
    samples: sample(corrupt.map((t) => `${t.id} · ${isCorrupt(t).join(', ')} · ${JSON.stringify(String(t.name).slice(0, 20))}`)),
  });

  // ── Employee IDs ──────────────────────────────────────────────────────────
  const noEmpId = teachers.filter((t) => !t.employeeId?.trim());
  add({
    area: 'Employee IDs',
    status: noEmpId.length === 0 ? 'READY' : 'NEEDS_REVIEW',
    count: noEmpId.length,
    reason: noEmpId.length
      ? `${noEmpId.length} of ${teachers.length} faculty have no employee ID. Duplicate detection falls back to email, then normalised name.`
      : 'Every faculty record has an employee ID.',
  });

  // ── Faculty emails ────────────────────────────────────────────────────────
  const synthetic = teachers.filter((t) => (t.email ?? '').endsWith('@faculty.local'));
  const emailCount = new Map<string, number>();
  for (const t of teachers) {
    const e = (t.email ?? '').trim().toLowerCase();
    if (e) emailCount.set(e, (emailCount.get(e) ?? 0) + 1);
  }
  const dupEmails = [...emailCount.entries()].filter(([, n]) => n > 1);
  add({
    area: 'Faculty emails',
    status: dupEmails.length ? 'BLOCKED' : synthetic.length ? 'NEEDS_REVIEW' : 'READY',
    count: dupEmails.length || synthetic.length,
    reason: dupEmails.length
      ? 'Duplicate emails inside one school. These block a tenant-scoped unique index and must be merged first.'
      : synthetic.length
        ? `${synthetic.length} synthetic @faculty.local address(es) generated during import. Real addresses should replace them.`
        : 'All addresses look real and are unique within the school.',
    samples: sample(dupEmails.map(([e, n]) => `${e} x${n}`)),
  });

  // ── Duplicate faculty ─────────────────────────────────────────────────────
  let dupHigh = 0, dupReview = 0, dupSamples: string[] = [];
  try {
    const plan = await buildDedupPlan(schoolId);
    dupHigh = plan.groups.filter((g) => g.confidence === 'high').length;
    dupReview = plan.groups.filter((g) => g.confidence === 'review').length;
    dupSamples = sample(plan.groups.map((g) => `${g.confidence}: ${g.key}`));
  } catch {
    /* dedup is best-effort in a read-only scan */
  }
  add({
    area: 'Duplicate faculty',
    status: dupReview ? 'NEEDS_REVIEW' : dupHigh ? 'AUTO_MIGRATABLE' : 'READY',
    count: dupHigh + dupReview,
    reason: dupHigh + dupReview
      ? `${dupHigh} high-confidence group(s) (employee ID or email), ${dupReview} needing human review (name or phone only).`
      : 'No duplicate groups detected.',
    samples: dupSamples,
  });

  // ── Faculty subjects / grades / sections ──────────────────────────────────
  const noSubjects = teachers.filter((t) => readList(t.subjects).length === 0 && !t.subject?.trim());
  add({
    area: 'Faculty subjects',
    status: noSubjects.length ? 'NEEDS_REVIEW' : 'READY',
    count: noSubjects.length,
    reason: noSubjects.length
      ? `${noSubjects.length} faculty have no subject mapping, so the generator cannot use them.`
      : 'Every faculty record carries at least one subject.',
  });

  const noGrades = teachers.filter((t) => readList(t.grades).length === 0);
  add({
    area: 'Faculty grades',
    status: noGrades.length ? 'NEEDS_REVIEW' : 'READY',
    count: noGrades.length,
    reason: noGrades.length ? `${noGrades.length} faculty have no grade eligibility recorded.` : 'All faculty have grades.',
  });

  const noSections = teachers.filter((t) => readList(t.sections).length === 0);
  add({
    area: 'Faculty sections',
    status: 'READY',
    count: noSections.length,
    reason: `${noSections.length} faculty have no section list. Optional — sections are not required for scheduling.`,
  });

  // ── Teacher qualifications ────────────────────────────────────────────────
  // Classified properly rather than assumed safe. A Cartesian expansion of
  // subjects x grades asserts pairings the flat lists never recorded.
  const qual = await scanQualificationReadiness(schoolId);
  const qualStatus: Readiness =
    qualifications > 0
      ? 'READY'
      : qual.counts.AMBIGUOUS || qual.counts.INSUFFICIENT || qual.withUndeclaredSubjects
        ? 'NEEDS_REVIEW'
        : 'AUTO_MIGRATABLE';
  add({
    area: 'Teacher qualifications',
    status: qualStatus,
    count: qual.counts.AMBIGUOUS + qual.counts.INSUFFICIENT + qual.withUndeclaredSubjects,
    reason: qualifications > 0
      ? `${qualifications} TeacherQualification row(s) already exist.`
      : [
          `${qual.counts.DETERMINISTIC} deterministic (one subject, or one grade)`,
          `${qual.counts.EVIDENCE_BACKED} resolvable from timetable evidence`,
          `${qual.counts.AMBIGUOUS} ambiguous (many subjects x many grades, unresolved)`,
          `${qual.counts.INSUFFICIENT} with insufficient data`,
          `-> ${qual.proposedRows} row(s) could be written safely.`,
          qual.withUndeclaredSubjects
            ? `WARNING: ${qual.withUndeclaredSubjects} faculty are scheduled to teach subjects their record never declared, so the declared lists understate reality. Migrating them verbatim would record qualifications narrower than what they actually teach.`
            : 'Declared subjects match what the timetable shows.',
        ].join(' · '),
    samples: sample([
      ...qual.plans.filter((p) => p.classification === 'AMBIGUOUS').map((p) => `AMBIGUOUS: ${p.teacherName} — ${p.reason}`),
      ...qual.plans.filter((p) => p.undeclaredSubjects.length).map((p) => `UNDECLARED: ${p.teacherName} teaches ${p.undeclaredSubjects.slice(0, 4).join(', ')} but is only mapped to ${p.declaredSubjects.join(', ')}`),
    ]),
  });

  // ── Subject configuration vs what is actually scheduled ───────────────────
  const configured = new Map<string, Set<string>>();
  for (const c of subjectConfigs) {
    if (c.active === false) continue;
    const set = configured.get(c.grade) ?? new Set<string>();
    set.add(c.subjectName.toLowerCase());
    configured.set(c.grade, set);
  }
  const unconfigured = new Map<string, number>();
  for (const r of schedules) {
    const set = configured.get(r.grade);
    if (!set || !set.has(r.subject.toLowerCase())) {
      const key = `${r.grade} · ${r.subject}`;
      unconfigured.set(key, (unconfigured.get(key) ?? 0) + 1);
    }
  }
  add({
    area: 'Subject configuration',
    status: subjectConfigs.length === 0 ? 'NEEDS_REVIEW' : unconfigured.size ? 'NEEDS_REVIEW' : 'READY',
    count: unconfigured.size,
    reason: subjectConfigs.length === 0
      ? 'No subjects configured. The existing timetable still runs, but rules such as weekly frequency cannot apply.'
      : unconfigured.size
        ? `${unconfigured.size} subject/grade combination(s) appear in the timetable but are not in Subject Management. An Admin should confirm which to adopt.`
        : 'Every scheduled subject is configured.',
    samples: sample([...unconfigured.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} (${n} periods)`)),
  });

  // ── Day / period configuration ────────────────────────────────────────────
  const days = workingDayNames(dayConfig) as string[];
  add({
    area: 'Day & period configuration',
    status: dayConfig.configured ? 'READY' : 'NEEDS_REVIEW',
    count: days.length,
    reason: dayConfig.configured
      ? `${days.length} working days: ${days.map((d) => `${d.slice(0, 3)} ${periodsForDay(d, dayConfig)}`).join(', ')}.`
      : 'Not explicitly configured; defaults are in use. Confirm before generating.',
  });

  // ── Timetable rows and versions ───────────────────────────────────────────
  const unversioned = schedules.filter((r) => !r.timetableVersionId).length;
  add({
    area: 'Timetable rows',
    status: schedules.length ? 'READY' : 'NEEDS_REVIEW',
    count: schedules.length,
    reason: schedules.length
      ? `${schedules.length} scheduled periods; ${unversioned} not under version control.`
      : 'No timetable yet.',
  });
  add({
    area: 'Timetable versions',
    status: versions.length ? 'READY' : unversioned ? 'NEEDS_REVIEW' : 'READY',
    count: versions.length,
    reason: versions.length
      ? `${versions.length} version(s): ${versions.map((v) => `${v.name} (${v.status})`).join(', ')}.`
      : unversioned
        ? 'Running entirely on unversioned rows. Valid and operational — upgrading is a choice, not a requirement.'
        : 'No versions and no rows.',
  });

  // ── Out-of-range periods ──────────────────────────────────────────────────
  const outOfRange = schedules.filter((r) => {
    if (!days.includes(r.day)) return true;
    return r.period > periodsForDay(r.day, dayConfig);
  });
  const oorByDay = new Map<string, number>();
  for (const r of outOfRange) oorByDay.set(r.day, (oorByDay.get(r.day) ?? 0) + 1);
  add({
    area: 'Out-of-range periods',
    status: outOfRange.length ? 'BLOCKED' : 'READY',
    count: outOfRange.length,
    reason: outOfRange.length
      ? 'Historical periods fall outside the current day configuration. They keep working as legacy rows, but cannot transfer into a clean revision without a decision.'
      : 'Every period fits the configured week.',
    samples: sample([...oorByDay.entries()].map(([d, n]) => `${d}: ${n} period(s) beyond ${periodsForDay(d, dayConfig)}`)),
  });

  // ── Clashes ───────────────────────────────────────────────────────────────
  const opScope = await operationalScheduleFilter(schoolId);
  const opVersionId: string | null = opScope.timetableVersionId ?? null;
  const scan = await scanTimetable(schoolId, opVersionId);
  const teacherClashes = scan.issues.filter((i) => i.code === 'TEACHER_DOUBLE_BOOKED').length;
  const classClashes = scan.issues.filter((i) => i.code === 'CLASS_DOUBLE_BOOKED').length;
  add({
    area: 'Teacher clashes',
    status: teacherClashes ? 'BLOCKED' : 'READY',
    count: teacherClashes,
    reason: teacherClashes
      ? `One teacher is in two places at once, within ${opVersionId ? 'the operational version' : 'the unversioned timetable'}. Historical rows are left alone and new assignments are already prevented; each must be resolved before those rows enter a validated version.`
      : `No teacher is double-booked in ${opVersionId ? 'the operational version' : 'the unversioned timetable'}.`,
    samples: sample(scan.issues.filter((i) => i.code === 'TEACHER_DOUBLE_BOOKED').map((i) => i.message)),
  });
  add({
    area: 'Class clashes',
    status: classClashes ? 'BLOCKED' : 'READY',
    count: classClashes,
    reason: classClashes ? 'A class has two lessons in the same period.' : 'No class is double-booked.',
    samples: sample(scan.issues.filter((i) => i.code === 'CLASS_DOUBLE_BOOKED').map((i) => i.message)),
  });

  // ── Orphan references ─────────────────────────────────────────────────────
  const orphanSchedules = schedules.filter((r) => r.teacherId && !teacherById.has(r.teacherId));
  const orphanSubs = substitutions.filter((s) => !s.absentTeacher);
  const orphanLeaves = leaves.filter((l) => !teacherById.has(l.teacherId));
  const orphanTotal = orphanSchedules.length + orphanSubs.length + orphanLeaves.length;
  add({
    area: 'Orphan references',
    status: orphanTotal ? 'BLOCKED' : 'READY',
    count: orphanTotal,
    reason: orphanTotal
      ? `${orphanSchedules.length} timetable row(s), ${orphanSubs.length} substitution(s) and ${orphanLeaves.length} leave record(s) point at faculty that no longer exist.`
      : 'Every reference resolves.',
  });

  // ── Invalid subject mappings ──────────────────────────────────────────────
  const notQualified = scan.issues.filter((i) => i.code === 'NOT_SUBJECT_QUALIFIED').length;
  add({
    area: 'Invalid subject mappings',
    status: notQualified ? 'NEEDS_REVIEW' : 'READY',
    count: notQualified,
    reason: notQualified
      ? `${notQualified} period(s) assign a teacher who is not mapped to that subject. Legal historically; each needs confirming or remapping.`
      : 'Every assignment matches the teacher subject mapping.',
  });

  // ── Rooms ─────────────────────────────────────────────────────────────────
  const unnormalised = rooms.filter((r) => !isKnownRoomType(r.type));
  add({
    area: 'Rooms',
    status: rooms.length === 0 ? 'READY' : unnormalised.length ? 'NEEDS_REVIEW' : 'READY',
    count: rooms.length,
    reason: rooms.length === 0
      ? 'No rooms defined. Optional until rooms become a scheduling constraint.'
      : unnormalised.length
        ? `${unnormalised.length} of ${rooms.length} room(s) carry a free-text type. Suggestions are offered; none is applied automatically.`
        : `${rooms.length} room(s), all with a normalised type.`,
    samples: sample(unnormalised.map((r) => {
      const s = suggestRoomType(r.name, r.code);
      return `${r.name} (${r.type}) -> ${s ? `${s.type} [${s.confidence}]` : 'no suggestion'}`;
    })),
  });

  // ── Legacy room strings on timetable rows ─────────────────────────────────
  const roomStrings = new Map<string, number>();
  for (const r of schedules) {
    if (r.roomId && isLegacyRoomString(r.roomId)) {
      roomStrings.set(r.roomId, (roomStrings.get(r.roomId) ?? 0) + 1);
    }
  }
  const legacyRoomRows = [...roomStrings.values()].reduce((a, b) => a + b, 0);
  add({
    area: 'Legacy room strings',
    status: roomStrings.size ? 'NEEDS_REVIEW' : 'READY',
    count: roomStrings.size,
    reason: roomStrings.size
      ? `${roomStrings.size} distinct synthetic room value(s) across ${legacyRoomRows} timetable row(s). These are generator-invented strings, not Room ids, and must be mapped by hand or left unassigned.`
      : 'No legacy room strings.',
    samples: sample([...roomStrings.entries()].sort((a, b) => b[1] - a[1]).map(([v, n]) => `"${v}" on ${n} row(s)`)),
  });

  // ── Substitutions ─────────────────────────────────────────────────────────
  const subUnresolvable = substitutions.filter((s) => !s.absentTeacher?.schoolId).length;
  const subCrossSchool = substitutions.filter(
    (s) => s.substitute?.schoolId && s.absentTeacher?.schoolId && s.substitute.schoolId !== s.absentTeacher.schoolId
  ).length;
  add({
    area: 'Substitutions',
    status: subUnresolvable || subCrossSchool ? 'BLOCKED' : substitutions.length ? 'AUTO_MIGRATABLE' : 'READY',
    count: substitutions.length,
    reason: subUnresolvable || subCrossSchool
      ? `${subUnresolvable} unresolvable, ${subCrossSchool} cross-school. These block a schoolId backfill.`
      : substitutions.length
        ? 'Every row resolves to exactly one school through its absent teacher, so a schoolId backfill is deterministic.'
        : 'No substitutions.',
  });

  // ── Leave, attendance, calendar, lesson plans ─────────────────────────────
  add({
    area: 'Leave records',
    status: orphanLeaves.length ? 'BLOCKED' : 'READY',
    count: leaves.length,
    reason: orphanLeaves.length
      ? `${orphanLeaves.length} leave record(s) reference missing faculty.`
      : `${leaves.length} leave record(s), all resolving to current faculty.`,
  });
  add({
    area: 'Attendance records',
    status: 'READY',
    count: attendance,
    reason: attendance
      ? `${attendance} attendance record(s). Note these are demo/simulated until a device adapter exists.`
      : 'No attendance records.',
  });
  add({
    area: 'Calendar events',
    status: 'READY',
    count: calendarEvents,
    reason: calendarEvents ? `${calendarEvents} event(s).` : 'No calendar events yet.',
  });
  add({
    area: 'Lesson plans',
    status: 'READY',
    count: lessonPlans,
    reason: lessonPlans
      ? `${lessonPlans} lesson plan(s), available as substitute lesson context.`
      : 'No lesson plans. Substitutes will see "no lesson content available" rather than invented content.',
  });

  const summary: Record<Readiness, number> = { READY: 0, AUTO_MIGRATABLE: 0, NEEDS_REVIEW: 0, BLOCKED: 0 };
  for (const a of areas) summary[a.status]++;

  return {
    schoolId,
    schoolName: school.name,
    generatedAt: new Date().toISOString(),
    areas,
    summary,
  };
}
