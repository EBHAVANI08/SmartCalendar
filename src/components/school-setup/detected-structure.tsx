'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Info, Layers, Loader2, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

interface DetectedGrade {
  grade: string;
  configured: boolean;
  sections: { section: string; periods: number }[];
  totalPeriods: number;
}

interface DetectedSubject {
  grade: string;
  subject: string;
  periods: number;
}

interface Detection {
  hasExistingTimetable: boolean;
  totalPeriods: number;
  grades: DetectedGrade[];
  detectedSubjects: DetectedSubject[];
  summary: {
    gradesDetected: number;
    gradesConfigured: number;
    sectionsDetected: number;
    subjectsConfigured: number;
    subjectsDetectedOnly: number;
  };
}

/**
 * Academic structure a school already has, whether or not it was ever configured.
 *
 * An established tenant has grades, sections and subjects living in its
 * timetable. Showing School Setup as blank would be untrue, and writing what we
 * infer would be worse - a subject that appears once in a legacy import is not
 * necessarily one the school wants to schedule against.
 *
 * So detection is shown, labelled as detected, and adopted only on request.
 */
export function DetectedStructure({ onAdopted }: { onAdopted?: () => void }) {
  const { toast } = useToast();
  const [data, setData] = useState<Detection | null>(null);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [adopting, setAdopting] = useState(false);
  const [showAllSubjects, setShowAllSubjects] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/school/detected-structure');
      if (!res.ok) return;
      const body = await res.json().catch(() => null);
      if (body?.success) setData(body);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const key = (s: DetectedSubject) => `${s.grade}|${s.subject}`;

  const toggle = (s: DetectedSubject) =>
    setPicked((prev) => {
      const next = new Set(prev);
      const k = key(s);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  /** Create a GradeSubjectConfig for each chosen pair. Nothing implicit. */
  const adopt = async () => {
    if (!picked.size || !data) return;
    setAdopting(true);
    let created = 0;
    const failed: string[] = [];
    try {
      for (const k of picked) {
        const [grade, subject] = k.split('|');
        // Weekly count seeded from what the timetable already runs, so the
        // adopted rule matches reality rather than a guess.
        const found = data.detectedSubjects.find((s) => s.grade === grade && s.subject === subject);
        const weekly = Math.min(20, Math.max(1, Math.round((found?.periods ?? 1) / Math.max(1, data.grades.find((g) => g.grade === grade)?.sections.length ?? 1))));

        const res = await fetch('/api/subjects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ grade, subjectName: subject, weeklyPeriods: weekly }),
        });
        if (res.ok) created++;
        else failed.push(`${grade} · ${subject}`);
      }

      toast({
        title: `${created} subject configuration(s) added`,
        description: failed.length ? `${failed.length} could not be added: ${failed.slice(0, 3).join(', ')}` : undefined,
        variant: failed.length ? 'destructive' : undefined,
      });
      setPicked(new Set());
      await load();
      onAdopted?.();
    } finally {
      setAdopting(false);
    }
  };

  if (loading) {
    return <p className="text-xs text-slate-400 py-6 text-center">Reading your existing timetable…</p>;
  }
  if (!data?.hasExistingTimetable) {
    return (
      <Card className="border-dashed border-slate-200">
        <CardContent className="p-6 text-center">
          <Layers className="w-6 h-6 text-slate-300 mx-auto mb-2" />
          <p className="text-xs font-semibold text-slate-600">No timetable yet</p>
          <p className="text-[11px] text-slate-400 mt-1">
            Once a timetable exists, the grades, sections and subjects it uses will appear here.
          </p>
        </CardContent>
      </Card>
    );
  }

  const shownSubjects = showAllSubjects ? data.detectedSubjects : data.detectedSubjects.slice(0, 20);

  return (
    <div className="space-y-4" data-testid="detected-structure">
      <div className="flex items-start gap-2.5 p-3 rounded-xl border border-blue-200 bg-blue-50">
        <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-bold text-blue-950">Existing academic structure detected</p>
          <p className="text-[11px] text-blue-800 mt-0.5">
            Read from your {data.totalPeriods} scheduled periods. {data.summary.gradesDetected} grade(s),{' '}
            {data.summary.sectionsDetected} section(s). Nothing here has been saved — confirm what you want to adopt.
          </p>
        </div>
      </div>

      {/* Grades and sections */}
      <Card className="border-slate-200">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-bold text-slate-900">Grades &amp; Sections</CardTitle>
          <CardDescription className="text-[11px]">
            Taken from the classes your timetable actually schedules.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {data.grades.map((g) => (
              <div key={g.grade} className="rounded-xl border border-slate-200 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900">{g.grade}</span>
                  <Badge
                    variant="outline"
                    className={`text-[9px] ${g.configured ? 'border-emerald-300 text-emerald-800' : 'border-amber-300 text-amber-800'}`}
                  >
                    {g.configured ? 'configured' : 'detected only'}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {g.sections.map((s) => (
                    <span key={s.section} className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] text-slate-700">
                      {s.section} <span className="text-slate-400">({s.periods})</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Subjects present in the timetable but never configured */}
      {data.detectedSubjects.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-bold text-slate-900">
              Detected Subjects ({data.detectedSubjects.length})
            </CardTitle>
            <CardDescription className="text-[11px]">
              Scheduled in your timetable but not in Subject Management. Select the ones to adopt — the
              weekly requirement is seeded from how often each is already taught.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-3">
            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-72 overflow-y-auto">
              {shownSubjects.map((s) => (
                <label
                  key={key(s)}
                  className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    data-testid="detected-subject"
                    checked={picked.has(key(s))}
                    onChange={() => toggle(s)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-[11px] font-semibold text-slate-800 flex-1 truncate">
                    {s.subject}
                  </span>
                  <span className="text-[10px] text-slate-500">{s.grade}</span>
                  <span className="text-[10px] text-slate-400">{s.periods} periods</span>
                </label>
              ))}
            </div>

            {data.detectedSubjects.length > 20 && (
              <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setShowAllSubjects((v) => !v)}>
                {showAllSubjects ? 'Show fewer' : `Show all ${data.detectedSubjects.length}`}
              </Button>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                className="h-8 text-xs gap-1.5"
                disabled={!picked.size || adopting}
                data-testid="adopt-detected-subjects"
                onClick={adopt}
              >
                {adopting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                {adopting ? 'Adding…' : `Add ${picked.size || ''} selected to Subject Configuration`}
              </Button>
              {picked.size > 0 && (
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setPicked(new Set())}>
                  Clear
                </Button>
              )}
              <span className="text-[10px] text-slate-400">
                Nothing is added until you choose it.
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {data.detectedSubjects.length === 0 && (
        <div className="flex items-center gap-2 p-3 rounded-xl border border-emerald-200 bg-emerald-50">
          <Check className="w-4 h-4 text-emerald-700 shrink-0" />
          <p className="text-[11px] text-emerald-900">
            Every subject in your timetable is already configured.
          </p>
        </div>
      )}
    </div>
  );
}
