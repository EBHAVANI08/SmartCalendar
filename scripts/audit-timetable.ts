/**
 * Audits a timetable version against every hard rule (src/lib/timetable-audit.ts).
 * Read only.
 *
 *   npx tsx scripts/audit-timetable.ts --school <id> --published
 *   npx tsx scripts/audit-timetable.ts --school <id> --version <versionId>
 *   add --limit <n> to show at most n issues per rule (default: all)
 *
 *   npx tsx scripts/audit-timetable.ts --school <id> --published --simulate [--seed n] [--assume-defaults W,D,C]
 *     Runs the solver in memory on the school's current settings (nothing is
 *     written) and audits the result with the same validator. The version only
 *     supplies version-specific workload rules and locked lessons.
 *     --assume-defaults: weekly,daily,consecutive caps for teachers with no
 *     rule and no school defaults, for a "what if" run; reported as assumed.
 */
import { db } from '../src/lib/db';
import { auditTimetable, auditVersion, loadAuditInput, type AuditIssue } from '../src/lib/timetable-audit';
import { loadSolverInput } from '../src/lib/solver/load';
import { solve } from '../src/lib/solver/solve';
import { toAuditInput } from '../src/lib/solver/to-audit';
import { timetableMetrics, type TimetableMetrics } from '../src/lib/timetable-metrics';

function parseArgs(argv: string[]) {
  const options = {
    schoolId: '', versionId: '', published: false, limit: Infinity, simulate: false, seed: 1,
    assumeDefaults: null as { maxWeekly: number; maxDaily: number; maxConsecutive: number } | null,
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--school') options.schoolId = argv[++index] ?? '';
    else if (arg === '--version') options.versionId = argv[++index] ?? '';
    else if (arg === '--published') options.published = true;
    else if (arg === '--limit') options.limit = Math.max(1, Number(argv[++index]) || 1);
    else if (arg === '--simulate') options.simulate = true;
    else if (arg === '--seed') options.seed = Number(argv[++index]) || 1;
    else if (arg === '--assume-defaults') {
      const [maxWeekly, maxDaily, maxConsecutive] = String(argv[++index] ?? '').split(',').map(Number);
      if (![maxWeekly, maxDaily, maxConsecutive].every((n) => Number.isInteger(n) && n > 0)) throw new Error('--assume-defaults takes three positive numbers: weekly,daily,consecutive');
      options.assumeDefaults = { maxWeekly, maxDaily, maxConsecutive };
    }
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.schoolId) throw new Error('--school <id> is required.');
  if (!options.versionId && !options.published) throw new Error('Pass --version <id> or --published.');
  if (options.assumeDefaults && !options.simulate) throw new Error('--assume-defaults only applies with --simulate.');
  return options;
}

