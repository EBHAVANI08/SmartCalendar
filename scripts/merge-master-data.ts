/**
 * Finds duplicate grade and subject names and merges them.
 *
 *   npx tsx scripts/merge-master-data.ts --school <schoolId>                    dry run
 *   npx tsx scripts/merge-master-data.ts --all                                  dry run, every school
 *   npx tsx scripts/merge-master-data.ts --school <id> --map "EVS=>Environmental Studies (EVS)" --apply
 *
 * Exact duplicates (names that differ only in case, spacing, punctuation,
 * "&"/"and", a grade/class prefix or Roman vs Arabic numerals) are merged into
 * the most-used spelling. Abbreviation and similar-name pairs are only listed;
 * they merge only when confirmed with --map "From=>To" (repeatable; subjects or
 * grades). Dry run is the default. --apply runs one transaction per school.
 *
 * References remapped: ClassSection, Schedule, GradeSubjectConfig, Substitution,
 * LessonPlan (via the school's teachers), ValidationIssue, Teacher subject/
 * subjects/grades/sections, TeacherQualification, SubjectRequirement,
 * TimetableSlot, SubjectMaster, Room.supportedSubjects and per-grade day-config
 * keys. Where both spellings hold the same row (same timetable slot, same
 * grade+subject config), the canonical row is kept and the duplicate removed;
 * the dry run lists each such collision first.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { compareSubjects, gradeKey, subjectKey } from '../src/lib/name-normalize';

type Kind = 'grade' | 'subject';
type Tx = Prisma.TransactionClient;
interface Rename { kind: Kind; from: string; to: string; reason: 'exact' | 'confirmed' }

const TRANSACTION_TIMEOUT_MS = 120_000;

// ── arguments ────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]) {
  const options = { schoolId: '', all: false, apply: false, maps: [] as { from: string; to: string }[] };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--school') options.schoolId = argv[++index] ?? '';
    else if (arg === '--all') options.all = true;
    else if (arg === '--apply') options.apply = true;
    else if (arg === '--dry-run') options.apply = false;
    else if (arg === '--map') {
      const [from, to] = String(argv[++index] ?? '').split('=>').map((part) => part.trim());
      if (!from || !to) throw new Error('--map expects "From=>To".');
      options.maps.push({ from, to });
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.all === Boolean(options.schoolId)) throw new Error('Pass exactly one of --school <id> or --all.');
  if (options.maps.length && options.all) throw new Error('--map is per school; use it with --school <id>.');
  return options;
}

// ── list / JSON renaming ─────────────────────────────────────────────────────

/** Renames one stored token: "Subject::Grade:Section", "Grade:Section", or a bare name. */
function renameToken(token: string, kind: Kind, from: string, to: string): string {
  const trimmed = token.trim();
  if (trimmed.includes('::')) {
    const [subject, rest] = trimmed.split('::');
    const renamedSubject = kind === 'subject' && subject.trim() === from ? to : subject.trim();
    return `${renamedSubject}::${renameToken(rest, kind, from, to)}`;
  }
  if (kind === 'grade' && trimmed.includes(':')) {
    const separator = trimmed.lastIndexOf(':');
    const grade = trimmed.slice(0, separator).trim();
    return grade === from ? `${to}:${trimmed.slice(separator + 1).trim()}` : trimmed;
  }
  return trimmed === from ? to : token;
}

function renameDeep(value: unknown, kind: Kind, from: string, to: string): unknown {
  if (typeof value === 'string') return renameToken(value, kind, from, to);
  if (Array.isArray(value)) {
    const renamed = value.map((item) => renameDeep(item, kind, from, to));
    return renamed.every((item) => typeof item === 'string') ? [...new Set(renamed as string[])] : renamed;
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const newKey = renameToken(key, kind, from, to);
      const renamed = renameDeep(entry, kind, from, to);
      result[newKey] = newKey in result && Array.isArray(result[newKey]) && Array.isArray(renamed)
        ? [...new Set([...(result[newKey] as unknown[]), ...renamed])]
        : renamed;
    }
    return result;
  }
  return value;
}

