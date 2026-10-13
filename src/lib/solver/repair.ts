import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { isAutofixEnabled, runAutofix } from '@/lib/autofix';
import { gradeKey, subjectKey } from '@/lib/name-normalize';
import { fingerprintOf } from '@/lib/settings-fingerprint';
import { loadSolverInput } from '@/lib/solver/load';
import { solve } from '@/lib/solver/solve';
import type { SolverLesson, Unallocated } from '@/lib/solver/types';
import { auditTimetable, auditVersion, loadAuditInput } from '@/lib/timetable-audit';
import { getDayConfig } from '@/lib/timetable-config';
import { periodTimingsForDay } from '@/lib/timetable-constraints';
import { getPublishedVersion } from '@/lib/timetable-lifecycle';

/**
 * "Fix only affected lessons": after settings change, keep every lesson that
 * still follows all rules exactly where it is and re-place only the lessons the
 * independent validator now flags (and periods still missing from a quota).
 *
 * Works on the draft. When there is no draft, a new draft is started from the
 * published version; the published version itself is never written. Locked
 * lessons are never moved, even when flagged.
 */

const WRITABLE_STATUSES = ['draft', 'review', 'approved'];

export async function repairDraft(request: { schoolId: string; actor: string; seed?: number }) {
  const { schoolId, actor } = request;

  const autofix = (await isAutofixEnabled(schoolId))
    ? await runAutofix(schoolId, { apply: true, trigger: 'generation', actor, tiers: [1, 2] })
    : { fixes: [], unfixable: [], suppressed: [], logIds: [], runId: null };

  const draft = await db.timetableVersion.findFirst({ where: { schoolId, status: { in: WRITABLE_STATUSES } }, orderBy: { version: 'desc' } });
  const published = await getPublishedVersion(schoolId);
  const base = draft ?? published;
  if (!base) return { status: 409, body: { error: 'There is no timetable to fix yet. Generate one first.', code: 'NOTHING_TO_REPAIR' } };

  // 1. What breaks the rules now, according to the independent validator.
  const auditInput = await loadAuditInput(schoolId, base.id);
  // A quota that is short keeps its existing lessons: the solver adds the missing ones.
  const issues = auditTimetable(auditInput).filter((i) => i.severity === 'error' && !(i.rule === 'weekly_quota' && / missing\)$/.test(i.message)));
  const flagged = new Set(issues.flatMap((i) => i.slotIds));
  const rows = await db.schedule.findMany({ where: { schoolId, timetableVersionId: base.id } });
  const freed = rows.filter((r) => flagged.has(r.id) && r.locked !== true);
  const kept = rows.filter((r) => !freed.includes(r));

  // 2. The school's current settings; every kept lesson is frozen in place.
  const loaded = await loadSolverInput(schoolId, { versionId: base.id });
  const { input } = loaded;
  const classOf = (grade: string, section: string) =>
    input.classes.find((c) => gradeKey(c.grade) === gradeKey(grade) && c.section.trim().toUpperCase() === section.trim().toUpperCase());
  const subjectOf = (classKey: string, subject: string) =>
    input.requirements.find((r) => r.classKey === classKey && subjectKey(r.subject) === subjectKey(subject))?.subject ?? subject;
  const frozen: SolverLesson[] = kept.flatMap((row) => {
    const cls = classOf(row.grade, row.section);
    if (!cls) return [];
    return [{ classKey: cls.key, day: row.day, period: row.period, subject: subjectOf(cls.key, row.subject), teacherId: row.teacherId ?? null, roomId: row.roomId ?? null, locked: true }];
  });

  // 3. Solve only what is missing; frozen lessons occupy their slots, teachers and rooms.
  const seed = request.seed ?? 1;
  let result = solve({ ...input, locked: frozen }, { seed });
  // A full week has no free slot to move into. If something could not be
  // placed, rearrange only the classes concerned (admin-locked lessons still
  // stay) and keep every other class frozen.
  let rearranged = new Set<string>();
  if (result.unallocated.length) {
    const classes = new Set(result.unallocated.map((u) => u.classKey));
    const lockedKeys = new Set(kept.filter((r) => r.locked === true).map((r) => `${classOf(r.grade, r.section)?.key}|${r.day}|${r.period}`));
    const looser = frozen.filter((l) => !classes.has(l.classKey) || lockedKeys.has(`${l.classKey}|${l.day}|${l.period}`));
    // Prefer each lesson's old slot so only what must move, moves.
    const previous = frozen.filter((l) => classes.has(l.classKey)).map((l) => ({ classKey: l.classKey, subject: l.subject, day: l.day, period: l.period, teacherId: l.teacherId }));
    const second = solve({ ...input, locked: looser, previous }, { seed });
    const unplaced = (r: typeof result) => r.unallocated.reduce((sum, u) => sum + u.periods, 0);
    if (unplaced(second) < unplaced(result)) {
      result = second;
      rearranged = classes;
    }
  }
  // Rows of rearranged classes are rewritten too (except admin-locked ones).
  for (const row of kept) {
    const cls = classOf(row.grade, row.section);
    if (cls && rearranged.has(cls.key) && row.locked !== true) freed.push(row);
  }
  kept.splice(0, kept.length, ...kept.filter((r) => !freed.includes(r)));
  const toWrite = result.lessons.filter((lesson) => !lesson.locked);
  // What really changed: new lessons not in a slot the same subject had before.
  const before = new Set(freed.map((r) => `${classOf(r.grade, r.section)?.key}|${subjectOf(classOf(r.grade, r.section)?.key ?? '', r.subject)}|${r.day}|${r.period}`));
  const moved = toWrite.filter((l) => !before.has(`${l.classKey}|${l.subject}|${l.day}|${l.period}`)).length;

  const classByKey = new Map(input.classes.map((c) => [c.key, c]));
  const timings = new Map<string, Map<number, { startTime: string; endTime: string }>>();
  for (const grade of new Set(toWrite.map((l) => classByKey.get(l.classKey)!.grade))) {
    const week = await getDayConfig(schoolId, grade);
    const cls = input.classes.find((c) => c.grade === grade)!;
    for (const { day } of cls.days) {
      timings.set(`${grade}|${day}`, new Map(periodTimingsForDay(week, day).map((t) => [t.period, { startTime: t.startTime, endTime: t.endTime }])));
    }
  }
  const unallocated: (Unallocated & { grade: string; section: string })[] = result.unallocated.map((u) => {
    const cls = classByKey.get(u.classKey)!;
    return { ...u, grade: cls.grade, section: cls.section };
  });

  // 4. Write the draft only.
  const versionId = await db.$transaction(async (tx) => {
    let target = draft;
    if (!target) {
      // Start a new draft from the published version, without the flagged lessons.
      const highest = await tx.timetableVersion.findFirst({ where: { schoolId }, orderBy: { version: 'desc' }, select: { version: true } });
      const next = (highest?.version ?? published!.version) + 1;
      target = await tx.timetableVersion.create({
        data: {
          schoolId, academicYearId: published!.academicYearId, name: `Master Timetable v${next}`, version: next, status: 'draft',
          basedOnId: published!.id, createdBy: actor, changeNotes: `Revision of v${published!.version}: lessons fixed after settings changed`,
        },
      });
      if (kept.length) {
        await tx.schedule.createMany({
          data: kept.map((r) => ({
            schoolId, timetableVersionId: target!.id, grade: r.grade, section: r.section, day: r.day, period: r.period, subject: r.subject,
            teacherId: r.teacherId, topic: r.topic, roomId: r.roomId, startTime: r.startTime, endTime: r.endTime, locked: r.locked ?? false,
          })),
        });
      }
    } else if (freed.length) {
      await tx.schedule.deleteMany({ where: { schoolId, timetableVersionId: target.id, id: { in: freed.map((r) => r.id) } } });
    }
    if (toWrite.length) {
      await tx.schedule.createMany({
        data: toWrite.map((lesson) => {
          const cls = classByKey.get(lesson.classKey)!;
          const time = timings.get(`${cls.grade}|${lesson.day}`)?.get(lesson.period);
          return {
            schoolId, timetableVersionId: target!.id, grade: cls.grade, section: cls.section, day: lesson.day, period: lesson.period,
            subject: lesson.subject, teacherId: lesson.teacherId, roomId: lesson.roomId, startTime: time?.startTime ?? '', endTime: time?.endTime ?? '', locked: false,
          };
        }),
      });
    }
    await tx.timetableVersion.update({
      where: { id: target.id },
      data: {
        ...(target.status === 'approved' ? { status: 'draft', approvedBy: null, approvedAt: null } : {}),
        generationConfig: {
          engine: 'solver-v2',
          mode: 'repair',
          generatedAt: new Date().toISOString(),
          generatedBy: actor,
          repairedFrom: { versionId: base.id, version: base.version, status: base.status },
          seed,
          stats: { ...result.stats, kept: kept.length, freed: freed.length, placed: toWrite.length, moved },
          rearrangedClasses: [...rearranged],
          unallocated,
          skipped: loaded.skipped,
          autofix: { runId: autofix.runId, logIds: autofix.logIds },
          settingsFingerprint: fingerprintOf(input),
        } as unknown as Prisma.InputJsonValue,
      },
    });
    return target.id;
  }, { timeout: 120000, maxWait: 20000 });

  const audit = await auditVersion(schoolId, versionId);
  const version = await db.timetableVersion.findUnique({ where: { id: versionId }, select: { id: true, version: true, status: true, name: true } });
  const unplaced = unallocated.reduce((sum, u) => sum + u.periods, 0);
  return {
    status: 200,
    body: {
      success: true,
      engine: 'solver-v2',
      mode: 'repair',
      version,
      message: freed.length || toWrite.length
        ? `Draft v${version?.version}: ${moved} lesson(s) moved; all other lessons stayed where they were`
          + (rearranged.size ? ` (to make room, only ${[...rearranged].map((k) => k.replace('|', ' ')).join(', ')} ${rearranged.size === 1 ? 'was' : 'were'} rearranged)` : '')
          + (unplaced ? `. ${unplaced} period(s) could not be placed (see Problems).` : '.')
        : `Draft v${version?.version}: nothing needed fixing.`,
      stats: { kept: kept.length, freed: freed.length, placed: toWrite.length, moved, unallocatedPeriods: unplaced, errors: audit.errors, warnings: audit.warnings },
      rearrangedClasses: [...rearranged],
      byRule: audit.byRule,
      unallocated,
      autoFixed: autofix.fixes.map((fix) => fix.summary),
      autofixLogIds: autofix.logIds,
    },
  };
}
