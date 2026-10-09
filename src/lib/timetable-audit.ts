import { db } from '@/lib/db';
import { gradeKey, subjectKey } from '@/lib/name-normalize';
import { specialRoomType } from '@/lib/room-types';
import { NOT_ARCHIVED } from '@/lib/soft-delete';
import { teacherRequirementOf, type TeacherRequirement } from '@/lib/teacher-requirement';
import { getDayConfig } from '@/lib/timetable-config';
import { DAY_NAMES, periodsForDay, workingDayNames } from '@/lib/timetable-constraints';

/**
 * Independent timetable validator.
 *
 * Re-checks every hard rule on a finished timetable, using only the stored
 * rows and the school's own settings. It shares no code with any generator,
 * so a generator bug cannot hide its own mistakes. Used by the publish gate,
 * the Studio (red cells and the issues panel) and scripts/audit-timetable.ts.
 */

export type AuditRule =
  | 'class_slot'
  | 'teacher_slot'
  | 'room_slot'
  | 'outside_bell'
  | 'no_teacher'
  | 'daily_subject_limit'
  | 'double_period'
  | 'weekly_quota'
  | 'not_in_curriculum'
  | 'section_missing'
  | 'teacher_weekly'
  | 'teacher_daily'
  | 'teacher_consecutive'
  | 'teacher_unavailable'
  | 'workload_rule_missing'
  | 'room_type'
  | 'unknown_room';

export interface AuditIssue {
  rule: AuditRule;
  /** Errors block publishing; warnings are shown but do not. */
  severity: 'error' | 'warning';
  message: string;
  grade?: string;
  section?: string;
  teacherId?: string;
  day?: string;
  /** The timetable rows involved, for highlighting cells. */
  slotIds: string[];
}

export interface AuditSlot {
  id: string;
  grade: string;
  section: string;
  day: string;
  period: number;
  subject: string;
  teacherId: string | null;
  roomId: string | null;
}

export interface AuditSubjectRule {
  grade: string;
  subjectName: string;
  weeklyPeriods: number;
  /** Null when not set; the audit then allows 1 per day. */
  maxPeriodsPerDay: number | null;
  allowConsecutive: boolean;
  requiredRoomType: string | null;
  /** Unset means "required": a lesson without a teacher is an error. */
  teacherRequirement?: TeacherRequirement | null;
  active: boolean;
}

export interface AuditTeacher {
  id: string;
  name: string;
  maxWeekly: number | null;
  maxDaily: number | null;
  maxConsecutive: number | null;
  /** Where the caps came from; "missing" when neither a personal rule nor school defaults exist. */
  limitSource: 'personal' | 'school' | 'missing';
  unavailable: { day: string; period: number }[];
}

export interface AuditInput {
  slots: AuditSlot[];
  sections: { grade: string; section: string }[];
  subjectRules: AuditSubjectRule[];
  teachers: AuditTeacher[];
  /** maxParallelClasses: classes allowed in the room at once (unset = 1). */
  rooms: { id: string; name: string; type: string; maxParallelClasses?: number | null }[];
  /** Teaching periods per day for each grade name, from the day configuration. */
  periodsByGrade: Record<string, Partial<Record<string, number>>>;
}

/** Allowed per class+subject per day when the subject rule sets none. */
export const DEFAULT_DAILY_LIMIT = 1;

const dayOrder = (day: string) => {
  const index = (DAY_NAMES as readonly string[]).indexOf(day);
  return index === -1 ? 99 : index;
};
const classLabel = (grade: string, section: string) => `${grade}${section ? ` ${section}` : ''}`;
const periodList = (periods: number[]) => [...periods].sort((a, b) => a - b).map((p) => `P${p}`).join(',');

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(item);
  }
  return map;
}

/** Runs of adjacent period numbers, e.g. [1,2,3,5] → [[1,2,3],[5]]. */
function runs(periods: number[]): number[][] {
  const sorted = [...new Set(periods)].sort((a, b) => a - b);
  const result: number[][] = [];
  for (const period of sorted) {
    const last = result[result.length - 1];
    if (last && period === last[last.length - 1] + 1) last.push(period);
    else result.push([period]);
  }
  return result;
}

