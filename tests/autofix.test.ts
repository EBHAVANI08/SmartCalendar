// npm run test:setup — made-up data only; no database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runEngine } from '../src/lib/autofix/engine';
import { planReduction } from '../src/lib/autofix/rules';
import { applyChanges, assertWritable, cloneSnapshot, revertChanges } from '../src/lib/autofix/snapshot-ops';
import type { Snapshot, SubjectConfigRow } from '../src/lib/autofix/types';

const NOW = '2030-01-01T00:00:00.000Z';
const CREATED = '2029-01-01T00:00:00.000Z';
const EDITED = '2029-06-01T00:00:00.000Z';
let nextId = 0;
const id = () => `id${++nextId}`;

function config(grade: string, subjectName: string, weeklyPeriods: number, extra: Partial<SubjectConfigRow> = {}): SubjectConfigRow {
  return {
    id: id(), grade, subjectName, weeklyPeriods, maxPeriodsPerDay: 2, priority: 'Normal', allowConsecutive: false,
    active: true, archivedAt: null, source: null, createdAt: CREATED, updatedAt: EDITED, ...extra,
  };
}

/** A synthetic week: five days of 6 periods = 30 slots, no breaks problems. */
function snapshot(partial: Partial<Snapshot> = {}): Snapshot {
  return {
    schoolId: 'school',
    dayConfig: {
      id: 'day', workingDays: 5, perDayPeriods: JSON.stringify({ Monday: 6, Tuesday: 6, Wednesday: 6, Thursday: 6, Friday: 6 }),
      startTime: '09:00', endTime: '14:00', breakEnabled: true, breakAfter: 2, breakMinutes: 10, lunchEnabled: true, lunchAfter: 4, lunchMinutes: 30, gradeConfigs: '{}',
    },
    subjectConfigs: [], subjectMasters: [], classSections: [], teachers: [], editableSchedules: [], teacherQualifications: [],
    frozenGrades: [], suppressed: [],
    ...partial,
  };
}

const run = (s: Snapshot) => runEngine(s, { now: NOW });
const rules = (result: ReturnType<typeof run>) => result.fixes.map((fix) => fix.rule);
const configNamed = (s: Snapshot, grade: string, subject: string) => s.subjectConfigs.find((c) => c.grade === grade && c.subjectName === subject && !c.archivedAt);

test('a clean setup produces no fixes, and the engine is idempotent', () => {
  const s = snapshot({ subjectConfigs: [config('Year A', 'Alpha', 10), config('Year A', 'Beta', 8, { maxPeriodsPerDay: 2 })] });
  assert.deepEqual(run(s).fixes, []);
  const messy = snapshot({ subjectConfigs: [config('Year A', 'alpha', 10), config('Year A', 'Alpha', 4)] });
  const first = run(messy);
  assert.ok(first.fixes.length > 0);
  assert.deepEqual(run(first.after).fixes, []);
});

test('auto-created rows: identical, never edited, not user-made → set inactive (tier 2)', () => {
  const placeholder = (subject: string) => config('Grade I', subject, 4, { updatedAt: CREATED, source: 'sync' });
  const s = snapshot({ subjectConfigs: [placeholder('A'), placeholder('B'), placeholder('C')] });
  const result = run(s);
  const fix = result.fixes.find((f) => f.rule === 'auto_created_rows');
  assert.ok(fix);
  assert.equal(fix.tier, 2);
  assert.ok(result.after.subjectConfigs.every((c) => !c.active));

  // Edited, user-made or differing rows are left alone.
  const edited = snapshot({ subjectConfigs: [placeholder('A'), placeholder('B'), config('Grade I', 'C', 4)] });
  assert.equal(rules(run(edited)).includes('auto_created_rows'), false);
  const userMade = snapshot({ subjectConfigs: [placeholder('A'), placeholder('B'), { ...placeholder('C'), source: 'user' }] });
  assert.equal(rules(run(userMade)).includes('auto_created_rows'), false);
});

test('duplicate grades merge into one name; the active row wins a collision; nothing is deleted', () => {
  const canonicalInactive = config('Grade 1', 'Music', 2, { active: false });
  const duplicateActive = config('Grade I', 'Music', 3, { maxPeriodsPerDay: 1 });
  const onlyDuplicate = config('Grade I', 'Art', 1);
  // The school's other grades use Arabic numerals, so "Grade 1" is the house spelling.
  const s = snapshot({
    subjectConfigs: [canonicalInactive, duplicateActive, onlyDuplicate, config('Grade 2', 'Art', 1), config('Grade 3', 'Art', 1)],
    classSections: [
      { id: 'sec1', grade: 'Grade 1', section: 'A', code: 'Grade1-A', academicYearId: 'y', active: true, archivedAt: null },
      { id: 'sec2', grade: 'Grade I', section: 'B', code: 'GradeI-B', academicYearId: 'y', active: true, archivedAt: null },
    ],
    teachers: [{ id: 't1', subject: 'Music', subjects: '["Music"]', grades: '["Grade I"]', sections: '["Music::Grade I:B"]' }],
  });
  const result = run(s);
  assert.ok(rules(result).includes('duplicate_grade'));
  const after = result.after;
  const music = after.subjectConfigs.find((c) => c.id === canonicalInactive.id)!;
  assert.deepEqual([music.grade, music.active, music.weeklyPeriods, music.maxPeriodsPerDay], ['Grade 1', true, 3, 1]);
  const archived = after.subjectConfigs.find((c) => c.id === duplicateActive.id)!;
  assert.equal(archived.archivedAt, NOW);
  assert.equal(archived.active, false);
  assert.equal(after.subjectConfigs.length, 5, 'rows are archived, never removed');
  assert.equal(after.subjectConfigs.find((c) => c.id === onlyDuplicate.id)!.grade, 'Grade 1');
  assert.deepEqual(after.classSections.find((c) => c.id === 'sec2'), { id: 'sec2', grade: 'Grade 1', section: 'B', code: 'Grade1-B', academicYearId: 'y', active: true, archivedAt: null });
  assert.equal(after.teachers[0].grades, '["Grade 1"]');
  assert.equal(after.teachers[0].sections, '["Music::Grade 1:B"]');
});

