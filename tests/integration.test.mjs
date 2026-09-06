/**
 * Behaviour tests for the timetable, faculty and substitution rules.
 *
 * These exercise the real API against a running dev server, unlike the
 * regex-over-source tests in smart-calendar.test.mjs which only assert that
 * identifiers exist. Run with:
 *
 *   npm run dev            (in another terminal)
 *   npm run test:integration
 *
 * Everything is created and cleaned up inside the HIGHSCHOOL test tenant. The
 * suite refuses to run against Takshila.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

const BASE = process.env.SC_BASE_URL ?? 'http://localhost:3005';
const TEST_SCHOOL = '6a90282671483239cb9b9cfe'; // HIGHSCHOOL
const TAKSHILA = '60d5ecb8b5c9c22340000001';
const LOGIN = { email: 'demo@takshila.school', password: 'school123' };

const db = new PrismaClient();
let token = '';
const created = { teachers: [], schedules: [], leaves: [], substitutions: [] };

const api = async (path, init = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body };
};

/** Skip the whole suite gracefully when no dev server is listening. */
let serverUp = false;

before(async () => {
  if (TEST_SCHOOL === TAKSHILA) throw new Error('refusing to run against Takshila');
  try {
    const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(5000) });
    serverUp = res.ok;
  } catch {
    serverUp = false;
  }
  if (!serverUp) return;

  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(LOGIN),
  });
  const data = await res.json();
  token = data.token ?? '';
  assert.ok(token, 'login should return a token');
});

after(async () => {
  if (created.substitutions.length) {
    await db.substitution.deleteMany({ where: { id: { in: created.substitutions } } }).catch(() => {});
  }
  if (created.leaves.length) {
    await db.leaveApplication.deleteMany({ where: { id: { in: created.leaves } } }).catch(() => {});
  }
  if (created.schedules.length) {
    await db.schedule.deleteMany({ where: { id: { in: created.schedules } } }).catch(() => {});
  }
  if (created.teachers.length) {
    await db.schedule.deleteMany({ where: { teacherId: { in: created.teachers } } }).catch(() => {});
    await db.substitution.deleteMany({
      where: { OR: [{ absentTeacherId: { in: created.teachers } }, { substituteId: { in: created.teachers } }] },
    }).catch(() => {});
    await db.leaveApplication.deleteMany({ where: { teacherId: { in: created.teachers } } }).catch(() => {});
    await db.teacher.deleteMany({ where: { id: { in: created.teachers } } }).catch(() => {});
  }
  await db.$disconnect();
});

const skipIfDown = (t) => {
  if (!serverUp) {
    t.skip('dev server not running on ' + BASE);
    return true;
  }
  return false;
};

const uniq = () => Math.random().toString(36).slice(2, 8);

async function makeTeacher(name, subjects, grades) {
  const t = await db.teacher.create({
    data: {
      schoolId: TEST_SCHOOL,
      name,
      email: `${name.toLowerCase().replace(/\W+/g, '.')}.${uniq()}@itest.edu`,
      subject: subjects[0],
      subjects: JSON.stringify(subjects),
      grades: JSON.stringify(grades),
      role: 'teacher',
    },
  });
  created.teachers.push(t.id);
  return t;
}

async function makeSlot(versionId, grade, section, day, period, subject, teacherId) {
  const s = await db.schedule.create({
    data: {
      schoolId: TEST_SCHOOL,
      timetableVersionId: versionId,
      grade, section, day, period, subject, teacherId,
      startTime: '09:00', endTime: '09:40',
    },
  });
  created.schedules.push(s.id);
  return s;
}

async function draftVersion() {
  return db.timetableVersion.findFirst({
    where: { schoolId: TEST_SCHOOL, status: { in: ['draft', 'review'] } },
    orderBy: { version: 'desc' },
  });
}

/**
 * The timetable that leave and substitution actually read: the published
 * version when there is one, otherwise whatever is live.
 */
async function operationalVersion() {
  return (
    (await db.timetableVersion.findFirst({ where: { schoolId: TEST_SCHOOL, status: 'published' }, orderBy: { version: 'desc' } })) ??
    (await draftVersion())
  );
}

// ── Tenant isolation ────────────────────────────────────────────────────────

