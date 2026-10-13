// npm run test:solver
import test from 'node:test';
import assert from 'node:assert/strict';
import { changedAreas, fingerprintOf } from '../src/lib/settings-fingerprint';
import { solve } from '../src/lib/solver/solve';
import { toAuditInput } from '../src/lib/solver/to-audit';
import type { SolverInput, SolverLesson } from '../src/lib/solver/types';
import { auditTimetable } from '../src/lib/timetable-audit';

// A small synthetic school; no real school's settings.
function school(): SolverInput {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((day) => ({ day, periods: 6 }));
  const classes = ['A', 'B'].map((section) => ({ key: `G1|${section}`, grade: 'G1', section, days, homeRoomId: null }));
  const subjects = [
    { name: 'Maths', weekly: 6, maxPerDay: 2, teachers: ['m1', 'm2'] },
    { name: 'Language', weekly: 5, maxPerDay: 1, teachers: ['l1'] },
    { name: 'Science', weekly: 5, maxPerDay: 1, teachers: ['s1'] },
  ];
  return {
    classes,
    requirements: classes.flatMap((c) => subjects.map((s) => ({
      classKey: c.key, subject: s.name, weeklyPeriods: s.weekly, maxPerDay: s.maxPerDay, allowConsecutive: false,
      requiredRoomType: null, core: false, teacherRequirement: 'required' as const, teacherIds: s.teachers,
    }))),
    teachers: ['m1', 'm2', 'l1', 's1'].map((id) => ({ id, name: id, maxWeekly: 20, maxDaily: 5, maxConsecutive: 3, unavailable: [] as { day: string; period: number }[] })),
    rooms: [],
    locked: [],
  };
}

test('the fingerprint changes only in the area that was edited', () => {
  const before = fingerprintOf(school());
  const edited = school();
  edited.teachers[0].unavailable = [{ day: 'Monday', period: 1 }];
  assert.deepEqual(changedAreas(before, fingerprintOf(edited)).map((c) => c.area), ['workload']);
  const quota = school();
  quota.requirements[0].weeklyPeriods = 5;
  assert.deepEqual(changedAreas(before, fingerprintOf(quota)).map((c) => c.area), ['subjects']);
  assert.deepEqual(changedAreas(before, fingerprintOf(school())), []);
  assert.deepEqual(changedAreas(undefined, before), [], 'versions made before fingerprints report nothing');
});

test('fixing after a settings change moves only the affected lessons', () => {
  const input = school();
  const first = solve(input, { seed: 1 });
  assert.equal(first.unallocated.length, 0);

  // Setting change: the language teacher can no longer teach the Monday periods she was given.
  const blocked = first.lessons.filter((l) => l.teacherId === 'l1' && l.day === 'Monday').map((l) => ({ day: l.day, period: l.period }));
  assert.ok(blocked.length > 0);
  const changed = school();
  changed.teachers.find((t) => t.id === 'l1')!.unavailable = blocked;
  const lessons = first.lessons.map((l, i) => ({ ...l, id: `r${i}` }));
  const issues = auditTimetable(toAuditInput(changed, { ...first, lessons })).filter((i) => i.severity === 'error');
  const audit = toAuditInput(changed, { ...first, lessons });
  const flagged = new Set(issues.flatMap((i) => i.slotIds));
  const flaggedLessons = lessons.filter((_, i) => flagged.has(audit.slots[i].id));
  assert.ok(flaggedLessons.length > 0 && flaggedLessons.every((l) => l.teacherId === 'l1' && l.day === 'Monday'), 'only her Monday lessons are flagged');

  // Repair: freeze everything else, solve only what is missing.
  const frozen: SolverLesson[] = lessons.filter((_, i) => !flagged.has(audit.slots[i].id)).map(({ id: _id, ...l }) => ({ ...l, locked: true }));
  const repaired = solve({ ...changed, locked: frozen }, { seed: 1 });
  const placedAgain = repaired.lessons.filter((l) => !l.locked);
  assert.equal(placedAgain.length, flaggedLessons.length, 'exactly the flagged lessons are placed again');
  for (const kept of frozen) {
    assert.ok(repaired.lessons.some((l) => l.locked && l.classKey === kept.classKey && l.day === kept.day && l.period === kept.period && l.subject === kept.subject && l.teacherId === kept.teacherId));
  }
  const after = auditTimetable(toAuditInput(changed, repaired)).filter((i) => i.severity === 'error');
  assert.deepEqual(after.map((i) => i.message), []);
  assert.ok(!repaired.lessons.some((l) => l.teacherId === 'l1' && blocked.some((b) => b.day === l.day && b.period === l.period)));
});
