'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface GradeCapacityRow {
  grade: string;
  demand: number;
  slots: number;
  overBy: number;
  ok: boolean;
  problem: string | null;
}

/**
 * Per-grade weekly demand (sum of subject quotas) against the grade's teaching
 * slots, from /api/school/capacity. A grade over capacity cannot be generated.
 */
export function CapacitySummary() {
  const [rows, setRows] = useState<GradeCapacityRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/school/capacity')
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !data.success) setError(data.error || 'Could not load weekly capacity.');
        else setRows(data.grades);
      })
      .catch(() => { if (!cancelled) setError('Could not load weekly capacity.'); });
    return () => { cancelled = true; };
  }, []);

  return (
    <Card className="border-slate-200 shadow-sm rounded-3xl">
      <CardHeader className="p-6 pb-4">
        <CardTitle className="text-base font-bold text-slate-900">Weekly demand per grade</CardTitle>
        <CardDescription className="text-xs text-slate-500">
          Sum of active subject quotas compared with the teaching slots in each grade&apos;s week.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6 pt-0">
        {error ? (
          <p className="text-xs text-rose-700">{error}</p>
        ) : rows === null ? (
          <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
        ) : rows.length === 0 ? (
          <p className="text-xs text-slate-500">No grade has subjects with weekly periods yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-left font-bold px-4 py-2">Grade</th>
                  <th className="text-right font-bold px-4 py-2">Demand</th>
                  <th className="text-right font-bold px-4 py-2">Slots</th>
                  <th className="text-left font-bold px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.grade} className={`border-t border-slate-100 ${row.ok ? '' : 'bg-rose-50/70'}`}>
                    <td className="px-4 py-2 font-semibold text-slate-900">{row.grade}</td>
                    <td className={`px-4 py-2 text-right font-bold ${row.overBy > 0 ? 'text-rose-700' : 'text-slate-900'}`}>{row.demand}</td>
                    <td className="px-4 py-2 text-right text-slate-700">{row.slots}</td>
                    <td className="px-4 py-2">
                      {row.ok ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" /> Fits</span>
                      ) : (
                        <span className="inline-flex items-start gap-1 text-rose-700"><AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {row.problem}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
