'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, RefreshCw, UserCog } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { impactText } from '@/lib/settings-impact-text';

/**
 * School Setup → Teacher Workload: the school's default limits, used for every
 * teacher who has no personal limits. Until they are set, timetable generation
 * reports "workload limits missing" instead of guessing.
 */

interface DefaultsResponse {
  defaults: { maxWeekly: number | null; maxDaily: number | null; maxConsecutive: number | null };
  set: boolean;
  week: { configured: boolean; longestDay: number; weeklySlots: number };
  teachers: { active: number; withPersonalRule: number };
  noSameClassBackToBack: boolean;
}

export function WorkloadDefaults() {
  const { toast } = useToast();
  const [data, setData] = useState<DefaultsResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [form, setForm] = useState({ maxWeekly: '', maxDaily: '', maxConsecutive: '' });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch('/api/school/workload-defaults');
      if (!res.ok) throw new Error(String(res.status));
      const body: DefaultsResponse = await res.json();
      setData(body);
      setForm({
        maxWeekly: body.defaults.maxWeekly?.toString() ?? '',
        maxDaily: body.defaults.maxDaily?.toString() ?? '',
        maxConsecutive: body.defaults.maxConsecutive?.toString() ?? '',
      });
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const [savingRule, setSavingRule] = useState(false);
  const saveRule = async (value: boolean) => {
    setSavingRule(true);
    try {
      const res = await fetch('/api/school/workload-defaults', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noSameClassBackToBack: value }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      toast({
        title: value ? 'Rule switched on' : 'Rule switched off',
        description: [value
          ? 'A teacher will not teach the same class two different subjects back to back.'
          : 'A teacher may teach the same class two different subjects back to back.', impactText(body.impact)].filter(Boolean).join(' '),
      });
      await load();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Could not save the rule', description: error instanceof Error ? error.message : 'Unexpected error' });
    } finally {
      setSavingRule(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setErrors([]);
    try {
      const res = await fetch('/api/school/workload-defaults', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setErrors(body.errors ?? [body.error ?? `HTTP ${res.status}`]); return; }
      toast({ title: 'Workload defaults saved', description: [`${form.maxWeekly} a week · ${form.maxDaily} a day · ${form.maxConsecutive} in a row.`, impactText(body.impact)].filter(Boolean).join(' ') });
      await load();
    } catch {
      setErrors(['Could not reach the server. Nothing was saved.']);
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof typeof form, label: string, hint: string) => (
    <div className="space-y-1">
      <Label className="text-xs font-semibold text-slate-700">{label}</Label>
      <Input type="number" min={1} value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} data-testid={`defaults-${key}`} />
      <p className="text-[10px] text-slate-500">{hint}</p>
    </div>
  );

  return (
    <Card className="border-slate-200 shadow-sm rounded-3xl" data-testid="workload-defaults">
      <CardHeader className="p-6 pb-3">
        <CardTitle className="text-base flex items-center gap-2"><UserCog className="w-4 h-4 text-blue-600" /> Teacher workload limits</CardTitle>
        <CardDescription className="text-xs">
          The most a teacher may teach. These defaults apply to every teacher without personal limits; set personal limits and unavailable periods on a teacher in the Faculty Directory.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6 pt-0 space-y-4">
        {failed && <p className="text-xs text-amber-800">Could not load the current limits. <button type="button" className="underline" onClick={load}>Try again</button></p>}
        {!data && !failed && <p className="text-xs text-slate-500 flex items-center gap-1.5"><RefreshCw className="w-3 h-3 animate-spin" /> Loading…</p>}
        {data && (
          <>
            <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${data.set ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
              {data.set ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
              <span>
                {data.set
                  ? `Set. ${data.teachers.withPersonalRule} of ${data.teachers.active} active teacher(s) have personal limits; the rest use these.`
                  : `Not set. Until they are, the timetable cannot be generated for ${data.teachers.active - data.teachers.withPersonalRule} teacher(s) without personal limits.`}
              </span>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              {field('maxWeekly', 'Periods per week', data.week.configured ? `At most ${data.week.weeklySlots}, the periods in your week` : 'Set up Days & Periods first')}
              {field('maxDaily', 'Periods per day', data.week.configured ? `At most ${data.week.longestDay}, your longest day` : '')}
              {field('maxConsecutive', 'Periods in a row', 'Without a free period in between')}
            </div>
            {errors.length > 0 && <p className="text-xs text-rose-700">{errors.join(' ')}</p>}
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" onClick={save} disabled={saving} data-testid="defaults-save">{saving ? 'Saving…' : 'Save defaults'}</Button>
              <Link href="/teachers" className="text-xs font-semibold text-blue-700 underline">Personal limits in the Faculty Directory</Link>
            </div>
            <label className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 cursor-pointer" data-testid="rule-same-class">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={data.noSameClassBackToBack}
                disabled={savingRule}
                onChange={(e) => saveRule(e.target.checked)}
              />
              <span>
                <span className="font-semibold text-slate-800">A teacher does not teach the same class two different subjects back to back</span>
                <span className="block text-[11px] text-slate-500">
                  On by default. A break or lunch in between is fine, different teachers back to back are fine, and double periods of one subject follow the subject's own setting. Clashes, limits and room checks always apply.
                </span>
              </span>
            </label>
          </>
        )}
      </CardContent>
    </Card>
  );
}
