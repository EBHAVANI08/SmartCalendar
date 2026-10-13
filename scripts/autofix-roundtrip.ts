/**
 * Proves on a TEST database that auto-fix can be applied and fully undone:
 *   1. snapshot the school's data,
 *   2. apply every fix (tiers 1 and 2),
 *   3. verify: a second run finds nothing, frozen timetable rows are untouched,
 *   4. undo every fix, newest first,
 *   5. verify: no fix is re-applied, and the data equals the snapshot.
 *
 *   $env:DATABASE_URL = "<test uri>"
 *   npx tsx scripts/autofix-roundtrip.ts --target-db <test db name> --school <id> [--clear-log]
 *
 * --clear-log first removes the school's AutoFixLog rows in the TEST database
 * (a restore from backup does not reset that collection).
 *
 * Refuses to run against the production database in .env. Compares every
 * field except updatedAt (which any write changes) and credentials (never
 * read into the report).
 */
import { db } from '../src/lib/db';
import { runAutofix, undoFix } from '../src/lib/autofix';
import { EDITABLE_STATUSES } from '../src/lib/timetable-lifecycle';
import { assertTestDatabase } from './lib/test-db-guard';

function parseArgs(argv: string[]) {
  const options = { targetDb: '', schoolId: '', clearLog: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--target-db') options.targetDb = argv[++index] ?? '';
    else if (arg === '--school') options.schoolId = argv[++index] ?? '';
    else if (arg === '--clear-log') options.clearLog = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.targetDb || !options.schoolId) throw new Error('--target-db <name> and --school <id> are required.');
  return options;
}

const IGNORED_FIELDS = new Set(['updatedAt', 'password']);
type State = Map<string, string>;

function canonical(row: Record<string, unknown>): string {
  const clean = Object.fromEntries(Object.entries(row)
    .filter(([field]) => !IGNORED_FIELDS.has(field))
    .map(([field, value]) => [field, value instanceof Date ? value.toISOString() : value ?? null])
    .sort(([a], [b]) => String(a).localeCompare(String(b))));
  return JSON.stringify(clean);
}

/** Every row auto-fix could touch, plus the timetable, keyed "model:id". */
async function capture(schoolId: string): Promise<State> {
  const teacherIds = (await db.teacher.findMany({ where: { schoolId }, select: { id: true } })).map((t) => t.id);
  const sets: [string, Record<string, unknown>[]][] = [
    ['gradeSubjectConfig', await db.gradeSubjectConfig.findMany({ where: { schoolId } })],
    ['subjectMaster', await db.subjectMaster.findMany({ where: { schoolId } })],
    ['classSection', await db.classSection.findMany({ where: { schoolId } })],
    ['teacher', await db.teacher.findMany({ where: { schoolId }, omit: { password: true } })],
    ['schedule', await db.schedule.findMany({ where: { schoolId } })],
    ['teacherQualification', await db.teacherQualification.findMany({ where: { schoolId, teacherId: { in: teacherIds } } })],
    ['schoolDayPeriodConfig', await db.schoolDayPeriodConfig.findMany({ where: { schoolId } })],
    ['timetableVersion', await db.timetableVersion.findMany({ where: { schoolId } })],
    ['mergeRule', await db.mergeRule.findMany({ where: { schoolId } })],
  ];
  const state: State = new Map();
  for (const [model, rows] of sets) for (const row of rows) state.set(`${model}:${row.id as string}`, canonical(row));
  return state;
}

function diff(before: State, after: State) {
  const added = [...after.keys()].filter((key) => !before.has(key));
  const removed = [...before.keys()].filter((key) => !after.has(key));
  const changed: string[] = [];
  for (const [key, value] of before) {
    const next = after.get(key);
    if (next === undefined || next === value) continue;
    const [a, b] = [JSON.parse(value), JSON.parse(next)] as Record<string, unknown>[];
    const fields = Object.keys({ ...a, ...b }).filter((field) => JSON.stringify(a[field]) !== JSON.stringify(b[field]));
    changed.push(`${key} [${fields.join(', ')}]`);
  }
  return { added, removed, changed };
}

