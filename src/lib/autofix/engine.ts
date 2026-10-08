import { AUTOFIX_MAX_ITERATIONS } from '@/lib/scheduling-constants';
import { RULES, type Rule, type RuleContext } from '@/lib/autofix/rules';
import { applyChanges, cloneSnapshot } from '@/lib/autofix/snapshot-ops';
import type { EngineResult, Fix, Snapshot, Unfixable } from '@/lib/autofix/types';

/**
 * Runs every rule over a copy of the snapshot. Each rule is asked repeatedly;
 * its first fix that was not undone before is applied, until it has nothing
 * left. Pure: no database access, so a dry run and a real run compute exactly
 * the same fixes.
 */
export function runEngine(snapshot: Snapshot, ctx: RuleContext, rules: Rule[] = RULES): EngineResult {
  const working = cloneSnapshot(snapshot);
  const suppressedKeys = new Set(snapshot.suppressed);
  const fixes: Fix[] = [];
  const suppressed = new Map<string, Fix>();
  const unfixable: Unfixable[] = [];

  for (const rule of rules) {
    let last: Unfixable[] = [];
    for (let iteration = 0; ; iteration++) {
      if (iteration >= AUTOFIX_MAX_ITERATIONS) throw new Error(`Auto-fix rule ${rule.id} did not settle`);
      const output = rule.run(working, ctx);
      last = output.unfixable;
      for (const fix of output.fixes) if (suppressedKeys.has(fix.suppressKey)) suppressed.set(fix.suppressKey, fix);
      const next = output.fixes.find((fix) => !suppressedKeys.has(fix.suppressKey));
      if (!next) break;
      applyChanges(working, next.changes);
      fixes.push(next);
    }
    unfixable.push(...last);
  }

  for (const fix of suppressed.values()) if (fix.ifSuppressed) unfixable.push(fix.ifSuppressed);
  return { fixes, unfixable, suppressed: [...suppressed.values()], after: working };
}
