import { db } from '@/lib/db';
import { runEngine } from '@/lib/autofix/engine';
import { RULES } from '@/lib/autofix/rules';
import { loadSnapshot, persistFixes } from '@/lib/autofix/store';
import type { Fix, RuleId, Unfixable } from '@/lib/autofix/types';

export type { Fix, Unfixable } from '@/lib/autofix/types';
export { undoFix } from '@/lib/autofix/store';

export interface AutofixRun {
  /** Fixes made (apply) or that would be made (dry run). */
  fixes: Fix[];
  /** Problems left for a person; `blocking` ones stop generation. */
  unfixable: Unfixable[];
  /** Fixes skipped because an admin undid them before. */
  suppressed: Fix[];
  /** AutoFixLog ids written (apply only). */
  logIds: string[];
  /** Groups this run's AutoFixLog rows (apply only). */
  runId: string | null;
}

export interface AutofixOptions {
  apply?: boolean;
  trigger: string;
  actor?: string | null;
  now?: Date;
  /** Which tiers run. Saves run tier 1 only; generation and scripts run both. */
  tiers?: (1 | 2)[];
  /** Run only these rules (tier 1 rules always run first when listed tiers include 1). */
  rules?: (RuleId | 'bell')[];
  /** Limit grade-level balancing to one grade. */
  onlyGrade?: string;
  /** Config rows that must not change (e.g. the row an admin just edited). */
  protectedConfigIds?: string[];
}

/**
 * Runs the auto-fix engine for one school. Dry run by default; with
 * `apply: true` each fix is written with its AutoFixLog entry. This function
 * does not check the school's autofixEnabled setting: callers that act on
 * their own (saves, generation) check it with isAutofixEnabled first; the
 * maintenance script is an explicit owner action.
 */
export async function runAutofix(schoolId: string, options: AutofixOptions): Promise<AutofixRun> {
  const tiers = options.tiers ?? [1, 2];
  const rules = RULES.filter((rule) => tiers.includes(rule.tier) && (!options.rules || options.rules.includes(rule.id as RuleId)));
  const snapshot = await loadSnapshot(schoolId, { protectedConfigIds: options.protectedConfigIds });
  const result = runEngine(snapshot, { now: (options.now ?? new Date()).toISOString(), onlyGrade: options.onlyGrade }, rules);
  const persisted = options.apply && result.fixes.length
    ? await persistFixes(schoolId, result.fixes, { trigger: options.trigger, actor: options.actor })
    : null;
  return { fixes: result.fixes, unfixable: result.unfixable, suppressed: result.suppressed, logIds: persisted?.ids ?? [], runId: persisted?.runId ?? null };
}

/** The per-school switch (SchoolFeatureFlags.autofixEnabled). Missing means off. */
export async function isAutofixEnabled(schoolId: string): Promise<boolean> {
  const flags = await db.schoolFeatureFlags.findUnique({ where: { schoolId }, select: { autofixEnabled: true } }).catch(() => null);
  return flags?.autofixEnabled === true;
}

/**
 * For School Setup save handlers: tier 1 fixes only (names, caps, bell).
 * Quotas are never balanced on save. When the school has automatic fixes
 * switched off, nothing is written and the response says what would change.
 * Never fails the save itself.
 */
export async function autofixAfterSave(schoolId: string, trigger: string, actor?: string | null) {
  try {
    const enabled = await isAutofixEnabled(schoolId);
    const run = await runAutofix(schoolId, { apply: enabled, trigger, actor, tiers: [1] });
    return {
      enabled,
      applied: run.logIds.length,
      fixes: run.fixes.map((fix) => ({ rule: fix.rule, tier: fix.tier, summary: fix.summary })),
      blocking: run.unfixable.filter((item) => item.blocking).map((item) => item.message),
    };
  } catch (error) {
    console.error('[autofix] after save failed:', error);
    return { enabled: false, applied: 0, fixes: [], blocking: [], error: 'Automatic setup checks could not run.' };
  }
}
