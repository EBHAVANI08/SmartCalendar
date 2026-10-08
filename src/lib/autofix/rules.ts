import { readList } from '@/lib/faculty';
import { compareSubjects, gradeKey, parseRoman } from '@/lib/name-normalize';
import { AUTO_CREATED_MIN_ROWS, UNEDITED_TOLERANCE_MS } from '@/lib/scheduling-constants';
import { buildTeachingGrid, longestDayPeriods, validateBellConfig, workingDayNames } from '@/lib/timetable-constraints';
import { planGradeMove, planSubjectMove } from '@/lib/autofix/moves';
import { inUse, isLive, shortHash, tidyName, weekFor } from '@/lib/autofix/snapshot-ops';
import type { Change, Fix, Snapshot, SubjectConfigRow, Unfixable } from '@/lib/autofix/types';

/**
 * The auto-fix rules, in the order the engine runs them. Each rule looks at
 * the snapshot as it is now and returns every fix it would make plus the
 * problems it cannot fix. The engine applies one fix at a time and asks again,
 * so a rule always sees the effect of the previous fix.
 */

export interface RuleContext {
  /** ISO timestamp used for archivedAt, so a run is deterministic. */
  now: string;
}

export interface RuleOutput {
  fixes: Fix[];
  unfixable: Unfixable[];
}

export interface Rule {
  id: string;
  run(s: Snapshot, ctx: RuleContext): RuleOutput;
}

const liveConfigs = (s: Snapshot) => s.subjectConfigs.filter(isLive);
const groupBy = <T>(items: T[], key: (item: T) => string) => {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(item);
  }
  return map;
};

/** The app's priority levels, lowest first. Unknown values rank as the default level. */
const PRIORITY_ORDER = ['Low', 'Normal', 'High', 'Core'];
const DEFAULT_PRIORITY = 'Normal';
const priorityRank = (priority: string) => {
  const index = PRIORITY_ORDER.indexOf(priority);
  return index === -1 ? PRIORITY_ORDER.indexOf(DEFAULT_PRIORITY) : index;
};
const isCore = (priority: string) => priority === PRIORITY_ORDER[PRIORITY_ORDER.length - 1];

/**
 * How presentable a spelling is: single spaces, then every word capitalised
 * ("Computer Science" over "computer Science"), then mixed rather than all
 * capitals or all lower case.
 */
const tidiness = (name: string) => {
  let score = 0;
  if (name === tidyName(name)) score += 4;
  const words = name.split(/\s+/).filter((word) => /\p{L}/u.test(word));
  if (words.length && words.every((word) => /^\p{Lu}/u.test(word))) score += 2;
  const letters = name.replace(/[^\p{L}]/gu, '');
  if (letters && letters !== letters.toUpperCase() && letters !== letters.toLowerCase()) score += 1;
  return score;
};

/** "Grade 1" → "Grade #arabic", "Class IV" → "Class #roman": the shape of a grade name. */
function gradeStyle(name: string): string {
  return tidyName(name)
    .replace(/\b\d+\b/g, '#arabic')
    .replace(/\b[IVXLCDM]+\b/g, (numeral) => (parseRoman(numeral) !== null ? '#roman' : numeral));
}

// ── Tier 2: rows that look auto-created ──────────────────────────────────────

/**
 * A grade whose active subject rows all carry identical settings and were
 * never edited since creation (and were not created by a user) holds
 * generated placeholders, not the school's curriculum: they are set inactive.
 */
