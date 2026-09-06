'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Users2, AlertTriangle, ShieldCheck, Loader2, RefreshCw, Check, X, Clock,
  GitMerge, Info, Wrench, Link2, Ban,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

interface Person {
  id: string;
  name: string;
  email: string | null;
  employeeId: string | null;
  why?: string;
}

interface Group {
  key: string;
  matchedOn: string;
  confidence: 'high' | 'review';
  reason: string;
  canonical: Person;
  duplicates: Person[];
  merged: { subjects: string[]; grades: string[]; sections: string[]; employeeId: string | null; email: string | null };
  referencesToRepoint: { total: number; byLabel: Record<string, number> };
  clashesIntroduced: { day: string; period: number; classes: { grade: string; section: string; subject: string }[] }[];
}

interface Corrupt {
  id: string;
  name: string;
  email: string | null;
  problems: string[];
  references: { total: number; byLabel: Record<string, number> };
  note: string;
}

/** Strip control characters so decoded-binary names cannot break the layout. */
const safe = (s: unknown, n = 40) =>
  String(s ?? '').replace(/[\u0000-\u001F\uFFFD]/g, '?').slice(0, n) || '—';

const CONFIDENCE_STYLE: Record<string, string> = {
  high: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  review: 'bg-amber-50 text-amber-700 border-amber-200',
};

/**
 * Duplicate-faculty review.
 *
 * Merging is always a deliberate act here: nothing is preselected, weak matches
 * are labelled as needing a human decision, and the preview states exactly what
 * will be repointed and what conflicts the merge will expose before anything
 * is written.
 */
