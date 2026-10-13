'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { impactText } from '@/lib/settings-impact-text';

/**
 * One teacher's workload limits and unavailable periods. A teacher follows the
 * school's defaults until given personal limits; "Use school defaults" removes
 * the personal rule again. The period grid is the school's own week.
 */

interface WorkloadItem {
  id: string;
  limits: { maxWeekly: number | null; maxDaily: number | null; maxConsecutive: number | null; source: 'personal' | 'school' | 'missing'; unavailable: { day: string; period: number }[] };
  load: { weekly: number };
  problems: string[];
}

interface WorkloadResponse {
  defaults: { maxWeekly: number | null; maxDaily: number | null; maxConsecutive: number | null };
  defaultsSet: boolean;
  week: { configured: boolean; days: { day: string; periods: number }[]; longestDay: number };
  teachers: WorkloadItem[];
}

const SOURCE_TEXT = {
  personal: 'Personal limits',
  school: 'Following the school defaults',
  missing: 'No limits set — the school has no defaults either',
} as const;

export function TeacherWorkloadEditor({ teacherId, teacherName, onSaved }: { teacherId: string; teacherName: string; onSaved?: () => void }) {
  const { toast } = useToast();
  const [data, setData] = useState<WorkloadResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [form, setForm] = useState({ maxWeekly: '', maxDaily: '', maxConsecutive: '' });
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch('/api/teachers/workload');
      if (!res.ok) throw new Error(String(res.status));
      const body: WorkloadResponse = await res.json();
      setData(body);
      const mine = body.teachers.find((t) => t.id === teacherId);
      const start = mine?.limits.source === 'personal' ? mine.limits : body.defaults;
      setForm({
        maxWeekly: start.maxWeekly?.toString() ?? '',
        maxDaily: start.maxDaily?.toString() ?? '',
        maxConsecutive: start.maxConsecutive?.toString() ?? '',
      });
      setBlocked(new Set((mine?.limits.unavailable ?? []).map((u) => `${u.day}|${u.period}`)));
    } catch {
      setFailed(true);
    }
  }, [teacherId]);

  useEffect(() => { load(); }, [load]);

  if (failed) return <p className="text-xs text-amber-800">Workload limits could not be loaded. <button type="button" className="underline" onClick={load}>Try again</button></p>;
  if (!data) return <p className="text-xs text-slate-500 flex items-center gap-1.5"><RefreshCw className="w-3 h-3 animate-spin" /> Loading workload limits…</p>;

  const mine = data.teachers.find((t) => t.id === teacherId);
  const source = mine?.limits.source ?? (data.defaultsSet ? 'school' : 'missing');
  const toggle = (key: string) => setBlocked((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const save = async () => {
    setSaving(true);
    setErrors([]);
    try {
      const res = await fetch(`/api/teachers/${encodeURIComponent(teacherId)}/workload-rule`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxWeekly: form.maxWeekly, maxDaily: form.maxDaily, maxConsecutive: form.maxConsecutive,
          unavailableSlots: [...blocked].map((key) => { const [day, period] = key.split('|'); return { day, period: Number(period) }; }),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setErrors(body.errors ?? [body.error ?? `HTTP ${res.status}`]); return; }
      toast({ title: 'Workload limits saved', description: [`${teacherName} now has personal limits.`, impactText(body.impact)].filter(Boolean).join(' ') });
      await load();
      onSaved?.();
    } catch {
      setErrors(['Could not reach the server. Nothing was saved.']);
    } finally {
      setSaving(false);
    }
  };

  const useDefaults = async () => {
    setSaving(true);
    setErrors([]);
    try {
      const res = await fetch(`/api/teachers/${encodeURIComponent(teacherId)}/workload-rule`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      const body = await res.json().catch(() => ({}));
      toast({ title: 'Using school defaults', description: [`${teacherName}'s personal limits and unavailable periods were removed.`, impactText(body.impact)].filter(Boolean).join(' ') });
      await load();
      onSaved?.();
    } catch {
      setErrors(['Could not remove the personal limits. Please try again.']);
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof typeof form, label: string) => (
    <div className="space-y-1">
      <Label className="text-[11px] font-semibold text-slate-600">{label}</Label>
      <Input type="number" min={1} value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} className="h-8 text-xs" data-testid={`workload-${key}`} />
    </div>
  );

  return (
    <div className="space-y-3" data-testid="teacher-workload-editor">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-600">
          <span className="font-semibold text-slate-800">{SOURCE_TEXT[source]}</span>
          {mine ? ` · teaches ${mine.load.weekly} period(s) a week in the timetable in use` : ''}
        </p>
        {source === 'missing' && (
          <Link href="/settings?tab=timetable&sub=workload" className="text-[11px] font-semibold text-blue-700 underline">Set school defaults</Link>
        )}
      </div>
      {mine && mine.problems.length > 0 && (
        <ul className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-2 py-1 list-disc list-inside">
          {mine.problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
      <div className="grid grid-cols-3 gap-2">
        {field('maxWeekly', 'Periods per week')}
        {field('maxDaily', 'Periods per day')}
        {field('maxConsecutive', 'Periods in a row')}
      </div>

      {data.week.configured && data.week.days.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-slate-600 mb-1">Unavailable periods (click to mark)</p>
          <div className="overflow-x-auto">
            <table className="text-[10px] border-collapse">
              <thead>
                <tr>
                  <th className="px-1" />
                  {Array.from({ length: data.week.longestDay }, (_, i) => <th key={i} className="px-1 font-semibold text-slate-500">P{i + 1}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.week.days.map(({ day, periods }) => (
                  <tr key={day}>
                    <td className="pr-2 font-semibold text-slate-600">{day.slice(0, 3)}</td>
                    {Array.from({ length: data.week.longestDay }, (_, i) => {
                      const period = i + 1;
                      const key = `${day}|${period}`;
                      if (period > periods) return <td key={key} className="w-7 h-6 bg-slate-50" />;
                      const off = blocked.has(key);
                      return (
                        <td key={key} className="p-0.5">
                          <button type="button" onClick={() => toggle(key)} aria-pressed={off} title={`${day} P${period}${off ? ' — unavailable' : ''}`}
                            className={`w-6 h-5 rounded border ${off ? 'bg-rose-500 border-rose-600' : 'bg-white border-slate-200 hover:bg-slate-100'}`} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {errors.length > 0 && <p className="text-[11px] text-rose-700">{errors.join(' ')}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" className="h-8 text-xs" disabled={saving} onClick={save} data-testid="workload-save">
          {saving ? 'Saving…' : 'Save personal limits'}
        </Button>
        {source === 'personal' && (
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs" disabled={saving} onClick={useDefaults}>
            Use school defaults
          </Button>
        )}
      </div>
    </div>
  );
}