const autoCreatedRows: Rule = {
  id: 'auto_created_rows',
  run(s) {
    const fixes: Fix[] = [];
    for (const [grade, rows] of groupBy(liveConfigs(s).filter((c) => c.active && c.weeklyPeriods > 0), (c) => c.grade)) {
      if (rows.length < AUTO_CREATED_MIN_ROWS) continue;
      const signature = (c: SubjectConfigRow) => `${c.weeklyPeriods}|${c.maxPeriodsPerDay}|${c.priority}|${c.allowConsecutive}`;
      if (new Set(rows.map(signature)).size !== 1) continue;
      const unedited = rows.every((c) => Math.abs(Date.parse(c.updatedAt) - Date.parse(c.createdAt)) <= UNEDITED_TOLERANCE_MS);
      if (!unedited || rows.some((c) => c.source === 'user')) continue;
      fixes.push({
        rule: 'auto_created_rows',
        tier: 2,
        entity: `grade:${grade}`,
        summary: `${grade}: ${rows.length} subject rows look auto-created (all ${rows[0].weeklyPeriods}/week, ${rows[0].maxPeriodsPerDay}/day, never edited) and were set inactive`,
        before: { grade, activeRows: rows.length, weeklyPeriods: rows[0].weeklyPeriods, subjects: rows.map((c) => c.subjectName) },
        after: { grade, activeRows: 0 },
        changes: rows.map((c) => ({ model: 'gradeSubjectConfig', id: c.id, before: { active: true }, after: { active: false } })),
        suppressKey: `auto_created_rows:${grade}:${shortHash(rows.map((c) => c.id).sort().join(','))}`,
      });
    }
    return { fixes, unfixable: [] };
  },
};

// ── Tier 1: duplicate grade names ────────────────────────────────────────────

const duplicateGrades: Rule = {
  id: 'duplicate_grade',
  run(s, ctx) {
    const fixes: Fix[] = [];
    const unfixable: Unfixable[] = [];
    const names = new Set<string>([
      ...liveConfigs(s).map((c) => c.grade),
      ...s.classSections.filter(isLive).map((c) => c.grade),
    ]);
    const frozen = new Set(s.frozenGrades);
    const styleCount = new Map<string, number>();
    for (const name of names) styleCount.set(gradeStyle(name), (styleCount.get(gradeStyle(name)) ?? 0) + 1);
    const references = (name: string) =>
      s.classSections.filter((c) => isLive(c) && c.grade === name).length * 10
      + liveConfigs(s).filter((c) => c.grade === name && inUse(c)).length;

    for (const group of groupBy([...names], gradeKey).values()) {
      if (group.length < 2) continue;
      // A name the live timetable uses must stay; otherwise the spelling that
      // follows the school's own naming style for its other grades wins,
      // then the tidiest, then the most used.
      const ranked = [...group].sort((a, b) =>
        Number(frozen.has(b)) - Number(frozen.has(a))
        || (styleCount.get(gradeStyle(b)) ?? 0) - (styleCount.get(gradeStyle(a)) ?? 0)
        || tidiness(b) - tidiness(a)
        || references(b) - references(a)
        || a.localeCompare(b));
      const canonical = ranked[0];
      for (const duplicate of ranked.slice(1)) {
        if (frozen.has(duplicate)) {
          unfixable.push({
            rule: 'duplicate_grade',
            entity: `grade:${canonical}`,
            message: `"${duplicate}" and "${canonical}" are the same grade, but the published timetable uses both names, so they were not merged.`,
            blocking: false,
          });
          continue;
        }
        const plan = planGradeMove(s, duplicate, canonical, ctx.now);
        if (!plan.changes.length) continue;
        fixes.push({
          rule: 'duplicate_grade',
          tier: 1,
          entity: `grade:${canonical}`,
          summary: `"${duplicate}" merged into "${canonical}"${plan.notes.length ? ` (${plan.notes.join('; ')})` : ''}`,
          before: { name: duplicate },
          after: { name: canonical },
          changes: plan.changes,
          suppressKey: `duplicate_grade:${[duplicate, canonical].sort().join('|')}`,
        });
      }
    }
    return { fixes, unfixable };
  },
};

// ── Tier 1: duplicate subject names ──────────────────────────────────────────

/** Name variants merged automatically: exact keys, abbreviations, one-letter spellings. */
const MERGEABLE = new Set(['exact', 'alias', 'spelling']);

