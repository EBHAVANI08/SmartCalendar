/**
 * A school's own merge decisions ("Computer" means "Computer Science"),
 * stored as MergeRule rows and applied by the auto-fix engine (tier 1).
 * Decisions are data, entered per school here, never written into code.
 *
 *   npx tsx scripts/merge-rules.ts --school <id> --list
 *   npx tsx scripts/merge-rules.ts --school <id> --add "Computer=>Computer Science" --add "Art=>Art & Craft"
 *   npx tsx scripts/merge-rules.ts --school <id> --add "Grade I=>Grade 1" --kind grade
 *   npx tsx scripts/merge-rules.ts --school <id> --remove "Computer"
 *   ... add --apply to write (dry run by default)
 */
import { db } from '../src/lib/db';

function parseArgs(argv: string[]) {
  const options = { schoolId: '', list: false, apply: false, kind: 'subject' as 'subject' | 'grade', add: [] as { from: string; to: string }[], remove: [] as string[], createdBy: process.env.USERNAME || process.env.USER || 'script' };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--school') options.schoolId = argv[++index] ?? '';
    else if (arg === '--list') options.list = true;
    else if (arg === '--apply') options.apply = true;
    else if (arg === '--kind') {
      const kind = argv[++index];
      if (kind !== 'subject' && kind !== 'grade') throw new Error('--kind expects subject or grade');
      options.kind = kind;
    } else if (arg === '--add') {
      const [from, to] = String(argv[++index] ?? '').split('=>').map((part) => part.trim());
      if (!from || !to || from === to) throw new Error('--add expects "From=>To" with two different names.');
      options.add.push({ from, to });
    } else if (arg === '--remove') options.remove.push(String(argv[++index] ?? '').trim());
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!/^[0-9a-f]{24}$/i.test(options.schoolId)) throw new Error('--school <24-character id> is required.');
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const school = await db.school.findUnique({ where: { id: options.schoolId }, select: { name: true } });
  if (!school) throw new Error(`No school with id ${options.schoolId}.`);
  console.log(`${school.name} — ${options.apply ? 'APPLY' : 'DRY RUN (no changes written)'}`);

  for (const rule of options.add) {
    const existing = await db.mergeRule.findFirst({ where: { schoolId: options.schoolId, kind: options.kind, from: rule.from } });
    // A rule pointing at a name that is itself merged elsewhere would chain; refuse it.
    const chained = await db.mergeRule.findFirst({ where: { schoolId: options.schoolId, kind: options.kind, from: rule.to } });
    if (chained) {
      console.log(`  skip ${options.kind} "${rule.from}" → "${rule.to}": "${rule.to}" is itself merged into "${chained.to}"`);
      continue;
    }
    console.log(`  ${existing ? 'update' : 'add'} ${options.kind} "${rule.from}" → "${rule.to}"${existing ? ` (was → "${existing.to}")` : ''}`);
    if (options.apply) {
      await db.mergeRule.upsert({
        where: { schoolId_kind_from: { schoolId: options.schoolId, kind: options.kind, from: rule.from } },
        create: { schoolId: options.schoolId, kind: options.kind, from: rule.from, to: rule.to, createdBy: options.createdBy },
        update: { to: rule.to, createdBy: options.createdBy },
      });
    }
  }
  for (const from of options.remove) {
    const existing = await db.mergeRule.findFirst({ where: { schoolId: options.schoolId, kind: options.kind, from } });
    console.log(existing ? `  remove ${options.kind} "${from}" → "${existing.to}"` : `  no ${options.kind} rule for "${from}"`);
    // Removing a decision record, not school data; earlier merges stay (undo them from the Auto-fixes panel).
    if (existing && options.apply) await db.mergeRule.delete({ where: { id: existing.id } });
  }
  if (options.list || (!options.add.length && !options.remove.length)) {
    const rules = await db.mergeRule.findMany({ where: { schoolId: options.schoolId }, orderBy: { createdAt: 'asc' } });
    console.log(rules.length ? 'Current rules:' : 'No merge rules.');
    for (const rule of rules) console.log(`  ${rule.kind} "${rule.from}" → "${rule.to}" (by ${rule.createdBy ?? 'unknown'}, ${rule.createdAt.toISOString().slice(0, 10)})`);
  }
  if (!options.apply && (options.add.length || options.remove.length)) console.log('Re-run with --apply to write.');
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
