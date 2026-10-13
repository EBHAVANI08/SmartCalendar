// npm run test:setup
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBellTimeline, periodTimingsForDay, validateBellConfig } from '../src/lib/timetable-constraints';
import { resolveDayConfig } from '../src/lib/timetable-config';

// Synthetic settings; nothing here is a real school's configuration.
const week = {
  workingDays: 6,
  periodsPerDay: 8,
  perDayPeriods: { Monday: 8, Tuesday: 8, Wednesday: 8, Thursday: 8, Friday: 8, Saturday: 5 },
};
const bell = {
  startTime: '08:00',
  endTime: '13:45',
  breakEnabled: true,
  breakAfter: 2,
  breakMinutes: 15,
  lunchEnabled: true,
  lunchAfter: 4,
  lunchMinutes: 30,
};

test('a full day ends exactly at the configured end time', () => {
  const timeline = buildBellTimeline({ ...week, ...bell });
  const periods = timeline.filter((item) => item.kind === 'period');
  assert.equal(periods.length, 8);
  assert.equal(periods[0].startTime, '08:00');
  assert.equal(periods[7].endTime, '13:45');
  assert.deepEqual(timeline.filter((item) => item.kind !== 'period').map((item) => item.kind), ['break', 'lunch']);
});

test('a shorter day uses the same period times and ends earlier', () => {
  const monday = periodTimingsForDay({ ...week, ...bell }, 'Monday');
  const saturday = periodTimingsForDay({ ...week, ...bell }, 'Saturday');
  assert.equal(saturday.length, 5);
  assert.deepEqual(saturday, monday.slice(0, 5));
});

test('a disabled break takes no time', () => {
  const timeline = buildBellTimeline({ ...week, ...bell, breakEnabled: false });
  assert.equal(timeline.some((item) => item.kind === 'break'), false);
  assert.equal(timeline.filter((item) => item.kind === 'period').at(-1)?.endTime, '13:45');
});

test('validation: enabled 0-minute break, same-period breaks, bad times', () => {
  assert.deepEqual(validateBellConfig({ ...week, ...bell }), []);
  assert.match(validateBellConfig({ ...week, ...bell, breakMinutes: 0 }).join(' '), /0 minutes/);
  assert.match(validateBellConfig({ ...week, ...bell, breakAfter: 3, lunchAfter: 3 }).join(' '), /both after period 3/);
  assert.match(validateBellConfig({ ...week, ...bell, breakAfter: 8 }).join(' '), /between 1 and 7/);
  assert.match(validateBellConfig({ ...week, ...bell, endTime: '07:00' }).join(' '), /end after it starts/);
  assert.match(validateBellConfig({ ...week, ...bell, endTime: '09:00' }).join(' '), /minutes per period/);
  // A switched-off break is not validated.
  assert.deepEqual(validateBellConfig({ ...week, ...bell, breakEnabled: false, breakMinutes: 0, breakAfter: 4 }), []);
});

test('rows saved before the switches existed: a 0-minute break is off', () => {
  const row = {
    workingDays: 6,
    perDayPeriods: JSON.stringify(week.perDayPeriods),
    startTime: '08:00',
    endTime: '13:45',
    breakAfter: 3,
    breakMinutes: 0,
    lunchAfter: 3,
    lunchMinutes: 30,
    gradeConfigs: '{}',
  };
  const config = resolveDayConfig('school', row, null);
  assert.equal(config.breakEnabled, false);
  assert.equal(config.lunchEnabled, true);
  assert.deepEqual(validateBellConfig(config), []);
});

test('grade overrides are found under any spelling of the grade', () => {
  const row = {
    workingDays: 6,
    perDayPeriods: JSON.stringify(week.perDayPeriods),
    ...bell,
    gradeConfigs: JSON.stringify({ 'Grade 1': { enabled: true, workingDays: 5, periodsPerDay: 6 } }),
  };
  assert.equal(resolveDayConfig('school', row, 'Grade I').isGradeCustom, true);
  assert.equal(resolveDayConfig('school', row, 'grade 1').workingDays, 5);
});