function subjectNames(s: Snapshot): Map<string, number> {
  const weight = new Map<string, number>();
  const add = (name: string | null | undefined, amount: number) => {
    const clean = String(name ?? '');
    if (!clean.trim()) return;
    weight.set(clean, (weight.get(clean) ?? 0) + amount);
  };
  for (const c of liveConfigs(s)) add(c.subjectName, inUse(c) ? 10 : 1);
  for (const m of s.subjectMasters.filter(isLive)) add(m.name, 1);
  for (const t of s.teachers) for (const name of new Set([t.subject, ...readList(t.subjects ?? t.subject)])) add(name, 1);
  for (const r of s.editableSchedules) add(r.subject, 0.01);
  return weight;
}

const duplicateSubjects: Rule = {
  id: 'duplicate_subject',
  run(s, ctx) {
    const fixes: Fix[] = [];
    const weight = subjectNames(s);
    const ranked = [...weight.keys()].sort((a, b) =>
      tidiness(b) - tidiness(a) || (weight.get(b)! - weight.get(a)!) || a.localeCompare(b));
    const assigned = new Set<string>();
    for (const canonical of ranked) {
      if (assigned.has(canonical)) continue;
      assigned.add(canonical);
      // Each variant must match the canonical name itself; no chains.
      for (const candidate of ranked) {
        if (assigned.has(candidate)) continue;
        const match = compareSubjects(candidate, canonical);
        if (!match || !MERGEABLE.has(match)) continue;
        assigned.add(candidate);
        const plan = planSubjectMove(s, candidate, canonical, ctx.now);
        if (!plan.changes.length) continue;
        fixes.push({
          rule: 'duplicate_subject',
          tier: 1,
          entity: `subject:${canonical}`,
          summary: `"${candidate}" merged into "${canonical}" (${match === 'exact' ? 'same name' : match === 'alias' ? 'abbreviation' : 'spelling variant'})`,
          before: { name: candidate },
          after: { name: canonical },
          changes: plan.changes,
          suppressKey: `duplicate_subject:${[candidate, canonical].sort().join('|')}`,
        });
      }
    }
    return { fixes, unfixable: [] };
  },
};

// ── Tier 1: untidy display names ─────────────────────────────────────────────

const displayNames: Rule = {
  id: 'display_name',
  run(s, ctx) {
    const fixes: Fix[] = [];
    const unfixable: Unfixable[] = [];
    const frozen = new Set(s.frozenGrades);
    const grades = new Set([...liveConfigs(s).map((c) => c.grade), ...s.classSections.filter(isLive).map((c) => c.grade)]);
    for (const name of grades) {
      const tidy = tidyName(name);
      if (tidy === name || grades.has(tidy)) continue;
      if (frozen.has(name)) {
        unfixable.push({ rule: 'display_name', entity: `grade:${name}`, message: `Grade "${name}" has stray spaces but the published timetable uses it, so it was not renamed.`, blocking: false });
        continue;
      }
      const plan = planGradeMove(s, name, tidy, ctx.now);
      fixes.push({ rule: 'display_name', tier: 1, entity: `grade:${tidy}`, summary: `Grade name "${name}" tidied to "${tidy}"`, before: { name }, after: { name: tidy }, changes: plan.changes, suppressKey: `display_name:grade:${name}` });
    }
    const subjects = new Set([...liveConfigs(s).map((c) => c.subjectName), ...s.subjectMasters.filter(isLive).map((m) => m.name)]);
    for (const name of subjects) {
      const tidy = tidyName(name);
      if (tidy === name || subjects.has(tidy)) continue;
      const plan = planSubjectMove(s, name, tidy, ctx.now);
      fixes.push({ rule: 'display_name', tier: 1, entity: `subject:${tidy}`, summary: `Subject name "${name}" tidied to "${tidy}"`, before: { name }, after: { name: tidy }, changes: plan.changes, suppressKey: `display_name:subject:${name}` });
    }
    return { fixes, unfixable };
  },
};

// ── Tier 1: daily cap below what the weekly quota needs ──────────────────────

