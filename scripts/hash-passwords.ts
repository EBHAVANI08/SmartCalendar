/**
 * One-time migration: replace every stored plain-text password with its bcrypt
 * hash, so existing users keep signing in with the same password.
 *
 *   npx tsx scripts/hash-passwords.ts --school <schoolId>     dry run, one school
 *   npx tsx scripts/hash-passwords.ts --all                   dry run, everything
 *   npx tsx scripts/hash-passwords.ts --all --apply           write changes
 *
 * Every converted account gets mustChangePassword = true: its password was
 * either a shared default or chosen by someone else, so the holder must pick a
 * new one at next sign-in (enforced by the app from the deploy that adds it).
 *
 * Dry run is the default. Password values are never printed. Changes are
 * applied in batched transactions. Admin and OwnerEmployee are platform-level
 * accounts and are only processed with --all.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 10;
const BCRYPT_PATTERN = /^\$2[aby]\$/;
const BATCH_SIZE = 50;
/** Values the schema used to fill in automatically. Counted (not printed) so the
 * report shows how many accounts still use a widely known password. */
const FORMER_SCHEMA_DEFAULTS = new Set(['teacher123', 'school123', 'member123']);

type ModelName = 'teacher' | 'school' | 'workspaceMember' | 'admin' | 'ownerEmployee';
type Row = { id: string; password: string | null; mustChangePassword: boolean | null };
type Tally = { total: number; hashed: number; plaintext: number; empty: number; formerDefault: number; mustChange: number };

interface Options {
  schoolId: string | null;
  all: boolean;
  apply: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { schoolId: null, all: false, apply: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--school') options.schoolId = argv[++index] ?? null;
    else if (arg === '--all') options.all = true;
    else if (arg === '--apply') options.apply = true;
    else if (arg === '--dry-run') options.apply = false;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.all === Boolean(options.schoolId)) {
    throw new Error('Pass exactly one of --school <id> or --all.');
  }
  if (options.schoolId && !/^[0-9a-f]{24}$/i.test(options.schoolId)) {
    throw new Error('--school expects a 24-character school id.');
  }
  return options;
}

function tally(rows: Row[]): Tally {
  const result: Tally = { total: rows.length, hashed: 0, plaintext: 0, empty: 0, formerDefault: 0, mustChange: 0 };
  for (const row of rows) {
    if (row.mustChangePassword) result.mustChange++;
    const value = row.password ?? '';
    if (!value) result.empty++;
    else if (BCRYPT_PATTERN.test(value)) result.hashed++;
    else {
      result.plaintext++;
      if (FORMER_SCHEMA_DEFAULTS.has(value)) result.formerDefault++;
    }
  }
  return result;
}

async function loadRows(db: PrismaClient, model: ModelName, schoolId: string | null): Promise<Row[]> {
  const select = { id: true, password: true, mustChangePassword: true } as const;
  switch (model) {
    case 'teacher':
      return db.teacher.findMany({ where: schoolId ? { schoolId } : {}, select });
    case 'workspaceMember':
      return db.workspaceMember.findMany({ where: schoolId ? { schoolId } : {}, select });
    case 'school':
      return db.school.findMany({ where: schoolId ? { id: schoolId } : {}, select });
    case 'admin':
      return db.admin.findMany({ select });
    case 'ownerEmployee':
      return db.ownerEmployee.findMany({ select });
  }
}

function updateOne(db: PrismaClient, model: ModelName, id: string, password: string) {
  const args = { where: { id }, data: { password, mustChangePassword: true }, select: { id: true } };
  switch (model) {
    case 'teacher': return db.teacher.update(args);
    case 'workspaceMember': return db.workspaceMember.update(args);
    case 'school': return db.school.update(args);
    case 'admin': return db.admin.update(args);
    case 'ownerEmployee': return db.ownerEmployee.update(args);
  }
}

function printTally(label: string, before: Tally, after: Tally) {
  const cell = (t: Tally) => `${t.hashed} hashed / ${t.plaintext} plain-text / ${t.empty} empty / ${t.mustChange} must change password`;
  console.log(`  ${label.padEnd(16)} total ${String(before.total).padStart(4)}`);
  console.log(`    before: ${cell(before)}${before.formerDefault ? `  (${before.formerDefault} still use a former schema default)` : ''}`);
  console.log(`    after:  ${cell(after)}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const db = new PrismaClient();
  const models: ModelName[] = options.all
    ? ['teacher', 'school', 'workspaceMember', 'admin', 'ownerEmployee']
    : ['teacher', 'school', 'workspaceMember'];

  try {
    if (options.schoolId) {
      const school = await db.school.findUnique({ where: { id: options.schoolId }, select: { id: true } });
      if (!school) throw new Error(`No school with id ${options.schoolId}.`);
    }

    console.log(`Mode: ${options.apply ? 'APPLY' : 'DRY RUN (no changes written)'}`);
    console.log(`Scope: ${options.all ? 'all schools and platform accounts' : `school ${options.schoolId}`}\n`);

    let totalToHash = 0;
    let totalHashed = 0;

    for (const model of models) {
      const rows = await loadRows(db, model, options.schoolId);
      const before = tally(rows);
      const pending = rows.filter((row) => row.password && !BCRYPT_PATTERN.test(row.password));
      totalToHash += pending.length;

      if (options.apply) {
        for (let start = 0; start < pending.length; start += BATCH_SIZE) {
          const batch = pending.slice(start, start + BATCH_SIZE);
          // Hash outside the transaction so it stays short.
          const hashes = await Promise.all(batch.map((row) => bcrypt.hash(row.password as string, BCRYPT_ROUNDS)));
          await db.$transaction(batch.map((row, index) => updateOne(db, model, row.id, hashes[index])));
          totalHashed += batch.length;
        }
      }

      const after = options.apply
        ? tally(await loadRows(db, model, options.schoolId))
        : { ...before, hashed: before.hashed + pending.length, plaintext: 0, formerDefault: 0, mustChange: before.mustChange + pending.filter((row) => !row.mustChangePassword).length };
      printTally(model, before, after);
    }

    console.log(
      options.apply
        ? `\nHashed ${totalHashed} of ${totalToHash} plain-text password(s) and flagged them mustChangePassword.`
        : `\n${totalToHash} plain-text password(s) would be hashed and flagged mustChangePassword. Re-run with --apply to write.`
    );
    console.log('Empty passwords are left unchanged: those accounts cannot sign in until a password is set.');
    console.log('Hashing keeps each password the same, so nobody is locked out; the flag makes each holder choose a new one at next sign-in.');
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
