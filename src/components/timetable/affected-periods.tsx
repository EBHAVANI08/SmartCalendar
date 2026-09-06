'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Loader2, Send, CheckCircle2, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

interface Affected {
  date: string;
  day: string;
  period: number;
  grade: string;
  section: string;
  subject: string;
  startTime: string;
  endTime: string;
  substitutionId: string | null;
  substitutionStatus: string | null;
  hasSubstitute: boolean;
}

/**
 * The classes a leave leaves uncovered, read straight from the timetable.
 *
 * The Admin never retypes the absent teacher's periods: approving the leave
 * resolves them automatically, and this panel shows what was found plus how
 * much of it already has cover.
 */
export function AffectedPeriods({ leaveId, status }: { leaveId: string; status: string }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Affected[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leaves/${leaveId}/affected`);
      const data = await res.json();
      setRows(res.ok && data.success ? data.affected : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [leaveId]);

  useEffect(() => { load(); }, [load]);

  const sendToSubstitution = async () => {
    setSending(true);
    try {
      const res = await fetch(`/api/leaves/${leaveId}/affected`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'Not sent', description: data.error, variant: 'destructive' });
        return;
      }
      toast({ title: 'Sent to Substitution', description: data.message });
      await load();
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <p className="text-xs text-slate-500 flex items-center gap-2 py-3">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Resolving affected classes from the timetable…
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="text-xs text-slate-500 py-3">
        No timetable periods fall inside this leave — nothing needs cover.
      </p>
    );
  }

  const pending = rows.filter((r) => !r.substitutionId).length;
  const covered = rows.filter((r) => r.hasSubstitute).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-700 flex items-center gap-2">
          <CalendarDays className="w-3.5 h-3.5 text-blue-600" />
          Affected classes ({rows.length})
          {rows.length > 0 && rows.length < 6 && (
            <span className="text-[10px] font-normal text-slate-500">(periods resolved from the timetable)</span>
          )}
          {covered > 0 && (
            <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
              {covered} covered
            </Badge>
          )}
        </p>
        {status === 'approved' && pending > 0 && (
          <Button size="sm" variant="outline" onClick={sendToSubstitution} disabled={sending} className="h-7 text-[11px]">
            {sending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Send className="w-3 h-3 mr-1" />}
            Send to Substitution
          </Button>
        )}
      </div>

      <div className="space-y-1">
        {rows.map((r) => (
          <div
            key={`${r.date}-${r.period}-${r.grade}-${r.section}`}
            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg border bg-white text-xs"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="font-bold text-slate-900 w-8">P{r.period}</span>
              <span className="text-slate-700">{r.grade}-{r.section}</span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-800 font-medium">{r.subject}</span>
              <span className="text-slate-400 hidden sm:inline">·</span>
              <span className="text-slate-500 hidden sm:inline">
                {r.date} ({r.day}) {r.startTime}–{r.endTime}
              </span>
            </div>
            {r.hasSubstitute ? (
              <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                <CheckCircle2 className="w-3 h-3 mr-1" /> substitute assigned
              </Badge>
            ) : r.substitutionId ? (
              <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                awaiting substitute
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-600 border-slate-200">
                <AlertCircle className="w-3 h-3 mr-1" /> not sent yet
              </Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
