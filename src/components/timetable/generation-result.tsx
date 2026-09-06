'use client';

import { AlertTriangle, CheckCircle2, X, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface UnresolvedSlot {
  grade: string;
  section: string;
  day?: string;
  period?: number;
  subject: string;
}

export interface GenerationResultData {
  success?: boolean;
  message?: string;
  stats?: {
    totalGenerated?: number;
    unassigned?: number;
    clashesIntroducedByThisRun?: number;
    preExistingClashesElsewhere?: number;
    grade?: string;
    section?: string;
  };
  unassignedSlots?: UnresolvedSlot[];
}

/**
 * Post-generation report.
 *
 * Requirements the solver could not place are shown, never hidden: automatic
 * generation will not fill a period with a teacher who is not mapped to the
 * subject, so a gap here means a real staffing constraint an Admin needs to
 * resolve (map a teacher to the subject/grade, or raise their capacity).
 */
export function GenerationResult({
  result,
  onDismiss,
}: {
  result: GenerationResultData | null;
  onDismiss: () => void;
}) {
  if (!result) return null;

  const scheduled = result.stats?.totalGenerated ?? 0;
  const unresolved = result.stats?.unassigned ?? 0;
  const clashes = result.stats?.clashesIntroducedByThisRun ?? 0;
  const clean = unresolved === 0 && clashes === 0;

  // Group the unresolved periods by class + subject so the list reads as
  // requirements rather than as individual empty cells.
  const grouped = new Map<string, { grade: string; section: string; subject: string; count: number }>();
  for (const slot of result.unassignedSlots ?? []) {
    const key = `${slot.grade}|${slot.section}|${slot.subject}`;
    const existing = grouped.get(key);
    if (existing) existing.count += 1;
    else grouped.set(key, { grade: slot.grade, section: slot.section, subject: slot.subject, count: 1 });
  }
  const requirements = [...grouped.values()].sort((a, b) => b.count - a.count);

  return (
    <div
      className={`relative rounded-xl border p-5 mb-6 ${
        clean ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'
      }`}
    >
      <Button
        size="sm"
        variant="ghost"
        onClick={onDismiss}
        className="absolute top-3 right-3 h-7 w-7 p-0 text-slate-500 hover:text-slate-800"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </Button>

      <div className="flex items-start gap-3">
        {clean ? (
          <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <h3 className={`font-bold text-base ${clean ? 'text-emerald-900' : 'text-amber-900'}`}>
            {clean ? 'Generation completed' : 'Generation completed with warnings'}
          </h3>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 mt-2 text-sm">
            <span className="text-slate-700">
              Scheduled: <strong className="text-slate-900">{scheduled}</strong> periods
            </span>
            <span className={unresolved ? 'text-amber-800' : 'text-slate-700'}>
              Unresolved: <strong className={unresolved ? 'text-amber-900' : 'text-slate-900'}>{unresolved}</strong> periods
            </span>
            <span className={clashes ? 'text-rose-800' : 'text-slate-700'}>
              Hard clashes: <strong className={clashes ? 'text-rose-900' : 'text-emerald-700'}>{clashes}</strong>
            </span>
          </div>

          {requirements.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-amber-900 mb-2">
                Unresolved scheduling requirements
              </p>
              <div className="space-y-1.5">
                {requirements.map((r) => (
                  <div
                    key={`${r.grade}-${r.section}-${r.subject}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white border border-amber-200"
                  >
                    <div className="text-sm">
                      <span className="font-semibold text-slate-900">
                        {r.grade}-{r.section}
                      </span>
                      <span className="text-slate-400 mx-2">·</span>
                      <span className="text-slate-800">{r.subject}</span>
                      <Badge variant="outline" className="ml-2 text-[10px] bg-amber-50 text-amber-800 border-amber-300">
                        {r.count} period{r.count === 1 ? '' : 's'}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      No qualified teacher available within configured capacity
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex items-start gap-2 mt-3 text-[11px] text-amber-800">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <p>
                  These were left empty on purpose. Automatic generation never assigns a teacher who is not
                  mapped to the subject. Map a qualified teacher in Faculty Directory, or adjust the weekly
                  requirement in Subject Management, then regenerate.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