test('a grade name used by the published timetable is never renamed away', () => {
  const s = snapshot({
    subjectConfigs: [config('Grade I', 'Alpha', 2), config('Grade 1', 'Beta', 2)],
    frozenGrades: ['Grade I', 'Grade 1'],
  });
  const result = run(s);
  assert.equal(rules(result).includes('duplicate_grade'), false);
  assert.ok(result.unfixable.some((u) => u.rule === 'duplicate_grade' && !u.blocking));
});

test('duplicate subjects: case, spelling variant and initials merge; descriptive names stay apart', () => {
  const s = snapshot({
    subjectConfigs: [
      config('Year A', 'Kaushal Bodh', 2), config('Year A', 'Koushal Bodh', 1),
      config('Year B', 'Value Education', 1), config('Year B', 'VE', 1),
      config('Year A', 'Science', 3), config('Year A', 'Science Practical', 1),
      config('Year C', 'computer Science', 2), config('Year C', 'Computer Science', 2, { active: false }),
    ],
    subjectMasters: [
      { id: 'm1', name: 'Value Education', code: 'VALUE', active: true, archivedAt: null },
      { id: 'm2', name: 'VE', code: 'VE', active: true, archivedAt: null },
    ],
    teacherQualifications: [{ id: 'q1', teacherId: 't1', subjectId: 'm2' }],
    teachers: [{ id: 't1', subject: 'VE', subjects: '["VE","Science"]', grades: '[]', sections: null }],
    editableSchedules: [{ id: 'r1', timetableVersionId: 'draft', grade: 'Year B', section: 'A', day: 'Monday', period: 1, subject: 'VE' }],
  });
  const result = run(s);
  const after = result.after;
  const subjectsOf = (grade: string) => after.subjectConfigs.filter((c) => c.grade === grade && !c.archivedAt).map((c) => c.subjectName).sort();
  assert.deepEqual(subjectsOf('Year A'), ['Kaushal Bodh', 'Science', 'Science Practical']);
  assert.deepEqual(subjectsOf('Year B'), ['Value Education']);
  // The active row's settings win over the inactive canonical one.
  assert.equal(configNamed(after, 'Year C', 'Computer Science')!.active, true);
  assert.equal(after.subjectMasters.find((m) => m.id === 'm2')!.archivedAt, NOW);
  assert.equal(after.teacherQualifications[0].subjectId, 'm1');
  assert.equal(after.teachers[0].subject, 'Value Education');
  assert.equal(after.editableSchedules[0].subject, 'Value Education');
});

test('display names are tidied', () => {
  const s = snapshot({ subjectConfigs: [config('Year A', 'Information  Technology ', 2)] });
  const result = run(s);
  assert.ok(rules(result).includes('display_name'));
  assert.equal(result.after.subjectConfigs[0].subjectName, 'Information Technology');
});

test('daily cap below the weekly need is raised to ceil(weekly / working days)', () => {
  const s = snapshot({ subjectConfigs: [config('Year A', 'Alpha', 7, { maxPeriodsPerDay: 1 })] });
  const result = run(s);
  const fix = result.fixes.find((f) => f.rule === 'daily_cap_too_low');
  assert.ok(fix);
  assert.equal(result.after.subjectConfigs[0].maxPeriodsPerDay, 2);
});

test('inactive subjects never count toward demand', () => {
  const s = snapshot({ subjectConfigs: [config('Year A', 'Alpha', 25), config('Year A', 'Beta', 25, { active: false })] });
  assert.equal(rules(run(s)).includes('over_capacity'), false);
});