export function printAudit(label: string, summary: { slots: number; errors: number; warnings: number; byRule: Record<string, number>; issues: AuditIssue[] }, limit = Infinity) {
  console.log(`${label}: ${summary.slots} lessons — ${summary.errors} error(s), ${summary.warnings} warning(s)\n`);
  const rules = Object.entries(summary.byRule).sort((a, b) => b[1] - a[1]);
  console.log('Issues by rule:');
  for (const [rule, count] of rules) console.log(`  ${rule.padEnd(24)} ${String(count).padStart(5)}`);
  for (const [rule, count] of rules) {
    console.log(`\n── ${rule} (${count})`);
    const ofRule = summary.issues.filter((issue) => issue.rule === rule);
    for (const issue of ofRule.slice(0, limit)) console.log(`  ${issue.severity === 'warning' ? '(warning) ' : ''}${issue.message}`);
    if (ofRule.length > limit) console.log(`  … and ${ofRule.length - limit} more`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const version = options.versionId
    ? await db.timetableVersion.findFirst({ where: { id: options.versionId, schoolId: options.schoolId } })
    : await db.timetableVersion.findFirst({ where: { schoolId: options.schoolId, status: 'published' }, orderBy: { version: 'desc' } });
  if (!version) throw new Error('No such timetable version for this school.');
  if (!options.simulate) {
    const summary = await auditVersion(options.schoolId, version.id);
    printAudit(`Version v${version.version} (${version.status}, ${version.id})`, summary, options.limit);
    return;
  }

  // Simulation: solve in memory, audit with the validator's own loader. Nothing is written.
  const loaded = await loadSolverInput(options.schoolId, { versionId: version.id, assumeDefaults: options.assumeDefaults });
  const started = Date.now();
  const result = solve(loaded.input, { seed: options.seed });
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  const auditInput = await loadAuditInput(options.schoolId, version.id);
  const publishedSlots = auditInput.slots;
  auditInput.slots = toAuditInput(loaded.input, result).slots;
  if (options.assumeDefaults) {
    const assumed = new Set(loaded.assumedTeachers);
    auditInput.teachers = auditInput.teachers.map((t) => (assumed.has(t.id) ? { ...t, ...options.assumeDefaults!, limitSource: 'school' as const } : t));
  }
  const issues = auditTimetable(auditInput);
  const byRule: Record<string, number> = {};
  for (const issue of issues) byRule[issue.rule] = (byRule[issue.rule] ?? 0) + 1;

  const unplaced = result.unallocated.reduce((sum, u) => sum + u.periods, 0);
  console.log(`SIMULATION (in memory, nothing written) — school ${options.schoolId}, rules of v${version.version}, seed ${options.seed}`);
  console.log(`  classes ${loaded.input.classes.length}, requirements ${loaded.input.requirements.length}, teachers ${loaded.input.teachers.length}, rooms ${loaded.input.rooms.length}, locked ${loaded.input.locked.length}`);
  if (options.assumeDefaults) console.log(`  ASSUMED caps ${options.assumeDefaults.maxWeekly}/${options.assumeDefaults.maxDaily}/${options.assumeDefaults.maxConsecutive} (weekly/daily/consecutive) for ${loaded.assumedTeachers.length} teacher(s) with no rule and no school defaults`);
  console.log(`  placed ${result.stats.placed}/${result.stats.required}, unallocated ${unplaced} period(s) in ${result.unallocated.length} item(s), repairs ${result.stats.repairs}, ${elapsed}s\n`);
  if (loaded.skipped.length) {
    console.log(`Skipped sections (${loaded.skipped.length}):`);
    for (const s of loaded.skipped) console.log(`  ${s.grade} ${s.section}: ${s.reason}`);
    console.log('');
  }

  // Quota shortfalls the solver itself reported are expected; anything else is a hard violation.
  const listed = new Map(result.unallocated.map((u) => [u.classKey + '|' + u.subject, u.periods]));
  const fullyUnallocated = new Set(loaded.input.classes
    .filter((c) => loaded.input.requirements.filter((r) => r.classKey === c.key).every((r) => listed.get(`${r.classKey}|${r.subject}`) === r.weeklyPeriods))
    .map((c) => `${c.grade}|${c.section}`));
  const isListedShortfall = (issue: AuditIssue) => {
    if (issue.rule === 'section_missing') return fullyUnallocated.has(`${issue.grade}|${issue.section}`);
    if (issue.rule !== 'weekly_quota') return false;
    const match = /: (.+) (\d+)\/week \(quota (\d+), (\d+) missing\)/.exec(issue.message);
    return Boolean(match && listed.get(`${issue.grade}|${issue.section}|${match[1]}`) === Number(match[4]));
  };
  const hard = issues.filter((i) => i.severity === 'error' && !isListedShortfall(i));
  console.log(`HARD VIOLATIONS (not explained by the unallocated list): ${hard.length}`);
  for (const issue of hard.slice(0, options.limit)) console.log(`  [${issue.rule}] ${issue.message}`);
  console.log('');
  printAudit('Full audit of the simulated timetable', {
    slots: auditInput.slots.length,
    errors: issues.filter((i) => i.severity === 'error').length,
    warnings: issues.filter((i) => i.severity === 'warning').length,
    byRule,
    issues,
  }, options.limit);

  // Same rules and caps for both columns; only the lessons differ.
  const before = timetableMetrics({ ...auditInput, slots: publishedSlots });
  const after = timetableMetrics(auditInput);
  const rows: [string, (m: TimetableMetrics) => string][] = [
    ['lessons placed', (m) => String(m.lessons)],
    ['same subject 2+ times a day (cases)', (m) => String(m.repeatCases)],
    ['  of which 3+ times', (m) => String(m.repeatCases3)],
    ['max times one subject in a day', (m) => String(m.maxRepeat)],
    ['teachers over weekly cap', (m) => String(m.teachersOverWeekly)],
    ['teachers over daily cap', (m) => String(m.teachersOverDaily)],
    ['teachers over consecutive cap', (m) => String(m.teachersOverConsecutive)],
    ['teachers over any cap', (m) => String(m.teachersOverAnyCap)],
    ['teachers with no caps at all', (m) => String(m.teachersWithoutCaps)],
    ['max consecutive (any teacher)', (m) => String(m.maxConsecutive)],
    ['periods without a required teacher', (m) => String(m.missingRequiredTeacher)],
    ['classes covered', (m) => `${m.classesCovered} of ${m.classesTotal}`],
    ['subject quotas met exactly', (m) => `${m.quotasExact} of ${m.quotasTotal}`],
  ];
  console.log(`\nCOMPARISON (same rules and caps): v${version.version} as stored vs simulation`);
  console.log(`  ${'metric'.padEnd(38)} ${('v' + version.version).padStart(10)} ${'simulated'.padStart(12)}`);
  for (const [label, value] of rows) console.log(`  ${label.padEnd(38)} ${value(before).padStart(10)} ${value(after).padStart(12)}`);

  console.log(`\nUNALLOCATED (${unplaced} period(s)) by reason:`);
  const byReason = new Map<string, typeof result.unallocated>();
  // Grouped by reason and detail, so e.g. each missing room type is its own group.
  for (const u of result.unallocated) byReason.set(`${u.reason}|${u.detail}`, [...(byReason.get(`${u.reason}|${u.detail}`) ?? []), u]);
  for (const [key, items] of [...byReason.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const reason = key.split('|')[0];
    console.log(`\n── ${reason}: ${items.reduce((s, u) => s + u.periods, 0)} period(s), ${items.length} item(s) — ${items[0].detail}`);
    for (const u of items.sort((a, b) => a.classKey.localeCompare(b.classKey, undefined, { numeric: true }) || a.subject.localeCompare(b.subject))) {
      console.log(`  ${u.classKey.replace('|', ' ')}: ${u.subject} — ${u.periods} period(s)`);
    }
  }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/audit-timetable.ts')) {
  main()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
}
