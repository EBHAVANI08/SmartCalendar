// npm run test:setup
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateGradeCapacity } from '../src/lib/timetable-capacity';

// A synthetic week: five 8-period days and a 5-period sixth day = 45 slots.
const week = {
  workingDays: 6,
  periodsPerDay: 8,
  perDayPeriods: { Monday: 8, Tuesday: 8, Wednesday: 8, Thursday: 8, Friday: 8, Saturday: 5 },
};
const subject = (subjectName: string, weeklyPeriods: number, maxPeriodsPerDay = 2) => ({ subjectName, weeklyPeriods, maxPeriodsPerDay });

test('demand above the week is blocking', () => {
  const result = evaluateGradeCapacity('G', [subject('A', 20), subject('B', 20), subject('C', 7)], week);
  assert.equal(result.slots, 45);
  assert.equal(result.demand, 47);
  assert.equal(result.overBy, 2);
  assert.equal(result.ok, false);
});

test('demand that fits is ok, and unset (0) quotas are ignored', () => {
  const result = evaluateGradeCapacity('G', [subject('A', 40, 8), subject('B', 5), subject('C', 0)], week);
  assert.equal(result.demand, 45);
  assert.equal(result.ok, true);
  assert.equal(result.subjects.length, 2);
});

test('a weekly quota the per-day cap cannot reach is blocking', () => {
  const result = evaluateGradeCapacity('G', [subject('A', 13, 2)], week);
  assert.equal(result.subjectIssues.length, 1);
  assert.equal(result.subjectIssues[0].maxPlaceable, 12);
  assert.equal(result.ok, false);
});
