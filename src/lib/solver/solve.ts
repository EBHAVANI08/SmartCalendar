import { PREVIOUS_SLOT_BONUS, SOLVER_REPAIR_ATTEMPTS_PER_LESSON, SOLVER_RESTARTS } from '@/lib/scheduling-constants';
import type {
  SolverInput, SolverLesson, SolverRequirement, SolverResult, SolverTeacher, Unallocated, UnallocatedReason,
} from '@/lib/solver/types';

/**
 * Timetable solver. Pure: no database access.
 *
 * Hard rules (never broken): one lesson per class, teacher and room per slot;
 * per class+subject per day at most maxPerDay; exactly weeklyPeriods (never
 * more; anything that cannot be placed is reported, never padded); teacher
 * weekly/daily/consecutive caps and unavailable slots; double periods only
 * when allowed and only as pairs; specialised rooms of the required type,
 * at most maxParallelClasses classes per room; locked lessons untouched.
 * Subjects whose teacherRequirement is "none" get no teacher and no room;
 * "optional" ones get a qualified free teacher when there is one.
 *
 * Soft goals (scored): spread a subject over distinct days, vary the period
 * number, few teacher gaps, balanced teacher days, core subjects earlier.
 */

const slotKey = (day: string, period: number) => `${day}|${period}`;

