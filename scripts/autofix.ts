/**
 * Runs the setup auto-fix engine (src/lib/autofix) for one school or all.
 *
 *   npx tsx scripts/autofix.ts --school <schoolId>            dry run
 *   npx tsx scripts/autofix.ts --all                          dry run, every school
 *   npx tsx scripts/autofix.ts --all --apply                  write fixes (each logged in AutoFixLog, undoable)
 *   add --verbose to list every row each fix changes
 *   --tier 1 | 2 | all (default all)
 *   --enable / --disable  switch automatic fixes on or off for --school (writes the setting)
 *
 * Dry run is the default and writes nothing.
 */
import { db } from '../src/lib/db';
import { runAutofix } from '../src/lib/autofix';

function parseArgs(argv: string[]) {
  const options = { schoolId: '', all: false, apply: false, verbose: false, tiers: [1, 2] as (1 | 2)[], enable: null as boolean | null };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--school') options.schoolId = argv[++index] ?? '';
    else if (arg === '--all') options.all = true;
    else if (arg === '--apply') options.apply = true;
    else if (arg === '--dry-run') options.apply = false;
    else if (arg === '--verbose') options.verbose = true;
    else if (arg === '--enable') options.enable = true;
    else if (arg === '--disable') options.enable = false;
    else if (arg === '--tier') {
      const value = argv[++index];
      options.tiers = value === '1' ? [1] : value === '2' ? [2] : value === 'all' ? [1, 2] : (() => { throw new Error('--tier expects 1, 2 or all'); })();
    }
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.all === Boolean(options.schoolId)) throw new Error('Pass exactly one of --school <id> or --all.');
  if (options.enable !== null && options.all) throw new Error('--enable/--disable work on one school: use --school <id>.');
  return options;
}

const show = (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value));

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const schools = await db.school.findMany({
    where: options.all ? {} : { id: options.schoolId },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  if (!schools.length) throw new Error(`No school with id ${options.schoolId}.`);
  console.log(`Mode: ${options.apply ? 'APPLY' : 'DRY RUN (no changes written)'}; tiers: ${options.tiers.join(', ')}`);
  if (options.enable !== null) {
    // The setting is written only with --apply, like everything else.
    if (options.apply) {
      await db.schoolFeatureFlags.upsert({
        where: { schoolId: options.schoolId },
        create: { schoolId: options.schoolId, autofixEnabled: options.enable },
        update: { autofixEnabled: options.enable },
      });
    }
    console.log(`Automatic fixes ${options.apply ? '' : 'would be '}switched ${options.enable ? 'ON' : 'OFF'} for ${options.schoolId}.`);
  }

  for (const school of schools) {
    const run = await runAutofix(school.id, { apply: options.apply, trigger: 'script', tiers: options.tiers });
    console.log(`\n=== ${school.name} (${school.id})`);
    console.log(`${run.fixes.length} fix(es) ${options.apply ? `applied (${run.logIds.length} logged)` : 'would be made'}`);
    run.fixes.forEach((fix, index) => {
      console.log(`\n ${String(index + 1).padStart(2)}. [tier ${fix.tier}] ${fix.rule} — ${fix.entity}`);
      console.log(`     ${fix.summary}`);
      console.log(`     before: ${show(fix.before)}`);
      console.log(`     after:  ${show(fix.after)}`);
      const byModel = new Map<string, number>();
      for (const change of fix.changes) byModel.set(change.model, (byModel.get(change.model) ?? 0) + 1);
      console.log(`     rows changed: ${[...byModel].map(([model, count]) => `${model} ${count}`).join(', ')}`);
      if (options.verbose) {
        for (const change of fix.changes) console.log(`       ${change.model} ${change.id}: ${show(change.before)} → ${show(change.after)}`);
      }
    });
    if (run.suppressed.length) {
      console.log('\nNot re-applied (undone by an admin earlier):');
      for (const fix of run.suppressed) console.log(`  - ${fix.summary}`);
    }
    if (run.unfixable.length) {
      console.log('\nLeft for a person:');
      for (const item of run.unfixable) console.log(`  - ${item.blocking ? '[blocks generation' + (item.grade ? ` for ${item.grade}` : '') + '] ' : ''}${item.message}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
