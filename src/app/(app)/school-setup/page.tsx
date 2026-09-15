'use client';

import { useCallback, useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowRight, Check, Sparkles, RefreshCw, Activity,
  Layers, BookOpen, Users, DoorOpen, CalendarClock,
  ShieldCheck, CheckCircle2, AlertTriangle, Play, ChevronRight, Info
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import SchoolSettingsPage from '../settings/page';

interface SetupStep {
  id: string;
  label: string;
  done: boolean;
  detail: string;
  required: boolean;
}

interface DiagnosticData {
  score: number;
  stats: {
    gradesCount: number;
    sectionsCount: number;
    subjectsCount: number;
    facultyCount: number;
    roomsCount: number;
    workingDays: number;
    totalWeeklyPeriods: number;
    unmappedSubjectsCount: number;
    hasTimetable: boolean;
    hasPublishedTimetable: boolean;
  };
  issues: {
    type: 'error' | 'warning' | 'info';
    title: string;
    message: string;
    actionTab: string;
    actionSub?: string;
  }[];
  tenantSecurity: {
    tenantId: string;
    tenantCode: string;
    dataIsolation: string;
    sessionAuth: string;
    biometricWebhook: string;
  };
}

const STEP_CONFIG: Record<string, { tab: string; sub?: string; icon: any }> = {
  profile: { tab: 'profile', icon: Activity },
  dayconfig: { tab: 'timetable', sub: 'days', icon: CalendarClock },
  classes: { tab: 'timetable', sub: 'structure', icon: Layers },
  subjects: { tab: 'timetable', sub: 'subjects', icon: BookOpen },
  faculty: { tab: 'timetable', sub: 'subjects', icon: Users },
  mapping: { tab: 'timetable', sub: 'subjects', icon: Users },
  rooms: { tab: 'timetable', sub: 'rooms', icon: DoorOpen },
  timetable: { tab: 'timetable', sub: 'summary', icon: Sparkles },
};

function SchoolSetupContent() {
  const router = useRouter();
  const { toast } = useToast();
  const [steps, setSteps] = useState<SetupStep[]>([]);
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticData | null>(null);
  const [diagModalOpen, setDiagModalOpen] = useState(false);
  const [syncingFaculty, setSyncingFaculty] = useState(false);
  const [runningDiag, setRunningDiag] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const [resStatus, resDiag] = await Promise.all([
        fetch('/api/school/setup-status'),
        fetch('/api/school/diagnostics'),
      ]);

      if (resStatus.ok) {
        const d = await resStatus.json().catch(() => null);
        if (d?.success) {
          setSteps(d.steps ?? []);
          setProgress({ completed: d.completed, total: d.total });
        }
      }

      if (resDiag.ok) {
        const diag = await resDiag.json().catch(() => null);
        if (diag?.success) {
          setDiagnostics(diag);
        }
      }
    } catch {
      /* the page works without blocking */
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleStepClick = (stepId: string) => {
    const target = STEP_CONFIG[stepId];
    if (target) {
      if (target.sub) {
        router.push(`/school-setup?tab=${target.tab}&sub=${target.sub}`);
      } else {
        router.push(`/school-setup?tab=${target.tab}`);
      }
    }
  };

  const handleSyncFaculty = async () => {
    setSyncingFaculty(true);
    try {
      const res = await fetch('/api/subjects/sync-faculty', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        toast({
          title: 'Faculty Subjects Synced',
          description: `Auto-discovered ${data.syncedSubjectsCount ?? 0} subject(s) across your faculty team.`,
        });
        await loadStatus();
      } else {
        toast({
          title: 'Sync Failed',
          description: data?.error || 'Could not sync faculty subjects.',
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      toast({
        title: 'Sync Failed',
        description: err?.message || 'Network error.',
        variant: 'destructive',
      });
    } finally {
      setSyncingFaculty(false);
    }
  };

  const handleRunDiagnostic = async () => {
    setRunningDiag(true);
    try {
      const res = await fetch('/api/school/diagnostics');
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setDiagnostics(data);
        setDiagModalOpen(true);
      }
    } finally {
      setRunningDiag(false);
    }
  };

  const pct = progress && progress.total > 0
    ? Math.round((progress.completed / progress.total) * 100)
    : diagnostics?.score ?? 0;

  const outstanding = steps.filter((s) => s.required && !s.done);

  return (
    <div className="w-full space-y-5">
      {/* ── Setup Command Center HUD ── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0B1528] via-[#10203E] to-[#0A1120] text-white p-6 md:p-7 border border-blue-900/40 shadow-xl">
        {/* Background glow accents */}
        <div className="absolute -right-20 -top-20 w-80 h-80 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 -bottom-20 w-72 h-72 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Left: Title & Readiness Status */}
          <div className="space-y-2 max-w-xl">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-400/30 backdrop-blur-md">
                <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                Institutional Setup Command Center
              </span>
              <span className="text-xs font-semibold text-slate-300">
                Tenant: <span className="font-mono text-white bg-white/10 px-1.5 py-0.5 rounded">{diagnostics?.tenantSecurity?.tenantCode || 'ACTIVE'}</span>
              </span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              School Configuration &amp; Readiness
            </h2>
            <p className="text-xs sm:text-sm text-slate-300/90 leading-relaxed font-normal">
              Setup working periods, grades, subject rules, and faculty assignments. All timetable generation and substitution engines reference these settings.
            </p>

            {/* Live Progress Bar */}
            <div className="pt-2 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-slate-300 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-emerald-400" />
                  Readiness Score: <span className="text-white font-extrabold">{pct}% Complete</span>
                </span>
                <span className="text-blue-300 text-[11px]">
                  {progress ? `${progress.completed} of ${progress.total} Core Steps Done` : 'Analyzing readiness…'}
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-800/80 rounded-full overflow-hidden border border-white/10 p-0.5">
                <div
                  className="h-full rounded-full transition-all duration-700 bg-gradient-to-r from-blue-500 via-indigo-400 to-emerald-400"
                  style={{ width: `${Math.max(5, pct)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Right: Quick Action Buttons & Stats */}
          <div className="flex flex-col sm:flex-row lg:flex-col gap-3 shrink-0">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-2">
              <div className="bg-white/5 backdrop-blur-md border border-white/10 p-2.5 rounded-2xl text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Grades</span>
                <span className="text-base font-black text-white">{diagnostics?.stats.gradesCount ?? '—'}</span>
              </div>
              <div className="bg-white/5 backdrop-blur-md border border-white/10 p-2.5 rounded-2xl text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Subjects</span>
                <span className="text-base font-black text-white">{diagnostics?.stats.subjectsCount ?? '—'}</span>
              </div>
              <div className="bg-white/5 backdrop-blur-md border border-white/10 p-2.5 rounded-2xl text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Faculty</span>
                <span className="text-base font-black text-white">{diagnostics?.stats.facultyCount ?? '—'}</span>
              </div>
              <div className="bg-white/5 backdrop-blur-md border border-white/10 p-2.5 rounded-2xl text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Rooms</span>
                <span className="text-base font-black text-white">{diagnostics?.stats.roomsCount ?? '—'}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleSyncFaculty}
                disabled={syncingFaculty}
                className="flex-1 bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs font-bold h-9 gap-1.5 backdrop-blur-sm"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncingFaculty ? 'animate-spin text-amber-300' : 'text-blue-300'}`} />
                <span>{syncingFaculty ? 'Syncing…' : 'Sync Faculty'}</span>
              </Button>

              <Button
                size="sm"
                onClick={handleRunDiagnostic}
                disabled={runningDiag}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold h-9 gap-1.5 shadow-md shadow-blue-900/50"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                <span>Health Check</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Pipeline Step Navigator */}
        <div className="mt-6 pt-5 border-t border-white/10">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-[11px] font-extrabold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-blue-400" /> Setup Checklist Pipeline
            </span>
            {outstanding.length === 0 ? (
              <span className="text-[11px] font-bold text-emerald-300 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> All Core Setup Steps Complete
              </span>
            ) : (
              <span className="text-[11px] font-bold text-amber-300">
                {outstanding.length} Step(s) Require Attention
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {steps.map((s) => {
              const cfg = STEP_CONFIG[s.id] || { icon: Activity };
              const Icon = cfg.icon;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleStepClick(s.id)}
                  className={`group flex flex-col text-left p-2.5 rounded-xl border transition-all text-xs ${
                    s.done
                      ? 'bg-emerald-950/30 border-emerald-500/30 hover:bg-emerald-900/40 text-slate-200'
                      : s.required
                      ? 'bg-amber-950/30 border-amber-500/40 hover:bg-amber-900/40 text-amber-100'
                      : 'bg-white/5 border-white/10 hover:bg-white/10 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <Icon className={`w-3.5 h-3.5 ${s.done ? 'text-emerald-400' : 'text-amber-400'}`} />
                    {s.done ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <ArrowRight className="w-3.5 h-3.5 text-amber-400 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                    )}
                  </div>
                  <span className="font-bold text-[11px] leading-tight line-clamp-1">{s.label}</span>
                  <span className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">{s.detail}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Diagnostic Modal ── */}
      <Dialog open={diagModalOpen} onOpenChange={setDiagModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-black text-slate-900">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
              School Setup Diagnostics &amp; Health Audit
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Real-time validation of tenant configuration, period balances, subject assignments, and isolation security.
            </DialogDescription>
          </DialogHeader>

          {diagnostics && (
            <div className="space-y-4 pt-2">
              {/* Score header */}
              <div className="p-4 rounded-2xl bg-slate-900 text-white flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Readiness Score</span>
                  <p className="text-2xl font-black text-white">{diagnostics.score}%</p>
                </div>
                <div className="text-right">
                  <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-xs font-bold">
                    Multi-Tenant Scoped
                  </Badge>
                  <p className="text-[10px] font-mono text-slate-400 mt-1">Tenant: {diagnostics.tenantSecurity.tenantCode}</p>
                </div>
              </div>

              {/* Issues & Recommendations */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Findings &amp; Recommendations</span>
                {diagnostics.issues.length === 0 ? (
                  <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div>
                      <p className="text-xs font-bold">Everything looks great!</p>
                      <p className="text-[11px] text-emerald-800">Your school profile, days, classes, subjects, and teachers are properly configured.</p>
                    </div>
                  </div>
                ) : (
                  diagnostics.issues.map((iss, i) => (
                    <div
                      key={i}
                      className={`p-3.5 rounded-xl border flex items-start justify-between gap-3 ${
                        iss.type === 'error'
                          ? 'border-red-200 bg-red-50 text-red-900'
                          : iss.type === 'warning'
                          ? 'border-amber-200 bg-amber-50 text-amber-900'
                          : 'border-blue-200 bg-blue-50 text-blue-900'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <p className="text-xs font-bold">{iss.title}</p>
                        <p className="text-[11px] opacity-90">{iss.message}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setDiagModalOpen(false);
                          if (iss.actionSub) {
                            router.push(`/school-setup?tab=${iss.actionTab}&sub=${iss.actionSub}`);
                          } else {
                            router.push(`/school-setup?tab=${iss.actionTab}`);
                          }
                        }}
                        className="text-[10px] h-7 font-bold shrink-0 bg-white"
                      >
                        Fix Now <ChevronRight className="w-3 h-3 ml-1" />
                      </Button>
                    </div>
                  ))
                )}
              </div>

              {/* Security Audit summary */}
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-2">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Tenant Security Integrity</span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  <div className="p-2 rounded-lg bg-white border border-slate-200">
                    <span className="text-[10px] text-slate-400 block font-bold">Data Isolation</span>
                    <span className="font-bold text-emerald-700">Tenant-Scoped</span>
                  </div>
                  <div className="p-2 rounded-lg bg-white border border-slate-200">
                    <span className="text-[10px] text-slate-400 block font-bold">Session Security</span>
                    <span className="font-bold text-blue-700">HMAC-SHA256</span>
                  </div>
                  <div className="p-2 rounded-lg bg-white border border-slate-200">
                    <span className="text-[10px] text-slate-400 block font-bold">Biometric Listener</span>
                    <span className="font-bold text-indigo-700">Active</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Main Settings Tabs & Panels */}
      <SchoolSettingsPage
        pageTitle="Institutional Configuration"
        pageDescription="Configure your school profile, timetable structure, automation limits, hardware endpoints, and tenant security."
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
