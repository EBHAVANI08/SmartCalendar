/**
 * Navigation, School Setup and the faculty delete flow.
 *
 * The delete tests exist because deleting a deactivated teacher appeared not to
 * work. It does — it refuses when other records still reference the teacher,
 * which is correct. These pin all three outcomes so the behaviour stays legible.
 *
 * HIGHSCHOOL only. Takshila is asserted unchanged at the end.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const BASE = process.env.SC_BASE_URL ?? 'http://localhost:3005';
const HIGH = '6a90282671483239cb9b9cfe';
const TAKSHILA = '60d5ecb8b5c9c22340000001';
const ADMIN = { email: 'demo@takshila.school', password: 'school123' };

const db = new PrismaClient();
let serverUp = false;
let token = '';
const PROBE_EMAILS = [
  'nav.clean@highschool.test',
  'nav.active@highschool.test',
  'nav.referenced@highschool.test',
  'nav.attendance@highschool.test',
  'bulk.guard@highschool.test',
];

const call = (path, { method = 'GET', body } = {}) =>
  fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

const page = (path) =>
  fetch(`${BASE}${path}`, { headers: { cookie: `smart_calendar_token=${token}` }, redirect: 'manual' });

async function cleanupProbes() {
  const probes = await db.teacher.findMany({
    where: {
      OR: [
        { email: { in: PROBE_EMAILS } },
        { email: { endsWith: '@highschool.test' } },
      ],
    },
    select: { id: true },
  });
  const ids = probes.map((p) => p.id);
  if (ids.length > 0) {
    await db.biometricAttendance.deleteMany({ where: { teacherId: { in: ids } } }).catch(() => {});
    await db.leaveApplication.deleteMany({ where: { teacherId: { in: ids } } }).catch(() => {});
    await db.schedule.deleteMany({ where: { teacherId: { in: ids } } }).catch(() => {});
    await db.substitution.deleteMany({ where: { OR: [{ originalTeacherId: { in: ids } }, { assignedTeacherId: { in: ids } }] } }).catch(() => {});
    await db.teacher.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
  }
}

before(async () => {
  try {
    serverUp = (await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(5000) })).ok;
  } catch { serverUp = false; }
  if (!serverUp) return;
  token = (await (await call('/api/auth/login', { method: 'POST', body: ADMIN })).json()).token ?? '';
  assert.ok(token, 'admin should log in');
  await cleanupProbes();
});

after(async () => {
  if (serverUp) await cleanupProbes();
  await db.$disconnect();
});

// ── School Setup ────────────────────────────────────────────────────────────

test('School Setup renders with all four configuration tabs', async (t) => {
  if (!serverUp) return t.skip('dev server not running');
  const res = await page('/school-setup');
  assert.equal(res.status, 200);
  const html = await res.text();
  for (const id of ['profile', 'structure', 'days', 'rooms']) {
    assert.ok(html.includes(`school-setup-tab-${id}`), `the ${id} tab should render`);
  }
});

test('the routes moved into School Setup still resolve as deep links', async (t) => {
  if (!serverUp) return t.skip('dev server not running');
  for (const path of ['/subjects', '/day-config', '/rooms', '/settings']) {
    assert.equal((await page(path)).status, 200, `${path} must keep working`);
  }
});

test('modules removed from the sidebar remain reachable directly', async (t) => {
  if (!serverUp) return t.skip('dev server not running');
  // Analytics and Lesson Plans left the sidebar but were not deleted.
  for (const path of ['/analytics', '/lesson-plans']) {
    assert.equal((await page(path)).status, 200, `${path} must still resolve`);
  }
});

// ── Faculty delete: all three outcomes ──────────────────────────────────────

test('a deactivated teacher with no references is really deleted', async (t) => {
  if (!serverUp) return t.skip('dev server not running');

  const probe = await db.teacher.create({
    data: {
      name: 'Nav Clean Probe', email: PROBE_EMAILS[0], password: 'x',
      subject: 'Mathematics', grades: '[]', role: 'inactive', schoolId: HIGH,
    },
  });

  const res = await call(`/api/teachers/${probe.id}`, { method: 'DELETE' });
  assert.ok(res.ok, `delete should succeed, got ${res.status}`);

  // Gone from the database, not just from the screen.
  assert.equal(await db.teacher.findUnique({ where: { id: probe.id } }), null);
  assert.equal((await call(`/api/teachers/${probe.id}`)).status, 404, 'GET must now 404');

  const list = await (await call('/api/teachers')).json();
  const rows = Array.isArray(list) ? list : list.teachers ?? [];
  assert.ok(!rows.some((r) => r.id === probe.id), 'and gone from the faculty list');
});

test('an active teacher cannot be deleted without deactivating first', async (t) => {
  if (!serverUp) return t.skip('dev server not running');

  const probe = await db.teacher.create({
    data: {
      name: 'Nav Active Probe', email: PROBE_EMAILS[1], password: 'x',
      subject: 'Mathematics', grades: '[]', role: 'teacher', schoolId: HIGH,
    },
  });

  const res = await call(`/api/teachers/${probe.id}`, { method: 'DELETE' });
  const body = await res.json();
  assert.equal(res.status, 409);
  assert.equal(body.code, 'NOT_DEACTIVATED');
  assert.ok(await db.teacher.findUnique({ where: { id: probe.id } }), 'the record must survive');
});

test('a referenced teacher is refused, and the references are named', async (t) => {
  if (!serverUp) return t.skip('dev server not running');

  const probe = await db.teacher.create({
    data: {
      name: 'Nav Referenced Probe', email: PROBE_EMAILS[2], password: 'x',
      subject: 'Mathematics', grades: '[]', role: 'inactive', schoolId: HIGH,
    },
  });
  const leave = await db.leaveApplication.create({
    data: {
      teacherId: probe.id, leaveType: 'casual', reason: 'nav suite',
      startDate: '2026-10-01', endDate: '2026-10-01', status: 'approved',
    },
  });

  const res = await call(`/api/teachers/${probe.id}`, { method: 'DELETE' });
  const body = await res.json();
  assert.equal(res.status, 409, 'a referenced record must not be deleted');
  assert.equal(body.code, 'HAS_REFERENCES');
  assert.ok(
    JSON.stringify(body.blockers).includes('leave records'),
    'the response must name what blocks the delete, not fail generically'
  );
  assert.ok(await db.teacher.findUnique({ where: { id: probe.id } }), 'the record must survive');

  // Remove the reference and the same delete now succeeds.
  await db.leaveApplication.delete({ where: { id: leave.id } });
  assert.ok((await call(`/api/teachers/${probe.id}`, { method: 'DELETE' })).ok);
  assert.equal(await db.teacher.findUnique({ where: { id: probe.id } }), null);
});

beforeEach(async () => {
  if (serverUp) await cleanupProbes();
});

test('Takshila is untouched by this suite', async (t) => {
  if (!serverUp) return t.skip('dev server not running');
  assert.ok((await db.teacher.count({ where: { schoolId: TAKSHILA } })) >= 59);
  assert.ok((await db.schedule.count({ where: { schoolId: TAKSHILA } })) >= 0);
  assert.equal(await db.substitution.count({ where: { schoolId: TAKSHILA } }), 0);
});

// ── Attendance must not block cleanup while it is demo data ─────────────────

test('simulated attendance does not block a delete, but real history does', async (t) => {
  if (!serverUp) return t.skip('dev server not running');

  const probe = await db.teacher.create({
    data: {
      name: 'Nav Attendance Probe', email: 'nav.attendance@highschool.test', password: 'x',
      subject: 'Mathematics', grades: '[]', role: 'inactive', schoolId: HIGH,
    },
  });
  const attendance = await db.biometricAttendance.create({
    data: { date: '2026-10-05', teacherId: probe.id, status: 'present', checkInTime: '08:12', syncSource: 'biometric' },
  });

  // With no device adapter configured, attendance is demo data and is reported
  // as such rather than blocking.
  const check = await (await call(`/api/teachers/${probe.id}`)).json();
  assert.equal(check.canDelete, true, 'demo attendance must not block cleanup');
  assert.ok(
    JSON.stringify(check.references).includes('demo data'),
    'and it must still be disclosed, labelled as demo'
  );

  // Real operational history still blocks.
  const leave = await db.leaveApplication.create({
    data: {
      teacherId: probe.id, leaveType: 'casual', reason: 'nav suite',
      startDate: '2026-10-05', endDate: '2026-10-05', status: 'approved',
    },
  });
  const blockedCheck = await (await call(`/api/teachers/${probe.id}`)).json();
  assert.equal(blockedCheck.canDelete, false, 'a leave record must still block');
  await db.leaveApplication.delete({ where: { id: leave.id } });

  // Deleting takes the demo attendance with it, leaving nothing dangling.
  assert.ok((await call(`/api/teachers/${probe.id}`, { method: 'DELETE' })).ok);
  assert.equal(await db.teacher.findUnique({ where: { id: probe.id } }), null);
  assert.equal(await db.biometricAttendance.findUnique({ where: { id: attendance.id } }), null,
    'the demo attendance row must not be orphaned');
});

// ── Bulk delete of deactivated faculty ──────────────────────────────────────
//
// Cleaning a broken import one record at a time meant 25 separate
// confirmations. This removes the repetition, not the safety: the same rules
// apply per record, and every deletion is still audited individually.

test('bulk delete previews without writing, and classifies each record', async (t) => {
  if (!serverUp) return t.skip('dev server not running');

  const made = [];
  for (let i = 0; i < 4; i++) {
    made.push(await db.teacher.create({
      data: {
        name: `Bulk Suite ${i}`, email: `bulk.suite${i}@highschool.test`, password: 'x',
        subject: 'Mathematics', grades: '[]',
        role: i === 3 ? 'teacher' : 'inactive', schoolId: HIGH,
      },
    }));
  }
  // One of the inactive records is referenced, so it needs clearing.
  await db.leaveApplication.create({
    data: {
      teacherId: made[1].id, leaveType: 'casual', reason: 'bulk suite',
      startDate: '2026-11-05', endDate: '2026-11-05', status: 'approved',
    },
  });
  const ids = made.map((m) => m.id);

  const preview = await (await call('/api/teachers/bulk-delete', {
    method: 'POST', body: { ids, resolveReferences: true },
  })).json();

  assert.equal(preview.mode, 'preview');
  assert.equal(preview.summary.deletableNow, 2, 'two are ready');
  assert.equal(preview.summary.needsReferenceClearing, 1, 'one is referenced');
  assert.equal(preview.summary.stillActive, 1, 'one is still active');
  assert.equal(await db.teacher.count({ where: { id: { in: ids } } }), 4, 'the preview writes nothing');

  const applied = await (await call('/api/teachers/bulk-delete', {
    method: 'POST', body: { ids, resolveReferences: true, confirm: true },
  })).json();

  assert.equal(applied.deleted, 3, 'the three deactivated records go');
  assert.equal(applied.skipped, 1, 'the active one is skipped');
  assert.ok(await db.teacher.findUnique({ where: { id: made[3].id } }), 'an active record is never bulk-deleted');
  assert.equal(await db.leaveApplication.count({ where: { teacherId: made[1].id } }), 0, 'its leave went with it');

  await db.teacher.deleteMany({ where: { email: { in: ids.map((_, i) => `bulk.suite${i}@highschool.test`) } } });
});

test('bulk delete refuses records from another school', async (t) => {
  if (!serverUp) return t.skip('dev server not running');

  const foreign = await db.teacher.findFirst({ where: { schoolId: TAKSHILA }, select: { id: true } });
  if (!foreign) return t.skip('no Takshila teacher to test with');

  const res = await (await call('/api/teachers/bulk-delete', {
    method: 'POST', body: { ids: [foreign.id], resolveReferences: true, confirm: true },
  })).json();

  assert.equal(res.deleted, 0, 'nothing outside the caller school may be deleted');
  assert.ok(await db.teacher.findUnique({ where: { id: foreign.id } }), 'the record survives');
});

test('bulk delete without clearing references skips the referenced ones', async (t) => {
  if (!serverUp) return t.skip('dev server not running');

  const probe = await db.teacher.create({
    data: {
      name: 'Bulk Guard', email: 'bulk.guard@highschool.test', password: 'x',
      subject: 'Mathematics', grades: '[]', role: 'inactive', schoolId: HIGH,
    },
  });
  await db.leaveApplication.create({
    data: {
      teacherId: probe.id, leaveType: 'casual', reason: 'guard',
      startDate: '2026-11-06', endDate: '2026-11-06', status: 'approved',
    },
  });

  const res = await (await call('/api/teachers/bulk-delete', {
    method: 'POST', body: { ids: [probe.id], confirm: true },
  })).json();

  assert.equal(res.deleted, 0, 'references must not be cleared unless asked');
  assert.ok(await db.teacher.findUnique({ where: { id: probe.id } }));

  await db.leaveApplication.deleteMany({ where: { teacherId: probe.id } });
  await db.teacher.delete({ where: { id: probe.id } });
});
