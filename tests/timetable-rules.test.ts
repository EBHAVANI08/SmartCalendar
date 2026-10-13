// npm run test:solver
// Scheduling rules: same teacher + same class back to back (Rule A), double
// periods, "Apart" minimum gaps, breaks, daily limits. Synthetic schools only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { solve } from '../src/lib/solver/solve';
import { toAuditInput } from '../src/lib/solver/to-audit';
import type { SolverInput, SolverLesson } from '../src/lib/solver/types';
import { auditTimetable } from '../src/lib/timetable-audit';

type Subject = { name: string; weekly: number; maxPerDay: number; teachers: string[]; allowConsecutive?: boolean; minGap?: number | null };

function school(options: { days?: string[]; periods: number; breaksAfter?: number[]; subjects: Subject[]; teachers: string[]; ruleA?: boolean; sections?: string[] }): SolverInput {
  const days = (options.days ?? ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']).map((day) => ({ day, periods: options.periods }));
  const classes = (options.sections ?? ['A']).map((section) => ({ key: `G1|${section}`, grade: 'G1', section, days, homeRoomId: null, breaksAfter: options.breaksAfter ?? [] }));
  return {
    classes,
    requirements: classes.flatMap((c) => options.subjects.map((s) => ({
      classKey: c.key, subject: s.name, weeklyPeriods: s.weekly, maxPerDay: s.maxPerDay, allowConsecutive: Boolean(s.allowConsecutive),
      minGap: s.minGap ?? null, requiredRoomType: null, core: false, teacherRequirement: 'required' as const, teacherIds: s.teachers,
    }))),
    teachers: options.teachers.map((id) => ({ id, name: id, maxWeekly: 40, maxDaily: 8, maxConsecutive: 8, unavailable: [] })),
    rooms: [],
    locked: [],
    rules: options.ruleA === undefined ? undefined : { noSameClassBackToBack: options.ruleA },
  };
}

/** Audit a hand-made timetable for one class (lessons in the given order of periods on Monday). */
function auditLessons(input: SolverInput, lessons: Omit<SolverLesson, 'classKey' | 'roomId' | 'locked'>[]) {
  const full = lessons.map((l) => ({ ...l, classKey: 'G1|A', roomId: null, locked: false }));
  return auditTimetable(toAuditInput(input, { lessons: full, unallocated: [], score: 0, stats: { placed: full.length, required: full.length, repairs: 0 } }))
    .filter((i) => i.severity === 'error' && i.rule !== 'weekly_quota' && i.rule !== 'section_missing');
}

const hardErrors = (input: SolverInput, seed = 1) => {
  const result = solve(input, { seed });
  return { result, errors: auditTimetable(toAuditInput(input, result)).filter((i) => i.severity === 'error') };
};

test('Rule A (default on): same teacher, same class, different subjects back to back is rejected', () => {
  const input = school({ periods: 3, subjects: [{ name: 'Maths', weekly: 1, maxPerDay: 1, teachers: ['T'] }, { name: 'Science', weekly: 1, maxPerDay: 1, teachers: ['T'] }], teachers: ['T'] });
  const issues = auditLessons(input, [
    { day: 'Monday', period: 1, subject: 'Maths', teacherId: 'T' },
    { day: 'Monday', period: 2, subject: 'Science', teacherId: 'T' },
  ]);
  assert.deepEqual(issues.map((i) => i.rule), ['teacher_same_class_consecutive']);
  assert.match(issues[0].message, /back to back on Monday/);
});

test('Rule A: a free period between them is accepted', () => {
  const input = school({ periods: 3, subjects: [{ name: 'Maths', weekly: 1, maxPerDay: 1, teachers: ['T'] }, { name: 'Science', weekly: 1, maxPerDay: 1, teachers: ['T'] }], teachers: ['T'] });
  assert.deepEqual(auditLessons(input, [
    { day: 'Monday', period: 1, subject: 'Maths', teacherId: 'T' },
    { day: 'Monday', period: 3, subject: 'Science', teacherId: 'T' },
  ]), []);
});

test('different teachers, different subjects back to back are accepted', () => {
  const input = school({ periods: 2, subjects: [{ name: 'Maths', weekly: 1, maxPerDay: 1, teachers: ['T1'] }, { name: 'Science', weekly: 1, maxPerDay: 1, teachers: ['T2'] }], teachers: ['T1', 'T2'] });
  assert.deepEqual(auditLessons(input, [
    { day: 'Monday', period: 1, subject: 'Maths', teacherId: 'T1' },
    { day: 'Monday', period: 2, subject: 'Science', teacherId: 'T2' },
  ]), []);
});

test('a teacher in two classes at the same time is always rejected', () => {
  const input = school({ periods: 2, sections: ['A', 'B'], subjects: [{ name: 'Maths', weekly: 1, maxPerDay: 1, teachers: ['T'] }], teachers: ['T'] });
  const issues = auditTimetable(toAuditInput(input, { lessons: [
    { classKey: 'G1|A', day: 'Monday', period: 1, subject: 'Maths', teacherId: 'T', roomId: null, locked: false },
    { classKey: 'G1|B', day: 'Monday', period: 1, subject: 'Maths', teacherId: 'T', roomId: null, locked: false },
  ], unallocated: [], score: 0, stats: { placed: 2, required: 2, repairs: 0 } }));
  assert.ok(issues.some((i) => i.rule === 'teacher_slot'));
});

test('generator: Rule A on leaves an impossible lesson unplaced with a reason; off places it; a break between also makes it fine', () => {
  const base = { days: ['Monday'], periods: 2, subjects: [{ name: 'Maths', weekly: 1, maxPerDay: 1, teachers: ['T'] }, { name: 'Science', weekly: 1, maxPerDay: 1, teachers: ['T'] }], teachers: ['T'] };
  const on = hardErrors(school(base));
  assert.equal(on.result.stats.placed, 1);
  assert.equal(on.result.unallocated.length, 1);
  assert.ok(on.result.unallocated[0].detail.length > 0, 'the conflict is explained');
  const off = hardErrors(school({ ...base, ruleA: false }));
  assert.equal(off.result.stats.placed, 2);
  assert.deepEqual(off.errors, [], 'switching Rule A off allows it; other rules still checked');
  const withBreak = hardErrors(school({ ...base, breaksAfter: [1] }));
  assert.equal(withBreak.result.stats.placed, 2, 'a break between the periods means they are not back to back');
  assert.deepEqual(withBreak.errors, []);
});

test('Together: a subject that may run as a double period is placed as consecutive pairs when it comes twice a day', () => {
  const input = school({ periods: 6, subjects: [
    { name: 'Lab', weekly: 10, maxPerDay: 2, allowConsecutive: true, teachers: ['L'] },
    { name: 'Language', weekly: 10, maxPerDay: 2, teachers: ['O1'] },
    { name: 'Social', weekly: 10, maxPerDay: 2, teachers: ['O2'] },
  ], teachers: ['L', 'O1', 'O2'] });
  const { result, errors } = hardErrors(input);
  assert.deepEqual(errors.map((e) => e.message), []);
  for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
    const periods = result.lessons.filter((l) => l.subject === 'Lab' && l.day === day).map((l) => l.period).sort((a, b) => a - b);
    assert.equal(periods.length, 2);
    assert.equal(periods[1] - periods[0], 1, `${day}: the two lab periods are together`);
  }
});