/** Renames inside a Teacher list column (JSON or legacy "a; b" text). Returns null when unchanged. */
function renameListColumn(raw: string | null, kind: Kind, from: string, to: string): string | null {
  if (!raw) return null;
  let next: string;
  try {
    next = JSON.stringify(renameDeep(JSON.parse(raw), kind, from, to));
  } catch {
    next = raw.split(/([;,|/])/).map((part) => (/^[;,|/]$/.test(part) ? part : renameToken(part, kind, from, to))).join('');
  }
  return next === raw ? null : next;
}

// ── name usage ───────────────────────────────────────────────────────────────

type Usage = Map<string, Map<string, number>>; // name -> model -> count

function bump(usage: Usage, name: string | null | undefined, model: string, count = 1) {
  const clean = String(name ?? '').trim();
  if (!clean) return;
  if (!usage.has(clean)) usage.set(clean, new Map());
  const models = usage.get(clean)!;
  models.set(model, (models.get(model) ?? 0) + count);
}

const total = (models: Map<string, number> | undefined) => [...(models?.values() ?? [])].reduce((a, b) => a + b, 0);
const describe = (models: Map<string, number> | undefined) =>
  [...(models?.entries() ?? [])].map(([model, count]) => `${model} ${count}`).join(', ') || 'no references';

async function collectUsage(db: PrismaClient | Tx, schoolId: string) {
  const grades: Usage = new Map();
  const subjects: Usage = new Map();
  const teacherIds = (await db.teacher.findMany({ where: { schoolId }, select: { id: true } })).map((t) => t.id);
  const [sections, configs, schedules, subs, plans, issues, teachers, masters, dayConfig] = await Promise.all([
    db.classSection.groupBy({ by: ['grade'], where: { schoolId }, _count: { _all: true } }),
    db.gradeSubjectConfig.findMany({ where: { schoolId }, select: { grade: true, subjectName: true } }),
    db.schedule.groupBy({ by: ['grade', 'subject'], where: { schoolId }, _count: { _all: true } }),
    db.substitution.groupBy({ by: ['grade', 'subject'], where: { schoolId }, _count: { _all: true } }),
    db.lessonPlan.groupBy({ by: ['grade', 'subject'], where: { teacherId: { in: teacherIds } }, _count: { _all: true } }),
    db.validationIssue.groupBy({ by: ['grade', 'subject'], where: { schoolId }, _count: { _all: true } }),
    db.teacher.findMany({ where: { schoolId }, select: { subject: true, subjects: true, grades: true } }),
    db.subjectMaster.findMany({ where: { schoolId }, select: { name: true } }),
    db.schoolDayPeriodConfig.findUnique({ where: { schoolId }, select: { gradeConfigs: true } }),
  ]);
  for (const row of sections) bump(grades, row.grade, 'ClassSection', row._count._all);
  for (const row of configs) { bump(grades, row.grade, 'GradeSubjectConfig'); bump(subjects, row.subjectName, 'GradeSubjectConfig'); }
  for (const row of schedules) { bump(grades, row.grade, 'Schedule', row._count._all); bump(subjects, row.subject, 'Schedule', row._count._all); }
  for (const row of subs) { bump(grades, row.grade, 'Substitution', row._count._all); bump(subjects, row.subject, 'Substitution', row._count._all); }
  for (const row of plans) { bump(grades, row.grade, 'LessonPlan', row._count._all); bump(subjects, row.subject, 'LessonPlan', row._count._all); }
  for (const row of issues) { bump(grades, row.grade, 'ValidationIssue', row._count._all); bump(subjects, row.subject, 'ValidationIssue', row._count._all); }
  for (const master of masters) bump(subjects, master.name, 'SubjectMaster');
  for (const teacher of teachers) {
    const parse = (raw: string | null) => { try { const v = JSON.parse(raw || '[]'); return Array.isArray(v) ? v.map(String) : []; } catch { return String(raw || '').split(/[;,|/]/); } };
    for (const grade of parse(teacher.grades)) bump(grades, grade, 'Teacher');
    for (const subject of new Set([teacher.subject, ...parse(teacher.subjects)])) bump(subjects, subject, 'Teacher');
  }
  try {
    for (const grade of Object.keys(JSON.parse(dayConfig?.gradeConfigs || '{}'))) bump(grades, grade, 'DayConfig');
  } catch { /* unreadable day config: nothing to count */ }
  return { grades, subjects };
}