test('schedules are scoped to the caller’s school', async (t) => {
  if (skipIfDown(t)) return;
  const { ok, body } = await api('/api/schedules');
  assert.ok(ok, 'request should succeed');
  assert.ok(Array.isArray(body));
  const schools = [...new Set(body.map((r) => r.schoolId))];
  assert.ok(schools.length <= 1, `expected one school, got ${schools.length}`);
  assert.ok(!schools.includes(TAKSHILA), 'must never return another tenant’s rows');
});

test('a spoofed ?schoolId cannot reach another tenant', async (t) => {
  if (skipIfDown(t)) return;
  const { body } = await api(`/api/schedules?schoolId=${TAKSHILA}`);
  const schools = [...new Set((body ?? []).map((r) => r.schoolId))];
  assert.ok(!schools.includes(TAKSHILA), 'query param must not override the session tenant');
});

test('anonymous callers cannot read schedules', async (t) => {
  if (skipIfDown(t)) return;
  const res = await fetch(`${BASE}/api/schedules`);
  assert.equal(res.status, 401);
});

// ── Teacher clash rules ─────────────────────────────────────────────────────

test('teacher clash is blocked across sections of the same grade', async (t) => {
  if (skipIfDown(t)) return;
  const v = await draftVersion();
  const teacher = await makeTeacher('Clash CrossSection', ['Physics'], ['Grade 10']);
  await makeSlot(v.id, 'Grade 10', 'IT1', 'Monday', 3, 'Physics', teacher.id);
  const target = await makeSlot(v.id, 'Grade 10', 'IT2', 'Monday', 3, 'Physics', null);

  const { status, body } = await api(`/api/schedules/${target.id}/change-teacher`, {
    method: 'POST',
    body: JSON.stringify({ teacherId: teacher.id }),
  });
  assert.equal(status, 409);
  assert.equal(body.code, 'TEACHER_DOUBLE_BOOKED');
  assert.match(body.error, /already assigned/i);
});

test('teacher clash is blocked across different grades', async (t) => {
  if (skipIfDown(t)) return;
  const v = await draftVersion();
  const teacher = await makeTeacher('Clash CrossGrade', ['Physics'], ['Grade 10', 'Grade 11']);
  await makeSlot(v.id, 'Grade 10', 'IT3', 'Tuesday', 4, 'Physics', teacher.id);
  const target = await makeSlot(v.id, 'Grade 11', 'IT3', 'Tuesday', 4, 'Physics', null);

  const { status, body } = await api(`/api/schedules/${target.id}/change-teacher`, {
    method: 'POST',
    body: JSON.stringify({ teacherId: teacher.id }),
  });
  assert.equal(status, 409);
  assert.equal(body.code, 'TEACHER_DOUBLE_BOOKED');
});

test('a different period for the same teacher is allowed', async (t) => {
  if (skipIfDown(t)) return;
  const v = await draftVersion();
  const teacher = await makeTeacher('Clash FreePeriod', ['Physics'], ['Grade 10']);
  await makeSlot(v.id, 'Grade 10', 'IT4', 'Wednesday', 2, 'Physics', teacher.id);
  const target = await makeSlot(v.id, 'Grade 10', 'IT5', 'Wednesday', 3, 'Physics', null);

  const { ok } = await api(`/api/schedules/${target.id}/change-teacher`, {
    method: 'POST',
    body: JSON.stringify({ teacherId: teacher.id }),
  });
  assert.ok(ok, 'a free period must be assignable');
});

// ── Draft editing ───────────────────────────────────────────────────────────

test('a draft slot can change subject', async (t) => {
  if (skipIfDown(t)) return;
  const v = await draftVersion();
  const slot = await makeSlot(v.id, 'Grade 10', 'IT6', 'Thursday', 2, 'Physics', null);

  const { ok } = await api(`/api/schedules/${slot.id}/slot`, {
    method: 'PATCH',
    body: JSON.stringify({ subject: 'Chemistry' }),
  });
  assert.ok(ok);
  const after = await db.schedule.findUnique({ where: { id: slot.id } });
  assert.equal(after.subject, 'Chemistry', 'subject must persist');
});

