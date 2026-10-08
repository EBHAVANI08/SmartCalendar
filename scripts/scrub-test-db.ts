/**
 * Turns a restored COPY of production into a safe test database.
 *
 *   $env:DATABASE_URL = "<test database uri>"     # never the production uri
 *   $env:SC_TEST_PASSWORD = "<password for every test account>"
 *   npx tsx scripts/scrub-test-db.ts --target-db <test db name> [--keep-login <email>]            # dry run
 *   npx tsx scripts/scrub-test-db.ts --target-db <test db name> [--keep-login <email>] --apply
 *
 * Refuses to run when DATABASE_URL points at the same host and database as the
 * DATABASE_URL in .env (production), or when its database name is not exactly
 * --target-db.
 *
 * With --apply, in batched transactions:
 *  - every account password becomes the bcrypt hash of SC_TEST_PASSWORD and
 *    mustChangePassword is cleared (Teacher, School, WorkspaceMember, Admin,
 *    OwnerEmployee);
 *  - every account email becomes <model>-<id>@example.test, except --keep-login;
 *  - teacher and school phone numbers are blanked;
 *  - all NotificationDelivery rows are deleted (real recipients, queued sends);
 *  - external calendar credentials and sync tokens are cleared.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const BATCH_SIZE = 50;
const SCRUBBED_DOMAIN = 'example.test';

type AccountModel = 'teacher' | 'school' | 'workspaceMember' | 'admin' | 'ownerEmployee';
const ACCOUNT_MODELS: AccountModel[] = ['teacher', 'school', 'workspaceMember', 'admin', 'ownerEmployee'];

function parseArgs(argv: string[]) {
  const options = { targetDb: '', keepLogin: '', apply: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--target-db') options.targetDb = argv[++index] ?? '';
    else if (arg === '--keep-login') options.keepLogin = (argv[++index] ?? '').trim().toLowerCase();
    else if (arg === '--apply') options.apply = true;
    else if (arg === '--dry-run') options.apply = false;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.targetDb) throw new Error('--target-db <name> is required.');
  return options;
}

/** host + database name, ignoring credentials and query options. */
function databaseIdentity(uri: string): { host: string; database: string } {
  const match = /^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)\/?([^?]*)/i.exec(uri.trim());
  if (!match) throw new Error('DATABASE_URL is not a MongoDB connection string.');
  return { host: match[1].toLowerCase(), database: decodeURIComponent(match[2] || '') };
}

function productionUriFromDotEnv(): string | null {
  try {
    const text = readFileSync(join(process.cwd(), '.env'), 'utf8');
    const line = text.split(/\r?\n/).find((entry) => /^\s*DATABASE_URL\s*=/.test(entry));
    if (!line) return null;
    return line.replace(/^\s*DATABASE_URL\s*=\s*/, '').replace(/^["']|["']$/g, '').trim();
  } catch {
    return null;
  }
}

function assertSafeTarget(targetDb: string) {
  const uri = process.env.DATABASE_URL || '';
  if (!uri) throw new Error('Set DATABASE_URL to the TEST database in this shell first.');
  const target = databaseIdentity(uri);
  if (target.database !== targetDb) {
    throw new Error(`DATABASE_URL database is "${target.database || '(none)'}", not --target-db "${targetDb}". Refusing.`);
  }
  const productionUri = productionUriFromDotEnv();
  if (!productionUri) throw new Error('Could not read DATABASE_URL from .env to compare against. Refusing.');
  const production = databaseIdentity(productionUri);
  if (production.host === target.host && production.database === target.database) {
    throw new Error('DATABASE_URL points at the production database from .env. Refusing.');
  }
  return target;
}

async function scrubAccounts(db: PrismaClient, model: AccountModel, passwordHash: string, keepLogin: string, apply: boolean) {
  const select = { id: true, email: true } as const;
  const rows: { id: string; email: string }[] =
    model === 'teacher' ? await db.teacher.findMany({ select })
    : model === 'school' ? await db.school.findMany({ select })
    : model === 'workspaceMember' ? await db.workspaceMember.findMany({ select })
    : model === 'admin' ? await db.admin.findMany({ select })
    : await db.ownerEmployee.findMany({ select });

  const kept = rows.filter((row) => keepLogin && row.email.toLowerCase() === keepLogin).length;
  if (apply) {
    for (let start = 0; start < rows.length; start += BATCH_SIZE) {
      const batch = rows.slice(start, start + BATCH_SIZE);
      await db.$transaction(batch.map((row) => {
        const email = keepLogin && row.email.toLowerCase() === keepLogin ? row.email : `${model}-${row.id}@${SCRUBBED_DOMAIN}`;
        const where = { id: row.id };
        const data = { password: passwordHash, mustChangePassword: false, email };
        switch (model) {
          case 'teacher': return db.teacher.update({ where, data: { ...data, phone: '' }, select: { id: true } });
          case 'school': return db.school.update({ where, data: { ...data, phone: null }, select: { id: true } });
          case 'workspaceMember': return db.workspaceMember.update({ where, data, select: { id: true } });
          case 'admin': return db.admin.update({ where, data, select: { id: true } });
          case 'ownerEmployee': return db.ownerEmployee.update({ where, data, select: { id: true } });
        }
      }));
    }
  }
  console.log(`  ${model.padEnd(16)} ${String(rows.length).padStart(4)} account(s) rewritten${kept ? ` (${kept} kept login email)` : ''}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const target = assertSafeTarget(options.targetDb);
  const testPassword = process.env.SC_TEST_PASSWORD || '';
  if (testPassword.length < 8) throw new Error('Set SC_TEST_PASSWORD (at least 8 characters) in this shell.');

  const db = new PrismaClient();
  try {
    console.log(`Mode: ${options.apply ? 'APPLY' : 'DRY RUN (no changes written)'}`);
    console.log(`Target: ${target.host} / ${target.database}\n`);
    const passwordHash = await bcrypt.hash(testPassword, 10);
    for (const model of ACCOUNT_MODELS) await scrubAccounts(db, model, passwordHash, options.keepLogin, options.apply);

    const deliveries = await db.notificationDelivery.count();
    const subscriptions = await db.calendarSubscription.count({ where: { OR: [{ encryptedCredential: { not: null } }, { syncToken: { not: null } }] } });
    if (options.apply) {
      await db.notificationDelivery.deleteMany({});
      await db.calendarSubscription.updateMany({ data: { encryptedCredential: null, syncToken: null, status: 'disabled' } });
    }
    console.log(`  notificationDelivery ${deliveries} row(s) deleted`);
    console.log(`  calendarSubscription ${subscriptions} credential(s) cleared`);
    console.log(options.apply ? '\nScrub complete.' : '\nRe-run with --apply to write.');
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
