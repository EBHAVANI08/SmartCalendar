'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Save, Loader2, Info, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export default function DayConfigPage({ onSaved }: { onSaved?: () => void } = {}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Lessons that would fall outside the proposed week. Nothing is deleted;
  // they are reported so the change is made with eyes open.
  const [impact, setImpact] = useState<{ day: string; proposed: number; highestInUse: number; over: number }[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [workingDays, setWorkingDays] = useState(6);
  const [perDay, setPerDay] = useState<Record<string, number>>({});
  const [times, setTimes] = useState({
    startTime: '08:00', endTime: '15:00',
    breakAfter: 2, breakMinutes: 15, lunchAfter: 4, lunchMinutes: 30,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/school/day-config');
      const data = await res.json();
      if (res.ok && data.success) {
        const c = data.config;
        setConfigured(c.configured);
        setWorkingDays(c.workingDays);
        const map: Record<string, number> = {};
        DAYS.forEach((d) => {
          map[d] = c.perDayPeriods?.[d] ?? (d === 'Saturday' ? 5 : c.periodsPerDay ?? 8);
        });
        setPerDay(map);
        setTimes({
          startTime: c.startTime, endTime: c.endTime,
          breakAfter: c.breakAfter, breakMinutes: c.breakMinutes,
          lunchAfter: c.lunchAfter, lunchMinutes: c.lunchMinutes,
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /**
   * Before saving, check what the proposed week would do to lessons already on
   * the timetable. Reducing Saturday from 8 periods to 5 does not delete
   * anything, but it does put existing P6-P8 lessons outside the configured day,
   * and the Admin should learn that before saving rather than after.
   */
  const checkImpact = async () => {
    setChecking(true);
    try {
      const res = await fetch('/api/school/detected-structure');
      if (!res.ok) { await save(); return; }
      const d = await res.json().catch(() => null);
      if (!d?.days) { await save(); return; }

      const affected = (d.days as { day: string; highestInUse: number }[])
        .map((row) => {
          const proposed = workingDays >= 6 || row.day !== 'Saturday' ? (perDay[row.day] ?? 0) : 0;
          const over = row.highestInUse > proposed ? row.highestInUse - proposed : 0;
          return { day: row.day, proposed, highestInUse: row.highestInUse, over };
        })
        .filter((row) => row.over > 0);

      if (!affected.length) { await save(); return; }
      setImpact(affected);
    } finally {
      setChecking(false);
    }
  };

  const save = async () => {
    setImpact(null);
    setSaving(true);
    try {
      const res = await fetch('/api/school/day-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workingDays,
          periodsPerDay: perDay.Monday ?? 8,
          saturdayPeriods: perDay.Saturday ?? 5,
          perDayPeriods: perDay,
          ...times,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'Not saved', description: data.error, variant: 'destructive' });
        return;
      }
      setConfigured(true);
      toast({
        title: 'Configuration saved',
        description: `${data.totalWeeklyPeriods} teaching periods per week. The generator, manual edits and substitution all use this.`,
      });
      await load();
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  const activeDays = DAYS.slice(0, workingDays);
  const weeklyTotal = activeDays.reduce((sum, d) => sum + (perDay[d] ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <CalendarClock className="w-6 h-6 text-blue-600" /> Day &amp; Period Configuration
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          The shape of your teaching week. Every module reads these values — nothing is inferred from
          existing timetable rows.
        </p>
      </div>

      {!configured && !loading && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-50 border border-blue-200">
          <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-blue-900">Not configured yet</p>
            <p className="text-blue-800 mt-0.5">
              The values below are defaults. Save them to make this the shared configuration for your school.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Periods per day</CardTitle>
            <Badge variant="outline" className="bg-slate-50">
              {weeklyTotal} periods / week
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Working days</Label>
              <Select value={String(workingDays)} onValueChange={(v) => setWorkingDays(Number(v))}>
                <SelectTrigger className="w-[220px] mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 — Monday to Friday</SelectItem>
                  <SelectItem value="6">6 — Monday to Saturday</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="divide-y border rounded-lg">
              {DAYS.map((day) => {
                const active = activeDays.includes(day);
                return (
                  <div
                    key={day}
                    className={`flex items-center justify-between px-4 py-3 ${active ? '' : 'opacity-40'}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-slate-800 w-28">{day}</span>
                      {day === 'Saturday' && active && (
                        <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                          often a short day
                        </Badge>
                      )}
                      {!active && <span className="text-xs text-slate-500">not a working day</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number" min={0} max={12} disabled={!active}
                        className="w-24 h-9 text-center"
                        value={perDay[day] ?? 0}
                        onChange={(e) => setPerDay({ ...perDay, [day]: Number(e.target.value) })}
                      />
                      <span className="text-xs text-slate-500 w-14">periods</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">School hours &amp; breaks</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Start</Label>
                <Input type="time" value={times.startTime}
                  onChange={(e) => setTimes({ ...times, startTime: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">End</Label>
                <Input type="time" value={times.endTime}
                  onChange={(e) => setTimes({ ...times, endTime: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Break after period</Label>
                <Input type="number" min={1} max={10} value={times.breakAfter}
                  onChange={(e) => setTimes({ ...times, breakAfter: Number(e.target.value) })} />
              </div>
              <div>
                <Label className="text-xs">Break minutes</Label>
                <Input type="number" min={0} max={60} value={times.breakMinutes}
                  onChange={(e) => setTimes({ ...times, breakMinutes: Number(e.target.value) })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Lunch after period</Label>
                <Input type="number" min={1} max={10} value={times.lunchAfter}
                  onChange={(e) => setTimes({ ...times, lunchAfter: Number(e.target.value) })} />
              </div>
              <div>
                <Label className="text-xs">Lunch minutes</Label>
                <Input type="number" min={0} max={90} value={times.lunchMinutes}
                  onChange={(e) => setTimes({ ...times, lunchMinutes: Number(e.target.value) })} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          {configured
            ? <span className="inline-flex items-center gap-1 text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5" /> Saved configuration is in use
              </span>
            : 'Unsaved defaults'}
        </p>
        <Button onClick={checkImpact} disabled={saving || checking || loading} data-testid="save-day-config">
          {saving || checking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          {checking ? 'Checking impact…' : saving ? 'Saving…' : 'Save configuration'}
        </Button>
      </div>

      {/* What this week would do to lessons already scheduled. */}
      <Dialog open={!!impact} onOpenChange={(o) => { if (!o) setImpact(null); }}>
        <DialogContent className="max-w-lg" data-testid="day-config-impact">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-800 font-bold">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              Existing lessons fall outside this week
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
              {(impact ?? []).map((row) => (
                <div key={row.day} className="px-3 py-2">
                  <p className="text-xs font-bold text-slate-900">{row.day}</p>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Your timetable uses up to period {row.highestInUse}. Saving {row.proposed} period(s)
                    leaves lessons in P{row.proposed + 1}–P{row.highestInUse}{' '}
                    <span className="font-semibold text-amber-800">out of range</span>.
                  </p>
                </div>
              ))}
            </div>

            <div className="p-3 rounded-xl border border-blue-200 bg-blue-50">
              <p className="text-[11px] text-blue-900">
                <strong>Nothing is deleted or moved.</strong> Those lessons stay exactly where they are and
                keep running. They will be reported as migration issues, so you can resolve them when you
                choose to.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setImpact(null)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving} data-testid="confirm-day-config">
              {saving ? 'Saving…' : 'Continue and save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