test('Together: never longer than a pair, and never across a break or lunch', () => {
  const input = school({ periods: 6, breaksAfter: [3], subjects: [{ name: 'Lab', weekly: 3, maxPerDay: 3, allowConsecutive: true, teachers: ['L'] }], teachers: ['L'] });
  // P2-P3 is a pair, P4 is after lunch: not a run of three.
  assert.deepEqual(auditLessons(input, [
    { day: 'Monday', period: 2, subject: 'Lab', teacherId: 'L' },
    { day: 'Monday', period: 3, subject: 'Lab', teacherId: 'L' },
    { day: 'Monday', period: 4, subject: 'Lab', teacherId: 'L' },
  ]), []);
  const noBreak = school({ periods: 6, subjects: [{ name: 'Lab', weekly: 3, maxPerDay: 3, allowConsecutive: true, teachers: ['L'] }], teachers: ['L'] });
  assert.ok(auditLessons(noBreak, [
    { day: 'Monday', period: 2, subject: 'Lab', teacherId: 'L' },
    { day: 'Monday', period: 3, subject: 'Lab', teacherId: 'L' },
    { day: 'Monday', period: 4, subject: 'Lab', teacherId: 'L' },
  ]).some((i) => i.rule === 'double_period'));
});

test('Apart: the configured minimum gap is respected by the generator and checked by the validator', () => {
  const input = school({ periods: 6, subjects: [
    { name: 'Maths', weekly: 10, maxPerDay: 2, minGap: 2, teachers: ['M'] },
    { name: 'Language', weekly: 10, maxPerDay: 2, teachers: ['O1'] },
    { name: 'Social', weekly: 10, maxPerDay: 2, teachers: ['O2'] },
  ], teachers: ['M', 'O1', 'O2'] });
  const { result, errors } = hardErrors(input);
  assert.deepEqual(errors.map((e) => e.message), []);
  for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
    const periods = result.lessons.filter((l) => l.subject === 'Maths' && l.day === day).map((l) => l.period).sort((a, b) => a - b);
    assert.ok(periods.length === 2 && periods[1] - periods[0] - 1 >= 2, `${day}: Maths at ${periods} has at least 2 periods between`);
  }
  const tooClose = auditLessons(input, [
    { day: 'Monday', period: 1, subject: 'Maths', teacherId: 'M' },
    { day: 'Monday', period: 3, subject: 'Maths', teacherId: 'M' },
  ]);
  assert.deepEqual(tooClose.map((i) => i.rule), ['subject_min_gap']);
});

