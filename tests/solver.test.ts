// npm run test:solver
import test from 'node:test';
import assert from 'node:assert/strict';
import { solve } from '../src/lib/solver/solve';
import { toAuditInput } from '../src/lib/solver/to-audit';
import type { SolverInput, SolverResult } from '../src/lib/solver/types';
import { auditTimetable } from '../src/lib/timetable-audit';

// Synthetic schools only; no real school's names or settings.

interface SubjectSpec {
  name: string;
  weekly: number;
  maxPerDay: number;
  allowConsecutive?: boolean;
  roomType?: string;
  core?: boolean;
  /** Number of teachers and each one's caps. */
  teachers: number;
  caps: { maxWeekly: number; maxDaily: number; maxConsecutive: number };
}

function school(options: {
  grades: string[];
  sections: string[];
  days: { day: string; periods: number }[];
  subjects: SubjectSpec[];
  rooms?: { id: string; type: string }[];
  homeRooms?: boolean;
}): SolverInput {
  const classes = options.grades.flatMap((grade) => options.sections.map((section) => ({
    key: `${grade}|${section}`, grade, section, days: options.days, homeRoomId: options.homeRooms ? `home-${grade}-${section}` : null,
  })));
  const teachers = options.subjects.flatMap((s) => Array.from({ length: s.teachers }, (_, i) => ({
    id: `${s.name}-t${i + 1}`, name: `${s.name} teacher ${i + 1}`, ...s.caps, unavailable: [] as { day: string; period: number }[],
  })));
  const requirements = classes.flatMap((c) => options.subjects.map((s) => ({
    classKey: c.key, subject: s.name, weeklyPeriods: s.weekly, maxPerDay: s.maxPerDay, allowConsecutive: Boolean(s.allowConsecutive),
    requiredRoomType: s.roomType ?? null, core: Boolean(s.core), teacherIds: teachers.filter((t) => t.id.startsWith(`${s.name}-t`)).map((t) => t.id),
  })));
  const rooms = [
    ...(options.rooms ?? []),
    ...(options.homeRooms ? classes.map((c) => ({ id: c.homeRoomId!, type: 'classroom' })) : []),
  ];
  return { classes, requirements, teachers, rooms, locked: [] };
}