/** Re-checks every hard rule. Pure: no database access. */
export function auditTimetable(input: AuditInput): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const teacherById = new Map(input.teachers.map((t) => [t.id, t]));
  const teacherName = (id: string) => teacherById.get(id)?.name ?? `Teacher ${id}`;
  const roomById = new Map(input.rooms.map((r) => [r.id, r]));
  // One rule per grade+subject: several stored rows can match the same grade
  // under different spellings ("Grade 1" / "Grade I"); the exact name wins.
  const activeRules = (grade: string) => {
    const matching = input.subjectRules.filter((r) => r.active && gradeKey(r.grade) === gradeKey(grade));
    const chosen = new Map<string, AuditSubjectRule>();
    for (const rule of [...matching].sort((a, b) => Number(b.grade === grade) - Number(a.grade === grade))) {
      if (!chosen.has(subjectKey(rule.subjectName))) chosen.set(subjectKey(rule.subjectName), rule);
    }
    return chosen;
  };
  const ruleFor = (grade: string, subject: string) => activeRules(grade).get(subjectKey(subject));
  const periodsFor = (grade: string, day: string): number | undefined => {
    const exact = input.periodsByGrade[grade];
    const match = exact ?? Object.entries(input.periodsByGrade).find(([name]) => gradeKey(name) === gradeKey(grade))?.[1];
    return match?.[day];
  };

  // 1. One lesson per class, teacher and room per slot; inside the bell.
  for (const rows of groupBy(input.slots, (s) => `${s.grade}|${s.section}|${s.day}|${s.period}`).values()) {
    if (rows.length < 2) continue;
    const { grade, section, day, period } = rows[0];
    issues.push({ rule: 'class_slot', severity: 'error', grade, section, day, slotIds: rows.map((r) => r.id),
      message: `${classLabel(grade, section)}: ${rows.length} lessons in ${day} P${period} (${rows.map((r) => r.subject).join(', ')})` });
  }
  for (const slot of input.slots) {
    const limit = periodsFor(slot.grade, slot.day);
    if (limit === undefined || slot.period < 1 || slot.period > limit) {
      issues.push({ rule: 'outside_bell', severity: 'error', grade: slot.grade, section: slot.section, day: slot.day, slotIds: [slot.id],
        message: `${classLabel(slot.grade, slot.section)}: ${slot.subject} on ${slot.day} P${slot.period}, but ${limit === undefined ? `${slot.day} is not a teaching day` : `${slot.day} has ${limit} periods`}` });
    }
    if (!slot.teacherId && teacherRequirementOf(ruleFor(slot.grade, slot.subject)?.teacherRequirement) === 'required') {
      issues.push({ rule: 'no_teacher', severity: 'error', grade: slot.grade, section: slot.section, day: slot.day, slotIds: [slot.id],
        message: `${classLabel(slot.grade, slot.section)}: ${slot.subject} on ${slot.day} P${slot.period} has no teacher` });
    }
  }
  for (const rows of groupBy(input.slots.filter((s) => s.teacherId), (s) => `${s.teacherId}|${s.day}|${s.period}`).values()) {
    if (rows.length < 2) continue;
    const { teacherId, day, period } = rows[0];
    issues.push({ rule: 'teacher_slot', severity: 'error', teacherId: teacherId!, day, slotIds: rows.map((r) => r.id),
      message: `${teacherName(teacherId!)}: double-booked on ${day} P${period} (${rows.map((r) => `${classLabel(r.grade, r.section)} ${r.subject}`).join('; ')})` });
  }
  const realRoomSlots = input.slots.filter((s) => s.roomId && roomById.has(s.roomId));
  for (const rows of groupBy(realRoomSlots, (s) => `${s.roomId}|${s.day}|${s.period}`).values()) {
    const room = roomById.get(rows[0].roomId!)!;
    const capacity = Math.max(1, room.maxParallelClasses ?? 1);
    if (rows.length <= capacity) continue;
    const { day, period } = rows[0];
    issues.push({ rule: 'room_slot', severity: 'error', day, slotIds: rows.map((r) => r.id),
      message: `Room ${room.name}: ${rows.length} classes on ${day} P${period}, room holds ${capacity} (${rows.map((r) => classLabel(r.grade, r.section)).join(', ')})` });
  }
  const unknownRooms = input.slots.filter((s) => s.roomId && !roomById.has(s.roomId));
  if (unknownRooms.length) {
    const examples = [...new Set(unknownRooms.map((s) => s.roomId))].slice(0, 3).join(', ');
    issues.push({ rule: 'unknown_room', severity: 'warning', slotIds: unknownRooms.map((s) => s.id),
      message: `${unknownRooms.length} lesson(s) name a room that is not one of the school's rooms (e.g. ${examples}); room clashes cannot be checked for them` });
  }

  // 2, 5. Per class+subject per day: the daily limit and double periods.
  for (const rows of groupBy(input.slots, (s) => `${s.grade}|${s.section}|${subjectKey(s.subject)}|${s.day}`).values()) {
    const { grade, section, subject, day } = rows[0];
    const rule = ruleFor(grade, subject);
    const limit = rule?.maxPeriodsPerDay ?? DEFAULT_DAILY_LIMIT;
    const periods = rows.map((r) => r.period);
    if (rows.length > limit) {
      issues.push({ rule: 'daily_subject_limit', severity: 'error', grade, section, day, slotIds: rows.map((r) => r.id),
        message: `${classLabel(grade, section)}: ${subject} ${rows.length}x on ${day} (limit ${limit}): ${periodList(periods)}` });
    }
    for (const run of runs(periods).filter((r) => r.length > 1)) {
      const runIds = rows.filter((r) => run.includes(r.period)).map((r) => r.id);
      if (!rule?.allowConsecutive) {
        issues.push({ rule: 'double_period', severity: 'error', grade, section, day, slotIds: runIds,
          message: `${classLabel(grade, section)}: ${subject} in consecutive periods on ${day} (${periodList(run)}) but double periods are not allowed` });
      } else if (run.length > 2) {
        issues.push({ rule: 'double_period', severity: 'error', grade, section, day, slotIds: runIds,
          message: `${classLabel(grade, section)}: ${subject} ${run.length} periods in a row on ${day} (${periodList(run)}); only pairs are allowed` });
      }
    }
  }

  // 3. Exactly the weekly quota; nothing outside the curriculum; every section scheduled.
  const sectionsWithSlots = new Set(input.slots.map((s) => `${gradeKey(s.grade)}|${s.section}`));
  for (const section of input.sections) {
    if (sectionsWithSlots.has(`${gradeKey(section.grade)}|${section.section}`)) continue;
    const hasQuota = input.subjectRules.some((r) => r.active && r.weeklyPeriods > 0 && gradeKey(r.grade) === gradeKey(section.grade));
    if (hasQuota) {
      issues.push({ rule: 'section_missing', severity: 'error', grade: section.grade, section: section.section, slotIds: [],
        message: `${classLabel(section.grade, section.section)}: not scheduled at all` });
    }
  }
  const scheduledClasses = groupBy(input.slots, (s) => `${s.grade}|${s.section}`);
  for (const classRows of scheduledClasses.values()) {
    const { grade, section } = classRows[0];
    const bySubject = groupBy(classRows, (r) => subjectKey(r.subject));
    for (const rule of [...activeRules(grade).values()].filter((r) => r.weeklyPeriods > 0)) {
      const rows = bySubject.get(subjectKey(rule.subjectName)) ?? [];
      if (rows.length === rule.weeklyPeriods) continue;
      const difference = rows.length - rule.weeklyPeriods;
      issues.push({ rule: 'weekly_quota', severity: 'error', grade, section, slotIds: rows.map((r) => r.id),
        message: `${classLabel(grade, section)}: ${rule.subjectName} ${rows.length}/week (quota ${rule.weeklyPeriods}, ${difference > 0 ? `${difference} extra` : `${-difference} missing`})` });
    }
    for (const rows of bySubject.values()) {
      if (ruleFor(grade, rows[0].subject)?.weeklyPeriods) continue;
      issues.push({ rule: 'not_in_curriculum', severity: 'error', grade, section, slotIds: rows.map((r) => r.id),
        message: `${classLabel(grade, section)}: ${rows[0].subject} ${rows.length}/week but it has no active weekly quota for ${grade}` });
    }
  }

  // 6. Specialised rooms.
  for (const slot of input.slots) {
    const needed = specialRoomType(ruleFor(slot.grade, slot.subject)?.requiredRoomType);
    if (!needed) continue;
    const room = slot.roomId ? roomById.get(slot.roomId) : undefined;
    if (room && room.type === needed) continue;
    issues.push({ rule: 'room_type', severity: 'error', grade: slot.grade, section: slot.section, day: slot.day, slotIds: [slot.id],
      message: `${classLabel(slot.grade, slot.section)}: ${slot.subject} on ${slot.day} P${slot.period} needs a ${needed} room but is in ${room ? `${room.name} (${room.type})` : slot.roomId ? `"${slot.roomId}", which is not a room of this school` : 'no room'}` });
  }

  // 4. Teacher caps and availability.
  for (const rows of groupBy(input.slots.filter((s) => s.teacherId), (s) => s.teacherId!).values()) {
    const id = rows[0].teacherId!;
    const teacher = teacherById.get(id);
    const name = teacherName(id);
    const byDay = groupBy(rows, (r) => r.day);
    const longest = (dayRows: AuditSlot[]) => runs(dayRows.map((r) => r.period)).reduce((a, b) => (b.length > a.length ? b : a), [] as number[]);
    if (!teacher || teacher.limitSource === 'missing') {
      const busiest = [...byDay.entries()].sort((a, b) => b[1].length - a[1].length)[0];
      const longestRun = [...byDay.entries()].map(([day, dayRows]) => ({ day, run: longest(dayRows) })).sort((a, b) => b.run.length - a.run.length)[0];
      issues.push({ rule: 'workload_rule_missing', severity: 'error', teacherId: id, slotIds: [],
        message: `${name}: no workload rule (teaches ${rows.length}/week, up to ${busiest[1].length} on ${busiest[0]}, ${longestRun.run.length} in a row on ${longestRun.day} ${periodList(longestRun.run)})` });
    } else {
      if (teacher.maxWeekly !== null && rows.length > teacher.maxWeekly) {
        issues.push({ rule: 'teacher_weekly', severity: 'error', teacherId: id, slotIds: rows.map((r) => r.id),
          message: `${name}: ${rows.length} periods/week (limit ${teacher.maxWeekly})` });
      }
      for (const [day, dayRows] of [...byDay.entries()].sort((a, b) => dayOrder(a[0]) - dayOrder(b[0]))) {
        if (teacher.maxDaily !== null && dayRows.length > teacher.maxDaily) {
          issues.push({ rule: 'teacher_daily', severity: 'error', teacherId: id, day, slotIds: dayRows.map((r) => r.id),
            message: `${name}: ${dayRows.length} periods on ${day} (limit ${teacher.maxDaily}): ${periodList(dayRows.map((r) => r.period))}` });
        }
        if (teacher.maxConsecutive !== null) {
          for (const run of runs(dayRows.map((r) => r.period)).filter((r) => r.length > teacher.maxConsecutive!)) {
            issues.push({ rule: 'teacher_consecutive', severity: 'error', teacherId: id, day, slotIds: dayRows.filter((r) => run.includes(r.period)).map((r) => r.id),
              message: `${name}: ${run.length} consecutive on ${day} (P${run[0]}–P${run[run.length - 1]}), limit ${teacher.maxConsecutive}` });
          }
        }
      }
    }
    const blocked = new Set((teacher?.unavailable ?? []).map((u) => `${u.day}|${u.period}`));
    for (const row of rows.filter((r) => blocked.has(`${r.day}|${r.period}`))) {
      issues.push({ rule: 'teacher_unavailable', severity: 'error', teacherId: id, day: row.day, slotIds: [row.id],
        message: `${name}: teaches ${classLabel(row.grade, row.section)} ${row.subject} on ${row.day} P${row.period}, a slot marked unavailable` });
    }
  }

  return issues.sort((a, b) => a.rule.localeCompare(b.rule)
    || (a.grade ?? '').localeCompare(b.grade ?? '', undefined, { numeric: true })
    || (a.section ?? '').localeCompare(b.section ?? '')
    || dayOrder(a.day ?? '') - dayOrder(b.day ?? '')
    || a.message.localeCompare(b.message));
}

