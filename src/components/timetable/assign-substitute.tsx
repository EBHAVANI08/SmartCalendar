'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Search, Loader2, CheckCircle2, Ban, AlertTriangle, UserCheck, Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

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
  coversThisWeek: number;
  recommendation: string;
}

/**
 * Substitute picker for one affected period.
 *
 * A teacher already occupied in that period is shown but disabled - there is
 * no override path for a clash. A teacher who is free but not mapped to the
 * subject requires an explicit override with a reason, which is audited.
 *
 * Assigning here never edits the timetable: the permanent slot keeps naming
 * the regular teacher.
 */
export function AssignSubstituteDialog({
  substitutionId,
  open,
  onOpenChange,
  onAssigned,
}: {
  substitutionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssigned?: () => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<any>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [recommended, setRecommended] = useState<Candidate[]>([]);
  const [search, setSearch] = useState('');
  const [assigning, setAssigning] = useState<string | null>(null);
  const [overrideFor, setOverrideFor] = useState<Candidate | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    if (!substitutionId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/substitutions/${substitutionId}/assign`);
      const data = await res.json();
      if (res.ok && data.success) {
        setInfo(data.substitution);
        setCandidates(data.candidates);
        setRecommended(data.recommended);
      }
    } finally {
      setLoading(false);
    }
  }, [substitutionId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const assign = async (c: Candidate, manualOverride = false, overrideReason?: string) => {
    if (!substitutionId) return;
    setAssigning(c.id);
    try {
      const res = await fetch(`/api/substitutions/${substitutionId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ substituteId: c.id, manualOverride, overrideReason }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.requiresOverride) {
          setOverrideFor(c);
          return;
        }
        toast({ title: 'Cannot assign', description: data.error, variant: 'destructive' });
        return;
      }

      toast({
        title: data.manualOverride ? 'Assigned with override' : 'Substitute assigned',
        description: data.message,
      });
      setOverrideFor(null);
      setReason('');
      onOpenChange(false);
      onAssigned?.();
    } finally {
      setAssigning(null);
    }
  };

  const filtered = candidates.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.subjects.some((s) => s.toLowerCase().includes(search.toLowerCase()))
  );

  const Row = ({ c }: { c: Candidate }) => {
    const blocked = !c.available;
    return (
      <div
        className={`flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 rounded-lg border ${
          blocked ? 'bg-slate-50 border-slate-200 opacity-70' : 'bg-white border-slate-200'
        }`}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-slate-900">{c.name}</span>
            {c.qualifiedSubject ? (
              <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                <CheckCircle2 className="w-3 h-3 mr-1" /> subject match
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                <AlertTriangle className="w-3 h-3 mr-1" /> not mapped to subject
              </Badge>
            )}
            {c.qualifiedGrade && (
              <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                grade ok
              </Badge>
            )}
            {blocked && (
              <Badge variant="outline" className="text-[10px] bg-rose-50 text-rose-700 border-rose-200">
                <Ban className="w-3 h-3 mr-1" /> {c.inactive ? 'deactivated' : 'busy'}
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {c.subjects.join(', ') || 'no subjects'} · {c.dailyWorkload} periods that day
            {c.coversThisWeek > 0 && ` · ${c.coversThisWeek} cover(s) that date`}
            {' · '}{c.recommendation}
          </p>
        </div>
        <Button
          size="sm"
          variant={c.qualifiedSubject ? 'default' : 'outline'}
          disabled={blocked || assigning !== null}
          onClick={() => assign(c)}
          className="h-8 text-xs shrink-0"
        >
          {assigning === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Assign'}
        </Button>
      </div>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assign a substitute</DialogTitle>
            <DialogDescription>
              {info
                ? `${info.grade}-${info.section} · Period ${info.period} · ${info.subject} · ${info.date}`
                : 'Loading…'}
              <br />
              This covers the one date only. The permanent timetable keeps naming the regular teacher.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <p className="py-10 text-center text-sm text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Finding available teachers…
            </p>
          ) : (
            <div className="space-y-4">
              {recommended.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" /> Recommended
                  </p>
                  <div className="space-y-2">
                    {recommended.map((c) => <Row key={c.id} c={c} />)}
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <UserCheck className="w-3.5 h-3.5 text-slate-500" />
                  <p className="text-xs font-semibold text-slate-700">Assign a different teacher</p>
                </div>
                <div className="relative mb-2">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    className="pl-9 h-9 text-sm"
                    placeholder="Search by name or subject…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  {filtered.map((c) => <Row key={c.id} c={c} />)}
                  {filtered.length === 0 && (
                    <p className="text-xs text-slate-500 py-4 text-center">No teachers match that search.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Explicit, audited override for a teacher who is free but not mapped to the subject. */}
      <Dialog open={!!overrideFor} onOpenChange={(o) => { if (!o) { setOverrideFor(null); setReason(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="w-5 h-5" /> Manual override required
            </DialogTitle>
            <DialogDescription>
              {overrideFor?.name} is not mapped to {info?.subject}. They are free in this period, so the
              assignment is possible — but it will be recorded as a manual override.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs">Reason (recorded in the audit log)</Label>
            <Input
              autoFocus
              placeholder="e.g. Only available staff member"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOverrideFor(null); setReason(''); }}>Cancel</Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={!reason.trim() || assigning !== null}
              onClick={() => overrideFor && assign(overrideFor, true, reason)}
            >
              Continue with override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