test('an email address is rejected as a subject', async (t) => {
  if (skipIfDown(t)) return;
  const v = await draftVersion();
  const slot = await makeSlot(v.id, 'Grade 10', 'IT7', 'Thursday', 3, 'Physics', null);
  const { status, body } = await api(`/api/schedules/${slot.id}/slot`, {
    method: 'PATCH',
    body: JSON.stringify({ subject: 'someone@school.edu' }),
  });
  assert.equal(status, 400);
  assert.match(body.error, /email address/i);
});

test('a draft slot can move to a free day and period', async (t) => {
  if (skipIfDown(t)) return;
  const v = await draftVersion();
  const slot = await makeSlot(v.id, 'Grade 10', 'IT8', 'Friday', 2, 'Physics', null);

  const { ok } = await api(`/api/schedules/${slot.id}/slot`, {
    method: 'PATCH',
    body: JSON.stringify({ day: 'Friday', period: 3 }),
  });
  assert.ok(ok);
  const after = await db.schedule.findUnique({ where: { id: slot.id } });
  assert.equal(after.period, 3, 'the move must persist');
  assert.equal(after.day, 'Friday');
});

test('a move beyond the configured Saturday periods is blocked', async (t) => {
  if (skipIfDown(t)) return;
  const cfg = await api('/api/school/day-config');
  const saturday = (cfg.body.days ?? []).find((d) => d.day === 'Saturday');
  if (!saturday) return t.skip('Saturday is not a working day for this school');

  const v = await draftVersion();
  const slot = await makeSlot(v.id, 'Grade 10', 'IT9', 'Monday', 2, 'Physics', null);
  const { status, body } = await api(`/api/schedules/${slot.id}/slot`, {
    method: 'PATCH',
    body: JSON.stringify({ day: 'Saturday', period: saturday.periods + 1 }),
  });
  assert.equal(status, 409);
  assert.equal(body.code, 'PERIOD_OUT_OF_RANGE');
  assert.match(body.error, new RegExp(`${saturday.periods} period`));
});

test('a move onto an occupied class period is blocked', async (t) => {
  if (skipIfDown(t)) return;
  const v = await draftVersion();
  await makeSlot(v.id, 'Grade 10', 'ITA', 'Monday', 5, 'Physics', null);
  const slot = await makeSlot(v.id, 'Grade 10', 'ITA', 'Monday', 6, 'Chemistry', null);

  const { status, body } = await api(`/api/schedules/${slot.id}/slot`, {
    method: 'PATCH',
    body: JSON.stringify({ day: 'Monday', period: 5 }),
  });
  assert.equal(status, 409);
  assert.equal(body.code, 'CLASS_DOUBLE_BOOKED');
});

test('a draft slot can be deleted', async (t) => {
  if (skipIfDown(t)) return;
  const v = await draftVersion();
  const slot = await makeSlot(v.id, 'Grade 10', 'ITB', 'Tuesday', 6, 'Physics', null);
  const { ok } = await api(`/api/schedules/${slot.id}/slot`, { method: 'DELETE' });
  assert.ok(ok);
  assert.equal(await db.schedule.findUnique({ where: { id: slot.id } }), null);
});

test('a slot with a substitution attached cannot be deleted', async (t) => {
  if (skipIfDown(t)) return;
  const v = await draftVersion();
  const teacher = await makeTeacher('Dependent Slot', ['Physics'], ['Grade 10']);
  const slot = await makeSlot(v.id, 'Grade 10', 'ITC', 'Wednesday', 7, 'Physics', teacher.id);
  const sub = await db.substitution.create({
    data: {
      date: '2026-12-01', period: 7, absentTeacherId: teacher.id,
      grade: 'Grade 10', section: 'ITC', subject: 'Physics', status: 'pending', scheduleId: slot.id,
    },
  });
  created.substitutions.push(sub.id);

  const { status, body } = await api(`/api/schedules/${slot.id}/slot`, { method: 'DELETE' });
  assert.equal(status, 409);
  assert.equal(body.code, 'HAS_SUBSTITUTIONS');
  assert.ok(await db.schedule.findUnique({ where: { id: slot.id } }), 'the slot must survive');
});

// ── Version lock ────────────────────────────────────────────────────────────

