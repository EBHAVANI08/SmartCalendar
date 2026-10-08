import { runEngine } from '@/lib/autofix/engine';
import { loadSnapshot, persistFixes } from '@/lib/autofix/store';
import type { Fix, Unfixable } from '@/lib/autofix/types';

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
}

/**
 * Runs the auto-fix engine for one school. Dry run by default; with
 * `apply: true` each fix is written with its AutoFixLog entry.
 */
export async function runAutofix(
  schoolId: string,
  options: { apply?: boolean; trigger: string; actor?: string | null; now?: Date } ,
): Promise<AutofixRun> {
  const snapshot = await loadSnapshot(schoolId);
  const result = runEngine(snapshot, { now: (options.now ?? new Date()).toISOString() });
  const logIds = options.apply && result.fixes.length
    ? await persistFixes(schoolId, result.fixes, { trigger: options.trigger, actor: options.actor })
    : [];
  return { fixes: result.fixes, unfixable: result.unfixable, suppressed: result.suppressed, logIds };
}

/**
 * For save handlers: apply fixes after a School Setup change and return a
 * short summary for the response. Never fails the save itself.
 */
export async function autofixAfterSave(schoolId: string, trigger: string, actor?: string | null) {
  try {
    const run = await runAutofix(schoolId, { apply: true, trigger, actor });
    return {
      applied: run.logIds.length,
      fixes: run.fixes.map((fix) => ({ rule: fix.rule, tier: fix.tier, summary: fix.summary })),
      blocking: run.unfixable.filter((item) => item.blocking).map((item) => item.message),
    };
  } catch (error) {
    console.error('[autofix] after save failed:', error);
    return { applied: 0, fixes: [], blocking: [], error: 'Automatic setup checks could not run.' };
  }
}
