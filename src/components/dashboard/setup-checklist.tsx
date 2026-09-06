'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronRight, X, ListChecks, ArrowRight, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export interface Step {
  id: string;
  label: string;
  done: boolean;
  href: string;
  detail: string;
  required: boolean;
  skipped?: boolean;
}

export interface SetupStatus {
  steps: Step[];
  completed: number;
  total: number;
  complete: boolean;
  nextStep: string | null;
  legacyMode: boolean;
}

/**
 * Sleek, professional, non-intrusive setup banner for the main Dashboard.
 * Takes minimal space and links directly to School Settings.
 */
export function SetupChecklist() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/school/setup-status');
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (data?.success) setStatus(data);
    } catch {
      /* the dashboard works without it */
    }
  }, []);

  useEffect(() => {
    load();
    try {
      setDismissed(localStorage.getItem('sc_setup_dismissed') === '1');
    } catch {
      /* private browsing */
    }
  }, [load]);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem('sc_setup_dismissed', '1');
    } catch {
      /* not important enough to fail on */
    }
  };

  if (!status || status.complete || dismissed) return null;

  const pct = status.total ? Math.round((status.completed / status.total) * 100) : 0;

  return (
    <div
      data-testid="setup-checklist"
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 px-4 rounded-2xl bg-gradient-to-r from-blue-50/90 via-indigo-50/70 to-slate-50 border border-blue-200/80 shadow-xs"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
          <Sparkles className="w-4 h-4 text-amber-300" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-[#081A33]">School Setup in Progress</span>
            <Badge variant="outline" className="bg-white/80 border-blue-200 text-blue-700 font-bold text-[10px] px-1.5 py-0 h-4">
              {status.completed} / {status.total} Steps ({pct}%)
            </Badge>
          </div>
          <p className="text-[11px] text-[#64748B] truncate mt-0.5">
            Complete your timetable structure, subjects, and room mapping to unlock full AI generation.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
        <Link
          href="/settings?tab=timetable"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-all"
        >
          <span>Continue Setup</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
        <Button
          size="sm"
          variant="ghost"
          onClick={dismiss}
          className="h-7 w-7 p-0 text-slate-400 hover:text-slate-700 rounded-lg"
          aria-label="Dismiss setup banner"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Full, rich Setup Checklist Card designed specifically for School Settings / School Setup.
 */
export function SetupChecklistFull() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/school/setup-status');
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (data?.success) setStatus(data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !status) return null;

  const pct = status.total ? Math.round((status.completed / status.total) * 100) : 0;

  return (
    <Card className="border-slate-200 shadow-sm overflow-hidden" data-testid="setup-checklist-full">
      <div className="p-5 pb-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-white shrink-0">
            <ListChecks className="w-5 h-5 text-amber-300" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              Institution Setup &amp; Readiness
              {status.complete && (
                <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-400/30 text-[10px] font-bold">
                  Ready
                </Badge>
              )}
            </h2>
            <p className="text-[11px] text-slate-300 mt-0.5">
              {status.completed} of {status.total} mandatory milestones completed ({pct}%)
            </p>
          </div>
        </div>

        <div className="w-full sm:w-44 space-y-1.5">
          <div className="flex justify-between text-[10px] font-semibold text-slate-300">
            <span>Progress</span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 rounded-full bg-white/15 overflow-hidden">
            <div
              className={`h-full transition-all ${status.complete ? 'bg-emerald-400' : 'bg-gradient-to-r from-blue-400 to-indigo-300'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="p-4 bg-slate-50/50">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {status.steps.map((step) => (
            <Link
              key={step.id}
              href={step.href}
              className={`flex items-start gap-2.5 p-3 rounded-xl border transition-all ${
                step.done
                  ? 'border-emerald-200/80 bg-white hover:border-emerald-300 hover:shadow-xs'
                  : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/30 hover:shadow-xs'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 border mt-0.5 ${
                  step.done
                    ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                    : 'border-slate-300 bg-slate-50 text-transparent'
                }`}
              >
                {step.done && <Check className="w-3.5 h-3.5 stroke-[3]" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-bold text-slate-900 truncate">
                    {step.label}
                  </span>
                  {!step.required && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Optional</span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 truncate mt-0.5">{step.detail}</p>
              </div>
              {!step.done && <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-1" />}
            </Link>
          ))}
        </div>
      </div>
    </Card>
  );
}
