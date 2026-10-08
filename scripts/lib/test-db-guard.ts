/**
 * Guard for scripts that write test data: refuses to run against the
 * production database named in .env (same host and database), and requires
 * the database name to be stated explicitly.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

/** Throws unless DATABASE_URL is a non-production database named exactly `targetDb`. */
export function assertTestDatabase(targetDb: string) {
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

