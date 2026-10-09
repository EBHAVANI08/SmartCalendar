/**
 * Credentials must never leave the server.
 *
 * Static checks always run. The live check runs only against a non-production
 * database: set SC_TEST_DATABASE_URL (the database the server at SC_BASE_URL is
 * using) plus SC_TEST_LOGIN_EMAIL / SC_TEST_LOGIN_PASSWORD for an admin of a test
 * school. Without them it is skipped, so this file never touches production.
 *
 *   node --test tests/no-credentials.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

async function sourceFiles(dir) {
  const entries = await readdir(join(root, dir), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(path);
  }
  return files;
}

async function scan(dirs, pattern) {
  const hits = [];
  for (const dir of dirs) {
    for (const file of await sourceFiles(dir)) {
      const lines = (await readFile(join(root, file), 'utf8')).split('\n');
      lines.forEach((line, index) => {
        if (pattern.test(line)) hits.push(`${relative(root, join(root, file))}:${index + 1}: ${line.trim().slice(0, 120)}`);
      });
    }
  }
  return hits;
}

test('no API loads a credential-bearing relation in full', async () => {
  // Teacher and School rows carry `password`; relations must use the selects in src/lib/safe-fields.ts.
  const hits = await scan(['src/app/api', 'src/lib/services'], /\b(teacher|absentTeacher|substitute|school)\s*:\s*true\b/);
  assert.deepEqual(hits, [], `Use TEACHER_PUBLIC_SELECT / SCHOOL_PUBLIC_SELECT instead:\n${hits.join('\n')}`);
});

test('no API writes a literal password', async () => {
  // An object property `password: '<literal>'`, not the word inside a message.
  const hits = await scan(['src/app/api', 'src/lib'], /(^|[{,])\s*password\s*:\s*['"`]/);
  assert.deepEqual(hits, [], `Hash passwords with src/lib/password.ts:\n${hits.join('\n')}`);
});

test('schema has no default password', async () => {
  const schema = await readFile(join(root, 'prisma/schema.prisma'), 'utf8');
  assert.doesNotMatch(schema, /password\s+String[^\n]*@default/);
});

test('plain-text login is off unless the legacy bridge is enabled', async () => {
  const source = await readFile(join(root, 'src/lib/password.ts'), 'utf8');
  assert.match(source, /ALLOW_LEGACY_PLAINTEXT_LOGIN/);
  assert.match(source, /if \(!legacyPlaintextAllowed\(\) \|\| provided !== stored\) return false;/);
  for (const route of ['src/app/api/auth/login/route.ts', 'src/app/api/superadmin/login/route.ts', 'src/app/api/profile/route.ts']) {
    const text = await readFile(join(root, route), 'utf8');
    assert.match(text, /from '@\/lib\/password'/, `${route} must use the shared verifier`);
    assert.doesNotMatch(text, /bcrypt\.compare/, `${route} must not compare passwords itself`);
  }
});

test('password-reset codes are bound to one account and never returned in production', async () => {
  const sendOtp = await readFile(join(root, 'src/app/api/auth/reset-password/send-otp/route.ts'), 'utf8');
  // Both an explicit opt-in and a non-production build are required.
  assert.match(sendOtp, /process\.env\.ALLOW_DEV_OTP === 'true' && process\.env\.NODE_ENV !== 'production'/);
  assert.match(sendOtp, /devOtp: emailResult\.simulated && devOtpAllowed\(\)/);
  assert.match(sendOtp, /SCHOOL_CODE_REQUIRED/, 'a reset must not pick one of several schools');
  const verifyOtp = await readFile(join(root, 'src/app/api/auth/reset-password/verify-otp/route.ts'), 'utf8');
  assert.doesNotMatch(verifyOtp, /where: \{ email \}/, 'a reset must not update every account sharing an email');
  const middleware = await readFile(join(root, 'src/middleware.ts'), 'utf8');
  assert.match(middleware, /verifySessionJwt\(token\)/, 'reset and setup tokens must not be accepted as sessions');
});

test('passwords chosen for someone else force a change at next sign-in', async () => {
  const schema = await readFile(join(root, 'prisma/schema.prisma'), 'utf8');
  for (const model of ['Teacher', 'School', 'WorkspaceMember', 'Admin', 'OwnerEmployee']) {
    const start = schema.indexOf(`model ${model} {`);
    const block = schema.slice(start, schema.indexOf('\n}', start));
    assert.match(block, /mustChangePassword\s+Boolean\?/, `${model} needs an optional mustChangePassword`);
  }
  const middleware = await readFile(join(root, 'src/middleware.ts'), 'utf8');
  assert.match(middleware, /session\?\.mustChangePassword/);
  assert.match(middleware, /PASSWORD_CHANGE_REQUIRED/);
  for (const route of ['src/app/api/teachers/route.ts', 'src/app/api/teachers/bulk-upload/route.ts', 'scripts/hash-passwords.ts', 'src/app/api/superadmin/tenants/[id]/route.ts']) {
    assert.match(await readFile(join(root, route), 'utf8'), /mustChangePassword: true/, `${route} must force a change`);
  }
  const changePassword = await readFile(join(root, 'src/app/api/auth/change-password/route.ts'), 'utf8');
  assert.match(changePassword, /verifySessionJwt/);
});

test('teacher setup links are single-use', async () => {
  const mailer = await readFile(join(root, 'src/lib/mailer.ts'), 'utf8');
  assert.match(mailer, /pwv: passwordFingerprint\(/, 'tokens must carry the password fingerprint');
  assert.match(mailer, /verified\.pwv === passwordFingerprint\(teacher\.password\)/, 'verification must compare it');
  const setup = await readFile(join(root, 'src/app/api/auth/setup-password/route.ts'), 'utf8');
  assert.match(setup, /updateMany\(\{\s*where: \{ id: teacher\.id, password: payload\.storedPassword \}/, 'the update must be conditional on the unused password');
});

test('teacher login never picks the first school with a matching email', async () => {
  const login = await readFile(join(root, 'src/app/api/auth/login/route.ts'), 'utf8');
  assert.doesNotMatch(login, /db\.teacher\.findFirst/);
  assert.match(login, /SCHOOL_REQUIRED/);
});

test('school list is not exposed to tenant users', async () => {
  const route = await readFile(join(root, 'src/app/api/schools/route.ts'), 'utf8');
  assert.match(route, /isSuperAdminRequest/);
});

function hasPasswordKey(value) {
  if (Array.isArray(value)) return value.some(hasPasswordKey);
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([key, entry]) => key.toLowerCase() === 'password' || hasPasswordKey(entry));
  }
  return false;
}

const live = {
  base: process.env.SC_BASE_URL,
  database: process.env.SC_TEST_DATABASE_URL,
  email: process.env.SC_TEST_LOGIN_EMAIL,
  password: process.env.SC_TEST_LOGIN_PASSWORD,
};
// Production is whatever .env points at; the live check refuses that database
// (same host and database name), whatever the current shell's DATABASE_URL is.
async function productionDatabaseUrl() {
  try {
    const text = await readFile(join(root, '.env'), 'utf8');
    const line = text.split(/\r?\n/).find((entry) => /^\s*DATABASE_URL\s*=/.test(entry));
    return line ? line.replace(/^\s*DATABASE_URL\s*=\s*/, '').replace(/^["']|["']$/g, '').trim() : null;
  } catch {
    return null;
  }
}
const identity = (uri) => {
  const match = /^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)\/?([^?]*)/i.exec(String(uri || '').trim());
  return match ? `${match[1].toLowerCase()}/${match[2]}` : String(uri || '');
};
const production = await productionDatabaseUrl();
const liveReason =
  !live.database ? 'SC_TEST_DATABASE_URL not set (live check never runs against production)'
  : !production ? 'cannot read .env DATABASE_URL to rule out production; refusing to run'
  : identity(live.database) === identity(production) ? 'SC_TEST_DATABASE_URL is the production database from .env; refusing to run'
  : !live.base || !live.email || !live.password ? 'SC_BASE_URL / SC_TEST_LOGIN_EMAIL / SC_TEST_LOGIN_PASSWORD not set'
  : null;

test('live: teacher and schedule APIs return no password field', { skip: liveReason ?? false }, async () => {
  const login = await fetch(`${live.base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: live.email, password: live.password }),
  });
  assert.equal(login.status, 200, 'test login failed');
  const { token } = await login.json();
  for (const path of ['/api/teachers', '/api/schedules']) {
    const response = await fetch(`${live.base}${path}`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(response.status, 200, `${path} returned ${response.status}`);
    assert.equal(hasPasswordKey(await response.json()), false, `${path} returned a password field`);
  }
});

test('session signing has no fallback secret in source', async () => {
  const source = await readFile(join(root, 'src/lib/jwt-auth.ts'), 'utf8');
  const getSecret = source.slice(source.indexOf('function getSecret'), source.indexOf('let cachedKey'));
  assert.match(getSecret, /throw new Error/, 'a missing or short JWT_SECRET must fail closed');
  assert.doesNotMatch(getSecret, /return\s+['"`]/, 'getSecret must never return a literal');
  const literals = [...(await scan(['src'], /['"`][A-Za-z0-9_]*secret[A-Za-z0-9_]*_[A-Za-z0-9_]{10,}['"`]/i))];
  assert.deepEqual(literals, [], 'no secret-like literal anywhere in src');
});
