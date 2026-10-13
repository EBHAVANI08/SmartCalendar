// npm run test:setup
import test from 'node:test';
import assert from 'node:assert/strict';
import { capViolations, parseUnavailable, teacherLoad, validateCaps, validateUnavailable, type SchoolWeekShape } from '../src/lib/workload';

// A synthetic week: five 8-period days and a 5-period day.
const week: SchoolWeekShape = {
  configured: true,
  days: [...['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((day) => ({ day, periods: 8 })), { day: 'Saturday', periods: 5 }],
  longestDay: 8,
  weeklySlots: 45,
};

test('teacher load: weekly count, busiest day and longest back-to-back run', () => {
  const load = teacherLoad([
    { day: 'Monday', period: 1 }, { day: 'Monday', period: 2 }, { day: 'Monday', period: 3 }, { day: 'Monday', period: 6 },
    { day: 'Tuesday', period: 4 }, { day: 'Tuesday', period: 5 },
  ]);
  assert.equal(load.weekly, 6);
  assert.deepEqual(load.busiestDay, { day: 'Monday', periods: 4 });
  assert.deepEqual(load.longestRun, { day: 'Monday', length: 3, from: 1, to: 3 });
  assert.deepEqual(teacherLoad([]), { weekly: 0, busiestDay: null, longestRun: null });
});

test('limits broken are named; missing limits break nothing', () => {
  const load = teacherLoad(Array.from({ length: 7 }, (_, i) => ({ day: 'Friday', period: i + 1 })));
  const problems = capViolations(load, { maxWeekly: 6, maxDaily: 5, maxConsecutive: 3 });
  assert.equal(problems.length, 3);
  assert.match(problems[0], /7 periods a week \(limit 6\)/);
  assert.match(problems[1], /7 periods on Friday \(limit 5\)/);
  assert.match(problems[2], /7 in a row on Friday, P1–P7 \(limit 3\)/);
  assert.deepEqual(capViolations(load, { maxWeekly: null, maxDaily: null, maxConsecutive: null }), []);
});

test('limits must be whole, consistent and fit the school week', () => {
  assert.deepEqual(validateCaps({ maxWeekly: 30, maxDaily: 6, maxConsecutive: 3 }, week, { allRequired: true }), []);
  assert.ok(validateCaps({ maxWeekly: null, maxDaily: 6, maxConsecutive: 3 }, week, { allRequired: true })[0].includes('required'));
  assert.ok(validateCaps({ maxWeekly: 0, maxDaily: 6, maxConsecutive: 3 }, week, { allRequired: true })[0].includes('at least 1'));
  assert.ok(validateCaps({ maxWeekly: 5, maxDaily: 6, maxConsecutive: 3 }, week, { allRequired: true }).some((e) => e.includes('per day cannot be more than periods per week')));
  assert.ok(validateCaps({ maxWeekly: 30, maxDaily: 4, maxConsecutive: 5 }, week, { allRequired: true }).some((e) => e.includes('in a row cannot be more than periods per day')));
  assert.ok(validateCaps({ maxWeekly: 30, maxDaily: 9, maxConsecutive: 3 }, week, { allRequired: true }).some((e) => e.includes('longest school day (8')));
  assert.ok(validateCaps({ maxWeekly: 46, maxDaily: 6, maxConsecutive: 3 }, week, { allRequired: true }).some((e) => e.includes('teaching periods in the week (45)')));
});

test('unavailable periods must exist in the school week', () => {
  assert.deepEqual(validateUnavailable([{ day: 'Saturday', period: 5 }], week), []);
  assert.ok(validateUnavailable([{ day: 'Saturday', period: 6 }, { day: 'Sunday', period: 1 }], week)[0].includes('Saturday P6, Sunday P1'));
  assert.deepEqual(parseUnavailable([{ day: 'Monday', period: '2' }, { day: '', period: 1 }, null, { day: 'Tuesday', period: 0 }]), [{ day: 'Monday', period: 2 }]);
});
