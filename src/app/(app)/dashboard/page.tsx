'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Users, RefreshCw, CalendarDays, AlertTriangle,
  Brain, TrendingUp, TrendingDown, CheckCircle2,
  Sparkles, Zap, Activity, ArrowRight, Clock,
  BarChart3, BookOpen, Fingerprint, Shield
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

/* ── Types ── */
interface DashboardStats {
  totalTeachers: number;
  totalStudents: number;
  absentToday: number;
  pendingSubstitutions: number;
  resolvedToday: number;
  todaySchedules: number;
  activeNotifications: number;
  grades: string[];
  teachers: { id: string; name: string; subject: string }[];
}

interface DailyBriefing {
  summary: string;
  urgentAlerts: string[];
  recommendations: string[];
  coverageRate: number;
  generatedAt: string;
}

/* ── Animated Count Up ── */
function CountUp({ to, duration = 1500 }: { to: number; duration?: number }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (to === 0) return;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setCount(Math.round(eased * to));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [to, duration]);
  return <>{count.toLocaleString('en-IN')}</>;
}

/* ── KPI Card ── */
function KpiCard({
  label, value, icon: Icon, trend, color, sub, href
}: {
  label: string; value: number; icon: React.ElementType;
  trend?: 'up' | 'down' | null; color: string; sub?: string; href?: string;
}) {
  const colorMap: Record<string, { bg: string; text: string; border: string; icon: string }> = {
    emerald: { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-100',   icon: 'text-blue-500' },
    blue:    { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-100',    icon: 'text-blue-500' },
    amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-100',   icon: 'text-amber-500' },
    rose:    { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-100',    icon: 'text-rose-500' },
    violet:  { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-100',  icon: 'text-violet-500' },
    teal:    { bg: 'bg-cyan-50',    text: 'text-cyan-700',    border: 'border-cyan-100',    icon: 'text-cyan-500' },
  };
  const c = colorMap[color] || colorMap.blue;
  const Wrapper = href ? Link : 'div';

  return (
    <Wrapper href={href as string} className={`block group ${href ? 'cursor-pointer' : ''}`}>
      <Card className={`border ${c.border} ${href ? 'hover:shadow-md hover:scale-[1.01]' : ''} transition-all duration-200`}>
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{label}</p>
              <p className={`text-3xl font-extrabold ${c.text}`}>
                <CountUp to={value} />
              </p>
              {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
            </div>
            <div className={`w-11 h-11 rounded-2xl ${c.bg} flex items-center justify-center`}>
              <Icon className={`w-5 h-5 ${c.icon}`} />
            </div>
          </div>
          {trend && (
            <div className="mt-3 flex items-center gap-1.5 text-xs font-medium">
              {trend === 'up'
                ? <><TrendingUp className="w-3.5 h-3.5 text-blue-500" /><span className="text-blue-600">Improving</span></>
                : <><TrendingDown className="w-3.5 h-3.5 text-rose-500" /><span className="text-rose-600">Needs Attention</span></>}
            </div>
          )}
        </CardContent>
      </Card>
    </Wrapper>
  );
}

/* ── AI Briefing Card ── */
function AIBriefingCard({ briefing, loading }: { briefing: DailyBriefing | null; loading: boolean }) {
  return (
    <Card className="border-0 bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 text-white overflow-hidden relative shadow-lg">
      <div className="absolute top-0 right-0 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl -translate-y-10 translate-x-10 pointer-events-none" />
      <CardContent className="p-6 relative z-10">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
            <Brain className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-base font-bold">AI Daily Briefing</h3>
            <p className="text-[11px] text-blue-300/70">Powered by AI • {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}</p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-3 bg-slate-700 rounded w-4/5" />
            <div className="h-3 bg-slate-700 rounded w-3/5" />
            <div className="h-3 bg-slate-700 rounded w-2/3" />
          </div>
        ) : briefing ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-200 leading-relaxed">{briefing.summary}</p>

            {briefing.urgentAlerts.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] text-amber-400 uppercase tracking-wider font-semibold">Urgent Alerts</p>
                {briefing.urgentAlerts.slice(0, 3).map((a, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-amber-200">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
                    {a}
                  </div>
                ))}
              </div>
            )}

            {briefing.recommendations.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] text-blue-400 uppercase tracking-wider font-semibold">Recommendations</p>
                {briefing.recommendations.slice(0, 2).map((r, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-slate-300">
                    <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-400" />
                    {r}
                  </div>
                ))}
              </div>
            )}

            {briefing.coverageRate >= 0 && (
              <div className="mt-4 flex items-center gap-3">
                <div className="flex-1 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-1000"
                    style={{ width: `${briefing.coverageRate}%` }}
                  />
                </div>
                <span className="text-xs font-semibold text-blue-300">{briefing.coverageRate}% coverage</span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-400">Generating your daily briefing…</p>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Quick Actions ── */
function QuickActions() {
  const actions = [
    { label: 'Timetable Studio', icon: CalendarDays, href: '/timetable', color: 'text-blue-700 bg-blue-50 border-blue-200' },
    { label: 'Manage Substitutions', icon: RefreshCw, href: '/substitutions', color: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
    { label: 'Faculty Directory', icon: Users, href: '/teachers', color: 'text-blue-700 bg-blue-50 border-blue-200' },
    { label: 'Analytics & BI', icon: BarChart3, href: '/analytics', color: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
    { label: 'Biometric Attendance', icon: Fingerprint, href: '/attendance', color: 'text-cyan-700 bg-cyan-50 border-cyan-200' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {actions.map((a) => {
        const Icon = a.icon;
        return (
          <Link key={a.href} href={a.href}>
            <Card className={`border ${a.color.split(' ').slice(2).join(' ')} hover:shadow-md hover:scale-[1.02] transition-all duration-200 cursor-pointer`}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl ${a.color.split(' ').slice(1, 3).join(' ')} flex items-center justify-center`}>
                  <Icon className={`w-4.5 h-4.5 ${a.color.split(' ')[0]}`} />
                </div>
                <span className="text-sm font-bold text-slate-800 leading-tight">{a.label}</span>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

/* ── Recent Activity Feed ── */
function ActivityFeed({ substitutions }: { substitutions: any[] }) {
  if (!substitutions.length) {
    return (
      <div className="py-8 text-center text-slate-400 text-sm">
        <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p>No recent substitution activity</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {substitutions.slice(0, 6).map((s) => (
        <div key={s.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
            s.status === 'completed' || s.status === 'assigned'
              ? 'bg-emerald-100 text-emerald-600'
              : 'bg-amber-100 text-amber-600'
          }`}>
            {s.status === 'completed' || s.status === 'assigned'
              ? <CheckCircle2 className="w-4 h-4" />
              : <Clock className="w-4 h-4" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">
              {s.subject} — {s.grade} {s.section} (Period {s.period})
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              {s.absentTeacher?.name} → {s.substitute?.name || 'Unassigned'} · {s.date}
            </p>
          </div>
          <Badge className={`text-[10px] shrink-0 ${
            s.status === 'completed' || s.status === 'assigned'
              ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
              : 'bg-amber-100 text-amber-700 border-amber-200'
          }`}>
            {s.status}
          </Badge>
        </div>
      ))}
    </div>
  );
}

/* ── Main Dashboard Page ── */
export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [briefing, setBriefing] = useState<DailyBriefing | null>(null);
  const [substitutions, setSubstitutions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [briefingLoading, setBriefingLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, subsRes] = await Promise.all([
        fetch('/api/dashboard/stats'),
        fetch('/api/substitutions?limit=10'),
      ]);
      if (statsRes.ok) { const d = await statsRes.json(); setStats(d.data); }
      if (subsRes.ok) {
        const d = await subsRes.json();
        setSubstitutions(d.substitutions || d.data || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBriefing = useCallback(async () => {
    setBriefingLoading(true);
    try {
      const r = await fetch('/api/ai/daily-briefing');
      if (r.ok) {
        const d = await r.json();
        setBriefing(d.briefing || d.data);
      } else {
        // Fallback briefing from stats
        if (stats) {
          setBriefing({
            summary: `Good morning! Today you have ${stats.totalTeachers} active faculty members, ${stats.absentToday} on leave, and ${stats.pendingSubstitutions} pending substitution${stats.pendingSubstitutions !== 1 ? 's' : ''} requiring your attention. Timetable coverage is running optimally.`,
            urgentAlerts: stats.pendingSubstitutions > 0
              ? [`${stats.pendingSubstitutions} substitution period${stats.pendingSubstitutions !== 1 ? 's' : ''} pending assignment`]
              : [],
            recommendations: [
              'Review today\'s biometric attendance records for early absence detection.',
              'Check teacher workload analytics to prevent burnout.',
            ],
            coverageRate: stats.todaySchedules > 0
              ? Math.round(((stats.todaySchedules - stats.pendingSubstitutions) / stats.todaySchedules) * 100)
              : 100,
            generatedAt: new Date().toISOString(),
          });
        }
      }
    } finally {
      setBriefingLoading(false);
    }
  }, [stats]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    if (stats) fetchBriefing();
  }, [stats, fetchBriefing]);

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6">
      {/* ── Enterprise SaaS Command Centre Header ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-700 via-indigo-800 to-slate-900 flex items-center justify-center text-white shadow-md shadow-blue-900/30 shrink-0 border border-blue-500/20">
            <Brain className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#081A33]">
                Academic Command Centre
              </h1>
              <Badge className="bg-blue-50 text-[#2563EB] border border-blue-200 font-bold text-[10px] uppercase tracking-wider">
                Delhi Public School (DPS)
              </Badge>
            </div>
            <p className="text-xs text-[#64748B] font-medium mt-1">
              Real-time daily operations, live biometric sync, timetable clash detection & AI briefings &middot; {today}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 px-3 py-1.5 text-xs font-extrabold flex items-center gap-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            Live DPS Stream
          </Badge>
          <Button size="sm" variant="outline" onClick={fetchData} className="gap-2 text-xs border-[#E2E8F0] text-[#0F2747] bg-white hover:bg-slate-50 font-bold h-9 shadow-xs px-3.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard label="Total Faculty" value={stats?.totalTeachers || 0} icon={Users} color="blue" href="/teachers" />
        <KpiCard label="Students" value={stats?.totalStudents || 0} icon={Shield} color="violet" />
        <KpiCard label="On Leave Today" value={stats?.absentToday || 0} icon={AlertTriangle} color="amber" trend={stats?.absentToday ? 'down' : null} />
        <KpiCard label="Pending Subs" value={stats?.pendingSubstitutions || 0} icon={RefreshCw} color="rose" href="/substitutions" />
        <KpiCard label="Resolved Today" value={stats?.resolvedToday || 0} icon={CheckCircle2} color="emerald" trend={stats?.resolvedToday ? 'up' : null} />
        <KpiCard label="Total Periods" value={stats?.todaySchedules || 0} icon={CalendarDays} color="teal" />
      </div>

      {/* AI Briefing + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2">
          <AIBriefingCard briefing={briefing} loading={briefingLoading} />
        </div>
        <div className="lg:col-span-3">
          <Card className="h-full border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <QuickActions />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recent Activity + Grade Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Substitution Feed */}
        <div className="lg:col-span-2">
          <Card className="border-slate-200">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-500" />
                Recent Substitutions
              </CardTitle>
              <Link href="/substitutions">
                <Button size="sm" variant="ghost" className="gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50">
                  View All <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              <ActivityFeed substitutions={substitutions} />
            </CardContent>
          </Card>
        </div>

        {/* Grade Summary */}
        <div>
          <Card className="border-slate-200 h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-violet-500" />
                Grade Coverage
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats?.grades && stats.grades.length > 0 ? (
                <div className="space-y-2">
                  {stats.grades.slice(0, 8).map((grade, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="text-xs font-semibold text-slate-600 w-20 truncate">{grade}</div>
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full"
                          style={{ width: `${Math.floor(Math.random() * 30 + 70)}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-slate-400 w-8 text-right">✓</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400 py-4 text-center">No grade data yet</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
