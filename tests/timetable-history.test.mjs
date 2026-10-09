// npm run test:credentials (static checks; no database)
// Published and older timetable versions are history: setup changes must not
// rewrite or delete their rows, and no route may write across schools.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (file) => readFile(join(root, file), 'utf8');

test('setup changes only touch editable timetable rows', async () => {
  for (const file of [
    'src/app/api/school/detected-structure/route.ts',
    'src/app/api/timetable/teacher-allotment/route.ts',
    'src/app/api/schedules/timings/route.ts',
  ]) {
    const source = await read(file);
    assert.match(source, /editableScheduleScope/, `${file} must limit timetable writes to editable rows`);
    assert.doesNotMatch(source, /schedule\.(deleteMany|updateMany)\(\{\s*where:\s*\{\s*schoolId,\s*grade/, `${file} still writes every version`);
  }
  const structure = await read('src/app/api/school/detected-structure/route.ts');
  assert.doesNotMatch(structure, /substitution\.deleteMany/, 'substitution history must be kept when a grade is deleted');
});

test('no timetable write without a school filter', async () => {
  const timings = await read('src/app/api/schedules/timings/route.ts');
  assert.doesNotMatch(timings, /where:\s*\{\s*grade,\s*section,\s*period/, 'the cross-school fallback must stay removed');
  for (const file of ['src/app/api/schedules/assign-teacher/route.ts', 'src/app/api/teachers/assign/route.ts']) {
    const source = await read(file);
    assert.match(source, /findFirst\(\{ where: \{ id: scheduleId, schoolId \} \}\)/, `${file} must load the lesson within the caller's school`);
    assert.match(source, /findFirst\(\{ where: \{ id: teacherId, schoolId \} \}\)/, `${file} must load the teacher within the caller's school`);
    assert.match(source, /isScheduleRowEditable/, `${file} must refuse published rows`);
    assert.doesNotMatch(source, /MAX_PERIODS_PER_DAY/, `${file} must use the school's workload limits`);
  }
  const balance = await read('src/app/api/analytics/ai-balance-workload/route.ts');
  assert.match(balance, /status: 410/);
  assert.doesNotMatch(balance, /\bdb\./, 'the switched-off balancer must not touch the database');
});

test('owner-only wipes are bounded', async () => {
  const reset = await read('src/app/api/schedules/reset/route.ts');
  assert.match(reset, /if \(!schoolId \|\| schoolId === 'all'\)/);
  const seed = await read('src/app/api/seed/route.ts');
  assert.match(seed, /NODE_ENV === 'production'/);
});

test('dashboard counts use the timetable in use', async () => {
  for (const file of ['src/app/api/dashboard/stats/route.ts', 'src/app/api/stats/route.ts', 'src/app/api/biometric/detect-absent/route.ts']) {
    const source = await read(file);
    assert.match(source, /operationalScheduleFilter/, `${file} must count one version, not all of them`);
    assert.doesNotMatch(source, /schedule\.count\(\{ where: \{ schoolId \} \}\)/, `${file} counts every version`);
  }
  const stats = await read('src/app/api/dashboard/stats/route.ts');
  assert.match(stats, /status: 'pending', date: \{ gte: todayStr \}/, 'pending cover counts today and later only');
});
