'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

interface Issue {
  id: string;
  severity: 'error' | 'warning';
  code: string;
  message: string;
  grade: string | null;
  section: string | null;
  day: string | null;
  period: number | null;
  subject: string | null;
  teacherName: string | null;
  acknowledged: boolean;
  acknowledgedBy: string | null;
  canAcknowledge: boolean;
}

/**
 * Validation issues for the timetable currently in play.
 *
 * Publication is gated on errors, so they have to be visible. Warnings can be
 * acknowledged; errors cannot, and the UI says so rather than offering a button
 * that would fail.
 */
export function ValidationIssues({ versionId }: { versionId?: string | null }) {
  const { toast } = useToast();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [errors, setErrors] = useState(0);
  const [warnings, setWarnings] = useState(0);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  const qs = versionId ? `?versionId=${encodeURIComponent(versionId)}` : '';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/timetable/validation-issues${qs}`);
      if (!res.ok) { setIssues([]); return; }
      const data = await res.json().catch(() => ({}));
      setIssues(data.issues ?? []);
      setErrors(data.errors ?? 0);
      setWarnings(data.warnings ?? 0);
    } finally {
      setLoading(false);
    }
  }, [qs]);

  useEffect(() => { load(); }, [load]);

  const rescan = async () => {
    setScanning(true);
    try {
      const res = await fetch(`/api/timetable/validation-issues${qs}`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: 'Scan failed', description: data?.error || `HTTP ${res.status}`, variant: 'destructive' });
        return;
      }
      setScanned(data.scanned ?? 0);
      toast({
        title: 'Timetable checked',
        description: `${data.scanned} periods scanned — ${data.errors} error(s), ${data.warnings} warning(s).`,
      });
      await load();
    } finally {
      setScanning(false);
    }
  };

  const acknowledge = async (issue: Issue) => {
    const res = await fetch('/api/timetable/validation-issues', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issueId: issue.id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast({ title: 'Not acknowledged', description: data?.error || `HTTP ${res.status}`, variant: 'destructive' });
      return;
    }
    setIssues((prev) => prev.map((i) => (i.id === issue.id ? { ...i, acknowledged: true } : i)));
  };

  const shown = showAll ? issues : issues.slice(0, 12);

  const where = (i: Issue) =>
    [i.grade, i.section, i.day, i.period ? `P${i.period}` : null].filter(Boolean).join(' · ') || '—';

  return (
    <Card className="border-slate-200 shadow-sm" data-testid="validation-issues">
      <CardHeader className="p-5 pb-3 flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-slate-600" />
            Validation Issues
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Checks the actual timetable rows. Errors block publication and cannot be acknowledged away.
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={rescan} disabled={scanning} className="gap-1.5 text-xs shrink-0" data-testid="rescan-timetable">
          <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
          {scanning ? 'Checking…' : 'Check timetable'}
        </Button>
      </CardHeader>

      <CardContent className="p-5 pt-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={`text-[11px] font-bold gap-1 ${errors ? 'border-red-300 text-red-800 bg-red-50' : 'border-emerald-300 text-emerald-800 bg-emerald-50'}`}>
            {errors ? <XCircle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
            {errors} error{errors === 1 ? '' : 's'}
          </Badge>
          <Badge variant="outline" className="text-[11px] font-bold gap-1 border-amber-300 text-amber-800 bg-amber-50">
            <AlertTriangle className="w-3 h-3" />
            {warnings} warning{warnings === 1 ? '' : 's'}
          </Badge>
          {scanned !== null && <span className="text-[11px] text-slate-500">{scanned} periods scanned</span>}
        </div>

        {errors > 0 && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl border border-red-200 bg-red-50">
            <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-red-900">
              This timetable cannot be published while {errors} error{errors === 1 ? '' : 's'} remain. Fix them in the
              Studio — acknowledging an error is deliberately not possible.
            </p>
          </div>
        )}

        {loading && <p className="text-xs text-slate-400 py-4 text-center">Loading issues…</p>}

        {!loading && issues.length === 0 && (
          <div className="py-6 text-center" data-testid="validation-clean">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-1.5" />
            <p className="text-xs font-semibold text-slate-700">No issues recorded</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Run <strong>Check timetable</strong> to validate the current periods.
            </p>
          </div>
        )}

        {shown.length > 0 && (
          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {shown.map((i) => (
              <div key={i.id} className={`p-3 ${i.severity === 'error' ? 'bg-red-50/40' : i.acknowledged ? 'bg-slate-50/60' : 'bg-amber-50/40'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {i.severity === 'error'
                        ? <XCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                        : <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />}
                      <span className="text-[10px] font-mono font-bold text-slate-500">{i.code}</span>
                      <span className="text-[10px] text-slate-400">·</span>
                      <span className="text-[10px] font-semibold text-slate-600">{where(i)}</span>
                      {i.subject && <span className="text-[10px] text-slate-500">· {i.subject}</span>}
                      {i.teacherName && <span className="text-[10px] text-slate-500">· {i.teacherName}</span>}
                      {i.acknowledged && (
                        <Badge variant="outline" className="text-[9px] border-slate-300 text-slate-600">acknowledged</Badge>
                      )}
                    </div>
                    <p className={`text-[11px] mt-1 ${i.severity === 'error' ? 'text-red-900' : 'text-amber-900'}`}>{i.message}</p>
                  </div>

                  {i.canAcknowledge && !i.acknowledged && (
                    <Button size="sm" variant="outline" onClick={() => acknowledge(i)} className="h-6 px-2 text-[10px] shrink-0">
                      Acknowledge
                    </Button>
                  )}
                  {i.severity === 'error' && (
                    <span className="text-[10px] text-red-700 font-semibold shrink-0 whitespace-nowrap">must fix</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {issues.length > 12 && (
          <Button size="sm" variant="ghost" onClick={() => setShowAll((v) => !v)} className="text-[11px] h-7">
            {showAll ? 'Show fewer' : `Show all ${issues.length}`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
