import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { runAutofix, isAutofixEnabled } from '@/lib/autofix';
import { gradeKey } from '@/lib/name-normalize';
import { loadSolverInput } from '@/lib/solver/load';
import { solve } from '@/lib/solver/solve';
import type { SolverLesson, Unallocated } from '@/lib/solver/types';
import { auditVersion } from '@/lib/timetable-audit';
import { describeCapacityProblem, gradeCapacityReport } from '@/lib/timetable-capacity';
import { getDayConfig } from '@/lib/timetable-config';
import { periodTimingsForDay } from '@/lib/timetable-constraints';
import { ensureAcademicYear, getPublishedVersion } from '@/lib/timetable-lifecycle';

/**
 * Timetable generation with the constraint solver (solverV2Enabled schools).
 *
 *   auto-fix (when the school has it on) → load the school's settings →
 *   solve → write the DRAFT version only → validate the draft.
 *
 * Published and superseded versions are never written. Lessons the solver
 * could not place are stored on the version (generationConfig.unallocated)
 * with a reason, never padded. Locked lessons in the draft stay as they are.
 */

export interface GenerateRequest {
  schoolId: string;
  actor: string;
  /** null: every class. Otherwise a grade range (inclusive, any spelling) or one class. */
  scope: { fromGrade?: string; toGrade?: string; grade?: string; section?: string } | null;
  seed?: number;
}

export interface GenerateResponse {
  status: number;
  body: Record<string, unknown>;
}

/** Versions generation may write into, newest first. An approved version goes back to draft. */
const WRITABLE_STATUSES = ['draft', 'review', 'approved'];

const classKeyOf = (grade: string, section: string) => `${grade}|${section}`;