const weekdays = (periods: number, saturday?: number) => [
  ...['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((day) => ({ day, periods })),
  ...(saturday ? [{ day: 'Saturday', periods: saturday }] : []),
];

/** Every audit error, except quota shortfalls that the solver itself listed as unallocated. */
function hardViolations(input: SolverInput, result: SolverResult) {
  const issues = auditTimetable(toAuditInput(input, result)).filter((i) => i.severity === 'error');
  const unallocated = new Map(result.unallocated.map((u) => [u.classKey + '|' + u.subject, u.periods]));
  return issues.filter((issue) => {
    if (issue.rule !== 'weekly_quota') return true;
    const match = /: (.+) (\d+)\/week \(quota (\d+), (\d+) missing\)/.exec(issue.message);
    if (!match) return true;
    const [, subject, , , missing] = match;
    return unallocated.get(`${issue.grade}|${issue.section}|${subject}`) !== Number(missing);
  });
}

function check(name: string, input: SolverInput, expectUnallocated = 0) {
  for (const seed of [1, 2, 3]) {
    const result = solve(input, { seed });
    const violations = hardViolations(input, result);
    const unplaced = result.unallocated.reduce((sum, u) => sum + u.periods, 0);
    console.log(`  ${name} seed ${seed}: ${result.stats.placed}/${result.stats.required} placed, ${unplaced} unallocated, ${violations.length} hard violations, ${result.stats.repairs} repairs, score ${result.score}`);
    assert.deepEqual(violations.map((v) => v.message), [], `${name} seed ${seed}`);
    assert.equal(result.stats.placed + unplaced, result.stats.required, 'every required period is placed or listed');
    if (expectUnallocated === 0) assert.equal(unplaced, 0, `${name} seed ${seed}: ${JSON.stringify(result.unallocated)}`);
  }
}

const caps = (maxWeekly: number, maxDaily: number, maxConsecutive: number) => ({ maxWeekly, maxDaily, maxConsecutive });

test('small school: 0 hard violations, everything placed', () => {
  check('small', school({
    grades: ['G1'], sections: ['A', 'B'], days: weekdays(6), homeRooms: true,
    rooms: [{ id: 'lab-1', type: 'lab' }],
    subjects: [
      { name: 'Maths', weekly: 7, maxPerDay: 2, allowConsecutive: true, core: true, teachers: 1, caps: caps(20, 5, 3) },
      { name: 'Language', weekly: 6, maxPerDay: 2, core: true, teachers: 1, caps: caps(20, 5, 3) },
      { name: 'Science', weekly: 5, maxPerDay: 1, roomType: 'lab', teachers: 1, caps: caps(20, 5, 3) },
      { name: 'Social', weekly: 5, maxPerDay: 1, teachers: 1, caps: caps(20, 5, 3) },
      { name: 'Arts', weekly: 4, maxPerDay: 1, teachers: 1, caps: caps(20, 5, 3) },
      { name: 'Games', weekly: 3, maxPerDay: 1, teachers: 1, caps: caps(20, 5, 3) },
    ],
  }));
});

test('medium school: 0 hard violations, everything placed', () => {
  const t = caps(30, 6, 4);
  check('medium', school({
    grades: ['G1', 'G2', 'G3', 'G4', 'G5', 'G6'], sections: ['A', 'B', 'C'], days: weekdays(8, 4), homeRooms: true,
    rooms: [{ id: 'comp-1', type: 'computer' }, { id: 'comp-2', type: 'computer' }, { id: 'field-1', type: 'field' }, { id: 'field-2', type: 'field' }],
    subjects: [
      { name: 'Maths', weekly: 7, maxPerDay: 2, allowConsecutive: true, core: true, teachers: 5, caps: t },
      { name: 'Language', weekly: 6, maxPerDay: 2, core: true, teachers: 4, caps: t },
      { name: 'Science', weekly: 6, maxPerDay: 2, teachers: 4, caps: t },
      { name: 'Language2', weekly: 5, maxPerDay: 1, teachers: 4, caps: t },
      { name: 'Social', weekly: 5, maxPerDay: 1, teachers: 4, caps: t },
      { name: 'Computing', weekly: 3, maxPerDay: 1, roomType: 'computer', teachers: 2, caps: t },
      { name: 'Games', weekly: 4, maxPerDay: 1, roomType: 'field', teachers: 3, caps: t },
      { name: 'Arts', weekly: 3, maxPerDay: 1, teachers: 2, caps: t },
      { name: 'Music', weekly: 2, maxPerDay: 1, teachers: 2, caps: t },
      { name: 'Reading', weekly: 2, maxPerDay: 1, teachers: 2, caps: t },
    ],
  }));
});

test('tight school: week exactly full, teachers at exactly their caps', () => {
  // 4 sections x 35 periods; every teacher's weekly cap equals their load.
  check('tight', school({
    grades: ['G1'], sections: ['A', 'B', 'C', 'D'], days: weekdays(7), homeRooms: true,
    rooms: [{ id: 'lab-1', type: 'lab' }],
    subjects: [
      { name: 'Maths', weekly: 7, maxPerDay: 2, allowConsecutive: true, core: true, teachers: 1, caps: caps(28, 6, 4) },
      { name: 'Language', weekly: 6, maxPerDay: 2, core: true, teachers: 1, caps: caps(24, 6, 4) },
      { name: 'Science', weekly: 6, maxPerDay: 2, roomType: 'lab', teachers: 1, caps: caps(24, 6, 4) },
      { name: 'Language2', weekly: 5, maxPerDay: 1, teachers: 1, caps: caps(20, 5, 3) },
      { name: 'Social', weekly: 5, maxPerDay: 1, teachers: 1, caps: caps(20, 5, 3) },
      { name: 'Games', weekly: 3, maxPerDay: 1, teachers: 1, caps: caps(12, 4, 3) },
      { name: 'Arts', weekly: 3, maxPerDay: 1, teachers: 1, caps: caps(12, 4, 3) },
    ],
  }));
});

test('impossible demands are listed with a reason, never padded or forced', () => {
  const input = school({
    grades: ['G1'], sections: ['A'], days: weekdays(4),
    subjects: [
      { name: 'Maths', weekly: 12, maxPerDay: 2, teachers: 1, caps: caps(30, 6, 3) },     // 20 slots, 12 + 8 + 4 = 24 needed
      { name: 'Science', weekly: 8, maxPerDay: 2, roomType: 'lab', teachers: 1, caps: caps(30, 6, 3) }, // no lab exists
      { name: 'Arts', weekly: 4, maxPerDay: 1, teachers: 1, caps: caps(2, 2, 2) },      // teacher cap 2
    ],
  });
  input.teachers.push({ id: 'norule', name: 'No rule', maxWeekly: null, maxDaily: null, maxConsecutive: null, unavailable: [] });
  input.requirements.push({ classKey: 'G1|A', subject: 'Reading', weeklyPeriods: 1, maxPerDay: 1, allowConsecutive: false, requiredRoomType: null, core: false, teacherIds: ['norule'] });
  input.requirements.push({ classKey: 'G1|A', subject: 'Writing', weeklyPeriods: 6, maxPerDay: 1, allowConsecutive: false, requiredRoomType: null, core: false, teacherIds: ['Maths-t1'] });
  input.requirements.push({ classKey: 'G1|A', subject: 'Dance', weeklyPeriods: 1, maxPerDay: 1, allowConsecutive: false, requiredRoomType: null, core: false, teacherIds: [] });
  const result = solve(input);
  const reasons = Object.fromEntries(result.unallocated.map((u) => [u.subject, u.reason]));
  assert.equal(reasons.Science, 'no_room_of_type');
  assert.equal(reasons.Arts, 'teacher_capacity');
  assert.equal(reasons.Reading, 'workload_rule_missing');
  assert.equal(reasons.Dance, 'no_qualified_teacher');
  assert.equal(reasons.Writing, 'daily_limit_too_low'); // 6/week, 1 a day, 5 days
  assert.equal(result.lessons.filter((l) => l.subject === 'Arts').length, 2);
  assert.deepEqual(hardViolations(input, result).map((v) => v.message), []);
});

test('teacher unavailable slots and locked lessons are respected', () => {
  const input = school({
    grades: ['G1'], sections: ['A'], days: weekdays(5),
    subjects: [
      { name: 'Maths', weekly: 5, maxPerDay: 1, teachers: 1, caps: caps(20, 5, 3) },
      { name: 'Language', weekly: 5, maxPerDay: 1, teachers: 1, caps: caps(20, 5, 3) },
    ],
  });
  input.teachers[0].unavailable = [1, 2, 3, 4].map((period) => ({ day: 'Monday', period }));
  input.locked = [{ classKey: 'G1|A', day: 'Monday', period: 5, subject: 'Language', teacherId: 'Language-t1', roomId: null, locked: true }];
  const result = solve(input);
  assert.ok(result.lessons.some((l) => l.locked && l.day === 'Monday' && l.period === 5 && l.subject === 'Language'));
  assert.equal(result.lessons.filter((l) => l.subject === 'Language').length, 5, 'the locked lesson counts toward the quota');
  assert.ok(!result.lessons.some((l) => l.teacherId === 'Maths-t1' && l.day === 'Monday' && l.period <= 4));
  assert.deepEqual(hardViolations(input, result).map((v) => v.message), []);
});

test('same seed gives the same timetable', () => {
  const input = school({ grades: ['G1'], sections: ['A', 'B'], days: weekdays(6), subjects: [
    { name: 'Maths', weekly: 6, maxPerDay: 2, teachers: 1, caps: caps(20, 5, 3) },
    { name: 'Arts', weekly: 5, maxPerDay: 1, teachers: 2, caps: caps(20, 5, 3) },
  ] });
  assert.deepEqual(solve(input, { seed: 7 }).lessons, solve(input, { seed: 7 }).lessons);
});
