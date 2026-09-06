'use client';

import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Sparkles, AlertTriangle, User, Clock } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface LessonContext {
  assignmentId: string;
  source: 'lesson_plan' | 'ai_generated' | 'none';
  date: string;
  period: number;
  grade: string;
  section: string;
  subject: string;
  regularTeacher: { id: string; name: string; email: string } | null;
  substituteTeacher: { id: string; name: string; email: string } | null;
  topic: string | null;
  previousTopic: string | null;
  objectives: string[];
  warmUp: string | null;
  mainActivity: string | null;
  assessment: string | null;
  homework: string | null;
  resources: string[];
  keyVocabulary: string[];
  note: string | null;
}

function Section({ title, body }: { title: string; body: string | null }) {
  if (!body) return null;
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{title}</p>
      <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">{body}</p>
    </div>
  );
}

function Chips({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span key={item} className="px-2 py-0.5 rounded-md bg-slate-100 text-[11px] text-slate-700">{item}</span>
        ))}
      </div>
    </div>
  );
}

/**
 * What a substitute is shown before covering a period.
 *
 * The lesson-pack API already existed but nothing in the product called it, so a
 * substitute was assigned and told nothing about what to teach.
 */
export function LessonContextDialog({
  substitutionId,
  open,
  onOpenChange,
}: {
  substitutionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [data, setData] = useState<LessonContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!substitutionId) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(`/api/substitutions/lesson-pack?assignmentId=${substitutionId}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body?.error || `Could not load lesson context (HTTP ${res.status}).`);
      setData(body.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load lesson context.');
    } finally {
      setLoading(false);
    }
  }, [substitutionId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const hasContent = Boolean(
    data && (data.warmUp || data.mainActivity || data.assessment || data.homework || data.objectives.length)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="lesson-context-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-600" />
            Lesson Context
          </DialogTitle>
        </DialogHeader>

        {loading && <p className="text-xs text-slate-400 py-8 text-center">Loading lesson context…</p>}

        {error && !loading && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl border border-red-200 bg-red-50">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-[11px] text-red-800">{error}</p>
              <Button size="sm" variant="outline" className="mt-2 h-7 text-[11px]" onClick={load}>Try again</Button>
            </div>
          </div>
        )}

        {data && !loading && (
          <div className="space-y-3">
            {/* Who, what, when */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm font-bold text-slate-900">
                  {data.grade} {data.section} · {data.subject}
                </p>
                <Badge variant="outline" className="text-[10px] font-bold gap-1">
                  <Clock className="w-3 h-3" /> Period {data.period} · {data.date}
                </Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <p className="flex items-center gap-1.5 text-slate-600">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  Regular teacher: <span className="font-semibold text-slate-900">{data.regularTeacher?.name ?? '—'}</span>
                </p>
                <p className="flex items-center gap-1.5 text-slate-600">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  Covering: <span className="font-semibold text-slate-900">{data.substituteTeacher?.name ?? 'Not yet assigned'}</span>
                </p>
              </div>
            </div>

            {/* Provenance - a teacher's plan and a machine's guess must not look alike */}
            {data.source === 'lesson_plan' && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50">
                <BookOpen className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                <p className="text-[11px] text-emerald-900 font-semibold">
                  From a lesson plan recorded for this class.
                </p>
              </div>
            )}
            {data.source === 'ai_generated' && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-amber-300 bg-amber-50">
                <Sparkles className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                <p className="text-[11px] text-amber-900 font-semibold">
                  AI-generated suggestion — not written by the regular teacher. Review before teaching.
                </p>
              </div>
            )}

            {(data.topic || data.previousTopic) && (
              <div className="rounded-xl border border-slate-200 p-3 space-y-1">
                {data.topic && (
                  <p className="text-xs text-slate-700">
                    <span className="font-bold text-slate-900">Today&apos;s topic:</span> {data.topic}
                  </p>
                )}
                {data.previousTopic && (
                  <p className="text-xs text-slate-600">
                    <span className="font-bold text-slate-800">Previously covered:</span> {data.previousTopic}
                  </p>
                )}
              </div>
            )}

            <Chips title="Learning objectives" items={data.objectives} />
            <Section title="Warm-up" body={data.warmUp} />
            <Section title="Main activity" body={data.mainActivity} />
            <Section title="Assessment / check for understanding" body={data.assessment} />
            <Section title="Homework" body={data.homework} />
            <Chips title="Resources" items={data.resources} />
            <Chips title="Key vocabulary" items={data.keyVocabulary} />

            {!hasContent && data.note && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5" data-testid="lesson-context-empty">
                <p className="text-xs font-bold text-amber-900">No lesson content available</p>
                <p className="text-[11px] text-amber-800 mt-1 leading-relaxed">{data.note}</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
