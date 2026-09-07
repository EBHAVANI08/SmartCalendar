'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Loader2, Lock, Trash2, ArrowRightLeft, BookOpen, UserCog, AlertTriangle,
  GitBranch, CheckCircle2, Ban, Info, ChevronLeft
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700 border-slate-300',
  review: 'bg-amber-50 text-amber-700 border-amber-300',
  approved: 'bg-indigo-50 text-indigo-700 border-indigo-300',
  published: 'bg-emerald-50 text-emerald-700 border-emerald-300',
  superseded: 'bg-slate-50 text-slate-500 border-slate-200',
  archived: 'bg-slate-50 text-slate-400 border-slate-200',
};

interface Candidate {
  id: string;
  name: string;
  subjects: string[];
  grades: string[];
  qualifiedSubject: boolean;
  qualifiedGrade: boolean;
  available: boolean;
  inactive: boolean;
  conflict: { grade: string; section: string; subject: string } | null;
  dailyWorkload: number;
  isCurrent: boolean;
}

type Mode = 'menu' | 'subject' | 'teacher' | 'move' | 'delete';

/**
 * The Timetable Studio slot editor.
 *
 * Every action here goes through the validated slot APIs, which apply the same
 * shared constraints as generation. A published or approved timetable opens
 * read-only: the only way to change it is a revision.
 */