const DAY_BY_NUMBER: Record<number, string> = Object.fromEntries(DAY_NAMES.map((day, index) => [index + 1, day]));

/** Reads one timetable version and the school's rules for auditTimetable. Read only. */
export async function loadAuditInput(schoolId: string, versionId: string): Promise<AuditInput> {
  const version = await db.timetableVersion.findFirst({ where: { id: versionId, schoolId }, select: { id: true } });
  if (!version) throw new Error(`Timetable version ${versionId} not found in this school.`);

  const [slots, sections, configs, teachers, rules, preferences, availability, rooms] = await Promise.all([
    db.schedule.findMany({ where: { schoolId, timetableVersionId: versionId }, select: { id: true, grade: true, section: true, day: true, period: true, subject: true, teacherId: true, roomId: true } }),
    db.classSection.findMany({ where: { schoolId, active: true, AND: [NOT_ARCHIVED] }, select: { grade: true, section: true } }),
    db.gradeSubjectConfig.findMany({ where: { schoolId, AND: [NOT_ARCHIVED] } }),
    db.teacher.findMany({ where: { schoolId }, select: { id: true, name: true } }),
    db.teacherWorkloadRule.findMany({ where: { schoolId, OR: [{ timetableVersionId: versionId }, { timetableVersionId: null }, { timetableVersionId: { isSet: false } }] } }),
    db.schoolPreferences.findUnique({ where: { schoolId } }),
    db.teacherAvailabilitySlot.findMany({ where: { schoolId, timetableVersionId: versionId } }),
    db.room.findMany({ where: { schoolId, active: true }, select: { id: true, name: true, type: true, maxParallelClasses: true } }),
  ]);

  const gradeNames = [...new Set([...slots.map((s) => s.grade), ...sections.map((s) => s.grade), ...configs.map((c) => c.grade)])];
  const periodsByGrade: AuditInput['periodsByGrade'] = {};
  for (const grade of gradeNames) {
    const week = await getDayConfig(schoolId, grade);
    periodsByGrade[grade] = Object.fromEntries(workingDayNames(week).map((day) => [day, periodsForDay(day, week)]));
  }

  const defaults = {
    maxWeekly: preferences?.defaultMaxWeekly ?? null,
    maxDaily: preferences?.defaultMaxDaily ?? null,
    maxConsecutive: preferences?.defaultMaxConsecutive ?? null,
  };
  const hasDefaults = defaults.maxWeekly !== null || defaults.maxDaily !== null || defaults.maxConsecutive !== null;
  const auditTeachers: AuditTeacher[] = teachers.map((teacher) => {
    // A version-specific rule wins over the teacher's standing rule.
    const own = rules.find((r) => r.teacherId === teacher.id && r.timetableVersionId === versionId)
      ?? rules.find((r) => r.teacherId === teacher.id && !r.timetableVersionId);
    const fromRule = Array.isArray(own?.unavailableSlots)
      ? (own!.unavailableSlots as { day?: string; period?: number }[]).filter((u) => u?.day && u?.period).map((u) => ({ day: String(u.day), period: Number(u.period) }))
      : [];
    const fromAvailability = availability
      .filter((a) => a.teacherId === teacher.id && ['unavailable', 'restricted'].includes(String(a.status).toLowerCase()) && DAY_BY_NUMBER[a.dayOfWeek])
      .map((a) => ({ day: DAY_BY_NUMBER[a.dayOfWeek], period: a.period }));
    return {
      id: teacher.id,
      name: teacher.name,
      maxWeekly: own ? own.maxWeekly : defaults.maxWeekly,
      maxDaily: own ? own.maxDaily : defaults.maxDaily,
      maxConsecutive: own ? own.maxConsecutive : defaults.maxConsecutive,
      limitSource: own ? 'personal' : hasDefaults ? 'school' : 'missing',
      unavailable: [...fromRule, ...fromAvailability],
    };
  });

  return {
    slots,
    sections,
    subjectRules: configs.map((c) => ({
      grade: c.grade,
      subjectName: c.subjectName,
      weeklyPeriods: c.weeklyPeriods,
      maxPeriodsPerDay: c.maxPeriodsPerDay ?? null,
      allowConsecutive: c.allowConsecutive,
      requiredRoomType: c.requiredRoomType ?? null,
      teacherRequirement: teacherRequirementOf(c.teacherRequirement),
      active: c.active,
    })),
    teachers: auditTeachers,
    rooms,
    periodsByGrade,
  };
}

