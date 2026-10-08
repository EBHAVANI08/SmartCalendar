'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CalendarClock, Save, Loader2, Info, CheckCircle2,
  AlertTriangle, Copy, Layers, Building2, Check, Sparkles, Sliders
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

interface GradeDayConfig {
  enabled?: boolean;
  workingDays?: number;
  periodsPerDay?: number;
  saturdayPeriods?: number;
  perDayPeriods?: Record<string, number>;
  startTime?: string;
  endTime?: string;
  breakEnabled?: boolean;
  breakAfter?: number;
  breakMinutes?: number;
  lunchEnabled?: boolean;
  lunchAfter?: number;
  lunchMinutes?: number;
}

export default function DayConfigPage({ onSaved }: { onSaved?: () => void } = {}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Available grades in school
  const [availableGrades, setAvailableGrades] = useState<string[]>([]);
  // Selected grade tab ('__school__' for School Default, or 'Grade 1', 'Grade 2', etc.)
  const [selectedGrade, setSelectedGrade] = useState<string>('__school__');

  // All grade configs map
  const [gradeConfigs, setGradeConfigs] = useState<Record<string, GradeDayConfig>>({});

  // Active form state
  const [configured, setConfigured] = useState(false);
  const [isCustomGrade, setIsCustomGrade] = useState(false);
  const [workingDays, setWorkingDays] = useState(6);
  const [perDay, setPerDay] = useState<Record<string, number>>({});
  const [times, setTimes] = useState({
    startTime: '08:00', endTime: '15:00',
    breakEnabled: true, breakAfter: 2, breakMinutes: 15,
    lunchEnabled: true, lunchAfter: 4, lunchMinutes: 30,
  });
  // Server-side bell validation messages from the last save attempt.
  const [bellErrors, setBellErrors] = useState<string[]>([]);

  // Base school default snapshot (for reference / reset)
  const [schoolDefault, setSchoolDefault] = useState<{
    workingDays: number;
    perDay: Record<string, number>;
    times: { startTime: string; endTime: string; breakEnabled: boolean; breakAfter: number; breakMinutes: number; lunchEnabled: boolean; lunchAfter: number; lunchMinutes: number };
  }>({
    workingDays: 6,
    perDay: { Monday: 8, Tuesday: 8, Wednesday: 8, Thursday: 8, Friday: 8, Saturday: 5 },
    times: { startTime: '08:00', endTime: '15:00', breakEnabled: true, breakAfter: 2, breakMinutes: 15, lunchEnabled: true, lunchAfter: 4, lunchMinutes: 30 },
  });

  // Batch copy modal state
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchSelectedGrades, setBatchSelectedGrades] = useState<string[]>([]);
  const [batchApplying, setBatchApplying] = useState(false);

  // Impact warning dialog state
  const [impact, setImpact] = useState<{ day: string; proposed: number; highestInUse: number; over: number }[] | null>(null);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async (gradeToLoad = selectedGrade) => {
    setLoading(true);
    try {
      const url = gradeToLoad !== '__school__'
        ? `/api/school/day-config?grade=${encodeURIComponent(gradeToLoad)}`
        : '/api/school/day-config';

      const res = await fetch(url);
      const data = await res.json();
      if (res.ok && data.success) {
        const c = data.config;
        const sDef = data.schoolDefaultConfig || c;

        setAvailableGrades(data.availableGrades || []);
        setGradeConfigs(data.gradeConfigs || {});

        // Store School Default snapshot
        const sMap: Record<string, number> = {};
        DAYS.forEach((d) => {
          sMap[d] = sDef.perDayPeriods?.[d] ?? (d === 'Saturday' ? 5 : sDef.periodsPerDay ?? 8);
        });
        setSchoolDefault({
          workingDays: sDef.workingDays ?? 6,
          perDay: sMap,
          times: {
            startTime: sDef.startTime || '08:00',
            endTime: sDef.endTime || '15:00',
            breakEnabled: sDef.breakEnabled ?? (sDef.breakMinutes ?? 0) > 0,
            breakAfter: sDef.breakAfter ?? 2,
            breakMinutes: sDef.breakMinutes ?? 15,
            lunchEnabled: sDef.lunchEnabled ?? (sDef.lunchMinutes ?? 0) > 0,
            lunchAfter: sDef.lunchAfter ?? 4,
            lunchMinutes: sDef.lunchMinutes ?? 30,
          },
        });

        // Set Active Tab Form
        setConfigured(c.configured);
        const isCustom = gradeToLoad !== '__school__' && Boolean(c.isGradeCustom);
        setIsCustomGrade(isCustom);
        setWorkingDays(c.workingDays ?? 6);

        const map: Record<string, number> = {};
        DAYS.forEach((d) => {
          map[d] = c.perDayPeriods?.[d] ?? (d === 'Saturday' ? 5 : c.periodsPerDay ?? 8);
        });
        setPerDay(map);
        setTimes({
          startTime: c.startTime || '08:00',
          endTime: c.endTime || '15:00',
          breakEnabled: c.breakEnabled ?? (c.breakMinutes ?? 0) > 0,
          breakAfter: c.breakAfter ?? 2,
          breakMinutes: c.breakMinutes ?? 15,
          lunchEnabled: c.lunchEnabled ?? (c.lunchMinutes ?? 0) > 0,
          lunchAfter: c.lunchAfter ?? 4,
          lunchMinutes: c.lunchMinutes ?? 30,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [selectedGrade]);

  useEffect(() => { load(selectedGrade); }, [selectedGrade, load]);

  const handleSelectGradeTab = (gradeKey: string) => {
    setSelectedGrade(gradeKey);
  };

  const handleToggleCustom = (checked: boolean) => {
    setIsCustomGrade(checked);
    if (!checked) {
      // Revert in-memory values to school default baseline
      setWorkingDays(schoolDefault.workingDays);
      setPerDay({ ...schoolDefault.perDay });
      setTimes({ ...schoolDefault.times });
    }
  };

  const handleCopyFromDefault = () => {
    setWorkingDays(schoolDefault.workingDays);
    setPerDay({ ...schoolDefault.perDay });
    setTimes({ ...schoolDefault.times });
    toast({ title: 'Values copied', description: 'Populated with School Default values. Click Save to apply.' });
  };

  /**
   * Before saving, check what the proposed week would do to lessons already on
   * the timetable.
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
      const isGradeScope = selectedGrade !== '__school__';

      const payload: any = {
        workingDays,
        periodsPerDay: perDay.Monday ?? 8,
        saturdayPeriods: perDay.Saturday ?? 5,
        perDayPeriods: perDay,
        ...times,
      };

      if (isGradeScope) {
        payload.grade = selectedGrade;
        payload.enabled = isCustomGrade;
      }

      const res = await fetch('/api/school/day-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setBellErrors(Array.isArray(data.errors) ? data.errors : data.error ? [data.error] : []);
        toast({ title: 'Not saved', description: data.error, variant: 'destructive' });
        return;
      }
      setBellErrors([]);
      setConfigured(true);
      toast({
        title: isGradeScope
          ? `${selectedGrade} Configuration Saved`
          : 'School Default Configuration Saved',
        description: `${data.totalWeeklyPeriods} teaching periods per week for this scope.`,
      });
      await load(selectedGrade);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  const handleBatchApply = async () => {
    if (batchSelectedGrades.length === 0) {
      toast({ title: 'No grades selected', description: 'Please select at least one grade to apply.', variant: 'destructive' });
      return;
    }

    setBatchApplying(true);
    try {
      const payload = {
        targetGrades: batchSelectedGrades,
        enabled: true,
        workingDays,
        periodsPerDay: perDay.Monday ?? 8,
        saturdayPeriods: perDay.Saturday ?? 5,
        perDayPeriods: perDay,
        ...times,
      };

      const res = await fetch('/api/school/day-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'Batch apply failed', description: data.error, variant: 'destructive' });
        return;
      }

      toast({
        title: 'Batch Configuration Applied',
        description: `Applied schedule to ${batchSelectedGrades.length} grade(s): ${batchSelectedGrades.join(', ')}`,
      });
      setBatchModalOpen(false);
      setBatchSelectedGrades([]);
      await load(selectedGrade);
      onSaved?.();
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Network error', variant: 'destructive' });
    } finally {
      setBatchApplying(false);
    }
  };

  const activeDays = DAYS.slice(0, workingDays);
  const weeklyTotal = activeDays.reduce((sum, d) => sum + (perDay[d] ?? 0), 0);
  const isGradeScope = selectedGrade !== '__school__';

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2">
            <CalendarClock className="w-6 h-6 text-blue-600" /> Day &amp; Period Configuration
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Configure working days, period counts, and bell timings. Set a <strong>School Default</strong> or customize <strong>per Grade</strong> (e.g. Primary vs High School).
          </p>
        </div>

        {isGradeScope && isCustomGrade && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setBatchSelectedGrades(availableGrades.filter((g) => g !== selectedGrade));
              setBatchModalOpen(true);
            }}
            className="text-xs font-bold gap-1.5 h-9 border-blue-200 text-blue-700 bg-blue-50/50 hover:bg-blue-100/80 shrink-0"
          >
            <Copy className="w-3.5 h-3.5" />
            Apply to other grades…
          </Button>
        )}
      </div>

      {/* ── Grade Selector Pills ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-blue-600" /> Select Scope / Grade
          </Label>
          <span className="text-[11px] text-slate-400">
            {Object.keys(gradeConfigs).filter((k) => gradeConfigs[k]?.enabled !== false).length} custom grade override(s) active
          </span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
          {/* School Default Tab */}
          <button
            type="button"
            data-testid="day-config-tab-school-default"
            onClick={() => handleSelectGradeTab('__school__')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 border ${
              selectedGrade === '__school__'
                ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Building2 className="w-3.5 h-3.5 text-blue-400" />
            <span>School Default</span>
            <Badge className={`text-[9px] px-1.5 py-0 uppercase font-black tracking-wider border-none ${
              selectedGrade === '__school__' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
            }`}>
              Baseline
            </Badge>
          </button>

          {/* Grade Tabs */}
          {availableGrades.map((g) => {
            const hasCustom = Boolean(gradeConfigs[g] && gradeConfigs[g].enabled !== false);
            const isTabActive = selectedGrade === g;

            return (
              <button
                key={g}
                type="button"
                data-testid={`day-config-tab-${g.replace(/\s+/g, '-').toLowerCase()}`}
                onClick={() => handleSelectGradeTab(g)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all shrink-0 border ${
                  isTabActive
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : hasCustom
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100/70'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span>{g}</span>
                {hasCustom ? (
                  <Badge className={`text-[9px] px-1.5 py-0 uppercase font-bold border-none ${
                    isTabActive ? 'bg-white/25 text-white' : 'bg-emerald-200 text-emerald-900'
                  }`}>
                    Custom
                  </Badge>
                ) : (
                  <span className={`text-[9px] ${isTabActive ? 'text-blue-100' : 'text-slate-400'}`}>
                    Default
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Grade Custom Override Banner / Toggle ── */}
      {isGradeScope && (
        <Card className="border-blue-200 bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-white shadow-xs rounded-2xl">
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shrink-0 shadow-sm mt-0.5 font-black text-xs">
                {selectedGrade.replace(/\D/g, '') || selectedGrade.substring(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="text-xs sm:text-sm font-bold text-slate-900">
                  {selectedGrade} Schedule &amp; Period Settings
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {isCustomGrade
                    ? `Using a dedicated custom schedule for ${selectedGrade}. Changes apply strictly to ${selectedGrade}.`
                    : `Currently inheriting the School Default schedule (${schoolDefault.workingDays} days, ${schoolDefault.times.startTime} – ${schoolDefault.times.endTime}).`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 self-end sm:self-center">
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
                <Label htmlFor="custom-grade-switch" className="text-xs font-bold text-slate-700 cursor-pointer">
                  Custom Schedule
                </Label>
                <Switch
                  id="custom-grade-switch"
                  checked={isCustomGrade}
                  onCheckedChange={handleToggleCustom}
                />
              </div>

              {isCustomGrade && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCopyFromDefault}
                  className="text-[11px] font-bold text-slate-600 hover:text-slate-900 h-8 gap-1"
                >
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  Reset to Default
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Non-configured info alert for school default ── */}
      {!configured && !loading && !isGradeScope && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-blue-50 border border-blue-200">
          <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-bold text-blue-900">School Defaults not saved yet</p>
            <p className="text-blue-800 mt-0.5">
              The values below are baseline defaults. Save them to make this the active shared configuration for your school.
            </p>
          </div>
        </div>
      )}

      {/* ── Form Fields Grid ── */}
      <div className={`grid grid-cols-1 lg:grid-cols-3 gap-6 transition-opacity ${
        isGradeScope && !isCustomGrade ? 'opacity-70' : 'opacity-100'
      }`}>
        {/* Left Column: Working Days and Periods per Day */}
        <Card className="lg:col-span-2 border-slate-200 shadow-xs rounded-3xl overflow-hidden">
          <CardHeader className="p-5 pb-3 flex flex-row items-center justify-between border-b border-slate-100 bg-slate-50/50">
            <div>
              <CardTitle className="text-sm sm:text-base font-bold text-slate-900">
                Periods per day {isGradeScope && `(${selectedGrade})`}
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-0.5">
                Number of instructional teaching periods assigned per day.
              </CardDescription>
            </div>
            <Badge variant="outline" className="bg-white border-blue-200 text-blue-700 font-bold text-xs">
              {weeklyTotal} periods / week
            </Badge>
          </CardHeader>

          <CardContent className="p-5 space-y-4">
            <div>
              <Label className="text-xs font-bold text-slate-700">Working days</Label>
              <Select
                value={String(workingDays)}
                disabled={isGradeScope && !isCustomGrade}
                onValueChange={(v) => setWorkingDays(Number(v))}
              >
                <SelectTrigger className="w-[240px] mt-1 text-xs rounded-xl h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 — Monday to Friday</SelectItem>
                  <SelectItem value="6">6 — Monday to Saturday</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="divide-y border border-slate-200 rounded-2xl overflow-hidden bg-white">
              {DAYS.map((day) => {
                const active = activeDays.includes(day);
                return (
                  <div
                    key={day}
                    className={`flex items-center justify-between px-4 py-3 ${
                      active ? 'bg-white' : 'bg-slate-50/60 opacity-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-xs text-slate-800 w-28">{day}</span>
                      {day === 'Saturday' && active && (
                        <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 font-bold">
                          often a short day
                        </Badge>
                      )}
                      {!active && <span className="text-[11px] text-slate-400 font-medium">not a working day</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={12}
                        disabled={!active || (isGradeScope && !isCustomGrade)}
                        className="w-20 h-8 text-center text-xs font-bold rounded-xl"
                        value={perDay[day] ?? 0}
                        onChange={(e) => setPerDay({ ...perDay, [day]: Number(e.target.value) })}
                      />
                      <span className="text-xs text-slate-500 w-14 font-medium">periods</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Right Column: School Hours & Breaks */}
        <Card className="border-slate-200 shadow-xs rounded-3xl overflow-hidden">
          <CardHeader className="p-5 pb-3 border-b border-slate-100 bg-slate-50/50">
            <CardTitle className="text-sm sm:text-base font-bold text-slate-900">
              School Hours &amp; Breaks
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 mt-0.5">
              Daily bell schedule &amp; recess timings.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">Start Time</Label>
                <Input
                  type="time"
                  disabled={isGradeScope && !isCustomGrade}
                  value={times.startTime}
                  onChange={(e) => setTimes({ ...times, startTime: e.target.value })}
                  className="text-xs rounded-xl h-9"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">End Time</Label>
                <Input
                  type="time"
                  disabled={isGradeScope && !isCustomGrade}
                  value={times.endTime}
                  onChange={(e) => setTimes({ ...times, endTime: e.target.value })}
                  className="text-xs rounded-xl h-9"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 space-y-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Recess &amp; Breaks</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 flex items-center justify-between">
                  <Label className="text-xs text-slate-600 font-medium">Short break</Label>
                  <Switch
                    checked={times.breakEnabled}
                    disabled={isGradeScope && !isCustomGrade}
                    onCheckedChange={(checked) => setTimes({ ...times, breakEnabled: checked })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600 font-medium">Break after period</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    disabled={(isGradeScope && !isCustomGrade) || !times.breakEnabled}
                    value={times.breakAfter}
                    onChange={(e) => setTimes({ ...times, breakAfter: Number(e.target.value) })}
                    className="text-xs rounded-xl h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600 font-medium">Break duration</Label>
                  <Input
                    type="number"
                    min={1}
                    max={60}
                    disabled={(isGradeScope && !isCustomGrade) || !times.breakEnabled}
                    value={times.breakMinutes}
                    onChange={(e) => setTimes({ ...times, breakMinutes: Number(e.target.value) })}
                    className="text-xs rounded-xl h-9"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="col-span-2 flex items-center justify-between">
                  <Label className="text-xs text-slate-600 font-medium">Lunch</Label>
                  <Switch
                    checked={times.lunchEnabled}
                    disabled={isGradeScope && !isCustomGrade}
                    onCheckedChange={(checked) => setTimes({ ...times, lunchEnabled: checked })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600 font-medium">Lunch after period</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    disabled={(isGradeScope && !isCustomGrade) || !times.lunchEnabled}
                    value={times.lunchAfter}
                    onChange={(e) => setTimes({ ...times, lunchAfter: Number(e.target.value) })}
                    className="text-xs rounded-xl h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-600 font-medium">Lunch duration</Label>
                  <Input
                    type="number"
                    min={1}
                    max={90}
                    disabled={(isGradeScope && !isCustomGrade) || !times.lunchEnabled}
                    value={times.lunchMinutes}
                    onChange={(e) => setTimes({ ...times, lunchMinutes: Number(e.target.value) })}
                    className="text-xs rounded-xl h-9"
                  />
                </div>
              </div>

              {/* Corrected automatically on save by the auto-fix engine (logged, undoable). */}
              {[
                ...(times.breakEnabled && !(times.breakMinutes > 0) ? ['The short break is on but lasts 0 minutes; it will be switched off.'] : []),
                ...(times.lunchEnabled && !(times.lunchMinutes > 0) ? ['Lunch is on but lasts 0 minutes; it will be switched off.'] : []),
                ...(times.breakEnabled && times.lunchEnabled && times.breakAfter === times.lunchAfter
                  ? [`The short break and lunch are both after period ${times.breakAfter}; the shorter one will be switched off.`]
                  : []),
              ].map((message) => (
                <p key={message} className="flex items-start gap-1.5 text-[11px] text-amber-700">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> On save: {message}
                </p>
              ))}
              {/* Problems that cannot be corrected automatically; the save was refused. */}
              {bellErrors.map((message) => (
                <p key={message} className="flex items-start gap-1.5 text-[11px] text-rose-700">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {message}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Footer Save Bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <p className="text-xs text-slate-500">
          {configured ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-700 font-bold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              {isGradeScope
                ? (isCustomGrade ? `${selectedGrade} Custom Schedule active` : `${selectedGrade} Inherits School Default`)
                : 'School Default Schedule active'}
            </span>
          ) : (
            'Unsaved defaults'
          )}
        </p>

        <div className="flex items-center gap-2">
          {isGradeScope && isCustomGrade && (
            <Button
              variant="outline"
              onClick={() => {
                setBatchSelectedGrades(availableGrades.filter((g) => g !== selectedGrade));
                setBatchModalOpen(true);
              }}
              className="text-xs font-bold h-9 gap-1.5 rounded-xl border-slate-200"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy to other grades…
            </Button>
          )}

          <Button
            onClick={checkImpact}
            disabled={saving || checking || loading}
            data-testid="save-day-config"
            className="bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 hover:from-blue-800 hover:to-slate-950 text-white font-bold text-xs h-9 px-5 rounded-xl shadow-md gap-1.5"
          >
            {saving || checking ? <Loader2 className="w-4 h-4 animate-spin text-amber-300" /> : <Save className="w-4 h-4 text-amber-300" />}
            <span>
              {checking ? 'Checking impact…' : saving ? 'Saving…' : isGradeScope ? `Save ${selectedGrade} Config` : 'Save School Default'}
            </span>
          </Button>
        </div>
      </div>

      {/* ── Batch Copy Modal ── */}
      <Dialog open={batchModalOpen} onOpenChange={setBatchModalOpen}>
        <DialogContent className="max-w-md rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Copy className="w-4 h-4 text-blue-600" />
              Apply {selectedGrade} Configuration to Other Grades
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Copy working days ({workingDays} days, {weeklyTotal} periods/wk) and timings ({times.startTime} – {times.endTime}) to selected grades.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-700">Select Target Grades:</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBatchSelectedGrades(availableGrades.filter((g) => g !== selectedGrade))}
                  className="text-[11px] text-blue-600 font-bold hover:underline"
                >
                  Select All
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() => setBatchSelectedGrades([])}
                  className="text-[11px] text-slate-500 font-medium hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto p-1">
              {availableGrades.filter((g) => g !== selectedGrade).map((g) => {
                const isSelected = batchSelectedGrades.includes(g);
                return (
                  <label
                    key={g}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50 text-blue-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setBatchSelectedGrades([...batchSelectedGrades, g]);
                        } else {
                          setBatchSelectedGrades(batchSelectedGrades.filter((x) => x !== g));
                        }
                      }}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>{g}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBatchModalOpen(false)}
              disabled={batchApplying}
              className="text-xs rounded-xl"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleBatchApply}
              disabled={batchApplying || batchSelectedGrades.length === 0}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl gap-1.5"
            >
              {batchApplying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              <span>Apply to {batchSelectedGrades.length} Grade(s)</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Impact Warning Dialog ── */}
      <Dialog open={!!impact} onOpenChange={(o) => { if (!o) setImpact(null); }}>
        <DialogContent className="max-w-lg rounded-3xl p-6" data-testid="day-config-impact">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-800 font-bold text-base">
              <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600" />
              Existing lessons fall outside this configuration
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
              {(impact ?? []).map((row) => (
                <div key={row.day} className="px-4 py-2.5 bg-white">
                  <p className="text-xs font-bold text-slate-900">{row.day}</p>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Your timetable uses up to period {row.highestInUse}. Saving {row.proposed} period(s)
                    leaves lessons in P{row.proposed + 1}–P{row.highestInUse}{' '}
                    <span className="font-bold text-amber-800">out of range</span>.
                  </p>
                </div>
              ))}
            </div>

            <div className="p-3.5 rounded-2xl border border-blue-200 bg-blue-50">
              <p className="text-[11px] text-blue-900 leading-relaxed">
                <strong>Nothing is deleted or moved.</strong> Those lessons stay exactly where they are and
                keep running. They will be flagged as migration adjustments so you can resolve them when you
                choose to.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setImpact(null)} disabled={saving} className="text-xs rounded-xl">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={save}
              disabled={saving}
              data-testid="confirm-day-config"
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl"
            >
              {saving ? 'Saving…' : 'Continue and save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