test('a published slot cannot be edited or deleted directly', async (t) => {
  if (skipIfDown(t)) return;
  const published = await db.timetableVersion.findFirst({
    where: { schoolId: TEST_SCHOOL, status: 'published' },
  });
  if (!published) return t.skip('no published version in the test tenant');

  const slot = await db.schedule.findFirst({
    where: { schoolId: TEST_SCHOOL, timetableVersionId: published.id },
  });
  if (!slot) return t.skip('published version has no rows');

  const patch = await api(`/api/schedules/${slot.id}/slot`, {
    method: 'PATCH',
    body: JSON.stringify({ subject: 'Tampered' }),
  });
  assert.equal(patch.status, 409);
  assert.equal(patch.body.code, 'VERSION_LOCKED');

  const del = await api(`/api/schedules/${slot.id}/slot`, { method: 'DELETE' });
  assert.equal(del.status, 409);
  assert.equal(del.body.code, 'VERSION_LOCKED');

  const teacherChange = await api(`/api/schedules/${slot.id}/change-teacher`, {
    method: 'POST',
    body: JSON.stringify({ teacherId: null }),
  });
  assert.equal(teacherChange.status, 409);
  assert.equal(teacherChange.body.code, 'VERSION_LOCKED');

  const still = await db.schedule.findUnique({ where: { id: slot.id } });
  assert.equal(still.subject, slot.subject, 'the published row must be untouched');
});

// ── Qualification ───────────────────────────────────────────────────────────

test('an unqualified teacher needs an explicit override', async (t) => {
  if (skipIfDown(t)) return;
  const v = await draftVersion();
  const mathsTeacher = await makeTeacher('Only Maths', ['Mathematics'], ['Grade 10']);
  const slot = await makeSlot(v.id, 'Grade 10', 'ITD', 'Thursday', 6, 'Physics', null);

  const refused = await api(`/api/schedules/${slot.id}/change-teacher`, {
    method: 'POST',
    body: JSON.stringify({ teacherId: mathsTeacher.id }),
  });
  assert.equal(refused.status, 409);
  assert.equal(refused.body.code, 'NOT_SUBJECT_QUALIFIED');
  assert.equal(refused.body.requiresOverride, true);

  const forced = await api(`/api/schedules/${slot.id}/change-teacher`, {
    method: 'POST',
    body: JSON.stringify({ teacherId: mathsTeacher.id, manualOverride: true, overrideReason: 'integration test' }),
  });
  assert.ok(forced.ok, 'an explicit override must succeed');
  assert.equal(forced.body.manualOverride, true);
});

// ── Faculty ─────────────────────────────────────────────────────────────────

test('duplicate faculty creation is blocked', async (t) => {
  if (skipIfDown(t)) return;
  const name = `Dup Guard ${uniq()}`;
  const first = await api('/api/teachers', {
    method: 'POST',
    body: JSON.stringify({ name, email: `dup.${uniq()}@itest.edu`, subjects: 'Physics', grades: 'Grade 10' }),
  });
  assert.ok(first.ok);
  created.teachers.push(first.body.teacher.id);

  const second = await api('/api/teachers', {
    method: 'POST',
    body: JSON.stringify({ name, subjects: 'Chemistry', grades: 'Grade 11' }),
  });
  assert.equal(second.status, 409);
  assert.equal(second.body.code, 'DUPLICATE_FACULTY');
});

test('an email in the subject field is rejected', async (t) => {
  if (skipIfDown(t)) return;
  const { status, body } = await api('/api/teachers', {
    method: 'POST',
    body: JSON.stringify({
      name: `Bad Subject ${uniq()}`,
      email: `bad.${uniq()}@itest.edu`,
      subjects: 'someone@school.edu',
      grades: 'Grade 9',
    }),
  });
  assert.equal(status, 400);
  assert.match(body.error, /email address/i);
});