test('bell: 0-minute break switched off, out-of-range clamped, same-period keeps the longer', () => {
  const zero = snapshot();
  zero.dayConfig!.breakMinutes = 0;
  const z = run(zero);
  assert.ok(rules(z).includes('break_zero_minutes'));
  assert.equal(z.after.dayConfig!.breakEnabled, false);

  const range = snapshot();
  range.dayConfig!.lunchAfter = 9;
  const r = run(range);
  assert.ok(rules(r).includes('break_out_of_range'));
  assert.equal(r.after.dayConfig!.lunchAfter, 5);

  const same = snapshot();
  same.dayConfig!.breakAfter = 3;
  same.dayConfig!.lunchAfter = 3;
  const m = run(same);
  assert.ok(rules(m).includes('break_same_period'));
  assert.equal(m.after.dayConfig!.breakEnabled, false, 'the shorter break goes');
  assert.equal(m.after.dayConfig!.lunchEnabled, true);

  // A grade override is fixed inside its own settings.
  const override = snapshot();
  override.dayConfig!.gradeConfigs = JSON.stringify({ 'Year A': { enabled: true, workingDays: 5, periodsPerDay: 6, breakEnabled: true, breakMinutes: 0, breakAfter: 2, lunchEnabled: true, lunchAfter: 4, lunchMinutes: 30 } });
  const o = run(override);
  assert.equal(JSON.parse(o.after.dayConfig!.gradeConfigs!)['Year A'].breakEnabled, false);
  assert.equal(o.after.dayConfig!.breakEnabled, true, 'the school default is untouched');
});

test('over capacity: lowest priority first, largest quota first, never below 1, Core last (tier 2)', () => {
  const rows = [
    config('Y', 'CoreA', 10, { priority: 'Core' }),
    config('Y', 'NormalBig', 9),
    config('Y', 'NormalSmall', 3),
    config('Y', 'LowA', 2, { priority: 'Low' }),
    config('Y', 'HighA', 8, { priority: 'High' }),
  ];
  const { reductions, remaining } = planReduction(rows, 5);
  assert.equal(remaining, 0);
  const after = (name: string) => reductions.get(rows.find((r) => r.subjectName === name)!.id);
  assert.equal(after('LowA'), 1);         // Low goes first, down to 1
  assert.equal(after('NormalBig'), 5);    // then the largest Normal
  assert.equal(after('CoreA'), undefined);
  assert.equal(after('HighA'), undefined);

  // Core is only reduced once everything else is at 1.
  const tight = [config('Y', 'CoreA', 10, { priority: 'Core' }), config('Y', 'Other', 2)];
  const plan = planReduction(tight, 3);
  assert.equal(plan.reductions.get(tight[1].id), 1);
  assert.equal(plan.reductions.get(tight[0].id), 8);

  const s = snapshot({ subjectConfigs: [config('Y', 'A', 20), config('Y', 'B', 15)] });
  const result = run(s);
  const fix = result.fixes.find((f) => f.rule === 'over_capacity')!;
  assert.equal(fix.tier, 2);
  assert.match(fix.summary, /reduced from 35 → 30/);
  assert.equal(result.after.subjectConfigs.reduce((sum, c) => sum + c.weeklyPeriods, 0), 30);
});

test('over capacity that cannot be fixed (too many subjects) blocks only that grade', () => {
  const many = Array.from({ length: 32 }, (_, index) => config('Y', `S${index}`, 1));
  const result = run(snapshot({ subjectConfigs: [...many, config('Z', 'Fine', 5)] }));
  const blocking = result.unfixable.filter((u) => u.blocking);
  assert.equal(blocking.length, 1);
  assert.equal(blocking[0].grade, 'Y');
});

test('undo restores every row, refuses when the rows changed since, and an undone fix is not re-applied', () => {
  const s = snapshot({ subjectConfigs: [config('Y', 'A', 20), config('Y', 'B', 15)] });
  const result = run(s);
  const fix = result.fixes.find((f) => f.rule === 'over_capacity')!;
  const state = cloneSnapshot(s);
  applyChanges(state, fix.changes);

  const edited = cloneSnapshot(state);
  edited.subjectConfigs[0].weeklyPeriods = 99;
  assert.equal(revertChanges(edited, fix.changes).ok, false);

  assert.equal(revertChanges(state, fix.changes).ok, true);
  assert.deepEqual(state.subjectConfigs.map((c) => c.weeklyPeriods), [20, 15]);

  const again = run({ ...state, suppressed: [fix.suppressKey] });
  assert.equal(rules(again).includes('over_capacity'), false);
  assert.ok(again.unfixable.some((u) => u.rule === 'over_capacity' && u.blocking && u.grade === 'Y'));
  // Once the school changes the quotas, the rule applies again.
  again.after.subjectConfigs[0].weeklyPeriods = 25;
  assert.ok(rules(run({ ...again.after, suppressed: [fix.suppressKey] })).includes('over_capacity'));
});

test('tier 3: auto-fix can never write credentials, roles or timetable assignments', () => {
  assert.throws(() => assertWritable({ model: 'teacher', id: 't', before: {}, after: { password: 'x' } }));
  assert.throws(() => assertWritable({ model: 'teacher', id: 't', before: {}, after: { role: 'admin' } }));
  assert.throws(() => assertWritable({ model: 'schedule', id: 'r', before: {}, after: { teacherId: 'x' } }));
  assert.doesNotThrow(() => assertWritable({ model: 'schedule', id: 'r', before: {}, after: { subject: 'x' } }));
});