export function SlotEditor({
  slotId,
  grade,
  section,
  open,
  onOpenChange,
  onChanged,
}: {
  slotId: string | null;
  grade: string;
  section: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [slot, setSlot] = useState<any>(null);
  const [version, setVersion] = useState<any>(null);
  const [editable, setEditable] = useState(false);
  const [lockReason, setLockReason] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);

  const [mode, setMode] = useState<Mode>('menu');
  const [newSubject, setNewSubject] = useState('');
  const [newTeacher, setNewTeacher] = useState('');
  const [moveDay, setMoveDay] = useState('');
  const [movePeriod, setMovePeriod] = useState('');
  const [dayPeriods, setDayPeriods] = useState<Record<string, number>>({});
  // Manual override for an unqualified (but free) teacher. A busy teacher
  // never reaches this dialog - that is a hard block with no override path.
  const [overrideFor, setOverrideFor] = useState<Candidate | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideAck, setOverrideAck] = useState(false);

  const load = useCallback(async () => {
    if (!slotId) return;
    setLoading(true);
    setError(null);
    setMode('menu');
    try {
      const [ctxRes, cfgRes] = await Promise.all([
        fetch(`/api/schedules/${slotId}/change-teacher`),
        fetch('/api/school/day-config'),
      ]);
      const ctx = await ctxRes.json();
      if (!ctxRes.ok) {
        setError(ctx.error || 'Could not load this slot.');
        return;
      }
      setSlot(ctx.slot);
      setVersion(ctx.version);
      setEditable(ctx.editable);
      setLockReason(ctx.lockReason);
      setCandidates(ctx.candidates ?? []);
      setNewSubject(ctx.slot?.subject ?? '');
      setNewTeacher(ctx.slot?.teacherId ?? '');
      setMoveDay(ctx.slot?.day ?? '');
      setMovePeriod(String(ctx.slot?.period ?? ''));

      const cfg = await cfgRes.json().catch(() => null);
      if (cfg?.success) {
        setDayPeriods(Object.fromEntries((cfg.days ?? []).map((d: any) => [d.day, d.periods])));
      }

      // Fetch grade configured subjects or school-wide subject catalogue
      const subRes = await fetch(`/api/subjects?grade=${encodeURIComponent(grade)}`);
      const sub = await subRes.json().catch(() => null);
      let availableSubjects: string[] = [];
      if (sub?.success) {
        if (Array.isArray(sub.subjects) && sub.subjects.length > 0) {
          availableSubjects = sub.subjects.filter((s: any) => s.active !== false).map((s: any) => s.subjectName);
        }
        if (availableSubjects.length === 0 && Array.isArray(sub.catalogue) && sub.catalogue.length > 0) {
          availableSubjects = sub.catalogue.filter((s: any) => s.active !== false).map((s: any) => s.name);
        }
      }
      if (ctx.slot?.subject && !availableSubjects.includes(ctx.slot.subject)) {
        availableSubjects.unshift(ctx.slot.subject);
      }
      setSubjects(Array.from(new Set(availableSubjects)));
    } finally {
      setLoading(false);
    }
  }, [slotId, grade]);

  useEffect(() => { if (open) load(); }, [open, load]);

  /** Surface the backend's actual reason, never a generic message. */
  const send = async (url: string, init: RequestInit, successTitle: string) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(url, init);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg = data.error || `Request failed (${res.status}).`;
        setError(errMsg);
        toast({ title: 'Cannot Complete Action', description: errMsg, variant: 'destructive' });
        return false;
      }
      toast({ title: successTitle, description: data.message });
      onChanged?.();
      onOpenChange(false);
      return true;
    } catch {
      const errMsg = 'The request could not be completed. Check your connection and try again.';
      setError(errMsg);
      toast({ title: 'Network Error', description: errMsg, variant: 'destructive' });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const currentTeacher = candidates.find((c) => c.isCurrent);
  const chosenTeacher = candidates.find((c) => c.id === newTeacher);
  // Changing the subject can strip the current teacher's qualification.
  const subjectChanged = newSubject && slot && newSubject !== slot.subject;
  const teacherStillQualified =
    !subjectChanged ||
    !currentTeacher ||
    currentTeacher.subjects.some((s) => s.toLowerCase() === newSubject.toLowerCase());
  const qualifiedForNewSubject = candidates.filter(
    (c) => c.available && c.subjects.some((s) => s.toLowerCase() === newSubject.toLowerCase())
  );

  const periodsForMoveDay = dayPeriods[moveDay] ?? 8;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="slot-editor">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {editable ? 'Edit period' : 'Period details'}
            {version && (
              <Badge variant="outline" className={STATUS_STYLE[version.status] ?? ''}>
                v{version.version} · {version.status}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {grade} {section}
            {slot ? ` · ${slot.day} · Period ${slot.period}` : ''}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-10 text-center text-sm text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading period…
          </p>
        ) : !slot ? (
          <p className="py-8 text-center text-sm text-slate-500">
            {error ?? 'This cell has no saved period yet. Generate the timetable to create it.'}
          </p>
        ) : (
          <div className="space-y-4">
            {/* Always-visible detail */}
            <div className="grid grid-cols-2 gap-3 text-sm rounded-lg border bg-slate-50 p-3">
              <div><p className="text-xs text-slate-500">Class</p><p className="font-medium">{slot.grade} {slot.section}</p></div>
              <div><p className="text-xs text-slate-500">Day / Period</p><p className="font-medium">{slot.day} · P{slot.period}</p></div>
              <div><p className="text-xs text-slate-500">Subject</p><p className="font-medium">{slot.subject}</p></div>
              <div><p className="text-xs text-slate-500">Teacher</p>
                <p className="font-medium">{currentTeacher?.name ?? 'Unassigned'}</p></div>
            </div>

            {!editable && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
                <p className="font-semibold text-emerald-900 flex items-center gap-2">
                  <Lock className="w-4 h-4" /> Read-only
                </p>
                <p className="text-emerald-800 text-xs mt-1">
                  {lockReason ?? 'This timetable cannot be edited directly.'}
                </p>
                <Button
                  size="sm" className="mt-3"
                  onClick={async () => {
                    await send(
                      '/api/timetable/lifecycle',
                      {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'revise', changeNotes: `Revision from timetable studio` }),
                      },
                      'Revision created'
                    );
                  }}
                  disabled={saving}
                >
                  <GitBranch className="w-3.5 h-3.5 mr-2" /> Create Revision
                </Button>
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">
                <p className="font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> Cannot save
                </p>
                <p className="mt-1 text-xs">{error}</p>
              </div>
            )}

            {editable && mode === 'menu' && (
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" data-testid="slot-change-subject" onClick={() => { setMode('subject'); setError(null); }}>
                  <BookOpen className="w-4 h-4 mr-2" /> Change Subject
                </Button>
                <Button type="button" variant="outline" data-testid="slot-change-teacher" onClick={() => { setMode('teacher'); setError(null); }}>
                  <UserCog className="w-4 h-4 mr-2" /> Change Teacher
                </Button>
                <Button type="button" variant="outline" data-testid="slot-move-period" onClick={() => { setMode('move'); setError(null); }}>
                  <ArrowRightLeft className="w-4 h-4 mr-2" /> Move / Swap Period
                </Button>
                <Button type="button" variant="outline" className="border-rose-300 text-rose-700 hover:bg-rose-50"
                  data-testid="slot-delete" onClick={() => { setMode('delete'); setError(null); }}>
                  <Trash2 className="w-4 h-4 mr-2" /> Delete Slot
                </Button>
              </div>
            )}

            {/* ── Change subject ── */}
            {editable && mode === 'subject' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setMode('menu'); setError(null); }} className="gap-1 text-xs text-slate-600 hover:text-slate-900 -ml-2 h-7 px-2">
                    <ChevronLeft className="w-4 h-4" /> Back to Actions
                  </Button>
                  <span className="text-xs font-semibold text-slate-500">Change Subject</span>
                </div>

                <div>
                  <Label className="text-xs">Subject for {grade}</Label>
                  <Select value={newSubject} onValueChange={setNewSubject}>
                    <SelectTrigger className="mt-1" data-testid="slot-subject-select"><SelectValue placeholder="Choose a subject…" /></SelectTrigger>
                    <SelectContent>
                      {subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {subjectChanged && !teacherStillQualified && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                    <p className="text-xs font-semibold text-amber-900 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {currentTeacher?.name} is not mapped to {newSubject}
                    </p>
                    <p className="text-[11px] text-amber-800 mt-1">
                      Select a qualified teacher to take this period, or cancel the subject change.
                    </p>
                    <div className="mt-2">
                      <Select value={newTeacher} onValueChange={setNewTeacher}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Select qualified teacher…" /></SelectTrigger>
                        <SelectContent>
                          {qualifiedForNewSubject.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name} — {c.dailyWorkload} periods that day
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {qualifiedForNewSubject.length === 0 && (
                        <p className="text-[11px] text-rose-700 mt-1">
                          No free teacher is mapped to {newSubject}. Map one in Faculty Directory first.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="ghost" onClick={() => { setMode('menu'); setError(null); }}>Back</Button>
                  <Button
                    type="button"
                    disabled={
                      saving ||
                      !newSubject ||
                      (subjectChanged && !teacherStillQualified && !qualifiedForNewSubject.some((c) => c.id === newTeacher))
                    }
                    onClick={async () => {
                      if (subjectChanged && !teacherStillQualified) {
                        const ok = await fetch(`/api/schedules/${slotId}/change-teacher`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ teacherId: newTeacher }),
                        });
                        if (!ok.ok) {
                          const d = await ok.json().catch(() => ({}));
                          setError(d.error || 'Could not reassign the teacher.');
                          return;
                        }
                      }
                      await send(
                        `/api/schedules/${slotId}/slot`,
                        {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ subject: newSubject }),
                        },
                        'Subject changed'
                      );
                    }}
                  >
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Save subject
                  </Button>
                </div>
              </div>
            )}

            {/* ── Change teacher ── */}
            {editable && mode === 'teacher' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setMode('menu'); setError(null); }} className="gap-1 text-xs text-slate-600 hover:text-slate-900 -ml-2 h-7 px-2">
                    <ChevronLeft className="w-4 h-4" /> Back to Actions
                  </Button>
                  <span className="text-xs font-semibold text-slate-500">Change Teacher</span>
                </div>

                <p className="text-xs text-slate-500">
                  Busy teachers are disabled. Anyone not mapped to {slot.subject} needs an explicit override.
                </p>
                <div className="max-h-64 overflow-y-auto space-y-1.5">
                  {candidates.map((c) => (
                    <div key={c.id}
                      className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs ${
                        c.available ? 'bg-white' : 'bg-slate-50 opacity-70'
                      }`}>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">
                          {c.name} {c.isCurrent && <span className="text-slate-400">(current)</span>}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {c.subjects.join(', ') || 'no subjects'} · {c.dailyWorkload} that day
                        </p>
                        {c.conflict && (
                          <p className="text-[11px] text-rose-700">
                            Busy: {c.conflict.grade}-{c.conflict.section} ({c.conflict.subject})
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {c.qualifiedSubject
                          ? <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">qualified</Badge>
                          : <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">not mapped</Badge>}
                        <Button
                          type="button"
                          size="sm" variant={c.qualifiedSubject ? 'default' : 'outline'}
                          disabled={!c.available || c.isCurrent || saving}
                          className="h-7 text-[11px]"
                          onClick={async () => {
                            if (!c.qualifiedSubject) {
                              setOverrideReason('');
                              setOverrideAck(false);
                              setOverrideFor(c);
                              return;
                            }
                            await send(
                              `/api/schedules/${slotId}/change-teacher`,
                              {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ teacherId: c.id }),
                              },
                              'Teacher changed'
                            );
                          }}
                        >
                          {c.available ? 'Assign' : <Ban className="w-3 h-3" />}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end pt-2">
                  <Button type="button" variant="ghost" onClick={() => { setMode('menu'); setError(null); }}>Back</Button>
                </div>
              </div>
            )}

            {/* ── Move ── */}
            {editable && mode === 'move' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setMode('menu'); setError(null); }} className="gap-1 text-xs text-slate-600 hover:text-slate-900 -ml-2 h-7 px-2">
                    <ChevronLeft className="w-4 h-4" /> Back to Actions
                  </Button>
                  <span className="text-xs font-semibold text-slate-500">Move or Swap Period</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Destination Day</Label>
                    <Select value={moveDay} onValueChange={(v) => { setMoveDay(v); setMovePeriod(''); }}>
                      <SelectTrigger className="mt-1" data-testid="slot-move-day"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DAYS.filter((d) => (dayPeriods[d] ?? 0) > 0 || Object.keys(dayPeriods).length === 0)
                          .map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">
                      Destination Period {moveDay && dayPeriods[moveDay] ? `(1–${dayPeriods[moveDay]})` : ''}
                    </Label>
                    <Select value={movePeriod} onValueChange={setMovePeriod}>
                      <SelectTrigger className="mt-1" data-testid="slot-move-period-select"><SelectValue placeholder="Select Period…" /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: periodsForMoveDay }, (_, i) => i + 1).map((n) => (
                          <SelectItem key={n} value={String(n)}>Period {n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 flex items-start gap-1.5 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-blue-600" />
                  If destination is empty, the period is moved. If occupied by another subject in this class, both periods swap positions seamlessly.
                </p>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="ghost" onClick={() => { setMode('menu'); setError(null); }}>Back</Button>
                  <Button
                    type="button"
                    disabled={saving || !moveDay || !movePeriod ||
                      (moveDay === slot.day && Number(movePeriod) === slot.period)}
                    onClick={() =>
                      send(
                        `/api/schedules/${slotId}/slot`,
                        {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ day: moveDay, period: Number(movePeriod) }),
                        },
                        'Period moved'
                      )
                    }
                  >
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRightLeft className="w-4 h-4 mr-2" />} Move / Swap period
                  </Button>
                </div>
              </div>
            )}

            {/* ── Delete ── */}
            {editable && mode === 'delete' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setMode('menu'); setError(null); }} className="gap-1 text-xs text-slate-600 hover:text-slate-900 -ml-2 h-7 px-2">
                    <ChevronLeft className="w-4 h-4" /> Back to Actions
                  </Button>
                  <span className="text-xs font-semibold text-slate-500">Delete Slot</span>
                </div>

                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                  <p className="font-semibold">Remove this period?</p>
                  <p className="text-xs mt-1">
                    {slot.grade} {slot.section} · {slot.day} P{slot.period} · {slot.subject}. The cell becomes
                    empty. If any substitution depends on it, the delete is refused.
                  </p>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="ghost" onClick={() => { setMode('menu'); setError(null); }}>Back</Button>
                  <Button
                    type="button"
                    className="bg-rose-600 hover:bg-rose-700 text-white"
                    disabled={saving}
                    onClick={() => send(`/api/schedules/${slotId}/slot`, { method: 'DELETE' }, 'Period removed')}
                  >
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                    Delete period
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {mode === 'menu' && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>

    {/* Manual override: an unqualified but FREE teacher. A busy teacher is
        blocked upstream and never reaches this dialog. */}
    <Dialog open={!!overrideFor} onOpenChange={(o) => { if (!o) setOverrideFor(null); }}>
      <DialogContent data-testid="override-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-700">
            <AlertTriangle className="w-5 h-5" /> Manual override required
          </DialogTitle>
          <DialogDescription>
            This teacher is not mapped to this subject. The assignment is still possible, but it will
            be recorded as a manual override with your reason.
          </DialogDescription>
        </DialogHeader>

        {overrideFor && slot && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3 rounded-lg border bg-slate-50 p-3 text-xs">
              <div><p className="text-slate-500">Teacher</p><p className="font-semibold text-slate-900">{overrideFor.name}</p></div>
              <div><p className="text-slate-500">Subject</p><p className="font-semibold text-slate-900">{slot.subject}</p></div>
              <div><p className="text-slate-500">Class</p><p className="font-medium">{slot.grade} {slot.section}</p></div>
              <div><p className="text-slate-500">Day / Period</p><p className="font-medium">{slot.day} · P{slot.period}</p></div>
              <div><p className="text-slate-500">Availability</p>
                <p className="font-medium text-emerald-700">Free this period</p></div>
              <div><p className="text-slate-500">Workload that day</p>
                <p className="font-medium">{overrideFor.dailyWorkload} period(s)</p></div>
            </div>

            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="text-xs font-semibold text-amber-900">
                This teacher is not mapped to {slot.subject} for {slot.grade}. This assignment will be
                recorded as a manual override.
              </p>
              <p className="text-[11px] text-amber-800 mt-1">
                They currently teach: {overrideFor.subjects.join(', ') || 'no subjects'}.
                {!overrideFor.qualifiedGrade && ' They are also not mapped to this grade.'}
              </p>
            </div>

            <div>
              <Label className="text-xs">Reason for the override (saved to the audit log)</Label>
              <Textarea
                data-testid="override-reason"
                className="mt-1"
                rows={3}
                placeholder="e.g. Only available staff member for this period"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
              />
            </div>

            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                data-testid="override-ack"
                checked={overrideAck}
                onCheckedChange={(v) => setOverrideAck(v === true)}
              />
              <span className="text-xs text-slate-700">
                I understand {overrideFor.name} is not qualified for {slot.subject} and am assigning them
                deliberately.
              </span>
            </label>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOverrideFor(null)}>Cancel</Button>
          <Button
            data-testid="override-confirm"
            className="bg-amber-600 hover:bg-amber-700 text-white"
            disabled={saving || !overrideAck || overrideReason.trim().length < 3}
            onClick={async () => {
              if (!overrideFor) return;
              const ok = await send(
                `/api/schedules/${slotId}/change-teacher`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    teacherId: overrideFor.id,
                    manualOverride: true,
                    overrideReason: overrideReason.trim(),
                  }),
                },
                'Teacher changed with override'
              );
              if (ok) setOverrideFor(null);
            }}
          >
            Confirm Override
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