test('dedup refuses a review-confidence group unless explicitly approved', async (t) => {
  if (skipIfDown(t)) return;
  const shared = `Review Twin ${uniq()}`;
  const a = await makeTeacher(shared, ['Physics'], ['Grade 10']);
  const b = await db.teacher.create({
    data: {
      schoolId: TEST_SCHOOL, name: shared, email: `twin.${uniq()}@itest.edu`,
      subject: 'History', subjects: JSON.stringify(['History']),
      grades: JSON.stringify(['Grade 7']), role: 'teacher',
    },
  });
  created.teachers.push(b.id);

  const plan = await api('/api/teachers/dedup');
  assert.ok(plan.ok);
  const group = plan.body.groups.find((g) =>
    [g.canonical, ...g.duplicates].some((r) => r.id === a.id || r.id === b.id)
  );
  assert.ok(group, 'the pair should be detected');
  assert.equal(group.confidence, 'review', 'a name-only match is never high confidence');

  const refused = await api('/api/teachers/dedup', {
    method: 'POST',
    body: JSON.stringify({ groupKeys: [group.key] }),
  });
  assert.equal(refused.body.merged.length, 0, 'nothing may merge without approval');
  assert.equal(refused.body.refusedForReview.length, 1);
  assert.ok(await db.teacher.findUnique({ where: { id: b.id } }), 'both records must survive');
});

test('dedup merges a high-confidence group and repoints references', async (t) => {
  if (skipIfDown(t)) return;
  const empId = `IT${uniq().toUpperCase()}`;
  const name = `Merge Me ${uniq()}`;
  const keep = await db.teacher.create({
    data: {
      schoolId: TEST_SCHOOL, name, email: `merge.a.${uniq()}@itest.edu`, employeeId: empId,
      subject: 'Physics', subjects: JSON.stringify(['Physics']),
      grades: JSON.stringify(['Grade 10']), role: 'teacher',
    },
  });
  const dupe = await db.teacher.create({
    data: {
      schoolId: TEST_SCHOOL, name, email: `merge.b.${uniq()}@itest.edu`, employeeId: empId,
      subject: 'Mathematics', subjects: JSON.stringify(['Mathematics']),
      grades: JSON.stringify(['Grade 9']), role: 'teacher',
    },
  });
  created.teachers.push(keep.id, dupe.id);

  const v = await draftVersion();
  await makeSlot(v.id, 'Grade 9', 'ITE', 'Friday', 6, 'Mathematics', dupe.id);

  const merged = await api('/api/teachers/dedup', {
    method: 'POST',
    body: JSON.stringify({ groupKeys: [empId] }),
  });
  assert.ok(merged.ok);
  assert.equal(merged.body.merged.length, 1, 'the employee-ID group should merge');

  const survivors = await db.teacher.findMany({ where: { schoolId: TEST_SCHOOL, employeeId: empId } });
  assert.equal(survivors.length, 1, 'one person must end up as one record');
  const subjects = JSON.parse(survivors[0].subjects ?? '[]');
  assert.ok(subjects.includes('Physics') && subjects.includes('Mathematics'), 'subjects must union');

  // Canonical selection keeps whichever record is better referenced, so the
  // assertion must follow what the merge actually removed.
  const removed = merged.body.merged[0].removedIds ?? [];
  assert.ok(removed.length >= 1, 'the merge should remove a record');
  const orphans = await db.schedule.count({ where: { teacherId: { in: removed } } });
  assert.equal(orphans, 0, 'no reference may still point at a removed record');
});

// ── Leave and substitution ──────────────────────────────────────────────────

test('approving a full-day leave surfaces every affected period', async (t) => {
  if (skipIfDown(t)) return;
  const v = await operationalVersion();
  const teacher = await makeTeacher('Leave FullDay', ['Physics'], ['Grade 10']);
  await makeSlot(v.id, 'Grade 10', 'ITF', 'Monday', 1, 'Physics', teacher.id);
  await makeSlot(v.id, 'Grade 10', 'ITF', 'Monday', 2, 'Physics', teacher.id);

  const applied = await api('/api/leaves/apply', {
    method: 'POST',
    body: JSON.stringify({
      teacherId: teacher.id, type: 'casual',
      startDate: '2026-12-07', endDate: '2026-12-07', reason: 'integration', status: 'pending',
    }),
  });
  created.leaves.push(applied.body.data.id);

  const approved = await api('/api/leaves', {
    method: 'PATCH',
    body: JSON.stringify({ id: applied.body.data.id, status: 'approved' }),
  });
  assert.ok(approved.ok);
  // 2026-12-07 is a Monday, so both Monday periods need cover.
  assert.ok(approved.body.substitutions.affectedPeriods >= 2, 'both Monday periods must be found');
});