export interface AuditSummary {
  versionId: string;
  slots: number;
  errors: number;
  warnings: number;
  byRule: Record<string, number>;
  issues: AuditIssue[];
}

export async function auditVersion(schoolId: string, versionId: string): Promise<AuditSummary> {
  const input = await loadAuditInput(schoolId, versionId);
  const issues = auditTimetable(input);
  const byRule: Record<string, number> = {};
  for (const issue of issues) byRule[issue.rule] = (byRule[issue.rule] ?? 0) + 1;
  return {
    versionId,
    slots: input.slots.length,
    errors: issues.filter((i) => i.severity === 'error').length,
    warnings: issues.filter((i) => i.severity === 'warning').length,
    byRule,
    issues,
  };
}

export interface PublishCheck {
  ok: boolean;
  summary: AuditSummary;
  /** Lessons of teacher-required subjects without a teacher, plus required periods never placed. */
  requiredTeacherGaps: number;
}

/**
 * The publish gate: a version may go live only when the validator finds no
 * error at all (clashes, caps, quotas, daily limits, rooms, missing required
 * teachers). Warnings do not block.
 */
export async function assessPublishability(schoolId: string, versionId: string): Promise<PublishCheck> {
  const summary = await auditVersion(schoolId, versionId);
  const requiredTeacherGaps = summary.issues.filter((i) => i.rule === 'no_teacher').length
    + summary.issues.filter((i) => i.rule === 'weekly_quota' && /missing\)$/.test(i.message)).length;
  return { ok: summary.errors === 0, summary, requiredTeacherGaps };
}
