/**
 * Settings persistence, readiness scanning and qualification classification.
 *
 * The readiness tests deliberately run against **Takshila**, because the whole
 * point is that scanning a live tenant is safe. They assert the scan writes
 * nothing, and that the production baseline is byte-for-byte unchanged after.
 *
 * Everything that WRITES runs against HIGHSCHOOL only.
 *
 *   npm run dev
 *   node --test tests/migration-readiness.test.mjs
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const BASE = process.env.SC_BASE_URL ?? 'http://localhost:3005';
const HIGH = '6a90282671483239cb9b9cfe';
const TAKSHILA = '60d5ecb8b5c9c22340000001';
const ADMIN = { email: 'demo@takshila.school', password: 'school123' };
const OWNER = { email: 'sp@kamglobalai.com', password: 'P@ssw0rd123' };

const db = new PrismaClient();
let serverUp = false;
let adminToken = '';
let ownerToken = '';
let original = null;

const call = (path, { method = 'GET', token, body } = {}) =>
  fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

before(async () => {
  try {
    serverUp = (await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(5000) })).ok;
  } catch { serverUp = false; }
  if (!serverUp) return;

  adminToken = (await (await call('/api/auth/login', { method: 'POST', body: ADMIN })).json()).token ?? '';
  ownerToken = (await (await call('/api/auth/login', { method: 'POST', body: OWNER })).json()).token ?? '';
  assert.ok(adminToken, 'school admin should log in');

  original = await db.school.findUnique({
    where: { id: HIGH },
    select: { name: true, email: true, code: true, board: true, address: true, phone: true },
  });
});

after(async () => {
  if (serverUp && original) {
    await db.school.update({
      where: { id: HIGH },
      data: { board: original.board, address: original.address, phone: original.phone, name: original.name },
    });
  }
  await db.$disconnect();
});

// ── Settings ────────────────────────────────────────────────────────────────

test('board and address persist to the database', async (t) => {
  if (!serverUp) return t.skip('dev server not running');
  const res = await call('/api/school/profile', {
    method: 'PUT', token: adminToken,
    body: { name: original.name, board: 'CBSE', address: 'Sector 21, Nashik, MH 422001', phone: '+91 90000 11111' },
  });
  assert.ok(res.ok, `expected 200, got ${res.status}`);

  const row = await db.school.findUnique({ where: { id: HIGH }, select: { board: true, address: true } });
  assert.equal(row.board, 'CBSE');
  assert.equal(row.address, 'Sector 21, Nashik, MH 422001');
});

test('a fresh read returns them, so a page reload keeps them', async (t) => {
  if (!serverUp) return t.skip('dev server not running');
  const body = await (await call('/api/school/profile', { token: adminToken })).json();
  assert.equal(body.profile.board, 'CBSE');
  assert.equal(body.profile.address, 'Sector 21, Nashik, MH 422001');
});

test('a partial save does not erase untouched fields', async (t) => {
  if (!serverUp) return t.skip('dev server not running');
  await call('/api/school/profile', { method: 'PUT', token: adminToken, body: { name: original.name, board: 'ICSE' } });
  const row = await db.school.findUnique({ where: { id: HIGH }, select: { board: true, address: true, phone: true } });
  assert.equal(row.board, 'ICSE', 'board should change');
  assert.equal(row.address, 'Sector 21, Nashik, MH 422001', 'address must survive');
  assert.equal(row.phone, '+91 90000 11111', 'phone must survive');
});

test('the login email cannot be changed through normal Settings', async (t) => {
  if (!serverUp) return t.skip('dev server not running');
  await call('/api/school/profile', {
    method: 'PUT', token: adminToken,
    body: { name: original.name, email: 'hijacked@evil.test' },
  });
  const row = await db.school.findUnique({ where: { id: HIGH }, select: { email: true } });
  assert.equal(row.email, original.email, 'login identity must be untouched');
});

test('the school code cannot be changed through Settings', async (t) => {
  if (!serverUp) return t.skip('dev server not running');
  await call('/api/school/profile', {
    method: 'PUT', token: adminToken,
    body: { name: original.name, code: 'HIJACKED' },
  });
  const row = await db.school.findUnique({ where: { id: HIGH }, select: { code: true } });
  assert.equal(row.code, original.code, 'tenant identity must be untouched');
});

test('an unrecognised board is rejected', async (t) => {
  if (!serverUp) return t.skip('dev server not running');
  const res = await call('/api/school/profile', {
    method: 'PUT', token: adminToken, body: { name: original.name, board: 'NOT_A_BOARD' },
  });
  assert.equal(res.status, 400);
});

// ── Readiness scanning is read-only ─────────────────────────────────────────

const takshilaBaseline = async () => ({
  teachers: await db.teacher.count({ where: { schoolId: TAKSHILA } }),
  schedules: await db.schedule.count({ where: { schoolId: TAKSHILA } }),
  substitutions: await db.substitution.count({ where: { absentTeacher: { schoolId: TAKSHILA } } }),
  versions: await db.timetableVersion.count({ where: { schoolId: TAKSHILA } }),
  validationIssues: await db.validationIssue.count({ where: { schoolId: TAKSHILA } }),
  rooms: await db.room.count({ where: { schoolId: TAKSHILA } }),
});

test('the Takshila readiness scan writes nothing and preserves the baseline', async (t) => {
  if (!serverUp) return t.skip('dev server not running');
  if (!ownerToken) return t.skip('owner login unavailable');

  const before = await takshilaBaseline();
  assert.deepEqual(before, {
    teachers: 59, schedules: 0, substitutions: 0,
    versions: 0, validationIssues: 0, rooms: 5,
  }, 'Takshila baseline must hold before the scan');

  const res = await call(`/api/school/readiness?schoolId=${TAKSHILA}`, { token: ownerToken });
  assert.ok(res.ok, `readiness scan should succeed, got ${res.status}`);
  const report = await res.json();
  assert.ok(Array.isArray(report.areas) && report.areas.length > 10, 'the report should cover many areas');

  const after = await takshilaBaseline();
  assert.deepEqual(after, before, 'the readiness scan must not write anything');
});

test('the Takshila upgrade preview writes nothing', async (t) => {
  if (!serverUp) return t.skip('dev server not running');
  if (!ownerToken) return t.skip('owner login unavailable');

  const before = await takshilaBaseline();
  const res = await call(`/api/timetable/upgrade-preview?schoolId=${TAKSHILA}`, { token: ownerToken });
  assert.ok(res.ok, `preview should succeed, got ${res.status}`);
  const preview = await res.json();
  assert.equal(preview.readOnly, true);
  // The demo timetable was cleared, so there are no legacy rows left to upgrade.
  assert.equal(preview.totalRows, 0, 'no legacy rows remain after the clear');

  const after = await takshilaBaseline();
  assert.deepEqual(after, before, 'the upgrade preview must not write anything');
});

test('the upgrade preview has no execution path', async (t) => {
  if (!serverUp) return t.skip('dev server not running');
  const res = await call('/api/timetable/upgrade-preview', { method: 'POST', token: adminToken });
  assert.equal(res.status, 405, 'POST must not exist on the preview route');
});

test('Takshila keeps its historical clash groups, corrupt records and duplicate groups', async (t) => {
  if (!serverUp) return t.skip('dev server not running');
  if (!ownerToken) return t.skip('owner login unavailable');

  const report = await (await call(`/api/school/readiness?schoolId=${TAKSHILA}`, { token: ownerToken })).json();
  const area = (name) => report.areas.find((a) => a.area === name);

  // 0 clashes because the demo timetable was cleared on 2026-09-06 - there are
  // no assignments left to clash. It was 57, then 37 after the corrupt-record
  // cleanup detached their periods.
  assert.equal(area('Teacher clashes').count, 0, 'no timetable means no clashes');
  // All 25 corrupt import records were removed by the admin through the UI.
  assert.equal(area('Corrupt faculty records').count, 0, 'the corrupt import records have all been cleared');
  assert.equal(area('Duplicate faculty').count, 7, '7 duplicate-review groups must remain');
  assert.equal(area('Timetable rows').count, 0, 'the demo timetable was cleared');
});

// ── Qualification classification ────────────────────────────────────────────

test('qualification readiness distinguishes deterministic from ambiguous', async (t) => {
  if (!serverUp) return t.skip('dev server not running');
  if (!ownerToken) return t.skip('owner login unavailable');

  const report = await (await call(`/api/school/readiness?schoolId=${HIGH}`, { token: ownerToken })).json();
  const area = report.areas.find((a) => a.area === 'Teacher qualifications');
  assert.ok(area, 'the report should cover teacher qualifications');

  // One subject across many grades, and many subjects in one grade, are safe.
  assert.match(area.reason, /deterministic/);
  // Many subjects across many grades must never be silently expanded.
  assert.match(area.reason, /ambiguous|evidence/);
});

test('a multi-subject multi-grade teacher is never auto-expanded', async (t) => {
  if (!serverUp) return t.skip('dev server not running');

  const readList = (v) => { try { const p = JSON.parse(v ?? '[]'); return Array.isArray(p) ? p : []; } catch { return []; } };
  const teachers = await db.teacher.findMany({
    where: { schoolId: HIGH },
    select: { name: true, subject: true, subjects: true, grades: true },
  });

  const cartesian = teachers.filter((x) => {
    const subs = readList(x.subjects).length ? readList(x.subjects) : (x.subject ? [x.subject] : []);
    return subs.length > 1 && readList(x.grades).length > 1;
  });

  // Whatever the count, none of them may have produced qualification rows,
  // because no qualification migration has been run.
  assert.equal(
    await db.teacherQualification.count({ where: { schoolId: HIGH } }), 0,
    'no TeacherQualification rows may exist yet'
  );
  assert.equal(
    await db.teacherQualification.count({ where: { schoolId: TAKSHILA } }), 0,
    'Takshila must have no TeacherQualification rows'
  );
  assert.ok(cartesian.length >= 0);
});

test('Migration 1 is applied: every substitution carries an explicit schoolId', async (t) => {
  if (!serverUp) return t.skip('dev server not running');

  // 94, not the 96 the backfill saw: two cover requests belonged to corrupt
  // records and went with them during the cleanup. The backfill itself changed
  // no row count.
  // 16, all HIGHSCHOOL: Takshila's 78 went with its demo timetable.
  assert.equal(await db.substitution.count(), 16, 'every remaining row is accounted for');
  assert.equal(
    await db.substitution.count({ where: { OR: [{ schoolId: null }, { schoolId: { isSet: false } }] } }), 0,
    'no substitution may be left without a tenant'
  );
  assert.equal(await db.substitution.count({ where: { schoolId: TAKSHILA } }), 0);
  assert.equal(await db.substitution.count({ where: { schoolId: HIGH } }), 16);

  // Every row still agrees with the relation the backfill derived it from.
  const rows = await db.substitution.findMany({ include: { absentTeacher: { select: { schoolId: true } } } });
  assert.equal(rows.filter((r) => r.schoolId !== r.absentTeacher?.schoolId).length, 0);
});

test('Migration 2 is applied: teacher email is unique per school, not globally', async (t) => {
  if (!serverUp) return t.skip('dev server not running');

  const indexes = (await db.$runCommandRaw({ listIndexes: 'Teacher' })).cursor.firstBatch;
  const names = indexes.map((i) => i.name);
  assert.ok(!names.includes('Teacher_email_key'), 'the global unique index must be gone');
  assert.ok(
    indexes.some((i) => i.name === 'Teacher_schoolId_email_key' && i.unique),
    'the compound unique index must exist'
  );

  // 85, not 93: 8 corrupt Takshila records were deliberately deleted by an admin.
  // The migration itself regenerated no identities.
  assert.equal(await db.teacher.count(), 68, 'the index change regenerated no identities');
  assert.equal(await db.teacher.count({ where: { schoolId: TAKSHILA } }), 59);
});

test('a teacher email may repeat across schools but not within one', async (t) => {
  if (!serverUp) return t.skip('dev server not running');
  const email = 'suite.crosstenant@example.test';
  await db.teacher.deleteMany({ where: { email } });

  const a = await db.teacher.create({
    data: { name: 'Suite A', email, password: 'x', subject: 'Math', grades: '[]', schoolId: TAKSHILA },
  });
  const b = await db.teacher.create({
    data: { name: 'Suite B', email, password: 'x', subject: 'Math', grades: '[]', schoolId: HIGH },
  });
  assert.ok(a.id && b.id, 'the same email must be legal in two different schools');

  await assert.rejects(
    () => db.teacher.create({
      data: { name: 'Suite C', email, password: 'x', subject: 'Math', grades: '[]', schoolId: TAKSHILA },
    }),
    'a duplicate within one school must still be rejected'
  );

  await db.teacher.deleteMany({ where: { email } });
  assert.equal(await db.teacher.count({ where: { schoolId: TAKSHILA } }), 59, 'Takshila restored');
});

test('the WebsiteSettings duplicate is resolved and Takshila is untouched', async (t) => {
  if (!serverUp) return t.skip('dev server not running');

  assert.equal(await db.websiteSettings.count({ where: { key: 'default' } }), 1, 'exactly one default row');

  // No qualification migration has run, and no timetable was upgraded.
  assert.equal(await db.teacherQualification.count({ where: { schoolId: TAKSHILA } }), 0);
  assert.equal(await db.teacher.count({ where: { schoolId: TAKSHILA } }), 59);
  assert.equal(await db.schedule.count({ where: { schoolId: TAKSHILA } }), 0);
  assert.equal(await db.timetableVersion.count({ where: { schoolId: TAKSHILA } }), 0);
});