// ── planning ─────────────────────────────────────────────────────────────────

function groupBy(names: readonly string[], key: (name: string) => string) {
  const groups = new Map<string, string[]>();
  for (const name of names) {
    const k = key(name);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(name);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

/** A tidy spelling: single spaces, and neither ALL CAPS nor all lower case (unless it has no letters to case). */
function tidiness(name: string): number {
  let score = 0;
  if (name === name.trim().replace(/\s+/g, ' ')) score += 2;
  const letters = name.replace(/[^\p{L}]/gu, '');
  if (letters && letters !== letters.toUpperCase() && letters !== letters.toLowerCase()) score += 1;
  return score;
}

/**
 * Tidiest spelling wins, then the most-referenced one, then the one with
 * ClassSection/SubjectMaster rows, then alphabetical.
 */
function pickCanonical(group: string[], usage: Usage, anchorModel: string) {
  return [...group].sort((a, b) =>
    tidiness(b) - tidiness(a)
    || total(usage.get(b)) - total(usage.get(a))
    || (usage.get(b)?.get(anchorModel) ?? 0) - (usage.get(a)?.get(anchorModel) ?? 0)
    || a.localeCompare(b))[0];
}

function plan(usage: { grades: Usage; subjects: Usage }, maps: { from: string; to: string }[]) {
  const renames: Rename[] = [];
  const exactGroups: { kind: Kind; canonical: string; members: string[] }[] = [];
  for (const [kind, names, key, anchor] of [
    ['grade', [...usage.grades.keys()], gradeKey, 'ClassSection'],
    ['subject', [...usage.subjects.keys()], subjectKey, 'SubjectMaster'],
  ] as const) {
    for (const group of groupBy(names, key)) {
      const canonical = pickCanonical(group, kind === 'grade' ? usage.grades : usage.subjects, anchor);
      exactGroups.push({ kind, canonical, members: group });
      for (const name of group) if (name !== canonical) renames.push({ kind, from: name, to: canonical, reason: 'exact' });
    }
  }

  // After exact merges, list abbreviation/similar subject pairs for confirmation.
  const renamedAway = new Set(renames.filter((r) => r.kind === 'subject').map((r) => r.from));
  const subjectNames = [...usage.subjects.keys()].filter((name) => !renamedAway.has(name));
  const suggestions: { a: string; b: string; match: 'alias' | 'similar' }[] = [];
  for (let i = 0; i < subjectNames.length; i++) {
    for (let j = i + 1; j < subjectNames.length; j++) {
      const match = compareSubjects(subjectNames[i], subjectNames[j]);
      if (match === 'alias' || match === 'similar') suggestions.push({ a: subjectNames[i], b: subjectNames[j], match });
    }
  }

  const resolve = (name: string) => {
    const exact = renames.find((r) => r.from === name);
    return exact ? exact.to : name;
  };
  for (const map of maps) {
    const kind: Kind = usage.subjects.has(map.from) || usage.subjects.has(map.to) ? 'subject' : 'grade';
    const known = kind === 'subject' ? usage.subjects : usage.grades;
    if (!known.has(map.from)) throw new Error(`--map: "${map.from}" is not a ${kind} name in this school.`);
    if (!known.has(map.to)) throw new Error(`--map: "${map.to}" is not a ${kind} name in this school.`);
    const to = resolve(map.to);
    const from = resolve(map.from);
    if (from === to) continue;
    // Spellings already merging into `from` follow it to the confirmed target.
    for (const rename of renames) if (rename.kind === kind && rename.to === from) rename.to = to;
    renames.push({ kind, from, to, reason: 'confirmed' });
  }
  return { renames, exactGroups, suggestions };
}

// ── collisions (rows that exist under both names) ────────────────────────────

async function collisions(db: PrismaClient | Tx, schoolId: string, rename: Rename) {
  const out: string[] = [];
  if (rename.kind === 'grade') {
    const [fromRows, toRows] = await Promise.all([
      db.schedule.findMany({ where: { schoolId, grade: rename.from }, select: { timetableVersionId: true, section: true, day: true, period: true } }),
      db.schedule.findMany({ where: { schoolId, grade: rename.to }, select: { timetableVersionId: true, section: true, day: true, period: true } }),
    ]);
    const slot = (r: { timetableVersionId: string | null; section: string; day: string; period: number }) => `${r.timetableVersionId}|${r.section}|${r.day}|${r.period}`;
    const taken = new Set(toRows.map(slot));
    const clash = fromRows.filter((row) => taken.has(slot(row))).length;
    if (clash) out.push(`${clash} Schedule slot(s) exist under both names; the "${rename.to}" row is kept`);
    const [fromSections, toSections] = await Promise.all([
      db.classSection.findMany({ where: { schoolId, grade: rename.from }, select: { section: true, academicYearId: true } }),
      db.classSection.findMany({ where: { schoolId, grade: rename.to }, select: { section: true, academicYearId: true } }),
    ]);
    const sectionKeys = new Set(toSections.map((s) => `${s.academicYearId}|${s.section}`));
    const dupSections = fromSections.filter((s) => sectionKeys.has(`${s.academicYearId}|${s.section}`)).length;
    if (dupSections) out.push(`${dupSections} section(s) exist under both names; their references move to the "${rename.to}" section`);
  }
  const field = rename.kind === 'grade' ? 'grade' : 'subjectName';
  const other = rename.kind === 'grade' ? 'subjectName' : 'grade';
  const [fromConfigs, toConfigs] = await Promise.all([
    db.gradeSubjectConfig.findMany({ where: { schoolId, [field]: rename.from } }),
    db.gradeSubjectConfig.findMany({ where: { schoolId, [field]: rename.to } }),
  ]);
  const settings = (c: { weeklyPeriods: number; maxPeriodsPerDay: number; active: boolean }) =>
    `${c.weeklyPeriods}/wk, max ${c.maxPeriodsPerDay}/day${c.active ? '' : ', inactive'}`;
  const inUse = (c: { weeklyPeriods: number; active: boolean }) => c.active && c.weeklyPeriods > 0;
  for (const config of fromConfigs) {
    const twin = toConfigs.find((candidate) => candidate[other] === config[other]);
    if (!twin) {
      // No twin: the row moves, adding this subject's quota to the canonical name.
      if (inUse(config)) out.push(`GradeSubjectConfig ${config[other]}: moves to "${rename.to}" (${settings(config)})`);
      continue;
    }
    const differs = twin.weeklyPeriods !== config.weeklyPeriods || twin.maxPeriodsPerDay !== config.maxPeriodsPerDay || twin.active !== config.active;
    const warn = !inUse(twin) && inUse(config) ? '  ⚠ the kept row is not in use but the removed one is; edit it afterwards if the removed settings were right' : '';
    out.push(`GradeSubjectConfig ${config[other]}: both names configured${differs
      ? `; keeping "${rename.to}" (${settings(twin)}) over "${rename.from}" (${settings(config)})${warn}`
      : ' with identical settings'}`);
  }
  return out;
}

// ── applying ─────────────────────────────────────────────────────────────────

async function applyGradeRename(tx: Tx, schoolId: string, { from, to }: Rename) {
  // Class sections: rename, or fold into the existing section of the canonical grade.
  for (const section of await tx.classSection.findMany({ where: { schoolId, grade: from } })) {
    const twin = await tx.classSection.findFirst({ where: { schoolId, grade: to, section: section.section, academicYearId: section.academicYearId } });
    if (twin) {
      await tx.timetableSlot.updateMany({ where: { schoolId, classSectionId: section.id }, data: { classSectionId: twin.id } });
      for (const requirement of await tx.subjectRequirement.findMany({ where: { schoolId, classSectionId: section.id } })) {
        const clash = await tx.subjectRequirement.findFirst({ where: { timetableVersionId: requirement.timetableVersionId, classSectionId: twin.id, subjectId: requirement.subjectId } });
        if (clash) await tx.subjectRequirement.delete({ where: { id: requirement.id } });
        else await tx.subjectRequirement.update({ where: { id: requirement.id }, data: { classSectionId: twin.id } });
      }
      await tx.classSection.delete({ where: { id: section.id } });
    } else {
      await tx.classSection.update({ where: { id: section.id }, data: { grade: to, code: `${to.replace(/\s+/g, '')}-${section.section}` } });
    }
  }

  // Schedule: rows colliding with an existing canonical slot are removed.
  const toSlots = new Set((await tx.schedule.findMany({ where: { schoolId, grade: to }, select: { timetableVersionId: true, section: true, day: true, period: true } }))
    .map((r) => `${r.timetableVersionId}|${r.section}|${r.day}|${r.period}`));
  const fromRows = await tx.schedule.findMany({ where: { schoolId, grade: from }, select: { id: true, timetableVersionId: true, section: true, day: true, period: true } });
  const clashing = fromRows.filter((r) => toSlots.has(`${r.timetableVersionId}|${r.section}|${r.day}|${r.period}`)).map((r) => r.id);
  if (clashing.length) await tx.schedule.deleteMany({ where: { id: { in: clashing } } });
  await tx.schedule.updateMany({ where: { schoolId, grade: from }, data: { grade: to } });

  await mergeConfigs(tx, schoolId, 'grade', from, to);
  await tx.substitution.updateMany({ where: { schoolId, grade: from }, data: { grade: to } });
  await tx.validationIssue.updateMany({ where: { schoolId, grade: from }, data: { grade: to } });
  const teacherIds = (await tx.teacher.findMany({ where: { schoolId }, select: { id: true } })).map((t) => t.id);
  await tx.lessonPlan.updateMany({ where: { teacherId: { in: teacherIds }, grade: from }, data: { grade: to } });

  for (const teacher of await tx.teacher.findMany({ where: { schoolId }, select: { id: true, grades: true, sections: true } })) {
    const grades = renameListColumn(teacher.grades, 'grade', from, to);
    const sections = renameListColumn(teacher.sections, 'grade', from, to);
    if (grades !== null || sections !== null) {
      await tx.teacher.update({ where: { id: teacher.id }, data: { ...(grades !== null ? { grades } : {}), ...(sections !== null ? { sections } : {}) } });
    }
  }
  for (const qualification of await tx.teacherQualification.findMany({ where: { schoolId } })) {
    const next = renameDeep(qualification.eligibleGrades, 'grade', from, to);
    if (JSON.stringify(next) !== JSON.stringify(qualification.eligibleGrades)) {
      await tx.teacherQualification.update({ where: { id: qualification.id }, data: { eligibleGrades: next as Prisma.InputJsonValue } });
    }
  }

  const dayConfig = await tx.schoolDayPeriodConfig.findUnique({ where: { schoolId } });
  if (dayConfig?.gradeConfigs) {
    try {
      const configs = JSON.parse(dayConfig.gradeConfigs) as Record<string, unknown>;
      if (from in configs) {
        if (!(to in configs)) configs[to] = configs[from];
        delete configs[from];
        await tx.schoolDayPeriodConfig.update({ where: { schoolId }, data: { gradeConfigs: JSON.stringify(configs) } });
      }
    } catch { /* unreadable day config is left unchanged */ }
  }
}

async function applySubjectRename(tx: Tx, schoolId: string, { from, to }: Rename) {
  const [fromMaster, toMaster] = await Promise.all([
    tx.subjectMaster.findFirst({ where: { schoolId, name: from } }),
    tx.subjectMaster.findFirst({ where: { schoolId, name: to } }),
  ]);
  if (fromMaster && toMaster) {
    for (const qualification of await tx.teacherQualification.findMany({ where: { schoolId, subjectId: fromMaster.id } })) {
      const clash = await tx.teacherQualification.findFirst({ where: { teacherId: qualification.teacherId, subjectId: toMaster.id } });
      if (clash) await tx.teacherQualification.delete({ where: { id: qualification.id } });
      else await tx.teacherQualification.update({ where: { id: qualification.id }, data: { subjectId: toMaster.id } });
    }
    for (const requirement of await tx.subjectRequirement.findMany({ where: { schoolId, subjectId: fromMaster.id } })) {
      const clash = await tx.subjectRequirement.findFirst({ where: { timetableVersionId: requirement.timetableVersionId, classSectionId: requirement.classSectionId, subjectId: toMaster.id } });
      if (clash) await tx.subjectRequirement.delete({ where: { id: requirement.id } });
      else await tx.subjectRequirement.update({ where: { id: requirement.id }, data: { subjectId: toMaster.id } });
    }
    await tx.timetableSlot.updateMany({ where: { schoolId, subjectId: fromMaster.id }, data: { subjectId: toMaster.id } });
    await tx.subjectMaster.delete({ where: { id: fromMaster.id } });
  } else if (fromMaster) {
    await tx.subjectMaster.update({ where: { id: fromMaster.id }, data: { name: to } });
  }

  await tx.schedule.updateMany({ where: { schoolId, subject: from }, data: { subject: to } });
  await mergeConfigs(tx, schoolId, 'subjectName', from, to);
  await tx.substitution.updateMany({ where: { schoolId, subject: from }, data: { subject: to } });
  await tx.validationIssue.updateMany({ where: { schoolId, subject: from }, data: { subject: to } });
  const teacherIds = (await tx.teacher.findMany({ where: { schoolId }, select: { id: true } })).map((t) => t.id);
  await tx.lessonPlan.updateMany({ where: { teacherId: { in: teacherIds }, subject: from }, data: { subject: to } });

  for (const teacher of await tx.teacher.findMany({ where: { schoolId }, select: { id: true, subject: true, subjects: true, sections: true } })) {
    const subjects = renameListColumn(teacher.subjects, 'subject', from, to);
    const sections = renameListColumn(teacher.sections, 'subject', from, to);
    const primary = teacher.subject.trim() === from ? to : null;
    if (subjects !== null || sections !== null || primary !== null) {
      await tx.teacher.update({
        where: { id: teacher.id },
        data: { ...(subjects !== null ? { subjects } : {}), ...(sections !== null ? { sections } : {}), ...(primary !== null ? { subject: primary } : {}) },
      });
    }
  }
  for (const room of await tx.room.findMany({ where: { schoolId }, select: { id: true, supportedSubjects: true } })) {
    if (!room.supportedSubjects) continue;
    const next = renameDeep(room.supportedSubjects, 'subject', from, to);
    if (JSON.stringify(next) !== JSON.stringify(room.supportedSubjects)) {
      await tx.room.update({ where: { id: room.id }, data: { supportedSubjects: next as Prisma.InputJsonValue } });
    }
  }
}

/** Moves GradeSubjectConfig rows; where both names are configured the canonical row is kept. */
async function mergeConfigs(tx: Tx, schoolId: string, field: 'grade' | 'subjectName', from: string, to: string) {
  const other = field === 'grade' ? 'subjectName' : 'grade';
  for (const config of await tx.gradeSubjectConfig.findMany({ where: { schoolId, [field]: from } })) {
    const twin = await tx.gradeSubjectConfig.findFirst({ where: { schoolId, [field]: to, [other]: config[other] } });
    if (twin) await tx.gradeSubjectConfig.delete({ where: { id: config.id } });
    else await tx.gradeSubjectConfig.update({ where: { id: config.id }, data: { [field]: to } });
  }
}

// ── report ───────────────────────────────────────────────────────────────────

async function reportSchool(db: PrismaClient, schoolId: string, label: string, options: ReturnType<typeof parseArgs>) {
  const usage = await collectUsage(db, schoolId);
  const { renames, exactGroups, suggestions } = plan(usage, options.maps);
  console.log(`\n=== ${label} (${schoolId})`);

  const byKind = (kind: Kind) => exactGroups.filter((g) => g.kind === kind);
  for (const kind of ['grade', 'subject'] as const) {
    const groups = byKind(kind);
    console.log(`\nExact duplicate ${kind}s (merged automatically): ${groups.length ? '' : 'none'}`);
    const names = kind === 'grade' ? usage.grades : usage.subjects;
    for (const group of groups) {
      console.log(`  → "${group.canonical}"`);
      for (const member of group.members) console.log(`      ${member === group.canonical ? 'keep ' : 'merge'} "${member}": ${describe(names.get(member))}`);
    }
  }

  console.log(`\nPossible duplicate subjects (NOT merged unless confirmed with --map): ${suggestions.length ? '' : 'none'}`);
  for (const { a, b, match } of suggestions) {
    console.log(`  [${match}] "${a}" (${describe(usage.subjects.get(a))})`);
    console.log(`          "${b}" (${describe(usage.subjects.get(b))})`);
    console.log(`          to merge: --map "${a}=>${b}"  or  --map "${b}=>${a}"`);
  }

  const confirmed = renames.filter((r) => r.reason === 'confirmed');
  if (confirmed.length) {
    console.log('\nConfirmed by --map:');
    for (const r of confirmed) console.log(`  ${r.kind} "${r.from}" → "${r.to}"`);
  }

  if (renames.length) {
    console.log('\nCollisions (rows present under both names):');
    let any = false;
    for (const rename of renames) {
      for (const line of await collisions(db, schoolId, rename)) { console.log(`  ${rename.kind} "${rename.from}" → "${rename.to}": ${line}`); any = true; }
    }
    if (!any) console.log('  none');
  }

  if (!options.apply || renames.length === 0) {
    console.log(renames.length ? `\n${renames.length} rename(s) planned. Re-run with --apply to write.` : '\nNothing to merge.');
    return;
  }

  // Grades first so subject config collisions are evaluated on canonical grades.
  const ordered = [...renames].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'grade' ? -1 : 1));
  await db.$transaction(async (tx) => {
    for (const rename of ordered) {
      if (rename.kind === 'grade') await applyGradeRename(tx, schoolId, rename);
      else await applySubjectRename(tx, schoolId, rename);
    }
  }, { timeout: TRANSACTION_TIMEOUT_MS, maxWait: TRANSACTION_TIMEOUT_MS });

  const after = await collectUsage(db, schoolId);
  const remaining = plan(after, []).exactGroups.length;
  console.log(`\nApplied ${renames.length} rename(s). After: ${after.grades.size} grade name(s), ${after.subjects.size} subject name(s), ${remaining} exact duplicate group(s) left.`);
  for (const rename of renames) {
    const left = (rename.kind === 'grade' ? after.grades : after.subjects).get(rename.from);
    if (left) console.log(`  warning: "${rename.from}" still referenced: ${describe(left)}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const db = new PrismaClient();
  try {
    const schools = await db.school.findMany({
      where: options.all ? {} : { id: options.schoolId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    if (!schools.length) throw new Error(`No school with id ${options.schoolId}.`);
    console.log(`Mode: ${options.apply ? 'APPLY' : 'DRY RUN (no changes written)'}`);
    for (const school of schools) await reportSchool(db, school.id, school.name, options);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