const dailyCapTooLow: Rule = {
  id: 'daily_cap_too_low',
  run(s) {
    const fixes: Fix[] = [];
    if (!s.dayConfig) return { fixes, unfixable: [] };
    for (const config of liveConfigs(s).filter((c) => c.active && c.weeklyPeriods > 0)) {
      const days = workingDayNames(weekFor(s, config.grade)).length;
      if (config.weeklyPeriods <= config.maxPeriodsPerDay * days) continue;
      const cap = Math.ceil(config.weeklyPeriods / days);
      fixes.push({
        rule: 'daily_cap_too_low',
        tier: 1,
        entity: `subject:${config.grade}/${config.subjectName}`,
        summary: `${config.grade} ${config.subjectName}: ${config.weeklyPeriods}/week needs up to ${cap}/day over ${days} days; daily limit raised from ${config.maxPeriodsPerDay} to ${cap}`,
        before: { maxPeriodsPerDay: config.maxPeriodsPerDay },
        after: { maxPeriodsPerDay: cap },
        changes: [{ model: 'gradeSubjectConfig', id: config.id, before: { maxPeriodsPerDay: config.maxPeriodsPerDay }, after: { maxPeriodsPerDay: cap } }],
        suppressKey: `daily_cap_too_low:${config.id}:${config.weeklyPeriods}:${config.maxPeriodsPerDay}`,
      });
    }
    return { fixes, unfixable: [] };
  },
};

// ── Tier 1: bell schedule ────────────────────────────────────────────────────

interface BellScope {
  /** null = school default; otherwise the grade override's key. */
  grade: string | null;
  breakOn: boolean;
  breakAfter: number;
  breakMinutes: number;
  lunchOn: boolean;
  lunchAfter: number;
  lunchMinutes: number;
  longest: number;
}

function bellScopes(s: Snapshot): BellScope[] {
  if (!s.dayConfig) return [];
  const scopes: BellScope[] = [];
  const base = weekFor(s, null);
  scopes.push({ grade: null, breakOn: base.breakEnabled, breakAfter: base.breakAfter, breakMinutes: base.breakMinutes, lunchOn: base.lunchEnabled, lunchAfter: base.lunchAfter, lunchMinutes: base.lunchMinutes, longest: longestDayPeriods(base) });
  let overrides: Record<string, { enabled?: boolean }> = {};
  try { overrides = JSON.parse(s.dayConfig.gradeConfigs || '{}'); } catch { overrides = {}; }
  for (const [grade, override] of Object.entries(overrides)) {
    if (override?.enabled === false) continue;
    const week = weekFor(s, grade);
    scopes.push({ grade, breakOn: week.breakEnabled, breakAfter: week.breakAfter, breakMinutes: week.breakMinutes, lunchOn: week.lunchEnabled, lunchAfter: week.lunchAfter, lunchMinutes: week.lunchMinutes, longest: longestDayPeriods(week) });
  }
  return scopes;
}

/** Changes that set bell fields for one scope (school row fields, or a grade override inside gradeConfigs). */
function bellChange(s: Snapshot, grade: string | null, patch: Record<string, unknown>): Change {
  const row = s.dayConfig!;
  if (grade === null) {
    const before = Object.fromEntries(Object.keys(patch).map((field) => [field, (row as unknown as Record<string, unknown>)[field] ?? null]));
    return { model: 'schoolDayPeriodConfig', id: row.id, before, after: patch };
  }
  const overrides = JSON.parse(row.gradeConfigs || '{}') as Record<string, Record<string, unknown>>;
  const next = { ...overrides, [grade]: { ...overrides[grade], ...patch } };
  return { model: 'schoolDayPeriodConfig', id: row.id, before: { gradeConfigs: row.gradeConfigs }, after: { gradeConfigs: JSON.stringify(next) } };
}