export function DedupReview({ onChanged }: { onChanged?: () => void }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<Group[]>([]);
  const [corrupt, setCorrupt] = useState<Corrupt[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [dismissed, setDismissed] = useState<Record<string, 'separate' | 'later'>>({});
  const [preview, setPreview] = useState<Group | null>(null);
  const [merging, setMerging] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/teachers/dedup');
      const data = await res.json();
      if (res.ok && data.success) {
        setGroups(data.groups ?? []);
        setCorrupt(data.corrupt ?? []);
        setSummary(data.summary ?? {});
      } else {
        toast({ title: 'Could not load duplicates', description: data.error, variant: 'destructive' });
      }
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const doMerge = async (group: Group) => {
    setMerging(true);
    try {
      const res = await fetch('/api/teachers/dedup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupKeys: [group.key],
          // A review group is only merged because a human explicitly chose to.
          includeReviewGroups: group.confidence === 'review',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'Merge failed', description: data.error, variant: 'destructive' });
        return;
      }
      const merged = data.merged?.[0];
      toast({
        title: 'Faculty records merged',
        description: merged
          ? `Kept ${merged.canonicalName}; repointed ${Object.values(merged.repointed ?? {}).reduce((a: number, b) => a + Number(b), 0)} reference(s).`
          : 'Merge completed.',
      });
      setPreview(null);
      await load();
      onChanged?.();
    } finally {
      setMerging(false);
    }
  };

  const visible = groups.filter((g) => !dismissed[g.key]);

  if (loading) {
    return (
      <div className="py-10 text-center text-sm text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Scanning for duplicate faculty…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="inline-flex items-center gap-1.5 text-slate-700">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            {summary.highConfidenceGroups ?? 0} confident match(es)
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-700">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            {summary.reviewGroups ?? 0} need your decision
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-700">
            <Wrench className="w-4 h-4 text-slate-500" />
            {corrupt.length} data issue(s)
          </span>
        </div>
        <Button size="sm" variant="outline" onClick={load}>
          <RefreshCw className="w-3.5 h-3.5 mr-2" /> Rescan
        </Button>
      </div>

      {visible.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <Users2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-700">No duplicate faculty to review</p>
          <p className="text-xs text-slate-500 mt-1">
            Every remaining record has a distinct employee ID, email and identity.
          </p>
        </CardContent></Card>
      ) : (
        visible.map((g) => (
          <Card key={g.key} data-testid="duplicate-review-card" className={g.confidence === 'high' ? 'border-emerald-200' : 'border-amber-200'}>
            <CardContent className="pt-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900">Possible duplicate</span>
                    <Badge variant="outline" className={CONFIDENCE_STYLE[g.confidence]}>
                      {g.confidence === 'high' ? 'confident match' : 'needs your decision'}
                    </Badge>
                    <Badge variant="outline" className="text-[11px] bg-slate-50">matched on {g.matchedOn}</Badge>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">{g.reason}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline"
                    onClick={() => setDismissed({ ...dismissed, [g.key]: 'separate' })}>
                    <X className="w-3.5 h-3.5 mr-1.5" /> Keep Separate
                  </Button>
                  <Button size="sm" variant="ghost" className="text-slate-500"
                    onClick={() => setDismissed({ ...dismissed, [g.key]: 'later' })}>
                    <Clock className="w-3.5 h-3.5 mr-1.5" /> Review Later
                  </Button>
                  {/* Never the default action, and never preselected. */}
                  <Button size="sm" variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-50"
                    data-testid="merge-records" onClick={() => setPreview(g)}>
                    <GitMerge className="w-3.5 h-3.5 mr-1.5" /> Merge Records…
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[g.canonical, ...g.duplicates].map((p, i) => (
                  <div key={p.id} className="rounded-lg border bg-slate-50/60 p-3 text-xs space-y-1">
                    <p className="font-semibold text-slate-900 text-sm">
                      {safe(p.name, 34)}
                      <span className="ml-2 font-normal text-slate-500">
                        {i === 0 ? '(record A — would be kept)' : '(record B)'}
                      </span>
                    </p>
                    <p className="text-slate-600">Email: {safe(p.email, 34)}</p>
                    <p className="text-slate-600">Employee ID: {p.employeeId ?? '—'}</p>
                    {i === 0 && p.why && <p className="text-slate-500 italic">Kept because: {p.why}</p>}
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600">
                <span>References to repoint: <strong>{g.referencesToRepoint.total}</strong></span>
                <span className={g.clashesIntroduced.length ? 'text-rose-700' : ''}>
                  Clashes revealed by merge: <strong>{g.clashesIntroduced.length}</strong>
                </span>
                <span>
                  Recommended:{' '}
                  <strong>
                    {g.confidence === 'high'
                      ? 'safe to merge'
                      : g.reason.includes('placeholder')
                        ? 'keep separate — shared placeholder number'
                        : 'confirm identity before merging'}
                  </strong>
                </span>
              </div>
            </CardContent>
          </Card>
        ))
      )}

      {/* ── Merge preview ── */}
      <Dialog open={!!preview} onOpenChange={(o) => { if (!o) setPreview(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="w-5 h-5 text-blue-600" /> Merge preview
            </DialogTitle>
            <DialogDescription>
              Review exactly what changes before anything is written. References are repointed first;
              the duplicate is only deleted once nothing refers to it.
            </DialogDescription>
          </DialogHeader>

          {preview && (
            <div className="space-y-4 text-sm">
              <div className="rounded-lg border bg-slate-50 p-3">
                <p className="text-xs text-slate-500 font-semibold mb-1">Canonical faculty (kept)</p>
                <p className="font-bold text-slate-900">{safe(preview.canonical.name, 40)}</p>
                <p className="text-xs text-slate-600">
                  {safe(preview.canonical.email, 40)} · {preview.canonical.employeeId ?? 'no employee ID'}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Removing: {preview.duplicates.map((d) => safe(d.name, 26)).join(', ')}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div><p className="text-slate-500 font-semibold mb-1">Combined subjects</p>
                  <p className="text-slate-800">{preview.merged.subjects.join(', ') || '—'}</p></div>
                <div><p className="text-slate-500 font-semibold mb-1">Combined grades</p>
                  <p className="text-slate-800">{preview.merged.grades.join(', ') || '—'}</p></div>
                <div><p className="text-slate-500 font-semibold mb-1">Combined sections</p>
                  <p className="text-slate-800">{preview.merged.sections.join(', ') || '—'}</p></div>
              </div>

              <div>
                <p className="text-xs text-slate-500 font-semibold mb-1">References to repoint</p>
                {preview.referencesToRepoint.total === 0 ? (
                  <p className="text-xs text-slate-600">None — the duplicate holds no linked records.</p>
                ) : (
                  <div className="space-y-1">
                    {Object.entries(preview.referencesToRepoint.byLabel).map(([label, n]) => (
                      <div key={label} className="flex justify-between text-xs px-3 py-1.5 rounded border bg-white">
                        <span className="text-slate-700">{label}</span>
                        <strong className="text-slate-900">{n}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {preview.clashesIntroduced.length > 0 && (
                <div className="rounded-lg border border-rose-300 bg-rose-50 p-3">
                  <p className="font-bold text-rose-800 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Merge will reveal {preview.clashesIntroduced.length} existing timetable conflict
                    {preview.clashesIntroduced.length === 1 ? '' : 's'}
                  </p>
                  <p className="text-xs text-rose-700 mt-1">
                    Faculty records can still be merged, but timetable cleanup will be required. No timetable
                    row is deleted or reassigned by this merge.
                  </p>
                  <div className="mt-2 space-y-0.5 max-h-40 overflow-y-auto">
                    {preview.clashesIntroduced.slice(0, 12).map((c, i) => (
                      <p key={i} className="text-[11px] text-rose-800">
                        {c.day} P{c.period}: {c.classes.map((x) => `${x.grade}-${x.section} (${x.subject})`).join(' + ')}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {preview.confidence === 'review' && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                  <p className="font-semibold flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5" /> This is not a confident match
                  </p>
                  <p className="mt-1">{preview.reason}</p>
                  <p className="mt-1">Only continue if you know these are the same person.</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)}>Cancel</Button>
            <Button
              disabled={merging}
              onClick={() => preview && doMerge(preview)}
              className={preview?.confidence === 'review' ? 'bg-amber-600 hover:bg-amber-700 text-white' : ''}
            >
              {merging ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              {preview?.confidence === 'review' ? 'Merge anyway' : 'Confirm merge'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Malformed faculty records. Nothing here is auto-resolved: each needs an Admin
 * to repair it, point it at a real teacher, or retire it.
 */
export function DataIssues({ onChanged }: { onChanged?: () => void }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Corrupt[]>([]);
  const [faculty, setFaculty] = useState<{ id: string; name: string }[]>([]);
  const [mapping, setMapping] = useState<Corrupt | null>(null);
  const [target, setTarget] = useState('');
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, t] = await Promise.all([
        fetch('/api/teachers/dedup').then((r) => r.json()),
        fetch('/api/teachers').then((r) => r.json()),
      ]);
      setRows(d?.corrupt ?? []);
      setFaculty(
        Array.isArray(t)
          ? t
              .filter((x: any) => !/^r{3,}$/i.test(String(x.name).trim()) && !/[\u0000-\u001F\uFFFD]/.test(String(x.name)))
              .map((x: any) => ({ id: x.id, name: x.name }))
          : []
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const remap = async () => {
    if (!mapping || !target) return;
    setWorking(true);
    try {
      const res = await fetch('/api/teachers/remap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromTeacherId: mapping.id, toTeacherId: target }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'Could not remap', description: data.error, variant: 'destructive' });
        return;
      }
      toast({ title: 'References remapped', description: data.message });
      setMapping(null);
      setTarget('');
      await load();
      onChanged?.();
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return (
      <div className="py-10 text-center text-sm text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Checking faculty data…
      </div>
    );
  }

  if (!rows.length) {
    return (
      <Card><CardContent className="py-12 text-center">
        <ShieldCheck className="w-10 h-10 text-emerald-300 mx-auto mb-3" />
        <p className="text-sm font-medium text-slate-700">No malformed faculty records</p>
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        {rows.length} record(s) fail validation. A record holding references cannot be deleted until those
        references are pointed at a real faculty member.
      </p>

      {rows.map((c) => (
        <Card key={c.id}>
          <CardContent className="pt-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900 font-mono text-sm">{safe(c.name, 34)}</p>
                <p className="text-xs text-slate-600 font-mono">{safe(c.email, 40)}</p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {c.problems.map((p) => (
                    <Badge key={p} variant="outline" className="text-[10px] bg-rose-50 text-rose-700 border-rose-200">
                      {p}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-1.5">
                  {c.references.total} reference(s){' '}
                  {c.references.total > 0 && (
                    <span className="text-slate-400">
                      — {Object.entries(c.references.byLabel).map(([k, v]) => `${v} ${k}`).join(', ')}
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500 mt-1">{c.note}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <Button size="sm" variant="outline"
                  onClick={() => { setMapping(c); setTarget(''); }}>
                  <Link2 className="w-3.5 h-3.5 mr-1.5" /> Map to Existing Faculty
                </Button>
                <Button
                  size="sm" variant="outline"
                  disabled={c.references.total > 0}
                  title={c.references.total > 0 ? 'Reassign its references first' : 'Delete permanently'}
                  className="border-rose-300 text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                  onClick={async () => {
                    const res = await fetch(`/api/teachers/${c.id}`, { method: 'DELETE' });
                    const d = await res.json();
                    toast({
                      title: res.ok ? 'Record deleted' : 'Cannot delete',
                      description: d.message || d.error,
                      variant: res.ok ? undefined : 'destructive',
                    });
                    await load();
                    onChanged?.();
                  }}
                >
                  {c.references.total > 0 ? <Ban className="w-3.5 h-3.5 mr-1.5" /> : null}
                  Delete
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog open={!!mapping} onOpenChange={(o) => { if (!o) { setMapping(null); setTarget(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Map to existing faculty</DialogTitle>
            <DialogDescription>
              Every reference held by this malformed record moves to the faculty member you choose. Nothing
              is deleted until the move is verified.
            </DialogDescription>
          </DialogHeader>

          {mapping && (
            <div className="space-y-4 text-sm">
              <div className="rounded-lg border bg-slate-50 p-3 text-xs">
                <p className="font-mono text-slate-800">{safe(mapping.name, 40)}</p>
                <p className="text-slate-500 mt-1">
                  {mapping.references.total} reference(s) will be repointed:
                </p>
                <ul className="mt-1 space-y-0.5">
                  {Object.entries(mapping.references.byLabel).map(([k, v]) => (
                    <li key={k} className="text-slate-700">• {v} {k}</li>
                  ))}
                </ul>
              </div>

              <div>
                <Label>Real faculty member</Label>
                <Select value={target} onValueChange={setTarget}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Choose a teacher…" /></SelectTrigger>
                  <SelectContent>
                    {faculty.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setMapping(null); setTarget(''); }}>Cancel</Button>
            <Button disabled={!target || working} onClick={remap}>
              {working ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Link2 className="w-4 h-4 mr-2" />}
              Repoint references
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
