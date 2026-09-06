'use client';

import { useCallback, useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import SchoolSettingsPage from '../settings/page';

interface SetupStep {
  id: string;
  label: string;
  done: boolean;
  detail: string;
  required: boolean;
}

const STEP_TAB: Record<string, { tab: string; sub?: string }> = {
  profile: { tab: 'profile' },
  dayconfig: { tab: 'timetable', sub: 'days' },
  classes: { tab: 'timetable', sub: 'structure' },
  subjects: { tab: 'timetable', sub: 'subjects' },
  mapping: { tab: 'timetable', sub: 'subjects' },
  rooms: { tab: 'timetable', sub: 'rooms' },
};

function SchoolSetupContent() {
  const router = useRouter();
  const [steps, setSteps] = useState<SetupStep[]>([]);
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/school/setup-status');
      if (!res.ok) return;
      const d = await res.json().catch(() => null);
      if (!d?.success) return;
      setSteps(d.steps ?? []);
      setProgress({ completed: d.completed, total: d.total });
    } catch {
      /* the page works without the progress badge */
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const outstanding = steps.filter((s) => s.required && !s.done);

  const handleStepClick = (stepId: string) => {
    const target = STEP_TAB[stepId];
    if (target) {
      if (target.sub) {
        router.push(`/school-setup?tab=${target.tab}&sub=${target.sub}`);
      } else {
        router.push(`/school-setup?tab=${target.tab}`);
      }
    }
  };

  const headerBadge = progress ? (
    <Badge
      variant="outline"
      data-testid="setup-progress"
      className={`text-[11px] font-bold shrink-0 ${
        progress.completed === progress.total
          ? 'border-emerald-300 text-emerald-800 bg-emerald-50'
          : 'border-amber-300 text-amber-800 bg-amber-50'
      }`}
    >
      {progress.completed === progress.total ? (
        <Check className="w-3.5 h-3.5 text-emerald-600 mr-1 inline" />
      ) : null}
      {progress.completed} of {progress.total} setup steps complete
    </Badge>
  ) : null;

  return (
    <div className="w-full space-y-4">
      {outstanding.length > 0 && (
        <div className="flex items-center gap-3 p-3.5 rounded-2xl border border-amber-200 bg-amber-50/80">
          <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wider shrink-0">Still to do:</span>
          <div className="flex flex-wrap gap-2">
            {outstanding.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => handleStepClick(s.id)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-amber-300 bg-white text-[11px] font-semibold text-amber-900 hover:bg-amber-100 transition-colors shadow-2xs"
              >
                {s.label}
                <ArrowRight className="w-3 h-3 text-amber-700" />
              </button>
            ))}
          </div>
        </div>
      )}

      <SchoolSettingsPage
        pageTitle="School Setup"
        pageDescription="Configure once. Faculty, Timetable Studio, Leave and Substitution all read what you set here."
        headerExtra={headerBadge}
      />
    </div>
  );
}

export default function SchoolSetupPage() {
  return (
    <Suspense fallback={<div className="p-6 text-xs text-slate-400">Loading School Setup…</div>}>
      <SchoolSetupContent />
    </Suspense>
  );
}