const bellRules: Rule = {
  id: 'bell',
  run(s) {
    const fixes: Fix[] = [];
    for (const scope of bellScopes(s)) {
      const label = scope.grade ?? 'School day';
      const where = scope.grade ?? 'school';
      const parts = [
        { kind: 'break' as const, name: 'short break', on: scope.breakOn, after: scope.breakAfter, minutes: scope.breakMinutes, enabledField: 'breakEnabled', afterField: 'breakAfter' },
        { kind: 'lunch' as const, name: 'lunch', on: scope.lunchOn, after: scope.lunchAfter, minutes: scope.lunchMinutes, enabledField: 'lunchEnabled', afterField: 'lunchAfter' },
      ];
      for (const part of parts) {
        if (part.on && !(part.minutes > 0)) {
          fixes.push({
            rule: 'break_zero_minutes', tier: 1, entity: `bell:${where}`,
            summary: `${label}: the ${part.name} was on but lasted ${part.minutes} minutes, so it was switched off`,
            before: { [part.enabledField]: true, minutes: part.minutes }, after: { [part.enabledField]: false },
            changes: [bellChange(s, scope.grade, { [part.enabledField]: false })],
            suppressKey: `break_zero_minutes:${where}:${part.kind}`,
          });
        }
      }
      for (const part of parts) {
        if (!part.on || (part.after >= 1 && part.after <= scope.longest - 1)) continue;
        if (scope.longest < 2) {
          fixes.push({
            rule: 'break_out_of_range', tier: 1, entity: `bell:${where}`,
            summary: `${label}: a day of ${scope.longest} period has no room for a ${part.name}, so it was switched off`,
            before: { [part.enabledField]: true }, after: { [part.enabledField]: false },
            changes: [bellChange(s, scope.grade, { [part.enabledField]: false })],
            suppressKey: `break_out_of_range:${where}:${part.kind}:${part.after}:${scope.longest}`,
          });
          continue;
        }
        const clamped = Math.min(scope.longest - 1, Math.max(1, Math.round(part.after)));
        fixes.push({
          rule: 'break_out_of_range', tier: 1, entity: `bell:${where}`,
          summary: `${label}: the ${part.name} was after period ${part.after}, outside periods 1–${scope.longest - 1}; moved to after period ${clamped}`,
          before: { [part.afterField]: part.after }, after: { [part.afterField]: clamped },
          changes: [bellChange(s, scope.grade, { [part.afterField]: clamped })],
          suppressKey: `break_out_of_range:${where}:${part.kind}:${part.after}:${scope.longest}`,
        });
      }
      if (scope.breakOn && scope.lunchOn && scope.breakAfter === scope.lunchAfter) {
        // Keep the longer of the two (lunch on a tie) and switch the other off.
        const keepLunch = scope.lunchMinutes >= scope.breakMinutes;
        const off = keepLunch ? parts[0] : parts[1];
        const kept = keepLunch ? parts[1] : parts[0];
        fixes.push({
          rule: 'break_same_period', tier: 1, entity: `bell:${where}`,
          summary: `${label}: the short break and lunch were both after period ${scope.breakAfter}; kept the ${kept.name} (${kept.minutes} min) and switched the ${off.name} (${off.minutes} min) off`,
          before: { [off.enabledField]: true, after: scope.breakAfter }, after: { [off.enabledField]: false },
          changes: [bellChange(s, scope.grade, { [off.enabledField]: false })],
          suppressKey: `break_same_period:${where}:${scope.breakAfter}:${scope.breakMinutes}:${scope.lunchMinutes}`,
        });
      }
    }
    // Whatever remains (times out of order, periods too short, or a fix an
    // admin undid) cannot be fixed automatically.
    const unfixable: Unfixable[] = [];
    for (const scope of bellScopes(s)) {
      for (const message of validateBellConfig(weekFor(s, scope.grade), scope.grade ?? 'School day')) {
        unfixable.push({ rule: 'bell_times', entity: `bell:${scope.grade ?? 'school'}`, message, blocking: true, ...(scope.grade ? { grade: scope.grade } : {}) });
      }
    }
    return { fixes, unfixable };
  },
};

// ── Tier 2: grade over capacity ──────────────────────────────────────────────