/** Small seeded PRNG so a given seed always gives the same timetable. */
function random(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Longest chain of periods where each is back to back with the next. */
function runLength(periods: number[], touching: (a: number, b: number) => boolean): number {
  const sorted = [...new Set(periods)].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let index = 0; index < sorted.length; index++) {
    run = index > 0 && touching(sorted[index - 1], sorted[index]) ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

function longestRun(periods: number[]): number {
  const sorted = [...new Set(periods)].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let index = 0; index < sorted.length; index++) {
    run = index > 0 && sorted[index] === sorted[index - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

const hasCaps = (t: SolverTeacher) => t.maxWeekly !== null || t.maxDaily !== null || t.maxConsecutive !== null;

/**
 * Runs the solver from several seeds derived from `seed` and keeps the run that
 * places the most lessons, then the best soft score. Deterministic per seed.
 */
export function solve(input: SolverInput, options: { seed?: number; restarts?: number } = {}): SolverResult {
  const seed = options.seed ?? 1;
  const restarts = Math.max(1, options.restarts ?? SOLVER_RESTARTS);
  let best: SolverResult | null = null;
  for (let run = 0; run < restarts; run++) {
    const result = solveOnce(input, seed * 7919 + run);
    if (!best || result.stats.placed > best.stats.placed || (result.stats.placed === best.stats.placed && result.score > best.score)) best = result;
    if (best.stats.placed === best.stats.required && run > 0) break;
  }
  return best!;
}

function solveOnce(input: SolverInput, seed: number): SolverResult {
  const rand = random(seed);
  const classByKey = new Map(input.classes.map((c) => [c.key, c]));
  const teacherById = new Map(input.teachers.map((t) => [t.id, t]));
  const roomCapacity = new Map(input.rooms.map((r) => [r.id, Math.max(1, r.maxParallelClasses ?? 1)]));
  const roomsByType = new Map<string, string[]>();
  for (const room of input.rooms) {
    if (!roomsByType.has(room.type)) roomsByType.set(room.type, []);
    roomsByType.get(room.type)!.push(room.id);
  }

  // ── State and indexes ─────────────────────────────────────────────────────
  const lessons: (SolverLesson | null)[] = [];
  const classSlot = new Map<string, number>();        // class|day|period → lesson index
  const teacherSlot = new Map<string, number>();      // teacher|day|period → lesson index
  const roomUse = new Map<string, number>();          // room|day|period → classes in it
  const teacherDayPeriods = new Map<string, number[]>(); // teacher|day → periods
  const teacherWeek = new Map<string, number>();
  const subjectDayPeriods = new Map<string, number[]>(); // class|subject|day → periods
  const subjectPeriodUse = new Map<string, Set<number>>(); // class|subject → period numbers used
  const unavailable = new Set(input.teachers.flatMap((t) => t.unavailable.map((u) => `${t.id}|${slotKey(u.day, u.period)}`)));

  const pushTo = <K>(map: Map<K, number[]>, key: K, value: number) => { if (!map.has(key)) map.set(key, []); map.get(key)!.push(value); };
  const removeFrom = <K>(map: Map<K, number[]>, key: K, value: number) => {
    const list = map.get(key);
    if (!list) return;
    const index = list.indexOf(value);
    if (index >= 0) list.splice(index, 1);
  };

  function add(lesson: SolverLesson): number {
    const index = lessons.push(lesson) - 1;
    index_(lesson, index);
    return index;
  }
  function index_(lesson: SolverLesson, index: number) {
    const k = slotKey(lesson.day, lesson.period);
    classSlot.set(`${lesson.classKey}|${k}`, index);
    if (lesson.roomId) roomUse.set(`${lesson.roomId}|${k}`, (roomUse.get(`${lesson.roomId}|${k}`) ?? 0) + 1);
    if (lesson.teacherId) {
      teacherSlot.set(`${lesson.teacherId}|${k}`, index);
      pushTo(teacherDayPeriods, `${lesson.teacherId}|${lesson.day}`, lesson.period);
      teacherWeek.set(lesson.teacherId, (teacherWeek.get(lesson.teacherId) ?? 0) + 1);
    }
    pushTo(subjectDayPeriods, `${lesson.classKey}|${lesson.subject}|${lesson.day}`, lesson.period);
    const use = subjectPeriodUse.get(`${lesson.classKey}|${lesson.subject}`) ?? new Set<number>();
    use.add(lesson.period);
    subjectPeriodUse.set(`${lesson.classKey}|${lesson.subject}`, use);
  }
  function remove(index: number): SolverLesson {
    const lesson = lessons[index]!;
    const k = slotKey(lesson.day, lesson.period);
    classSlot.delete(`${lesson.classKey}|${k}`);
    if (lesson.roomId) roomUse.set(`${lesson.roomId}|${k}`, (roomUse.get(`${lesson.roomId}|${k}`) ?? 1) - 1);
    if (lesson.teacherId) {
      teacherSlot.delete(`${lesson.teacherId}|${k}`);
      removeFrom(teacherDayPeriods, `${lesson.teacherId}|${lesson.day}`, lesson.period);
      teacherWeek.set(lesson.teacherId, (teacherWeek.get(lesson.teacherId) ?? 1) - 1);
    }
    removeFrom(subjectDayPeriods, `${lesson.classKey}|${lesson.subject}|${lesson.day}`, lesson.period);
    const stillUsed = lessons.some((other, i) => i !== index && other && other.classKey === lesson.classKey && other.subject === lesson.subject && other.period === lesson.period);
    if (!stillUsed) subjectPeriodUse.get(`${lesson.classKey}|${lesson.subject}`)?.delete(lesson.period);
    lessons[index] = null;
    return lesson;
  }
  function restore(index: number, lesson: SolverLesson) {
    lessons[index] = lesson;
    index_(lesson, index);
  }

  // ── Hard checks ───────────────────────────────────────────────────────────
  /** Two periods are back to back when adjacent with no break or lunch between them. */
  const breaksByClass = new Map(input.classes.map((c) => [c.key, new Set(c.breaksAfter ?? [])]));
  function touchingFor(classKey: string) {
    const breaks = breaksByClass.get(classKey) ?? new Set<number>();
    return (a: number, b: number) => Math.abs(a - b) === 1 && !breaks.has(Math.min(a, b));
  }

  /** The room a lesson would use at this slot, or undefined when none is free. */
  function roomFor(req: SolverRequirement, day: string, period: number): string | null | undefined {
    if (req.teacherRequirement === 'none') return null;
    const k = slotKey(day, period);
    const free = (id: string) => (roomUse.get(`${id}|${k}`) ?? 0) < (roomCapacity.get(id) ?? 1);
    if (req.requiredRoomType) return (roomsByType.get(req.requiredRoomType) ?? []).find(free);
    const home = classByKey.get(req.classKey)?.homeRoomId ?? null;
    return home && free(home) ? home : null;
  }

  /** teacherId null: a lesson without a teacher (subjects that do not require one). */
  function feasible(req: SolverRequirement, teacherId: string | null, day: string, period: number): { ok: true; roomId: string | null } | { ok: false } {
    const cls = classByKey.get(req.classKey);
    const dayShape = cls?.days.find((d) => d.day === day);
    if (!dayShape || period < 1 || period > dayShape.periods) return { ok: false };
    const k = slotKey(day, period);
    if (classSlot.has(`${req.classKey}|${k}`)) return { ok: false };
    if (teacherId) {
      if (teacherSlot.has(`${teacherId}|${k}`) || unavailable.has(`${teacherId}|${k}`)) return { ok: false };
      const teacher = teacherById.get(teacherId);
      if (!teacher || !hasCaps(teacher)) return { ok: false };
      if (teacher.maxWeekly !== null && (teacherWeek.get(teacherId) ?? 0) >= teacher.maxWeekly) return { ok: false };
      const dayPeriods = teacherDayPeriods.get(`${teacherId}|${day}`) ?? [];
      if (teacher.maxDaily !== null && dayPeriods.length >= teacher.maxDaily) return { ok: false };
      if (teacher.maxConsecutive !== null && longestRun([...dayPeriods, period]) > teacher.maxConsecutive) return { ok: false };
    } else if (req.teacherRequirement === 'required') {
      return { ok: false };
    }
    const subjectPeriods = subjectDayPeriods.get(`${req.classKey}|${req.subject}|${day}`) ?? [];
    if (subjectPeriods.length >= req.maxPerDay) return { ok: false };
    const touching = touchingFor(req.classKey);
    for (const p of subjectPeriods) {
      if (touching(p, period)) {
        // Back to back with the same subject is a double period: only when allowed.
        if (!req.allowConsecutive) return { ok: false };
      } else if (req.minGap != null && Math.abs(p - period) - 1 < req.minGap) {
        return { ok: false };                                              // "Apart": minimum gap
      }
    }
    if (req.allowConsecutive && runLength([...subjectPeriods, period], touching) > 2) return { ok: false }; // pairs only
    // Rule A: the same teacher does not teach this class a different subject
    // in the period just before or after (breaks and lunch separate periods).
    if (teacherId && input.rules?.noSameClassBackToBack !== false) {
      for (const neighbour of [period - 1, period + 1]) {
        if (!touching(neighbour, period)) continue;
        const index = classSlot.get(`${req.classKey}|${slotKey(day, neighbour)}`);
        const other = index === undefined ? null : lessons[index];
        if (other && other.teacherId === teacherId && other.subject !== req.subject) return { ok: false };
      }
    }
    const roomId = roomFor(req, day, period);
    if (roomId === undefined) return { ok: false };
    return { ok: true, roomId };
  }

  // ── Soft score ────────────────────────────────────────────────────────────
  // Lessons' old slots (soft): a rearranged class keeps as much as it can.
  const previousSlots = new Map((input.previous ?? []).map((p) => [`${p.classKey}|${p.subject}|${p.day}|${p.period}`, p.teacherId]));

  function score(req: SolverRequirement, teacherId: string | null, day: string, period: number, maxPeriods: number): number {
    let value = 0;
    const samePeriods = subjectDayPeriods.get(`${req.classKey}|${req.subject}|${day}`) ?? [];
    const sameDay = samePeriods.length;
    value += sameDay === 0 ? 50 : -40;                                     // spread over distinct days
    if (sameDay > 0) {
      const touching = touchingFor(req.classKey);
      if (req.allowConsecutive && samePeriods.some((p) => touching(p, period))) value += 70; // "Together": keep the pair
      else value += 3 * Math.min(...samePeriods.map((p) => Math.abs(p - period))); // otherwise apart within the day
    }
    if (subjectPeriodUse.get(`${req.classKey}|${req.subject}`)?.has(period)) value -= 12; // vary the period number
    const dayPeriods = teacherId ? teacherDayPeriods.get(`${teacherId}|${day}`) ?? [] : [];
    if (dayPeriods.length) {
      const gaps = (list: number[]) => (list.length < 2 ? 0 : Math.max(...list) - Math.min(...list) + 1 - list.length);
      value -= 8 * (gaps([...dayPeriods, period]) - gaps(dayPeriods));     // fewer teacher gaps
    }
    value -= 3 * dayPeriods.length;                                        // balance the teacher's days
    value += req.core ? 2 * (maxPeriods - period) : 0;                     // core subjects earlier
    if (previousSlots.has(`${req.classKey}|${req.subject}|${day}|${period}`)) {
      value += PREVIOUS_SLOT_BONUS + (previousSlots.get(`${req.classKey}|${req.subject}|${day}|${period}`) === teacherId ? PREVIOUS_SLOT_BONUS / 2 : 0);
    }
    return value + rand();                                                 // seeded tie-break
  }

  // ── Locked lessons first, exactly as they are ─────────────────────────────
  for (const lesson of input.locked) add({ ...lesson, locked: true });
  const lockedCount = new Map<string, number>();
  for (const lesson of input.locked) lockedCount.set(`${lesson.classKey}|${lesson.subject}`, (lockedCount.get(`${lesson.classKey}|${lesson.subject}`) ?? 0) + 1);

  // ── Teacher per class+subject: one teacher, within weekly capacity ─────────
  const unallocated: Unallocated[] = [];
  const primary = new Map<SolverRequirement, string | null>();
  const planned = new Map<string, number>(input.teachers.map((t) => [t.id, teacherWeek.get(t.id) ?? 0]));
  const usable = (req: SolverRequirement) => req.teacherIds.filter((id) => { const t = teacherById.get(id); return t && hasCaps(t); });
  const need = (req: SolverRequirement) => Math.max(0, req.weeklyPeriods - (lockedCount.get(`${req.classKey}|${req.subject}`) ?? 0));
  const needsTeacher = (req: SolverRequirement) => req.teacherRequirement === 'required';
  const ordered = [...input.requirements].sort((a, b) =>
    Number(needsTeacher(b)) - Number(needsTeacher(a)) ||
    Number(Boolean(b.requiredRoomType)) - Number(Boolean(a.requiredRoomType))
    || usable(a).length - usable(b).length
    || need(b) - need(a)
    || a.classKey.localeCompare(b.classKey) || a.subject.localeCompare(b.subject));
  const active: SolverRequirement[] = [];
  for (const req of ordered) {
    const count = need(req);
    if (!count) continue;
    if (req.teacherRequirement === 'none' || (req.teacherRequirement === 'optional' && !usable(req).length)) {
      primary.set(req, null);
      active.push(req);
      continue;
    }
    if (!req.teacherIds.length) {
      unallocated.push({ classKey: req.classKey, subject: req.subject, periods: count, reason: 'no_qualified_teacher', detail: 'No teacher in the Faculty Directory is qualified for this subject in this class.' });
      continue;
    }
    const candidates = usable(req);
    if (!candidates.length) {
      unallocated.push({ classKey: req.classKey, subject: req.subject, periods: count, reason: 'workload_rule_missing', detail: 'The qualified teachers have no workload rule and the school has no default caps.' });
      continue;
    }
    const room = (id: string) => { const t = teacherById.get(id)!; return t.maxWeekly === null ? Infinity : t.maxWeekly - (planned.get(id) ?? 0); };
    const best = [...candidates].sort((a, b) => Number(room(b) >= count) - Number(room(a) >= count) || room(b) - room(a))[0];
    primary.set(req, best);
    planned.set(best, (planned.get(best) ?? 0) + count);
    active.push(req);
  }

  // ── Placement: round-robin over requirements, hardest first ───────────────
  let repairs = 0;
  let totalScore = 0;
  const remaining = new Map(active.map((req) => [req, need(req)]));
  const failed = new Map<SolverRequirement, number>();

  /** Teachers to try, in order; null (no teacher) comes last and only when the subject allows it. */
  function teachersFor(req: SolverRequirement, first: string | null = primary.get(req) ?? null): (string | null)[] {
    if (req.teacherRequirement === 'none') return [null];
    const ids = [...(first ? [first] : []), ...usable(req).filter((id) => id !== first)];
    return req.teacherRequirement === 'optional' ? [...ids, null] : ids;
  }

  function placeBest(req: SolverRequirement): boolean {
    const cls = classByKey.get(req.classKey)!;
    const maxPeriods = Math.max(...cls.days.map((d) => d.periods));
    for (const teacherId of teachersFor(req)) {
      let best: { day: string; period: number; roomId: string | null; value: number } | null = null;
      for (const { day, periods } of cls.days) {
        for (let period = 1; period <= periods; period++) {
          const check = feasible(req, teacherId, day, period);
          if (!check.ok) continue;
          const value = score(req, teacherId, day, period, maxPeriods);
          if (!best || value > best.value) best = { day, period, roomId: check.roomId, value };
        }
      }
      if (best) {
        add({ classKey: req.classKey, day: best.day, period: best.period, subject: req.subject, teacherId, roomId: best.roomId, locked: false });
        totalScore += best.value;
        return true;
      }
    }
    return false;
  }

  /** Re-places a removed lesson anywhere it fits (same teacher first). */
  function rehome(lesson: SolverLesson): boolean {
    const req = input.requirements.find((r) => r.classKey === lesson.classKey && r.subject === lesson.subject);
    if (!req) return false;
    const cls = classByKey.get(req.classKey)!;
    for (const teacherId of teachersFor(req, lesson.teacherId)) {
      for (const { day, periods } of cls.days) {
        for (let period = 1; period <= periods; period++) {
          if (day === lesson.day && period === lesson.period) continue;
          const check = feasible(req, teacherId, day, period);
          if (check.ok) {
            add({ ...lesson, day, period, teacherId, roomId: check.roomId });
            return true;
          }
        }
      }
    }
    return false;
  }

  /** Frees a slot by moving the class's and/or the teacher's lesson there elsewhere. */
  function repair(req: SolverRequirement): boolean {
    const cls = classByKey.get(req.classKey)!;
    let attempts = 0;
    for (const teacherId of teachersFor(req)) {
      for (const { day, periods } of cls.days) {
        for (let period = 1; period <= periods; period++) {
          if (attempts++ > SOLVER_REPAIR_ATTEMPTS_PER_LESSON) return false;
          const k = slotKey(day, period);
          const blockers = [...new Set([classSlot.get(`${req.classKey}|${k}`), teacherId ? teacherSlot.get(`${teacherId}|${k}`) : undefined].filter((i): i is number => i !== undefined))];
          if (!blockers.length || blockers.some((i) => lessons[i]!.locked)) continue;
          const removed = blockers.map((i) => ({ index: i, lesson: remove(i) }));
          const check = feasible(req, teacherId, day, period);
          if (check.ok) {
            const placedIndex = add({ classKey: req.classKey, day, period, subject: req.subject, teacherId, roomId: check.roomId, locked: false });
            const moved: number[] = [];
            let allMoved = true;
            for (const { lesson } of removed) {
              const before = lessons.length;
              if (rehome(lesson)) moved.push(before);
              else { allMoved = false; break; }
            }
            if (allMoved) { repairs++; return true; }
            for (const index of moved.reverse()) remove(index);
            remove(placedIndex);
          }
          for (const { index, lesson } of removed.reverse()) restore(index, lesson);
        }
      }
    }
    return false;
  }

  for (let round = 0; [...remaining.values()].some((n) => n > 0); round++) {
    for (const req of active) {
      if ((remaining.get(req) ?? 0) <= 0) continue;
      remaining.set(req, remaining.get(req)! - 1);
      if (placeBest(req) || repair(req)) continue;
      failed.set(req, (failed.get(req) ?? 0) + 1);
    }
  }

  // ── Why each unplaced lesson could not be placed ──────────────────────────
  for (const [req, count] of failed) {
    const cls = classByKey.get(req.classKey)!;
    const slots = cls.days.reduce((sum, d) => sum + d.periods, 0);
    const used = lessons.filter((l) => l && l.classKey === req.classKey).length;
    let reason: UnallocatedReason = 'no_feasible_slot';
    let detail = 'No slot satisfies every hard rule (class, teacher, room, daily limit and teacher caps) at once.';
    const dayRoom = cls.days.reduce((sum, d) => sum + Math.min(req.maxPerDay, d.periods), 0);
    if (req.weeklyPeriods > dayRoom) {
      reason = 'daily_limit_too_low';
      detail = `${req.weeklyPeriods}/week does not fit at most ${req.maxPerDay} a day over ${cls.days.length} day(s) (${dayRoom} at most).`;
    } else if (used >= slots) {
      reason = 'grade_over_capacity';
      detail = `The class's week (${slots} periods) is full; its subjects need more periods than it has.`;
    } else if (req.requiredRoomType && !(roomsByType.get(req.requiredRoomType)?.length)) {
      reason = 'no_room_of_type';
      detail = `The school has no room of type "${req.requiredRoomType}".`;
    } else if (needsTeacher(req) && usable(req).every((id) => { const t = teacherById.get(id)!; return t.maxWeekly !== null && (teacherWeek.get(id) ?? 0) >= t.maxWeekly; })) {
      reason = 'teacher_capacity';
      detail = 'Every qualified teacher is at their weekly limit.';
    }
    unallocated.push({ classKey: req.classKey, subject: req.subject, periods: count, reason, detail });
  }

  const placed = lessons.filter((l): l is SolverLesson => Boolean(l));
  const required = input.requirements.reduce((sum, r) => sum + r.weeklyPeriods, 0);
  return { lessons: placed, unallocated, score: Math.round(totalScore), stats: { placed: placed.length, required, repairs } };
}