test('no gap configured: no forced before/after-lunch split, only no back-to-back without a double period', () => {
  const input = school({ periods: 6, breaksAfter: [3], subjects: [{ name: 'Maths', weekly: 2, maxPerDay: 2, teachers: ['M'] }], teachers: ['M'] });
  assert.deepEqual(auditLessons(input, [
    { day: 'Monday', period: 1, subject: 'Maths', teacherId: 'M' },
    { day: 'Monday', period: 3, subject: 'Maths', teacherId: 'M' },
  ]), [], 'both before lunch is fine');
  assert.deepEqual(auditLessons(input, [
    { day: 'Monday', period: 1, subject: 'Maths', teacherId: 'M' },
    { day: 'Monday', period: 2, subject: 'Maths', teacherId: 'M' },
  ]).map((i) => i.rule), ['double_period'], 'same subject back to back needs the double-period setting');
});

test('the daily limit is never exceeded', () => {
  const input = school({ periods: 6, subjects: [{ name: 'Maths', weekly: 3, maxPerDay: 2, teachers: ['M'] }], teachers: ['M'] });
  const issues = auditLessons(input, [
    { day: 'Monday', period: 1, subject: 'Maths', teacherId: 'M' },
    { day: 'Monday', period: 3, subject: 'Maths', teacherId: 'M' },
    { day: 'Monday', period: 5, subject: 'Maths', teacherId: 'M' },
  ]);
  assert.ok(issues.some((i) => i.rule === 'daily_subject_limit'));
  const generated = hardErrors(school({ periods: 6, subjects: [{ name: 'Maths', weekly: 12, maxPerDay: 2, teachers: ['M'] }], teachers: ['M'] }));
  assert.equal(generated.result.stats.placed, 10, '5 days x 2 per day; the rest is reported, not forced');
  assert.equal(generated.result.unallocated[0].reason, 'daily_limit_too_low');
  assert.ok(!generated.errors.some((e) => e.rule === 'daily_subject_limit'));
});

test('a realistic school with teachers who teach two subjects: Rule A holds everywhere and nothing else breaks', () => {
  const input = school({ periods: 7, breaksAfter: [2, 4], sections: ['A', 'B', 'C'], subjects: [
    { name: 'Maths', weekly: 6, maxPerDay: 2, minGap: 1, teachers: ['T1', 'T2'] },
    { name: 'Science', weekly: 6, maxPerDay: 2, allowConsecutive: true, teachers: ['T1', 'T3'] },
    { name: 'Language', weekly: 6, maxPerDay: 2, teachers: ['T2', 'T4'] },
    { name: 'Social', weekly: 5, maxPerDay: 1, teachers: ['T3', 'T4'] },
    { name: 'Arts', weekly: 5, maxPerDay: 1, teachers: ['T5'] },
  ], teachers: ['T1', 'T2', 'T3', 'T4', 'T5'] });
  for (const seed of [1, 2, 3]) {
    const { result, errors } = hardErrors(input, seed);
    assert.deepEqual(errors.filter((e) => e.rule !== 'weekly_quota').map((e) => e.message), [], `seed ${seed}`);
    const unplaced = result.unallocated.reduce((s, u) => s + u.periods, 0);
    assert.equal(result.stats.placed + unplaced, result.stats.required, 'every period placed or reported');
  }
});
