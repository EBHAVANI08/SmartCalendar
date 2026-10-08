'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RotateCcw, Wand2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

export interface AutoFixEntry {
  id: string;
  rule: string;
  tier: number;
  entity: string;
  summary: string;
  trigger: string;
  appliedAt: string;
  appliedBy: string | null;
  undoneAt: string | null;
  undoneBy: string | null;
}

const RULE_LABELS: Record<string, string> = {
  auto_created_rows: 'Auto-created rows',
  duplicate_grade: 'Duplicate grade',
  duplicate_subject: 'Duplicate subject',
  display_name: 'Name tidied',
  daily_cap_too_low: 'Daily limit',
  break_zero_minutes: 'Break with no time',
  break_out_of_range: 'Break position',
  break_same_period: 'Break and lunch together',
  over_capacity: 'Weekly periods reduced',
};

const TRIGGER_LABELS: Record<string, string> = {
  'save:subjects': 'after a subject change',
  'save:structure': 'after a grade/section change',
  'save:dayconfig': 'after a day & period change',
  generation: 'before generating',
  manual: 'checks run manually',
  script: 'maintenance script',
};

/** Undo one fix; shared by the panel and the dashboard notices. */
export async function undoAutoFix(id: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/school/autofix/undo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  const data = await res.json().catch(() => ({}));
  return res.ok ? { ok: true } : { ok: false, error: data.error || 'Could not undo this fix.' };
}

/** Every automatic setup correction for the school, with Undo. */
export function AutoFixPanel() {
  const { toast } = useToast();
  const [fixes, setFixes] = useState<AutoFixEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/school/autofix');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load automatic fixes.');
      setFixes(data.fixes);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load automatic fixes.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const undo = async (fix: AutoFixEntry) => {
    setBusy(fix.id);
    const result = await undoAutoFix(fix.id);
    setBusy(null);
    toast(result.ok
      ? { title: 'Fix undone', description: 'The previous values are back. This fix will not be re-applied to the same settings.' }
      : { title: 'Not undone', description: result.error, variant: 'destructive' });
    load();
  };

  const runNow = async () => {
    setBusy('run');
    const res = await fetch('/api/school/autofix/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    toast(res.ok
      ? { title: 'Setup checked', description: data.applied ? `${data.applied} correction(s) applied.` : 'Nothing needed correcting.' }
      : { title: 'Check failed', description: data.error || 'Could not run the checks.', variant: 'destructive' });
    load();
  };

  return (
    <Card className="border-slate-200 shadow-sm rounded-3xl">
      <CardHeader className="p-6 pb-4 flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2"><Wand2 className="w-4 h-4" /> Automatic fixes</CardTitle>
          <CardDescription className="text-xs text-slate-500 mt-1">
            Setup mistakes the system corrected by itself. Nothing is deleted; every fix can be undone.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" disabled={busy !== null} onClick={runNow}>
          {busy === 'run' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Run checks now'}
        </Button>
      </CardHeader>
      <CardContent className="p-6 pt-0">
        {error ? (
          <p className="text-xs text-rose-700">{error}</p>
        ) : fixes === null ? (
          <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
        ) : fixes.length === 0 ? (
          <p className="text-xs text-slate-500">No automatic fixes so far.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
            {fixes.map((fix) => (
              <li key={fix.id} className={`flex items-start justify-between gap-3 p-3 ${fix.undoneAt ? 'opacity-60' : ''}`}>
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px]">{RULE_LABELS[fix.rule] ?? fix.rule}</Badge>
                    {fix.tier === 2 && <Badge className="text-[10px] bg-amber-100 text-amber-800 hover:bg-amber-100">Review</Badge>}
                    {fix.undoneAt && <Badge variant="outline" className="text-[10px]">Undone</Badge>}
                  </div>
                  <p className="text-xs text-slate-800 break-words">{fix.summary}</p>
                  <p className="text-[10px] text-slate-400">
                    {new Date(fix.appliedAt).toLocaleString()} · {TRIGGER_LABELS[fix.trigger] ?? fix.trigger}
                    {fix.undoneAt ? ` · undone ${new Date(fix.undoneAt).toLocaleString()}${fix.undoneBy ? ` by ${fix.undoneBy}` : ''}` : ''}
                  </p>
                </div>
                {!fix.undoneAt && (
                  <Button variant="ghost" size="sm" className="shrink-0 text-xs" disabled={busy !== null} onClick={() => undo(fix)}>
                    {busy === fix.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><RotateCcw className="w-3.5 h-3.5 mr-1" /> Undo</>}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