export async function generateDraft(request: GenerateRequest): Promise<GenerateResponse> {
  const { schoolId, actor } = request;

  // 1. Correct setup mistakes first (logged, undoable).
  const autofix = (await isAutofixEnabled(schoolId))
    ? await runAutofix(schoolId, { apply: true, trigger: 'generation', actor, tiers: [1, 2] })
    : { fixes: [], unfixable: [], suppressed: [], logIds: [], runId: null };

  const draft = await db.timetableVersion.findFirst({
    where: { schoolId, status: { in: WRITABLE_STATUSES } },
    orderBy: { version: 'desc' },
  });
  const published = await getPublishedVersion(schoolId);

  // 2. The school's settings, with the draft's locked lessons.
  const loaded = await loadSolverInput(schoolId, { versionId: draft?.id ?? null });
  const { input } = loaded;
  if (!input.classes.length) {
    return { status: 422, body: { error: 'No class can be scheduled yet.', code: 'NOTHING_TO_SCHEDULE', skipped: loaded.skipped } };
  }

  // 3. Which classes this run regenerates.
  const scope = request.scope;
  // Grades in school order, for ranges like "Grade 3 to Grade 7".
  const gradeOrder = [...new Set(input.classes.map((c) => gradeKey(c.grade)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const rangeFrom = scope?.fromGrade ? gradeOrder.indexOf(gradeKey(scope.fromGrade)) : -1;
  const rangeTo = scope?.toGrade ? gradeOrder.indexOf(gradeKey(scope.toGrade)) : -1;
  const inScope = (grade: string, section: string) => {
    if (!scope) return true;
    if (scope.fromGrade && scope.toGrade) {
      const index = gradeOrder.indexOf(gradeKey(grade));
      return index >= Math.min(rangeFrom, rangeTo) && index <= Math.max(rangeFrom, rangeTo) && rangeFrom >= 0 && rangeTo >= 0;
    }
    return Boolean(scope.grade && scope.section)
      && gradeKey(scope.grade!) === gradeKey(grade) && scope.section!.trim().toUpperCase() === section.trim().toUpperCase();
  };
  const scopeKeys = new Set(input.classes.filter((c) => inScope(c.grade, c.section)).map((c) => c.key));
  if (!scopeKeys.size) return { status: 400, body: { error: 'None of the requested classes is an active section.', code: 'EMPTY_SCOPE' } };
  const scopeGrades = new Set([...scopeKeys].map((key) => gradeKey(input.classes.find((c) => c.key === key)!.grade)));

  // 4. Refuse when a target grade still cannot fit its week.
  const blocking = autofix.unfixable.filter((item) => item.blocking && (!item.grade || scopeGrades.has(gradeKey(item.grade))));
  const overCapacity = (await gradeCapacityReport(schoolId)).filter((c) => !c.ok && scopeGrades.has(gradeKey(c.grade)));
  if (blocking.length || overCapacity.length) {
    return {
      status: 422,
      body: {
        error: `Cannot generate: ${blocking.length + overCapacity.length} setup problem(s) must be fixed first.`,
        code: 'CAPACITY_EXCEEDED',
        autoFixed: autofix.fixes.map((fix) => fix.summary),
        grades: [
          ...blocking.map((item) => ({ grade: item.grade ?? 'All grades', problem: item.message })),
          ...overCapacity.filter((c) => !blocking.some((b) => b.grade === c.grade)).map((c) => ({ grade: c.grade, demand: c.demand, slots: c.slots, problem: describeCapacityProblem(c) })),
        ],
      },
    };
  }

  // 5. Classes outside the scope keep their lessons (draft, or the published
  // version when a new draft is started) and only occupy teachers and rooms.
  const baseVersionId = draft?.id ?? published?.id ?? null;
  const outside = baseVersionId && scopeKeys.size < input.classes.length
    ? await db.schedule.findMany({ where: { schoolId, timetableVersionId: baseVersionId } })
    : [];
  const outsideRows = outside.filter((row) => !scopeKeys.has(classKeyOf(row.grade, row.section)));
  const fixed: SolverLesson[] = outsideRows.map((row) => ({
    classKey: classKeyOf(row.grade, row.section), day: row.day, period: row.period, subject: row.subject,
    teacherId: row.teacherId ?? null, roomId: row.roomId ?? null, locked: true,
  }));
  const lockedInScope = input.locked.filter((lesson) => scopeKeys.has(lesson.classKey));
  const scopedInput = {
    ...input,
    requirements: input.requirements.filter((r) => scopeKeys.has(r.classKey)),
    locked: [...lockedInScope, ...fixed.filter((l) => input.classes.some((c) => c.key === l.classKey))],
  };

  // 6. Solve (pure, in memory).
  const seed = request.seed ?? 1;
  const result = solve(scopedInput, { seed });
  const toWrite = result.lessons.filter((lesson) => !lesson.locked && scopeKeys.has(lesson.classKey));

  // Per-day bell times for every grade written.
  const classByKey = new Map(input.classes.map((c) => [c.key, c]));
  const timings = new Map<string, Map<number, { startTime: string; endTime: string }>>();
  for (const cls of [...scopeKeys].map((key) => classByKey.get(key)!)) {
    if (timings.has(`${cls.grade}|${cls.days[0].day}`)) continue;
    const week = await getDayConfig(schoolId, cls.grade);
    for (const { day } of cls.days) {
      timings.set(`${cls.grade}|${day}`, new Map(periodTimingsForDay(week, day).map((t) => [t.period, { startTime: t.startTime, endTime: t.endTime }])));
    }
  }

  const unallocated: (Unallocated & { grade: string; section: string })[] = result.unallocated.map((u) => {
    const cls = classByKey.get(u.classKey)!;
    return { ...u, grade: cls.grade, section: cls.section };
  });

  // 7. Write the draft (and only the draft) in one transaction.
  const versionId = await db.$transaction(async (tx) => {
    let target = draft;
    if (!target) {
      const highest = await tx.timetableVersion.findFirst({ where: { schoolId }, orderBy: { version: 'desc' }, select: { version: true } });
      const next = (highest?.version ?? 0) + 1;
      target = await tx.timetableVersion.create({
        data: {
          schoolId,
          academicYearId: published?.academicYearId ?? (await ensureAcademicYear(schoolId)),
          name: `Master Timetable v${next}`,
          version: next,
          status: 'draft',
          basedOnId: published?.id ?? null,
          createdBy: actor,
          changeNotes: `Generated draft (v${next})`,
        },
      });
      // A new draft starts with the published lessons of classes outside the scope.
      if (outsideRows.length) {
        await tx.schedule.createMany({
          data: outsideRows.map((r) => ({
            schoolId, timetableVersionId: target!.id, grade: r.grade, section: r.section, day: r.day, period: r.period,
            subject: r.subject, teacherId: r.teacherId, topic: r.topic, roomId: r.roomId, startTime: r.startTime, endTime: r.endTime,
          })),
        });
      }
    }

    const scopeClasses = [...scopeKeys].map((key) => classByKey.get(key)!);
    await tx.schedule.deleteMany({
      where: {
        schoolId,
        timetableVersionId: target.id,
        OR: scopeClasses.map((c) => ({ grade: c.grade, section: c.section })),
        // Unlocked rows; on MongoDB `NOT: { locked: true }` would skip rows without the field.
        AND: [{ OR: [{ locked: false }, { locked: null }, { locked: { isSet: false } }] }],
      },
    });
    if (toWrite.length) {
      await tx.schedule.createMany({
        data: toWrite.map((lesson) => {
          const cls = classByKey.get(lesson.classKey)!;
          const time = timings.get(`${cls.grade}|${lesson.day}`)?.get(lesson.period);
          return {
            schoolId, timetableVersionId: target!.id, grade: cls.grade, section: cls.section, day: lesson.day, period: lesson.period,
            subject: lesson.subject, teacherId: lesson.teacherId, roomId: lesson.roomId,
            startTime: time?.startTime ?? '', endTime: time?.endTime ?? '', locked: false,
          };
        }),
      });
    }

    await tx.timetableVersion.update({
      where: { id: target.id },
      data: {
        // Regenerating an approved version needs a fresh approval.
        ...(target.status === 'approved' ? { status: 'draft', approvedBy: null, approvedAt: null } : {}),
        generationConfig: {
          engine: 'solver-v2',
          generatedAt: new Date().toISOString(),
          generatedBy: actor,
          seed,
          scope: scope ? { classes: [...scopeKeys] } : 'all',
          stats: result.stats,
          unallocated,
          skipped: loaded.skipped,
          autofix: { runId: autofix.runId, logIds: autofix.logIds },
        } as unknown as Prisma.InputJsonValue,
      },
    });
    return target.id;
  }, { timeout: 120000, maxWait: 20000 });

  // 8. Validate what was written, with the independent validator.
  const audit = await auditVersion(schoolId, versionId);
  const version = await db.timetableVersion.findUnique({ where: { id: versionId }, select: { id: true, version: true, status: true, name: true } });
  const unplaced = unallocated.reduce((sum, u) => sum + u.periods, 0);

  return {
    status: 200,
    body: {
      success: true,
      engine: 'solver-v2',
      version,
      message: `Draft v${version?.version} generated: ${toWrite.length} lesson(s) placed for ${scopeKeys.size} class(es)`
        + (unplaced ? `, ${unplaced} period(s) could not be placed (see Problems).` : '.')
        + ' Review, approve and publish to make it live.',
      stats: {
        totalClasses: scopeKeys.size,
        totalGenerated: toWrite.length,
        required: result.stats.required,
        unallocatedPeriods: unplaced,
        repairs: result.stats.repairs,
        errors: audit.errors,
        warnings: audit.warnings,
      },
      byRule: audit.byRule,
      unallocated,
      skipped: loaded.skipped,
      autoFixed: autofix.fixes.map((fix) => fix.summary),
      autofixLogIds: autofix.logIds,
    },
  };
}