const countBy = (keys: string[]) => {
  const counts = new Map<string, number>();
  for (const key of keys) counts.set(key.split(':')[0], (counts.get(key.split(':')[0]) ?? 0) + 1);
  return [...counts].map(([model, count]) => `${model} ${count}`).join(', ') || 'none';
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const target = assertTestDatabase(options.targetDb);
  const school = await db.school.findUnique({ where: { id: options.schoolId }, select: { name: true } });
  if (!school) throw new Error(`No school with id ${options.schoolId} in ${target.database}.`);
  console.log(`Round trip on ${target.host} / ${target.database} — ${school.name}\n`);
  const existingLogs = await db.autoFixLog.count({ where: { schoolId: options.schoolId } });
  if (existingLogs && !options.clearLog) throw new Error(`The test copy already has ${existingLogs} AutoFixLog row(s); re-run with --clear-log for a clean start.`);
  if (options.clearLog) console.log(`0. Cleared ${(await db.autoFixLog.deleteMany({ where: { schoolId: options.schoolId } })).count} AutoFixLog row(s) in the test copy`);

  const before = await capture(options.schoolId);
  const frozenVersions = (await db.timetableVersion.findMany({ where: { schoolId: options.schoolId }, select: { id: true, status: true } }))
    .filter((v) => !(EDITABLE_STATUSES as string[]).includes(v.status)).map((v) => v.id);
  const frozenKey = (state: State) => [...state].filter(([key, value]) => key.startsWith('schedule:') && frozenVersions.includes(JSON.parse(value).timetableVersionId)).map(([key, value]) => `${key}=${value}`).sort().join('\n');
  console.log(`1. Snapshot: ${before.size} rows`);

  const applied = await runAutofix(options.schoolId, { apply: true, trigger: 'script:roundtrip' });
  console.log(`2. Applied ${applied.logIds.length} of ${applied.fixes.length} fix(es)`);
  for (const fix of applied.fixes) console.log(`   - [tier ${fix.tier}] ${fix.summary}`);

  const afterApply = await capture(options.schoolId);
  const applyDiff = diff(before, afterApply);
  const second = await runAutofix(options.schoolId, { apply: false, trigger: 'script:roundtrip' });
  const frozenIntact = frozenKey(before) === frozenKey(afterApply);
  console.log(`3. Verify after apply: rows changed: ${countBy(applyDiff.changed)}; added: ${applyDiff.added.length}; removed: ${applyDiff.removed.length}`);
  console.log(`   second run finds ${second.fixes.length} more fix(es) (expected 0)`);
  console.log(`   published/superseded timetable rows unchanged: ${frozenIntact ? 'yes' : 'NO'}`);

  // Undo by the run's own log rows (newest first), so nothing written can be missed.
  const logs = applied.runId
    ? await db.autoFixLog.findMany({ where: { schoolId: options.schoolId, runId: applied.runId }, orderBy: { appliedAt: 'desc' }, select: { id: true } })
    : [];
  const failures: string[] = [];
  for (const { id } of logs) {
    const result = await undoFix(options.schoolId, id, 'script:roundtrip');
    if (!result.ok && result.reason !== 'already_undone') failures.push(`${id}: ${result.reason}${result.conflicts ? ` (${result.conflicts.join(', ')})` : ''}`);
  }
  console.log(`4. Undid ${logs.length - failures.length} of ${logs.length} fix(es)${failures.length ? `; failed: ${failures.join('; ')}` : ''}`);

  const afterUndo = await capture(options.schoolId);
  const final = diff(before, afterUndo);
  const reapplied = await runAutofix(options.schoolId, { apply: false, trigger: 'script:roundtrip' });
  // An undone fix must never come back. A different issue may appear that the
  // undone fixes had hidden (e.g. a grade they had merged away); it is listed
  // but is not a failure.
  const appliedKeys = new Set(applied.fixes.map((fix) => fix.suppressKey));
  const cameBack = reapplied.fixes.filter((fix) => appliedKeys.has(fix.suppressKey));
  const uncovered = reapplied.fixes.filter((fix) => !appliedKeys.has(fix.suppressKey));
  console.log(`5. Verify after undo: undone fixes that would come back: ${cameBack.length} (expected 0; ${reapplied.suppressed.length} stay suppressed)`);
  for (const fix of cameBack) console.log(`     came back: ${fix.summary}`);
  for (const fix of uncovered) console.log(`     new issue visible only with the undone fixes reversed: [tier ${fix.tier}] ${fix.summary}`);
  console.log(`   differences from the snapshot: added ${final.added.length}, removed ${final.removed.length}, changed ${final.changed.length}`);
  for (const line of [...final.added.map((k) => `+ ${k}`), ...final.removed.map((k) => `- ${k}`), ...final.changed.map((k) => `~ ${k}`)].slice(0, 50)) console.log(`     ${line}`);

  const ok = second.fixes.length === 0 && frozenIntact && failures.length === 0 && cameBack.length === 0
    && final.added.length === 0 && final.removed.length === 0 && final.changed.length === 0;
  console.log(`\nResult: ${ok ? 'PASS — data identical to before (ignoring updatedAt)' : 'FAIL — see above'}`);
  if (!ok) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
