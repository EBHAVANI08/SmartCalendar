'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarPlus, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

interface TeacherOption { id: string; name: string }

const LEAVE_TYPES = [
  'casual', 'sick', 'personal', 'maternity',
  'official_duty', 'training', 'family_emergency', 'medical_appointment',
];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Apply for leave, full day or partial.
 *
 * The backend has always accepted `periods: [1, 3]` for partial-day leave, and
 * affected-period resolution honours it - but there was no way to enter one.
 *
 * The period checkboxes come from the school's own day configuration for the
 * chosen date, so a Saturday configured with 5 periods never offers a 6th.
 */
export function ApplyLeaveDialog({
  open,
  onOpenChange,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied: () => void;
}) {
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);

  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [dayPeriods, setDayPeriods] = useState<Record<string, number>>({});
  const [teacherId, setTeacherId] = useState('');
  const [leaveType, setLeaveType] = useState('casual');
  const [mode, setMode] = useState<'full' | 'partial'>('full');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [selectedPeriods, setSelectedPeriods] = useState<number[]>([]);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOptions = useCallback(async () => {
    try {
      const [tRes, dRes] = await Promise.all([
        fetch('/api/teachers'),
        fetch('/api/school/day-config'),
      ]);
      if (tRes.ok) {
        const t = await tRes.json().catch(() => ({}));
        const list = Array.isArray(t) ? t : t.teachers ?? [];
        setTeachers(list.filter((x: { role?: string }) => x.role !== 'inactive'));
      }
      if (dRes.ok) {
        const d = await dRes.json().catch(() => ({}));
        const map: Record<string, number> = {};
        for (const row of d.days ?? []) map[row.day] = row.periods;
        setDayPeriods(map);
      }
    } catch {
      /* the form still works; the period list just falls back to empty */
    }
  }, []);

  useEffect(() => { if (open) loadOptions(); }, [open, loadOptions]);

  // Which periods exist on the chosen date, per this school's configuration.
  const dayName = useMemo(() => {
    const d = new Date(`${startDate}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : DAY_NAMES[d.getDay()];
  }, [startDate]);

  const availablePeriods = useMemo(() => {
    if (!dayName) return [];
    const count = dayPeriods[dayName] ?? 0;
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [dayName, dayPeriods]);

  // Switching date can invalidate an already-picked period.
  useEffect(() => {
    setSelectedPeriods((prev) => prev.filter((p) => availablePeriods.includes(p)));
  }, [availablePeriods]);

  // Partial-day leave is a single date by definition.
  useEffect(() => {
    if (mode === 'partial') setEndDate(startDate);
  }, [mode, startDate]);

  const togglePeriod = (p: number) =>
    setSelectedPeriods((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p].sort((a, b) => a - b)));

  const isNonTeachingDay = Boolean(dayName && availablePeriods.length === 0);

  const submit = async () => {
    setError(null);
    if (!teacherId) return setError('Choose the teacher this leave is for.');
    if (!reason.trim()) return setError('Give a reason for the leave.');
    if (mode === 'partial' && selectedPeriods.length === 0) {
      return setError('Select at least one period, or switch to Full Day.');
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/leaves/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacherId,
          type: leaveType,
          startDate,
          endDate: mode === 'partial' ? startDate : endDate,
          reason: reason.trim(),
          status: 'pending',
          ...(mode === 'partial' ? { periods: selectedPeriods } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data?.error || `The server rejected the request (HTTP ${res.status}).`);
        return;
      }

      toast({
        title: 'Leave application created',
        description:
          mode === 'partial'
            ? `Pending approval — ${selectedPeriods.length} period${selectedPeriods.length === 1 ? '' : 's'} on ${startDate}.`
            : `Pending approval — ${startDate}${endDate !== startDate ? ` to ${endDate}` : ''}.`,
      });
      onOpenChange(false);
      setReason('');
      setSelectedPeriods([]);
      onApplied();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="apply-leave-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="w-5 h-5 text-blue-600" />
            Apply for Leave
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl border border-red-200 bg-red-50">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-[11px] text-red-800">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Teacher</Label>
              <Select value={teacherId} onValueChange={setTeacherId}>
                <SelectTrigger className="h-9 text-xs" data-testid="leave-teacher-select">
                  <SelectValue placeholder="Choose a teacher…" />
                </SelectTrigger>
                <SelectContent>
                  {teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Leave type</Label>
              <Select value={leaveType} onValueChange={setLeaveType}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAVE_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">{t.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Full day vs partial day */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Duration</Label>
            <div className="grid grid-cols-2 gap-2">
              {(['full', 'partial'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  data-testid={`leave-mode-${m}`}
                  onClick={() => setMode(m)}
                  className={`px-3 py-2 rounded-xl border text-xs font-bold transition-all ${
                    mode === m
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {m === 'full' ? 'Full Day' : 'Partial Day'}
                </button>
              ))}
            </div>
            {mode === 'partial' && (
              <p className="text-[10px] text-slate-500">
                Only the periods you select will need cover. Everything else stays on the timetable.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{mode === 'partial' ? 'Date' : 'From'}</Label>
              <Input
                type="date"
                value={startDate}
                data-testid="leave-start-date"
                onChange={(e) => { setStartDate(e.target.value); if (mode === 'partial') setEndDate(e.target.value); }}
                className="h-9 text-xs"
              />
            </div>
            {mode === 'full' && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">To</Label>
                <Input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            )}
          </div>

          {mode === 'partial' && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Periods on {dayName ?? 'the selected date'}
              </Label>

              {isNonTeachingDay ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
                  <p className="text-[11px] text-amber-900">
                    {dayName} is not a teaching day in your Day &amp; Period Setup, so there are no
                    periods to cover. Choose another date or apply for full-day leave.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2" data-testid="leave-period-picker">
                    {availablePeriods.map((p) => {
                      const on = selectedPeriods.includes(p);
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => togglePeriod(p)}
                          className={`w-10 h-9 rounded-lg border text-xs font-bold transition-all ${
                            on
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          P{p}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-slate-400">
                    {dayName} has {availablePeriods.length} teaching period
                    {availablePeriods.length === 1 ? '' : 's'} configured.
                  </p>
                </>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Reason</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this leave needed?"
              rows={3}
              className="text-xs"
              data-testid="leave-reason"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={submit}
            disabled={submitting || (mode === 'partial' && isNonTeachingDay)}
            data-testid="submit-leave"
          >
            {submitting ? 'Submitting…' : 'Submit for Approval'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
