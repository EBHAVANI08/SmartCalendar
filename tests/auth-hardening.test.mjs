// npm run test:credentials (static checks of the sign-in and session code; no database)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (file) => readFile(join(root, file), 'utf8');

async function sourceFiles(dir) {
  const out = [];
  for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await sourceFiles(path)));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(path);
  }
  return out;
}

test('password-reset codes stay on the server', async () => {
  const store = await read('src/lib/otp-store.ts');
  assert.match(store, /passwordResetCode/, 'codes are stored in the database');
  assert.match(store, /randomInt\(/, 'codes come from a secure random source');
  assert.doesNotMatch(store, /signJwt|otpToken|Math\.random/, 'no code (or hash of it) in a token sent to the browser');
  const send = await read('src/app/api/auth/reset-password/send-otp/route.ts');
  assert.doesNotMatch(send, /otpToken|accountName,|schoolName,\s*$/m, 'the reply carries no token, name or school');
  assert.match(send, /GENERIC_MESSAGE/, 'the same reply for every email');
  assert.match(send, /RESET_REQUESTS_PER_EMAIL/, 'how often codes can be requested is limited');
  const verify = await read('src/app/api/auth/reset-password/verify-otp/route.ts');
  assert.doesNotMatch(verify, /otpToken/);
});

test('the public demo endpoint reveals nothing on a real deployment', async () => {
  const demo = await read('src/app/api/auth/demo-credentials/route.ts');
  assert.match(demo, /process\.env\.NODE_ENV !== 'production' && process\.env\.ALLOW_DEMO_CREDENTIALS === 'true'/);
  assert.match(demo, /if \(!allowed\) return NextResponse\.json\(\{ enabled: false \}\)/);
});

test('sign-in limits failed attempts and refuses deactivated or closed accounts', async () => {
  const login = await read('src/app/api/auth/login/route.ts');
  assert.match(login, /LOGIN_MAX_FAILURES_PER_EMAIL/);
  assert.match(login, /LOGIN_MAX_FAILURES_PER_IP/);
  assert.match(login, /status: 429/);
  assert.match(login, /role: \{ not: 'inactive' \}/, 'deactivated teachers cannot sign in');
  assert.match(login, /SCHOOL_CLOSED/, 'suspended or cancelled schools cannot sign in');
  assert.doesNotMatch(login, /\{ contactName: admin\.name \}|\{ name: admin\.name \}/, 'an admin is never linked to a school by name');
  const owner = await read('src/app/api/superadmin/login/route.ts');
  assert.match(owner, /LOGIN_MAX_FAILURES_PER_EMAIL/);
  assert.match(owner, /mustChangePassword/);
});

test('session tokens are never kept in browser storage', async () => {
  const offenders = [];
  for (const file of await sourceFiles('src')) {
    if (!/\.tsx$/.test(file)) continue;
    const text = await read(file);
    if (/setItem\('sc_token'/.test(text) || /token: (d|data|owner)\.token/.test(text) || /superadminToken/.test(text)) offenders.push(relative(root, join(root, file)));
  }
  assert.deepEqual(offenders, []);
});

test('owner impersonation cannot outlive logout or renew itself', async () => {
  const logout = await read('src/app/api/auth/logout/route.ts');
  assert.match(logout, /smart_calendar_impersonator_token', ''/, 'logout clears the saved owner session');
  const restore = await read('src/app/api/auth/restore-session/route.ts');
  assert.doesNotMatch(restore, /signJwt/, 'restoring never issues a new, longer session');
  assert.doesNotMatch(restore, /request\.json\(\)|body\.token/, 'a token in the request body is ignored');
  const impersonate = await read('src/app/api/superadmin/tenants/[id]/impersonate/route.ts');
  assert.match(impersonate, /maxAge: IMPERSONATION_TTL_SECONDS/);
  assert.doesNotMatch(impersonate, /superadminToken: /, 'the owner token is not sent to the page');
});

test('security headers', async () => {
  const config = await read('next.config.ts');
  assert.match(config, /Strict-Transport-Security/);
  assert.match(config, /poweredByHeader: false/);
});
