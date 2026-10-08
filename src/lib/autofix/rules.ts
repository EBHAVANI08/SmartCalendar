import { readList } from '@/lib/faculty';
import { compareSubjects, gradeKey } from '@/lib/name-normalize';
import { teacherQualifiedFor } from '@/lib/staffing';
import { renameListColumn, type NameKind } from '@/lib/autofix/rename';
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
  /** Limit grade-level rules (balancing) to one grade. */
  onlyGrade?: string;
}

export interface RuleOutput {
  fixes: Fix[];
  unfixable: Unfixable[];
}

export interface Rule {
  id: string;
  /** 1 = runs on every School Setup save; 2 = runs at generation or on request. */
  tier: 1 | 2;
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

/** True when a teacher list column mentions the name. */
const mentions = (raw: string | null, kind: NameKind, name: string) => renameListColumn(raw, kind, name, '\u0000') !== null;

/** How much of the school's data uses a grade name: rows, teacher lists and timetable rows (every version). */
function gradeReferences(s: Snapshot, name: string): number {
  return liveConfigs(s).filter((c) => c.grade === name).length
    + s.classSections.filter((c) => isLive(c) && c.grade === name).length
    + s.teachers.filter((t) => mentions(t.grades, 'grade', name) || mentions(t.sections, 'grade', name)).length
    + (s.scheduleCounts.grades[name] ?? 0);
}

/** How much of the school's data uses a subject name: rows, teacher lists and timetable rows (every version). */
function subjectReferences(s: Snapshot, name: string): number {
  return liveConfigs(s).filter((c) => c.subjectName === name).length
    + s.subjectMasters.filter((m) => isLive(m) && m.name === name).length
    + s.teachers.filter((t) => t.subject.trim() === name || mentions(t.subjects, 'subject', name) || mentions(t.sections, 'subject', name)).length
    + (s.scheduleCounts.subjects[name] ?? 0);
}

/** Single spaces and every word capitalised score higher ("Computer Science" over "computer  science"). */
const presentability = (name: string) =>
  (name === tidyName(name) ? 2 : 0)
  + (name.split(/\s+/).filter((word) => /\p{L}/u.test(word)).every((word) => /^\p{Lu}/u.test(word)) ? 1 : 0);

/**
 * The most-referenced name wins; on a tie the longer form; then the better
 * presented spelling; then alphabetical, so runs are deterministic.
 */
const byReferences = (references: (name: string) => number) => (a: string, b: string) =>
  references(b) - references(a) || b.length - a.length || presentability(b) - presentability(a) || a.localeCompare(b);

// ── Tier 1: the school's own merge rules ─────────────────────────────────────

/** "From" means "to" for this school (MergeRule rows); applied like any other merge. */
const mergeRules: Rule = {
  id: 'merge_rule',
  tier: 1,
  run(s, ctx) {
    const fixes: Fix[] = [];
    const unfixable: Unfixable[] = [];
    const frozen = new Set(s.frozenGrades);
    for (const rule of s.mergeRules) {
      if (rule.from === rule.to) continue;
      const plan = rule.kind === 'grade'
        ? (frozen.has(rule.from) ? null : planGradeMove(s, rule.from, rule.to, ctx.now))
        : planSubjectMove(s, rule.from, rule.to, ctx.now);
      if (!plan) {
        unfixable.push({ rule: 'merge_rule', entity: `grade:${rule.to}`, message: `Merge rule "${rule.from}" → "${rule.to}" waits: the published timetable uses "${rule.from}".`, blocking: false });
        continue;
      }
      if (!plan.changes.length) continue;
      fixes.push({
        rule: 'merge_rule',
        tier: 1,
        entity: `${rule.kind}:${rule.to}`,
        summary: `"${rule.from}" merged into "${rule.to}" (school merge rule)`,
        before: { name: rule.from },
        after: { name: rule.to },
        changes: plan.changes,
        suppressKey: `merge_rule:${rule.id}`,
      });
    }
    return { fixes, unfixable };
  },
};

// ── Tier 2: rows that look auto-created ──────────────────────────────────────

/**
 * A grade whose active subject rows all carry identical settings and were
 * never edited since creation (and were not created by a user) holds
 * generated placeholders, not the school's curriculum: they are set inactive.
 */
const autoCreatedRows: Rule = {
  id: 'auto_created_rows',
  tier: 2,
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
  tier: 1,
  run(s, ctx) {
    const fixes: Fix[] = [];
    const unfixable: Unfixable[] = [];
    const names = new Set<string>([
      ...liveConfigs(s).map((c) => c.grade),
      ...s.classSections.filter(isLive).map((c) => c.grade),
    ]);
    const frozen = new Set(s.frozenGrades);
    const order = byReferences((name) => gradeReferences(s, name));

    for (const group of groupBy([...names], gradeKey).values()) {
      if (group.length < 2) continue;
      // A name the live timetable uses must stay; otherwise the most-referenced
      // name wins (the longer form on a tie).
      const ranked = [...group].sort((a, b) => Number(frozen.has(b)) - Number(frozen.has(a)) || order(a, b));
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

/** Every subject name the school's live setup, teachers and draft timetable use. */
function subjectNames(s: Snapshot): string[] {
  const names = new Set<string>();
  const add = (name: string | null | undefined) => { if (String(name ?? '').trim()) names.add(String(name)); };
  for (const c of liveConfigs(s)) add(c.subjectName);
  for (const m of s.subjectMasters.filter(isLive)) add(m.name);
  for (const t of s.teachers) for (const name of [t.subject, ...readList(t.subjects ?? t.subject)]) add(name);
  for (const r of s.editableSchedules) add(r.subject);
  return [...names];
}

const duplicateSubjects: Rule = {
  id: 'duplicate_subject',
  tier: 1,
  run(s, ctx) {
    const fixes: Fix[] = [];
    // The most-referenced name wins (the longer form on a tie).
    const ranked = subjectNames(s).sort(byReferences((name) => subjectReferences(s, name)));
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
  tier: 1,
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
  tier: 1,
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
  tier: 1,
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

/** Why a subject is reduced earlier or later; read from the school's data only. */
export type BalanceSignal = 'no_teacher' | 'staffed' | 'needs_room';

export interface BalanceRow {
  id: string;
  subjectName: string;
  weeklyPeriods: number;
  priority: string;
  signal: BalanceSignal;
  /** Quota set by hand by an admin: reduced only after everything else. */
  edited: boolean;
}

const SIGNAL_RANK: Record<BalanceSignal, number> = { no_teacher: 0, staffed: 1, needs_room: 2 };

/**
 * Shares `total` periods among `weights` in proportion (largest-remainder
 * method), each between 1 and its own weight. Deterministic: ties go to the
 * larger original weight, then the earlier item.
 */
export function allocateProportionally(weights: number[], total: number): number[] {
  const result = new Array<number>(weights.length).fill(0);
  const fixed = new Set<number>();
  for (;;) {
    const free = weights.map((_, index) => index).filter((index) => !fixed.has(index));
    const left = total - [...fixed].reduce((sum, index) => sum + result[index], 0);
    const freeWeight = free.reduce((sum, index) => sum + weights[index], 0);
    const quotas = free.map((index) => (freeWeight ? (left * weights[index]) / freeWeight : 0));
    // Pin items that would fall below 1 or rise above their own weight, then re-share.
    const pinned = free.filter((index, position) => quotas[position] < 1 || quotas[position] > weights[index]);
    if (pinned.length) {
      for (const index of pinned) {
        const quota = quotas[free.indexOf(index)];
        result[index] = quota < 1 ? 1 : weights[index];
        fixed.add(index);
      }
      continue;
    }
    const floors = quotas.map(Math.floor);
    free.forEach((index, position) => { result[index] = floors[position]; });
    let remainder = left - floors.reduce((sum, value) => sum + value, 0);
    const order = free
      .map((index, position) => ({ index, fraction: quotas[position] - floors[position] }))
      .sort((a, b) => b.fraction - a.fraction || weights[b.index] - weights[a.index] || a.index - b.index);
    for (const { index } of order) {
      if (remainder <= 0) break;
      result[index] += 1;
      remainder -= 1;
    }
    return result;
  }
}

/**
 * Brings a grade's demand down by `overBy`:
 *  1. explicit priority first (Low, then Normal, then High, then Core);
 *  2. within a priority, data signals: no qualified teacher first, then
 *     staffed subjects, then subjects needing a specialised room;
 *  3. quotas an admin set by hand only after everything else;
 *  4. within one level, proportional to the original quotas (largest
 *     remainder), never below 1 period.
 */
export function planBalance(rows: BalanceRow[], overBy: number): { targets: Map<string, number>; remaining: number } {
  const levelKey = (row: BalanceRow) => [row.edited ? 1 : 0, priorityRank(row.priority), SIGNAL_RANK[row.signal]];
  const levels = groupBy(rows, (row) => levelKey(row).join('|'));
  const ordered = [...levels.values()].sort((a, b) => {
    const [x, y] = [levelKey(a[0]), levelKey(b[0])];
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  });

  const targets = new Map<string, number>();
  let remaining = overBy;
  for (const level of ordered) {
    if (remaining <= 0) break;
    const reducible = level.reduce((sum, row) => sum + (row.weeklyPeriods - 1), 0);
    if (reducible <= 0) continue;
    if (remaining >= reducible) {
      for (const row of level) if (row.weeklyPeriods > 1) targets.set(row.id, 1);
      remaining -= reducible;
      continue;
    }
    const total = level.reduce((sum, row) => sum + row.weeklyPeriods, 0) - remaining;
    const shares = allocateProportionally(level.map((row) => row.weeklyPeriods), total);
    level.forEach((row, index) => { if (shares[index] !== row.weeklyPeriods) targets.set(row.id, shares[index]); });
    remaining = 0;
  }
  return { targets, remaining };
}

const SIGNAL_NOTE: Record<BalanceSignal, string> = { no_teacher: 'no qualified teacher', staffed: '', needs_room: 'needs a specialised room' };

const overCapacity: Rule = {
  id: 'over_capacity',
  tier: 2,
  run(s, ctx) {
    const fixes: Fix[] = [];
    const unfixable: Unfixable[] = [];
    const active = liveConfigs(s).filter((c) => c.active && c.weeklyPeriods > 0);
    if (!s.dayConfig) {
      if (active.length) unfixable.push({ rule: 'day_config_missing', entity: 'bell:school', message: 'The day & period setup has not been saved yet.', blocking: true });
      return { fixes, unfixable };
    }
    const teachers = s.teachers.filter((t) => t.role !== 'inactive').map((t) => ({ ...t, name: '' }));
    const strict = new Set(s.protectedConfigIds);
    for (const [grade, rows] of groupBy(active, (c) => c.grade)) {
      if (ctx.onlyGrade && grade !== ctx.onlyGrade) continue;
      const slots = buildTeachingGrid(weekFor(s, grade)).length;
      const demand = rows.reduce((sum, row) => sum + row.weeklyPeriods, 0);
      if (demand <= slots) continue;

      const balanceRows: BalanceRow[] = rows.filter((row) => !strict.has(row.id)).map((row) => ({
        id: row.id,
        subjectName: row.subjectName,
        weeklyPeriods: row.weeklyPeriods,
        priority: row.priority,
        edited: Boolean(row.quotaEditedAt),
        signal: !teachers.some((t) => teacherQualifiedFor(t, row.subjectName, grade))
          ? 'no_teacher'
          : row.requiredRoomType ? 'needs_room' : 'staffed',
      }));
      const { targets, remaining } = planBalance(balanceRows, demand - slots);
      if (remaining > 0) {
        unfixable.push({
          rule: 'over_capacity', entity: `grade:${grade}`, grade, blocking: true,
          message: `${grade} needs ${demand} periods a week but has ${slots}; even with every subject at 1 period it is ${remaining} over. Deactivate subjects or add periods.`,
        });
        continue;
      }
      const changed = balanceRows.filter((row) => targets.has(row.id));
      // Say why: an explicit priority decides first, otherwise the data signal.
      const reason = (row: BalanceRow) => (priorityRank(row.priority) !== priorityRank(DEFAULT_PRIORITY) ? `${row.priority} priority` : SIGNAL_NOTE[row.signal]);
      const describe = (row: BalanceRow) => `${row.subjectName} ${row.weeklyPeriods}→${targets.get(row.id)}${reason(row) ? ` (${reason(row)})` : ''}`;
      fixes.push({
        rule: 'over_capacity',
        tier: 2,
        entity: `grade:${grade}`,
        summary: `${grade} reduced from ${demand} → ${slots} periods: ${changed.map(describe).join(', ')}`,
        before: { grade, demand, slots, quotas: Object.fromEntries(changed.map((row) => [row.subjectName, row.weeklyPeriods])) },
        after: { grade, demand: slots, slots, quotas: Object.fromEntries(changed.map((row) => [row.subjectName, targets.get(row.id)])) },
        changes: changed.map((row) => ({ model: 'gradeSubjectConfig', id: row.id, before: { weeklyPeriods: row.weeklyPeriods }, after: { weeklyPeriods: targets.get(row.id)! } })),
        // An undo holds until the school changes something itself: the grade's
        // week (slots) or a quota set by hand. Other automatic fixes (merges)
        // do not re-open it.
        suppressKey: `over_capacity:${grade}:${slots}:${rows.map((row) => row.quotaEditedAt ?? '').sort().at(-1) || 'never-edited'}`,
        ifSuppressed: {
          rule: 'over_capacity', entity: `grade:${grade}`, grade, blocking: true,
          message: `${grade} needs ${demand} periods a week but has ${slots}. The automatic balancing was undone, so generation for this grade waits until the quotas are changed.`,
        },
      });
    }
    return { fixes, unfixable };
  },
};

/** Run order matters: the school's own merge rules, placeholders, names, then limits. */
export const RULES: Rule[] = [mergeRules, autoCreatedRows, duplicateGrades, duplicateSubjects, displayNames, dailyCapTooLow, bellRules, overCapacity];
