/**
 * Writes school setup values into a TEST database copy, so simulations can run
 * on settings a school has not entered yet. Refuses the production database
 * from .env (scripts/lib/test-db-guard.ts). On production a school enters
 * these values itself in School Setup.
 *
 *   npx tsx scripts/test-setup-data.ts --target-db <test db name> --school <id> \
 *     [--defaults W,D,C] [--teacher-requirement "Subject=none|optional|required"]...
 *     [--flag autofixEnabled=true|false] [--flag solverV2Enabled=true|false] [--apply]
 *
 * Dry run by default: prints before/after. --apply writes in one transaction.
 */
import type { Prisma } from '@prisma/client';
import { db } from '../src/lib/db';
import { subjectKey } from '../src/lib/name-normalize';
import { NOT_ARCHIVED } from '../src/lib/soft-delete';
import { teacherRequirementOf, type TeacherRequirement } from '../src/lib/teacher-requirement';
import { assertTestDatabase } from './lib/test-db-guard';

function parseArgs(argv: string[]) {
  const options = {
    targetDb: '', schoolId: '', apply: false,
    defaults: null as { maxWeekly: number; maxDaily: number; maxConsecutive: number } | null,
    requirements: [] as { subject: string; value: TeacherRequirement }[],
    flags: {} as Partial<Record<'autofixEnabled' | 'solverV2Enabled', boolean>>,
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--target-db') options.targetDb = argv[++index] ?? '';
    else if (arg === '--school') options.schoolId = argv[++index] ?? '';
    else if (arg === '--apply') options.apply = true;
    else if (arg === '--defaults') {
      const [maxWeekly, maxDaily, maxConsecutive] = String(argv[++index] ?? '').split(',').map(Number);
      if (![maxWeekly, maxDaily, maxConsecutive].every((n) => Number.isInteger(n) && n > 0)) throw new Error('--defaults takes weekly,daily,consecutive (positive numbers)');
      options.defaults = { maxWeekly, maxDaily, maxConsecutive };
    } else if (arg === '--teacher-requirement') {
      const [subject, value] = String(argv[++index] ?? '').split('=').map((part) => part.trim());
      if (!subject || !['none', 'optional', 'required'].includes(value)) throw new Error('--teacher-requirement expects "Subject=none|optional|required"');
      options.requirements.push({ subject, value: value as TeacherRequirement });
    } else if (arg === '--flag') {
      const [name, value] = String(argv[++index] ?? '').split('=').map((part) => part.trim());
      if (!['autofixEnabled', 'solverV2Enabled'].includes(name) || !['true', 'false'].includes(value)) throw new Error('--flag expects autofixEnabled=true|false or solverV2Enabled=true|false');
      options.flags[name as 'autofixEnabled' | 'solverV2Enabled'] = value === 'true';
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.targetDb) throw new Error('--target-db <test database name> is required.');
  if (!options.schoolId) throw new Error('--school <id> is required.');
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  assertTestDatabase(options.targetDb);
  const school = await db.school.findUnique({ where: { id: options.schoolId }, select: { id: true, name: true } });
  if (!school) throw new Error('No such school in this database.');
  console.log(`Database: ${options.targetDb} (test). School: ${school.name}. Mode: ${options.apply ? 'APPLY' : 'DRY RUN'}\n`);

  const writes: ((tx: Prisma.TransactionClient) => Promise<unknown>)[] = [];
  if (options.defaults) {
    const before = await db.schoolPreferences.findUnique({ where: { schoolId: school.id } });
    console.log(`Workload defaults (weekly/daily/consecutive): ${before?.defaultMaxWeekly ?? 'unset'}/${before?.defaultMaxDaily ?? 'unset'}/${before?.defaultMaxConsecutive ?? 'unset'} → ${options.defaults.maxWeekly}/${options.defaults.maxDaily}/${options.defaults.maxConsecutive}`);
    const data = { defaultMaxWeekly: options.defaults.maxWeekly, defaultMaxDaily: options.defaults.maxDaily, defaultMaxConsecutive: options.defaults.maxConsecutive };
    writes.push((tx) => tx.schoolPreferences.upsert({ where: { schoolId: school.id }, update: data, create: { schoolId: school.id, ...data } }));
  }
  if (options.requirements.length) {
    const configs = await db.gradeSubjectConfig.findMany({ where: { schoolId: school.id, AND: [NOT_ARCHIVED] }, select: { id: true, grade: true, subjectName: true, teacherRequirement: true } });
    for (const { subject, value } of options.requirements) {
      const rows = configs.filter((c) => subjectKey(c.subjectName) === subjectKey(subject));
      console.log(`\nTeacher requirement "${subject}" → ${value}: ${rows.length} row(s)`);
      for (const row of rows) console.log(`  ${row.grade} ${row.subjectName}: ${teacherRequirementOf(row.teacherRequirement)} → ${value}`);
      const ids = rows.filter((r) => teacherRequirementOf(r.teacherRequirement) !== value).map((r) => r.id);
      if (ids.length) writes.push((tx) => tx.gradeSubjectConfig.updateMany({ where: { schoolId: school.id, id: { in: ids } }, data: { teacherRequirement: value } }));
    }
  }

  if (Object.keys(options.flags).length) {
    const before = await db.schoolFeatureFlags.findUnique({ where: { schoolId: school.id }, select: { autofixEnabled: true, solverV2Enabled: true } });
    for (const [name, value] of Object.entries(options.flags)) console.log(`\nFeature ${name}: ${before?.[name as 'autofixEnabled'] ?? 'unset'} → ${value}`);
    writes.push((tx) => tx.schoolFeatureFlags.upsert({ where: { schoolId: school.id }, update: options.flags, create: { schoolId: school.id, ...options.flags } }));
  }

  if (!options.apply) {
    console.log('\nDry run: nothing written. Add --apply to write.');
    return;
  }
  await db.$transaction(async (tx) => { for (const write of writes) await write(tx); });
  console.log(`\nApplied ${writes.length} write(s).`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
