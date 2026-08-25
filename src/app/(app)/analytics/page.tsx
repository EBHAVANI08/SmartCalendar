'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart3, TrendingUp, TrendingDown, Users, RefreshCw,
  AlertTriangle, CheckCircle2, BookOpen, Clock, Target,
  PieChart, Activity, Download
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';

interface AnalyticsData {
  coverageRate: number;
  sameSubjectRate: number;
  totalToday: number;
  resolvedToday: number;
  pendingToday: number;
  totalFaculty: number;
  totalSchedules: number;
  topSubjects: { subject: string; count: number }[];
  topAbsentTeachers: { name: string; subject: string; count: number }[];
  peakHours: { period: string; count: number }[];
  deptBreakdown: { name: string; teachersCount: number }[];
  weeklyTrends: { week: string; total: number; aiAssigned: number; manualAssigned: number; sameSubject: number; crossSubject: number }[];
}

const COLORS = ['#2563eb', '#1d4ed8', '#4f46e5', '#0284c7', '#0369a1', '#3b82f6', '#6366f1', '#1e40af'];

function MiniBarChart({ data, maxVal }: { data: { label: string; value: number }[]; maxVal: number }) {
  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-xs text-slate-500 w-24 truncate shrink-0">{d.label}</span>
          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${maxVal > 0 ? (d.value / maxVal) * 100 : 0}%`, backgroundColor: COLORS[i % COLORS.length] }}
            />
          </div>
          <span className="text-xs font-bold text-slate-700 w-6 text-right">{d.value}</span>
        </div>
      ))}
    </div>
  );
}

function GaugeCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, { ring: string; text: string; bg: string }> = {
    emerald: { ring: 'stroke-blue-600', text: 'text-blue-700', bg: 'bg-blue-50' },
    blue:    { ring: 'stroke-blue-600', text: 'text-blue-700', bg: 'bg-blue-50' },
    amber:   { ring: 'stroke-amber-500', text: 'text-amber-700', bg: 'bg-amber-50' },
  };
  const c = colorMap[color] || colorMap.blue;
  const r = 40;
  const circ = 2 * Math.PI * r;
  const strokeDashoffset = circ - (value / 100) * circ;

  return (
    <div className={`${c.bg} rounded-2xl p-5 flex flex-col items-center`}>
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#e2e8f0" strokeWidth="10" />
        <circle
          cx="50" cy="50" r={r} fill="none"
          className={c.ring}
          strokeWidth="10"
          strokeDasharray={circ}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
        <text x="50" y="55" textAnchor="middle" className="fill-current font-extrabold" style={{ fontSize: 18, fontWeight: 900 }}>
          {value}%
        </text>
      </svg>
      <p className={`text-sm font-semibold ${c.text} mt-1`}>{label}</p>
    </div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/dashboard/analytics?date=${date}`);
      if (r.ok) { const d = await r.json(); setData(d.data); }
    } finally { setLoading(false); }
  }, [date]);

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  const maxSubjectCount = data?.topSubjects ? Math.max(...data.topSubjects.map(s => s.count), 1) : 1;
  const maxPeriodCount = data?.peakHours ? Math.max(...data.peakHours.map(p => p.count), 1) : 1;
  const maxAbsenceCount = data?.topAbsentTeachers ? Math.max(...data.topAbsentTeachers.map(t => t.count), 1) : 1;
  const maxDeptCount = data?.deptBreakdown ? Math.max(...data.deptBreakdown.map(d => d.teachersCount), 1) : 1;

  return (
    <div className="space-y-6">
      {/* ── Enterprise SaaS Analytics & BI Header ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-700 via-indigo-800 to-slate-900 flex items-center justify-center text-white shadow-md shadow-blue-900/30 shrink-0 border border-blue-500/20">
            <BarChart3 className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#081A33]">
                Analytics & Business Intelligence
              </h1>
              <Badge className="bg-blue-50 text-[#2563EB] border border-blue-200 font-bold text-[10px] uppercase tracking-wider">
                Delhi Public School (DPS)
              </Badge>
            </div>
            <p className="text-xs text-[#64748B] font-medium mt-1">
              Operational coverage rate, department breakdown, peak load distribution & teacher wellbeing metrics.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-36 h-9 text-xs font-mono bg-white border-[#E2E8F0]" />
          <Button size="sm" variant="outline" onClick={fetchAnalytics} className="gap-2 text-xs border-[#E2E8F0] text-[#0F2747] bg-white hover:bg-slate-50 font-bold h-9 shadow-xs px-3.5">
            <RefreshCw className={`w-3.5 h-3.5 text-[#2563EB] ${loading ? 'animate-spin' : ''}`} /> Refresh Data
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.print()} className="gap-2 text-xs border-[#E2E8F0] text-[#0F2747] bg-white hover:bg-slate-50 font-bold h-9 shadow-xs px-3.5">
            <Download className="w-4 h-4 text-[#2563EB]" /> Export Report
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 animate-pulse">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="border-slate-200">
              <CardContent className="p-5">
                <div className="h-24 bg-slate-100 rounded-xl" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : data ? (
        <>
          {/* Gauge Row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <GaugeCard label="Coverage Rate" value={data.coverageRate} color="emerald" />
            <GaugeCard label="Same-Subject Rate" value={data.sameSubjectRate} color="blue" />
            <GaugeCard label="Resolution Rate" value={data.totalToday > 0 ? Math.round((data.resolvedToday / data.totalToday) * 100) : 100} color="amber" />
          </div>

          {/* KPI Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total Faculty', value: data.totalFaculty, icon: Users, color: 'bg-blue-50 text-blue-600' },
              { label: 'Total Periods', value: data.totalSchedules, icon: Clock, color: 'bg-teal-50 text-teal-600' },
              { label: 'Subs Today', value: data.totalToday, icon: RefreshCw, color: 'bg-amber-50 text-amber-600' },
              { label: 'Resolved Today', value: data.resolvedToday, icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-600' },
            ].map(k => (
              <Card key={k.label} className="border-slate-200">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl ${k.color.split(' ')[0]} flex items-center justify-center`}>
                    <k.icon className={`w-5 h-5 ${k.color.split(' ')[1]}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-extrabold text-slate-800">{k.value}</p>
                    <p className="text-xs text-slate-500">{k.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top subjects needing substitution */}
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-violet-500" />
                  Subjects Needing Most Substitutions
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.topSubjects.length > 0 ? (
                  <MiniBarChart
                    data={data.topSubjects.map(s => ({ label: s.subject, value: s.count }))}
                    maxVal={maxSubjectCount}
                  />
                ) : <p className="text-sm text-slate-400 py-4 text-center">No substitution data yet</p>}
              </CardContent>
            </Card>

            {/* Peak periods */}
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-500" />
                  Peak Substitution Periods
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.peakHours.length > 0 ? (
                  <MiniBarChart
                    data={data.peakHours.sort((a, b) => b.count - a.count).map(p => ({ label: p.period, value: p.count }))}
                    maxVal={maxPeriodCount}
                  />
                ) : <p className="text-sm text-slate-400 py-4 text-center">No period data yet</p>}
              </CardContent>
            </Card>

            {/* Top absent teachers */}
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-500" />
                  Teachers with Most Absences
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.topAbsentTeachers.length > 0 ? (
                  <div className="space-y-3">
                    {data.topAbsentTeachers.map((t, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-xs shrink-0">
                          {t.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{t.name}</p>
                          <p className="text-xs text-slate-400">{t.subject}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="flex-1 w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-rose-400 rounded-full" style={{ width: `${(t.count / maxAbsenceCount) * 100}%` }} />
                          </div>
                          <span className="text-xs font-bold text-rose-600 ml-1 w-5">{t.count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-slate-400 py-4 text-center">No absence data yet</p>}
              </CardContent>
            </Card>

            {/* Department breakdown */}
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-500" />
                  Faculty by Department
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.deptBreakdown.length > 0 ? (
                  <MiniBarChart
                    data={data.deptBreakdown.map(d => ({ label: d.name, value: d.teachersCount }))}
                    maxVal={maxDeptCount}
                  />
                ) : <p className="text-sm text-slate-400 py-4 text-center">No department data yet</p>}
              </CardContent>
            </Card>
          </div>

          {/* Weekly Trend Summary */}
          {data.weeklyTrends.length > 0 && (
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                  Substitution Trend Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                  {[
                    { label: 'Total', value: data.weeklyTrends[0].total, color: 'text-slate-700' },
                    { label: 'AI Assigned', value: data.weeklyTrends[0].aiAssigned, color: 'text-emerald-700' },
                    { label: 'Manual', value: data.weeklyTrends[0].manualAssigned, color: 'text-blue-700' },
                    { label: 'Same Subject', value: data.weeklyTrends[0].sameSubject, color: 'text-violet-700' },
                    { label: 'Cross Subject', value: data.weeklyTrends[0].crossSubject, color: 'text-amber-700' },
                  ].map(item => (
                    <div key={item.label} className="bg-slate-50 rounded-xl p-4 text-center">
                      <p className={`text-2xl font-extrabold ${item.color}`}>{item.value}</p>
                      <p className="text-xs text-slate-400 mt-1">{item.label}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <Card className="border-dashed border-slate-200">
          <CardContent className="py-16 text-center">
            <BarChart3 className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <p className="text-slate-500">Failed to load analytics. Please refresh.</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={fetchAnalytics}>Try Again</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
