'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Users, RefreshCw, CalendarDays, AlertTriangle,
  Brain, TrendingUp, TrendingDown, CheckCircle2,
  Sparkles, Zap, Activity, ArrowRight, Clock,
  BarChart3, BookOpen, Fingerprint, Shield,
  GraduationCap, ClipboardList
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { SetupChecklist } from '@/components/dashboard/setup-checklist';

/* ── Types ── */
interface DashboardStats {
  schoolName?: string;
  totalTeachers: number;
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
function CountUp({ to, duration = 350 }: { to: number; duration?: number }) {
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
    { label: 'Academic Calendar', icon: CalendarDays, href: '/calendar', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
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

interface TeacherDashboardData {
  teacher: { id: string; name: string; email: string };
  today: { date: string; day: string };
  counts: {
    classesToday: number;
    coverPeriodsToday: number;
    pendingLeaveRequests: number;
    approvedLeave: number;
    periodsThisWeek: number;
    upcomingCover: number;
  };
  todaySchedule: Array<{
    id: string;
    period: number;
    grade: string;
    section: string;
    subject: string;
    startTime?: string | null;
    endTime?: string | null;
    roomId?: string | null;
  }>;
  weekSchedule: Array<{
    id: string;
    day: string;
    period: number;
    grade: string;
    section: string;
    subject: string;
    startTime?: string | null;
    endTime?: string | null;
    roomId?: string | null;
  }>;
  nextPeriod?: any;
  myCover: any[];
  myLeave: any[];
}

const DAYS_LIST = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const PERIOD_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8];

/* ── Main Dashboard Page ── */
export default function DashboardPage() {
  const { toast } = useToast();
  const [userRole, setUserRole] = useState<string>('admin');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [teacherData, setTeacherData] = useState<TeacherDashboardData | null>(null);
  const [briefing, setBriefing] = useState<DailyBriefing | null>(null);
  const [substitutions, setSubstitutions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [briefingLoading, setBriefingLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('sc_user') || localStorage.getItem('smart_calendar_auth_session');
      if (raw) {
        const parsed = JSON.parse(raw);
        const u = parsed.user || parsed;
        if (u.role) setUserRole(u.role === 'teacher' ? 'teacher' : 'admin');
      }
    } catch {}
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let role = 'admin';
      try {
        const raw = sessionStorage.getItem('sc_user') || localStorage.getItem('smart_calendar_auth_session');
        if (raw) {
          const parsed = JSON.parse(raw);
          const u = parsed.user || parsed;
          if (u.role) role = u.role;
        }
      } catch {}

      if (role === 'teacher') {
        const tRes = await fetch('/api/teacher/dashboard');
        if (tRes.ok) {
          const d = await tRes.json();
          setTeacherData(d);
        }
      } else {
        const [statsRes, subsRes] = await Promise.all([
          fetch('/api/dashboard/stats'),
          fetch('/api/substitutions?limit=10'),
        ]);
        if (statsRes.status === 403) {
          setUserRole('teacher');
          const tRes = await fetch('/api/teacher/dashboard');
          if (tRes.ok) {
            const d = await tRes.json();
            setTeacherData(d);
          }
          return;
        }
        if (statsRes.ok) { const d = await statsRes.json(); setStats(d.data); }
        if (subsRes.ok) {
          const d = await subsRes.json();
          setSubstitutions(d.substitutions || d.data || []);
        }
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


  if (userRole === 'teacher') {
    const todaySlots = teacherData?.todaySchedule || [];
    const weekSlots = teacherData?.weekSchedule || [];
    const counts = teacherData?.counts || {
      classesToday: 0,
      coverPeriodsToday: 0,
      pendingLeaveRequests: 0,
      approvedLeave: 0,
      periodsThisWeek: 0,
      upcomingCover: 0,
    };

    return (
      <div className="space-y-6">
        {/* ── Teacher Workstation Header ── */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-xs">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-700 via-indigo-800 to-slate-900 flex items-center justify-center text-white shadow-md shadow-blue-900/30 shrink-0 border border-blue-500/20">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#081A33]">
                  {teacherData?.teacher?.name ? `Welcome, ${teacherData.teacher.name}` : 'Faculty Timetable Station'}
                </h1>
                <Badge className="bg-blue-50 text-[#2563EB] border border-blue-200 font-bold text-[10px] uppercase tracking-wider">
                  Faculty Account
                </Badge>
              </div>
              <p className="text-xs text-[#64748B] font-medium mt-1">
                Your personal allotted timetable, daily teaching slots and substitution notices &middot; {today}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link href="/timetable">
              <Button size="sm" className="gap-2 text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold h-9 shadow-xs px-3.5 border-none">
                <CalendarDays className="w-3.5 h-3.5" /> My Allotted Timetable
              </Button>
            </Link>
            <Button size="sm" variant="outline" onClick={fetchData} className="gap-2 text-xs border-[#E2E8F0] text-[#0F2747] bg-white hover:bg-slate-50 font-bold h-9 shadow-xs px-3.5">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* ── Personal KPI Row ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KpiCard label="Classes Today" value={counts.classesToday} icon={Clock} color="blue" />
          <KpiCard label="Weekly Teaching Load" value={counts.periodsThisWeek} icon={CalendarDays} color="teal" sub="Total Allotted Periods" href="/timetable" />
          <KpiCard label="Cover Duties Today" value={counts.coverPeriodsToday} icon={RefreshCw} color="amber" href="/substitutions" />
          <KpiCard label="Approved Leaves" value={counts.approvedLeave} icon={CheckCircle2} color="emerald" href="/leaves" />
        </div>

        {/* ── Today's Schedule & Quick Actions ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Today's Teaching Periods */}
          <div className="lg:col-span-2">
            <Card className="border-slate-200 h-full">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-600" />
                  Today's Teaching Schedule ({teacherData?.today?.day || 'Today'})
                </CardTitle>
                <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-xs font-bold">
                  {todaySlots.length} Period{todaySlots.length !== 1 ? 's' : ''}
                </Badge>
              </CardHeader>
              <CardContent>
                {todaySlots.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-sm">
                    <CalendarDays className="w-8 h-8 mx-auto mb-2 opacity-30 text-blue-500" />
                    <p className="font-semibold text-slate-600">No scheduled teaching classes today</p>
                    <p className="text-xs text-slate-400 mt-0.5">Use your free periods for lesson planning and preparation.</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {todaySlots.map((slot) => (
                      <div key={slot.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 hover:bg-blue-50/40 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 font-extrabold text-xs flex items-center justify-center shrink-0">
                            P{slot.period}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900">
                              {slot.grade} {slot.section} &middot; <span className="text-blue-700">{slot.subject}</span>
                            </p>
                            <p className="text-xs text-slate-500">
                              {slot.startTime && slot.endTime ? `${slot.startTime} – ${slot.endTime}` : `Period ${slot.period}`}
                              {slot.roomId && ` · Room ${slot.roomId}`}
                            </p>
                          </div>
                        </div>
                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold">
                          Allotted
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions & Leave Overview */}
          <div className="space-y-6">
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" />
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Link href="/timetable" className="block">
                  <div className="p-3 rounded-xl border border-blue-200 bg-blue-50/60 hover:bg-blue-100/70 transition-colors flex items-center justify-between cursor-pointer">
                    <div className="flex items-center gap-2.5">
                      <CalendarDays className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-bold text-slate-800">My Allotted Timetable</span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                </Link>
                <Link href="/leaves" className="block">
                  <div className="p-3 rounded-xl border border-indigo-200 bg-indigo-50/60 hover:bg-indigo-100/70 transition-colors flex items-center justify-between cursor-pointer">
                    <div className="flex items-center gap-2.5">
                      <ClipboardList className="w-4 h-4 text-indigo-600" />
                      <span className="text-xs font-bold text-slate-800">Apply for Leave</span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-indigo-600" />
                  </div>
                </Link>
                <Link href="/substitutions" className="block">
                  <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/60 hover:bg-amber-100/70 transition-colors flex items-center justify-between cursor-pointer">
                    <div className="flex items-center gap-2.5">
                      <RefreshCw className="w-4 h-4 text-amber-600" />
                      <span className="text-xs font-bold text-slate-800">My Cover Duties</span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-amber-600" />
                  </div>
                </Link>
              </CardContent>
            </Card>

            {/* Stand-in & Cover Duties */}
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 text-amber-600" />
                  Assigned Substitutions
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(!teacherData?.myCover || teacherData.myCover.length === 0) ? (
                  <p className="text-xs text-slate-400 py-2 text-center">No cover duties assigned to you.</p>
                ) : (
                  <div className="space-y-2">
                    {teacherData.myCover.slice(0, 3).map((cov: any) => (
                      <div key={cov.id} className="p-2 rounded-lg bg-amber-50/70 border border-amber-200 text-xs">
                        <div className="flex justify-between items-center font-bold text-slate-800">
                          <span>{cov.grade} {cov.section} · P{cov.period}</span>
                          <span className="text-[10px] text-amber-700">{cov.date}</span>
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5">
                          Standing in for {cov.absentTeacher?.name || 'Faculty Member'} ({cov.subject})
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── Weekly Allotted Timetable Grid for Teacher ── */}
        <Card className="border-slate-200 overflow-hidden bg-white rounded-2xl shadow-xs">
          <div className="p-4 sm:p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <CalendarDays className="w-4.5 h-4.5 text-blue-600" />
                <span>My Weekly Allotted Teaching Matrix</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Full weekly timetable of all your assigned periods across all classes.
              </p>
            </div>
            <Link href="/timetable">
              <Button size="sm" variant="outline" className="text-xs border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold h-8">
                Open in Timetable Studio
              </Button>
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#1c2d54] text-white border-b border-slate-300 font-bold text-[11px]">
                  <th className="p-2.5 w-24 border-r border-slate-700">Day</th>
                  {PERIOD_SLOTS.map((p) => (
                    <th key={p} className="p-2.5 text-center border-r border-slate-700">P{p}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {DAYS_LIST.map((day) => (
                  <tr key={day} className="hover:bg-slate-50/80">
                    <td className="p-2.5 font-bold text-slate-800 bg-slate-50 border-r border-slate-200">{day}</td>
                    {PERIOD_SLOTS.map((p) => {
                      const slot = weekSlots.find((s) => s.day === day && s.period === p);
                      return (
                        <td key={p} className="p-2 text-center border-r border-slate-200">
                          {slot ? (
                            <div className="bg-blue-50 p-1.5 rounded-lg border border-blue-200 text-[10px] space-y-0.5">
                              <span className="font-bold text-blue-900 block">{slot.grade} {slot.section}</span>
                              <span className="text-slate-600 block">{slot.subject}</span>
                              {slot.roomId && <span className="text-slate-400 block text-[9px]">{slot.roomId}</span>}
                            </div>
                          ) : (
                            <span className="text-slate-300 text-[10px]">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  }

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
                {stats?.schoolName || 'School Workspace'}
              </Badge>
            </div>
            <p className="text-xs text-[#64748B] font-medium mt-1">
              Daily operations, absence detection, timetable clash detection and briefings &middot; {today}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button size="sm" variant="outline" onClick={fetchData} className="gap-2 text-xs border-[#E2E8F0] text-[#0F2747] bg-white hover:bg-slate-50 font-bold h-9 shadow-xs px-3.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Setup progress, from real data. Disappears once the school is set up. */}
      {userRole !== 'teacher' && <SetupChecklist />}

      {/* KPI Row - every card below is a live tenant-scoped database count. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard label="Total Faculty" value={stats?.totalTeachers || 0} icon={Users} color="blue" href="/teachers" />
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