/**
 * Reduce weekly quotas until the grade fits its week: lowest priority first,
 * the largest quota first within a priority, never below 1 period, and Core
 * subjects only once every other subject is down to 1.
 */
export function planReduction(rows: SubjectConfigRow[], overBy: number): { reductions: Map<string, number>; remaining: number } {
  const weekly = new Map(rows.map((row) => [row.id, row.weeklyPeriods]));
  let remaining = overBy;
  while (remaining > 0) {
    const reducible = rows.filter((row) => weekly.get(row.id)! > 1);
    const nonCore = reducible.filter((row) => !isCore(row.priority));
    const pool = nonCore.length ? nonCore : reducible;
    if (!pool.length) break;
    pool.sort((a, b) =>
      priorityRank(a.priority) - priorityRank(b.priority)
      || weekly.get(b.id)! - weekly.get(a.id)!
      || a.subjectName.localeCompare(b.subjectName));
    weekly.set(pool[0].id, weekly.get(pool[0].id)! - 1);
    remaining--;
  }
  const reductions = new Map<string, number>();
  for (const row of rows) if (weekly.get(row.id)! !== row.weeklyPeriods) reductions.set(row.id, weekly.get(row.id)!);
  return { reductions, remaining };
}

const overCapacity: Rule = {
  id: 'over_capacity',
  run(s) {
    const fixes: Fix[] = [];
    const unfixable: Unfixable[] = [];
    const active = liveConfigs(s).filter((c) => c.active && c.weeklyPeriods > 0);
    if (!s.dayConfig) {
      if (active.length) unfixable.push({ rule: 'day_config_missing', entity: 'bell:school', message: 'The day & period setup has not been saved yet.', blocking: true });
      return { fixes, unfixable };
    }
    for (const [grade, rows] of groupBy(active, (c) => c.grade)) {
      const slots = buildTeachingGrid(weekFor(s, grade)).length;
      const demand = rows.reduce((sum, row) => sum + row.weeklyPeriods, 0);
      if (demand <= slots) continue;
      const { reductions, remaining } = planReduction(rows, demand - slots);
      if (remaining > 0) {
        unfixable.push({
          rule: 'over_capacity', entity: `grade:${grade}`, grade, blocking: true,
          message: `${grade} has ${rows.length} active subjects but only ${slots} periods a week; even at 1 period each it is ${rows.length - slots} over. Deactivate subjects or add periods.`,
        });
        continue;
      }
      const changed = rows.filter((row) => reductions.has(row.id));
      fixes.push({
        rule: 'over_capacity',
        tier: 2,
        entity: `grade:${grade}`,
        summary: `${grade} reduced from ${demand} → ${slots} periods: ${changed.map((row) => `${row.subjectName} ${row.weeklyPeriods}→${reductions.get(row.id)}`).join(', ')}`,
        before: { grade, demand, slots, quotas: Object.fromEntries(changed.map((row) => [row.subjectName, row.weeklyPeriods])) },
        after: { grade, demand: slots, slots, quotas: Object.fromEntries(changed.map((row) => [row.subjectName, reductions.get(row.id)])) },
        changes: changed.map((row) => ({ model: 'gradeSubjectConfig', id: row.id, before: { weeklyPeriods: row.weeklyPeriods }, after: { weeklyPeriods: reductions.get(row.id)! } })),
        suppressKey: `over_capacity:${grade}:${slots}:${shortHash(rows.map((row) => `${row.id}=${row.weeklyPeriods}`).sort().join(','))}`,
        ifSuppressed: {
          rule: 'over_capacity', entity: `grade:${grade}`, grade, blocking: true,
          message: `${grade} needs ${demand} periods a week but has ${slots}. The automatic reduction was undone, so generation for this grade waits until the quotas are changed.`,
        },
      });
    }
    return { fixes, unfixable };
  },
};

/** Run order matters: placeholders out first, then names, then limits. */
export const RULES: Rule[] = [autoCreatedRows, duplicateGrades, duplicateSubjects, displayNames, dailyCapTooLow, bellRules, overCapacity];
