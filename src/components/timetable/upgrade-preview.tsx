'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowUpCircle, CheckCircle2, XCircle, AlertTriangle, Info, Lock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

interface MigrationIssue {
  code: string;
  severity: 'blocker' | 'review';
  message: string;
  affectedRows: number;
  grade: string | null;
  section: string | null;
  day: string | null;
  period: number | null;
  subject: string | null;
  teacherName: string | null;
  legacyValue: string | null;
  suggestedAction: string;
  status: string;
}

interface Preview {
  totalRows: number;
  transferable: number;
  blocked: number;
  withReview: number;
  issues: MigrationIssue[];
  countsByCode: Record<string, number>;
  blockerCount: number;
  reviewCount: number;
  canCreateCleanRevision: boolean;
}

const CODE_LABEL: Record<string, string> = {
  TEACHER_CLASH: 'Teacher clash',
  CLASS_CLASH: 'Class clash',
  CORRUPT_FACULTY: 'Corrupt faculty',
  DUPLICATE_FACULTY_REVIEW: 'Duplicate faculty',
  SUBJECT_NOT_CONFIGURED: 'Subject not configured',
  TEACHER_NOT_MAPPED: 'Teacher not mapped to subject',
  PERIOD_OUT_OF_RANGE: 'Period outside configured day',
  NON_WORKING_DAY: 'Non-working day',
  LEGACY_ROOM_UNMAPPED: 'Legacy room value',
  TEACHER_QUALIFICATION_REVIEW: 'Qualification review',
  ORPHAN_REFERENCE: 'Orphan reference',
  UNKNOWN: 'Unclassified',
};

/**
 * Upgrade Existing Timetable — preview.
 *
 * Shows exactly what a clean revision would and would not carry across. The
 * legacy timetable is never modified from here, and no option in this card
 * executes anything: creating the revision is a separate, approved step.
 */
