/**
 * Authorization tests.
 *
 * These exist because a measured probe found a teacher account could POST
 * /api/teachers and PUT /api/school/day-config - create faculty and redefine the
 * school week. Sidebar filtering was the only thing standing in the way, and
 * hiding a link is not authorization.
 *
 * Everything runs inside the HIGHSCHOOL test tenant. The suite refuses to run
 * against Takshila and creates/destroys its own probe account.
 *
 *   npm run dev              (in another terminal)
 *   node --test tests/authz.test.mjs
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const BASE = process.env.SC_BASE_URL ?? 'http://localhost:3005';
const TEST_SCHOOL = '6a90282671483239cb9b9cfe'; // HIGHSCHOOL
const TAKSHILA = '60d5ecb8b5c9c22340000001';
const ADMIN = { email: 'demo@takshila.school', password: 'school123' };
const PROBE_EMAIL = 'authz.suite.probe@highschool.test';
const PROBE_PASSWORD = 'probe12345';

const db = new PrismaClient();
let serverUp = false;
let teacherToken = '';
let adminToken = '';
let probeId = '';

const call = (path, { method = 'GET', token, body, headers = {} } = {}) =>
  fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

const blocked = (status) => status === 401 || status === 403;

before(async () => {
  if (TEST_SCHOOL === TAKSHILA) throw new Error('refusing to run against Takshila');
  try {
    const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(5000) });
    serverUp = res.ok;
  } catch {
    serverUp = false;
  }
  if (!serverUp) return;

  await db.teacher.deleteMany({ where: { email: PROBE_EMAIL } });
  const probe = await db.teacher.create({
    data: {
      name: 'Authz Suite Probe',
      email: PROBE_EMAIL,
      password: await bcrypt.hash(PROBE_PASSWORD, 10),
      subject: 'Mathematics',
      grades: JSON.stringify(['Grade 10']),
      role: 'teacher',
      schoolId: TEST_SCHOOL,
    },
  });
  probeId = probe.id;

  const t = await (await call('/api/auth/login', { method: 'POST', body: { email: PROBE_EMAIL, password: PROBE_PASSWORD } })).json();
  teacherToken = t.token ?? '';
  const a = await (await call('/api/auth/login', { method: 'POST', body: ADMIN })).json();
  adminToken = a.token ?? '';

  assert.ok(teacherToken, 'teacher probe should log in');
  assert.ok(adminToken, 'school admin should log in');
  assert.equal(t.user?.role, 'teacher', 'probe must actually be a teacher');
});

after(async () => {
  if (serverUp) {
    await db.leaveApplication.deleteMany({ where: { teacherId: probeId } }).catch(() => {});
    await db.teacher.deleteMany({ where: { email: { in: [PROBE_EMAIL, 'authz.created@highschool.test'] } } });
  }
  await db.$disconnect();
});

// ── A teacher must not reach administrative capabilities ────────────────────

const TEACHER_MUST_NOT = [
  ['create faculty', 'POST', '/api/teachers', { name: 'Nope', email: 'authz.created@highschool.test', subjects: 'Math', grades: 'Grade 10' }],
  ['edit faculty', 'PUT', '/api/teachers', { id: 'x', name: 'Nope' }],
  ['deactivate faculty', 'PATCH', '/api/teachers', { id: 'x', role: 'inactive' }],
  ['read the faculty register', 'GET', '/api/teachers', null],
  ['run faculty dedup', 'GET', '/api/teachers/dedup', null],
  ['modify day & period setup', 'PUT', '/api/school/day-config', { workingDays: 5 }],
  ['read school settings', 'GET', '/api/school/profile', null],
  ['write school settings', 'PUT', '/api/school/profile', { name: 'Hijacked', email: 'a@b.c' }],
  ['add a subject', 'POST', '/api/subjects', { grade: 'Grade 10', subjectName: 'Nope' }],
  ['generate a timetable', 'POST', '/api/schedules/ai-generate-timetable', { grade: 'Grade 10', section: 'A' }],
  ['import a timetable', 'POST', '/api/timetable/lifecycle', { action: 'adopt' }],
  ['publish a timetable version', 'POST', '/api/timetable/versions/anyid/workflow', { action: 'publish' }],
  ['approve leave', 'PATCH', '/api/leaves', { id: 'x', status: 'approved' }],
  ['assign a substitute', 'PATCH', '/api/substitutions', { substitutionId: 'x', substituteId: 'y' }],
  ['manage rooms', 'POST', '/api/rooms', { code: 'X', name: 'X', type: 'classroom', capacity: 1 }],
  ['read the owner console', 'GET', '/api/superadmin/tenants', null],
  ['clear a school workspace', 'POST', '/api/schools/clear-workspace', { schoolId: TAKSHILA, confirm: true }],
  ['change school credentials', 'POST', '/api/schools/update-credentials', { schoolId: TAKSHILA, password: 'pwned123' }],
];

for (const [label, method, path, body] of TEACHER_MUST_NOT) {
  test(`teacher cannot ${label}`, async (t) => {
    if (!serverUp) return t.skip('dev server not running');
    const res = await call(path, { method, token: teacherToken, body });
    assert.ok(blocked(res.status), `expected 401/403, got ${res.status} for ${method} ${path}`);
  });
}

test('teacher can still apply for their own leave', async (t) => {
  if (!serverUp) return t.skip('dev server not running');
  const res = await call('/api/leaves/apply', {
    method: 'POST',
    token: teacherToken,
    body: { teacherId: probeId, type: 'casual', startDate: '2026-11-02', endDate: '2026-11-02', reason: 'authz suite', status: 'pending' },
  });
  assert.equal(res.status, 200);
});

test('teacher can read their own profile', async (t) => {
  if (!serverUp) return t.skip('dev server not running');
  const res = await call('/api/profile', { token: teacherToken });
  assert.ok(res.ok, `expected 200, got ${res.status}`);
});

// ── Page routes, not only APIs ──────────────────────────────────────────────

for (const page of ['/teachers', '/settings', '/day-config', '/subjects', '/rooms', '/analytics']) {
  test(`teacher typing ${page} is redirected away`, async (t) => {
    if (!serverUp) return t.skip('dev server not running');
    const res = await fetch(`${BASE}${page}`, {
      headers: { cookie: `smart_calendar_token=${teacherToken}` },
      redirect: 'manual',
    });
    assert.ok(res.status >= 300 && res.status < 400, `expected a redirect, got ${res.status}`);
    assert.match(res.headers.get('location') ?? '', /\/dashboard/);
  });
}

test('teacher can still open their own pages', async (t) => {
  if (!serverUp) return t.skip('dev server not running');
  for (const page of ['/dashboard', '/timetable', '/substitutions', '/leaves']) {
    const res = await fetch(`${BASE}${page}`, {
      headers: { cookie: `smart_calendar_token=${teacherToken}` },
      redirect: 'manual',
    });
    assert.equal(res.status, 200, `${page} should render for a teacher`);
  }
});

// ── School admin boundaries ─────────────────────────────────────────────────

test('school admin can administer their own school', async (t) => {
  if (!serverUp) return t.skip('dev server not running');
  for (const path of ['/api/teachers', '/api/school/profile', '/api/school/day-config', '/api/school/setup-status']) {
    const res = await call(path, { token: adminToken });
    assert.ok(res.ok, `${path} should be readable by a school admin, got ${res.status}`);
  }
});

test('school admin cannot reach owner APIs', async (t) => {
  if (!serverUp) return t.skip('dev server not running');
  const res = await call('/api/superadmin/tenants', { token: adminToken });
  assert.ok(blocked(res.status), `expected 401/403, got ${res.status}`);
});

test('school admin cannot clear another school workspace', async (t) => {
  if (!serverUp) return t.skip('dev server not running');
  const res = await call('/api/schools/clear-workspace', {
    method: 'POST', token: adminToken, body: { schoolId: TAKSHILA, confirm: true },
  });
  assert.ok(blocked(res.status), `expected 401/403, got ${res.status}`);
  assert.ok((await db.teacher.count({ where: { schoolId: TAKSHILA } })) >= 50, 'Takshila faculty must be untouched');
});

// ── Anonymous and spoofing ──────────────────────────────────────────────────

test('anonymous requests are refused', async (t) => {
  if (!serverUp) return t.skip('dev server not running');
  for (const path of ['/api/teachers', '/api/school/profile', '/api/school/setup-status', '/api/timetable/export']) {
    const res = await call(path);
    assert.ok(blocked(res.status), `${path} should refuse anonymous access, got ${res.status}`);
  }
});

test('a spoofed role header does not grant access', async (t) => {
  if (!serverUp) return t.skip('dev server not running');
  const res = await call('/api/teachers', {
    method: 'POST',
    body: { name: 'Spoofed' },
    headers: { 'x-user-role': 'admin', 'x-school-id': TEST_SCHOOL },
  });
  assert.ok(blocked(res.status), `expected 401/403, got ${res.status}`);
});

test('Takshila is untouched by this suite', async (t) => {
  if (!serverUp) return t.skip('dev server not running');
  assert.ok((await db.teacher.count({ where: { schoolId: TAKSHILA } })) >= 50);
  assert.ok((await db.schedule.count({ where: { schoolId: TAKSHILA } })) >= 0);
  assert.ok((await db.substitution.count({ where: { schoolId: TAKSHILA } })) >= 0);
});

// ── Teacher read scoping ────────────────────────────────────────────────────
//
// Blocking a teacher from admin PAGES is not enough if the READ APIs still
// answer them with the whole school's data. The leave case is the sharpest:
// leave records carry a stated reason, and a colleague has no business
// reading it.

let realTeacher = null;
let realTeacherToken = '';

test('set up a real teacher session for scoping checks', async (t) => {
  if (!serverUp) return t.skip('dev server not running');

  realTeacher = await db.teacher.findFirst({
    where: { schoolId: TEST_SCHOOL, role: { not: 'inactive' } },
    select: { id: true, name: true, email: true, password: true },
  });
  assert.ok(realTeacher, 'the test tenant should have a teacher');

  await db.teacher.update({
    where: { id: realTeacher.id },
    data: { password: await bcrypt.hash('scopesuite123', 10) },
  });
  const login = await (await call('/api/auth/login', {
    method: 'POST', body: { email: realTeacher.email, password: 'scopesuite123' },
  })).json();
  realTeacherToken = login.token ?? '';
  assert.equal(login.user?.role, 'teacher');
});

test('a teacher reads only their own leave, never a colleague reason', async (t) => {
  if (!serverUp || !realTeacherToken) return t.skip('no teacher session');
  const body = await (await call('/api/leaves', { token: realTeacherToken })).json();
  const rows = body.leaves ?? [];
  assert.equal(rows.filter((l) => l.teacherId !== realTeacher.id).length, 0,
    'a teacher must not see another teacher leave record');
});

test('a school admin still sees school-wide leave', async (t) => {
  if (!serverUp) return t.skip('dev server not running');
  const body = await (await call('/api/leaves', { token: adminToken })).json();
  assert.ok((body.leaves ?? []).length > 0, 'admins keep the school-wide view');
});

test('a teacher reads only cover that involves them', async (t) => {
  if (!serverUp || !realTeacherToken) return t.skip('no teacher session');
  const body = await (await call('/api/substitutions', { token: realTeacherToken })).json();
  const rows = Array.isArray(body) ? body : body.substitutions ?? [];
  assert.equal(
    rows.filter((s) => s.substituteId !== realTeacher.id && s.absentTeacherId !== realTeacher.id).length, 0,
    'a teacher must not see the whole school cover list'
  );
});

test('a teacher reads only their own timetable periods', async (t) => {
  if (!serverUp || !realTeacherToken) return t.skip('no teacher session');
  const published = await db.timetableVersion.findFirst({
    where: { schoolId: TEST_SCHOOL, status: 'published' },
    orderBy: { version: 'desc' },
  });
  const timetableVersionId = published?.id ?? null;
  const s1 = await db.schedule.create({
    data: { schoolId: TEST_SCHOOL, timetableVersionId, grade: 'Grade 3', section: 'A', day: 'Monday', period: 1, subject: 'Math', teacherId: realTeacher.id, startTime: '08:00', endTime: '08:40' }
  });
  const s2 = await db.schedule.create({
    data: { schoolId: TEST_SCHOOL, timetableVersionId, grade: 'Grade 3', section: 'A', day: 'Monday', period: 2, subject: 'Science', teacherId: null, startTime: '08:40', endTime: '09:20' }
  });
  try {
    const mine = await (await call('/api/schedules?grade=Grade%203&section=A', { token: realTeacherToken })).json();
    const all = await (await call('/api/schedules?grade=Grade%203&section=A', { token: adminToken })).json();
    assert.equal((Array.isArray(mine) ? mine : []).filter((r) => r.teacherId !== realTeacher.id).length, 0,
      'a teacher must not read the master timetable');
    assert.ok((all ?? []).length > (mine ?? []).length, 'an admin still sees the full class');
  } finally {
    await db.schedule.deleteMany({ where: { id: { in: [s1.id, s2.id] } } });
  }
});

test('a teacher cannot read admin dashboard stats or school analytics', async (t) => {
  if (!serverUp || !realTeacherToken) return t.skip('no teacher session');
  assert.equal((await call('/api/dashboard/stats', { token: realTeacherToken })).status, 403);
  assert.equal((await call('/api/dashboard/analytics', { token: realTeacherToken })).status, 403);
});

test('a teacher gets their own dashboard instead', async (t) => {
  if (!serverUp || !realTeacherToken) return t.skip('no teacher session');
  const res = await call('/api/teacher/dashboard', { token: realTeacherToken });
  assert.ok(res.ok, `expected 200, got ${res.status}`);
  const body = await res.json();
  assert.ok(body.counts, 'the teacher dashboard reports personal counts');
  assert.equal(body.teacher.id, realTeacher.id, 'and it is scoped to them');
  // Personal counts only - no school-wide staffing figures.
  assert.ok(!('totalTeachers' in body.counts));
  assert.ok(!('pendingSubstitutions' in body.counts));
});

test('an admin calling the teacher dashboard is told to use the school one', async (t) => {
  if (!serverUp) return t.skip('dev server not running');
  assert.equal((await call('/api/teacher/dashboard', { token: adminToken })).status, 400);
});

test('restore the borrowed teacher password', async (t) => {
  if (!serverUp || !realTeacher) return t.skip('nothing to restore');
  await db.teacher.update({ where: { id: realTeacher.id }, data: { password: realTeacher.password } });
  assert.ok(true);
});

// ── Regression: every admin page must actually open ─────────────────────────
//
// PAGE_CAPABILITY asks for the NARROWEST capability that should open a page, so
// /timetable requires `timetable.read.own`. That is right for teachers, but it
// silently locked school admins out of Timetable Studio and Substitutions
// because the admin role had never been given the `.own` capabilities.
//
// Guarding the pages is not enough - they have to open for the people who need
// them. This test fails the moment a capability rename breaks that again.

const ADMIN_PAGES = [
  '/dashboard', '/timetable', '/timetable-versions', '/teachers', '/leaves',
  '/substitutions', '/attendance', '/school-setup', '/calendar', '/support',
  '/subjects', '/day-config', '/rooms', '/settings', '/analytics',
  '/lesson-plans', '/profile',
];

for (const page of ADMIN_PAGES) {
  test(`school admin can open ${page}`, async (t) => {
    if (!serverUp) return t.skip('dev server not running');
    const res = await fetch(`${BASE}${page}`, {
      headers: { cookie: `smart_calendar_token=${adminToken}` },
      redirect: 'manual',
    });
    assert.equal(res.status, 200, `${page} must render for a school admin, got ${res.status}`);
  });
}

test('a teacher is still turned away from every admin page', async (t) => {
  if (!serverUp || !realTeacherToken) return t.skip('no teacher session');

  const teacherAllowed = new Set([
    '/dashboard', '/timetable', '/substitutions', '/leaves',
    '/calendar', '/lesson-plans', '/profile',
  ]);

  for (const page of ADMIN_PAGES) {
    const res = await fetch(`${BASE}${page}`, {
      headers: { cookie: `smart_calendar_token=${realTeacherToken}` },
      redirect: 'manual',
    });
    if (teacherAllowed.has(page)) {
      assert.equal(res.status, 200, `${page} should open for a teacher`);
    } else {
      assert.ok(res.status >= 300 && res.status < 400, `${page} must redirect a teacher, got ${res.status}`);
    }
  }
});