test('a partial-day leave only affects the listed periods', async (t) => {
  if (skipIfDown(t)) return;
  const v = await operationalVersion();
  const teacher = await makeTeacher('Leave PartDay', ['Physics'], ['Grade 10']);
  await makeSlot(v.id, 'Grade 10', 'ITG', 'Monday', 1, 'Physics', teacher.id);
  await makeSlot(v.id, 'Grade 10', 'ITG', 'Monday', 2, 'Physics', teacher.id);
  await makeSlot(v.id, 'Grade 10', 'ITG', 'Monday', 3, 'Physics', teacher.id);

  const applied = await api('/api/leaves/apply', {
    method: 'POST',
    body: JSON.stringify({
      teacherId: teacher.id, type: 'casual',
      startDate: '2026-12-14', endDate: '2026-12-14', reason: 'partial', periods: [2], status: 'pending',
    }),
  });
  created.leaves.push(applied.body.data.id);

  const approved = await api('/api/leaves', {
    method: 'PATCH',
    body: JSON.stringify({ id: applied.body.data.id, status: 'approved' }),
  });
  assert.ok(approved.ok);
  assert.equal(approved.body.substitutions.affectedPeriods, 1, 'only the listed period needs cover');
  assert.equal(approved.body.substitutions.affected[0].period, 2);
});

test('a busy substitute is blocked, and cover never edits the timetable', async (t) => {
  if (skipIfDown(t)) return;
  const v = await operationalVersion();
  const absent = await makeTeacher('Absent One', ['Physics'], ['Grade 10']);
  const busy = await makeTeacher('Busy Cover', ['Physics'], ['Grade 10']);
  const free = await makeTeacher('Free Cover', ['Physics'], ['Grade 10']);

  const slot = await makeSlot(v.id, 'Grade 10', 'ITH', 'Monday', 4, 'Physics', absent.id);
  await makeSlot(v.id, 'Grade 10', 'ITI', 'Monday', 4, 'Physics', busy.id);

  const sub = await db.substitution.create({
    data: {
      date: '2026-12-21', period: 4, absentTeacherId: absent.id,
      grade: 'Grade 10', section: 'ITH', subject: 'Physics', status: 'pending', scheduleId: slot.id,
    },
  });
  created.substitutions.push(sub.id);

  const blocked = await api(`/api/substitutions/${sub.id}/assign`, {
    method: 'POST',
    body: JSON.stringify({ substituteId: busy.id }),
  });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.code, 'SUBSTITUTE_BUSY');

  const assigned = await api(`/api/substitutions/${sub.id}/assign`, {
    method: 'POST',
    body: JSON.stringify({ substituteId: free.id }),
  });
  assert.ok(assigned.ok, 'a free qualified teacher must be assignable');

  const row = await db.schedule.findUnique({ where: { id: slot.id } });
  assert.equal(row.teacherId, absent.id, 'temporary cover must not change the permanent timetable');
});

// ── Takshila must stay untouched ────────────────────────────────────────────

test('Takshila data is unchanged by this suite', async (t) => {
  if (skipIfDown(t)) return;
  // 59, not the original 84: an admin cleared all 25 corrupt import records
  // through the UI on 2026-09-06. Every deletion is in the audit log and no
  // readable-name record was removed.
  assert.equal(await db.teacher.count({ where: { schoolId: TAKSHILA } }), 59);
  // Takshila's demo timetable was cleared by the admin on 2026-09-06 so a
  // real one could be built. Backed up to backups/takshila-timetable-*.json.
  assert.equal(await db.schedule.count({ where: { schoolId: TAKSHILA } }), 0);
  assert.equal(await db.timetableVersion.count({ where: { schoolId: TAKSHILA } }), 0);
  // The 12 historical Saturday P6-P8 rows went with the cleared timetable.
  assert.equal(
    await db.schedule.count({ where: { schoolId: TAKSHILA, day: 'Saturday', period: { gt: 5 } } }),
    0
  );
});