export function UpgradePreview({ unversionedRows }: { unversionedRows: number }) {
  const [data, setData] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<'keep' | 'revise' | 'resolve'>('keep');
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/timetable/upgrade-preview');
      if (!res.ok) { setData(null); return; }
      const body = await res.json().catch(() => null);
      if (body?.success) setData(body);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  if (unversionedRows === 0) return null;

  const blockers = (data?.issues ?? []).filter((i) => i.severity === 'blocker');
  const reviews = (data?.issues ?? []).filter((i) => i.severity === 'review');
  const shown = showAll ? [...blockers, ...reviews] : [...blockers, ...reviews].slice(0, 15);

  const where = (i: MigrationIssue) =>
    [i.grade, i.section, i.day, i.period ? `P${i.period}` : null].filter(Boolean).join(' · ') || '—';

  return (
    <>
      <Card className="border-blue-200 bg-blue-50/40" data-testid="upgrade-preview-card">
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <ArrowUpCircle className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-blue-950">
                {unversionedRows} scheduled period{unversionedRows === 1 ? '' : 's'} are not under version control
              </p>
              <p className="text-[11px] text-blue-800 mt-0.5">
                Your timetable is running normally. Upgrading is optional — see what a clean revision would carry
                across before deciding anything.
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="shrink-0" data-testid="open-upgrade-preview">
            Upgrade Existing Timetable
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto" data-testid="upgrade-preview-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpCircle className="w-5 h-5 text-blue-600" />
              Upgrade Existing Timetable
            </DialogTitle>
          </DialogHeader>

          {loading && <p className="text-xs text-slate-400 py-8 text-center">Analysing your timetable…</p>}

          {data && !loading && (
            <div className="space-y-4">
              <div className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 bg-slate-50">
                <Info className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-slate-700">
                  This is a preview. Nothing below has been created, moved or deleted, and your existing
                  timetable is untouched.
                </p>
              </div>

              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Your current timetable
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="rounded-xl border border-slate-200 p-2.5 text-center">
                    <p className="text-lg font-black text-slate-900">{data.totalRows}</p>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase">Legacy periods</p>
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-center">
                    <p className="text-lg font-black text-emerald-700">{data.transferable}</p>
                    <p className="text-[10px] font-semibold text-emerald-700 uppercase">Would transfer</p>
                  </div>
                  <div className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-center">
                    <p className="text-lg font-black text-red-700">{data.blocked}</p>
                    <p className="text-[10px] font-semibold text-red-700 uppercase">Held back</p>
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-center">
                    <p className="text-lg font-black text-amber-700">{data.reviewCount}</p>
                    <p className="text-[10px] font-semibold text-amber-700 uppercase">To review</p>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">What we found</p>
                <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                  {Object.entries(data.countsByCode).sort((a, b) => b[1] - a[1]).map(([code, n]) => {
                    const blocker = blockers.some((i) => i.code === code);
                    return (
                      <div key={code} className="flex items-center justify-between gap-2 px-3 py-2">
                        <span className="text-[11px] text-slate-700">{CODE_LABEL[code] ?? code}</span>
                        <span className="flex items-center gap-2">
                          <span className="text-[11px] font-bold text-slate-900">{n}</span>
                          <Badge variant="outline" className={`text-[9px] ${blocker ? 'border-red-300 text-red-800' : 'border-amber-300 text-amber-800'}`}>
                            {blocker ? 'must resolve' : 'review'}
                          </Badge>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── The three options ── */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Choose how to proceed</p>
                <div className="space-y-2">
                  {[
                    {
                      id: 'keep' as const,
                      title: '1. Keep the current timetable operational',
                      body: 'Change nothing. Continue exactly as you are today. You can upgrade later — nothing expires.',
                      tone: 'emerald',
                    },
                    {
                      id: 'revise' as const,
                      title: '2. Create a clean revision',
                      body: `Your existing timetable is preserved read-only as the historical record. A new Draft receives only the ${data.transferable} assignments that pass validation. The remaining ${data.blocked} become Migration Issues you resolve before publishing. Nothing is deleted. Nothing is moved.`,
                      tone: 'blue',
                    },
                    {
                      id: 'resolve' as const,
                      title: '3. Resolve issues first, then upgrade',
                      body: `Work through the ${data.blockerCount} blocking item(s) in Validation Issues and Faculty Data Issues, then return here for a clean transfer.`,
                      tone: 'slate',
                    },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setChoice(opt.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-all ${
                        choice === opt.id ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200' : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <p className="text-xs font-bold text-slate-900">{opt.title}</p>
                      <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">{opt.body}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Migration issues ── */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Migration issues ({data.issues.length})
                </p>
                <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-72 overflow-y-auto">
                  {shown.map((i, idx) => (
                    <div key={`${i.code}-${idx}`} className={`p-2.5 ${i.severity === 'blocker' ? 'bg-red-50/50' : 'bg-amber-50/40'}`}>
                      <div className="flex items-start gap-2">
                        {i.severity === 'blocker'
                          ? <XCircle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                          : <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-mono font-bold text-slate-500">{i.code}</span>
                            <span className="text-[10px] text-slate-400">·</span>
                            <span className="text-[10px] font-semibold text-slate-600">{where(i)}</span>
                            {i.teacherName && <span className="text-[10px] text-slate-500">· {i.teacherName}</span>}
                            {i.affectedRows > 0 && (
                              <Badge variant="outline" className="text-[9px]">{i.affectedRows} row{i.affectedRows === 1 ? '' : 's'}</Badge>
                            )}
                            <Badge variant="outline" className="text-[9px] border-slate-300 text-slate-500">{i.status}</Badge>
                          </div>
                          <p className={`text-[11px] mt-0.5 ${i.severity === 'blocker' ? 'text-red-900' : 'text-amber-900'}`}>{i.message}</p>
                          {i.legacyValue && (
                            <p className="text-[10px] text-slate-500 mt-0.5">
                              Legacy value: <code className="font-mono bg-slate-100 px-1 rounded">{i.legacyValue}</code>
                            </p>
                          )}
                          <p className="text-[10px] text-slate-500 mt-0.5">→ {i.suggestedAction}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {data.issues.length > 15 && (
                  <Button size="sm" variant="ghost" onClick={() => setShowAll((v) => !v)} className="text-[11px] h-7 mt-1">
                    {showAll ? 'Show fewer' : `Show all ${data.issues.length}`}
                  </Button>
                )}
              </div>

              <div className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-300 bg-slate-50">
                <Lock className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-slate-700">
                  <strong>Preview only.</strong> Creating the clean revision is not enabled yet — it is a separate
                  step that needs sign-off. Option 1 requires no action: your timetable already works this way.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Close</Button>
            <Button size="sm" disabled data-testid="upgrade-execute" className="gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {choice === 'keep' ? 'No action needed' : 'Not enabled yet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
