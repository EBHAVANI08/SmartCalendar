'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Fingerprint, RefreshCw, Search, Calendar, Users,
  CheckCircle2, Clock, AlertTriangle, Zap, TrendingUp,
  UserCheck, Brain, WifiOff
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

interface BiometricRecord {
  id: string;
  date: string;
  teacherId: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  status: string;
  deviceId: string | null;
  teacher?: { id: string; name: string; subject: string; email: string; phone?: string };
}

interface BiometricSummary {
  total: number;
  present: number;
  absent: number;
  late: number;
  halfDay: number;
}

const statusBadge: Record<string, string> = {
  present:   'bg-blue-100 text-blue-900 border-blue-200',
  absent:    'bg-rose-100 text-rose-700 border-rose-200',
  late:      'bg-amber-100 text-amber-700 border-amber-200',
  'half-day':'bg-orange-100 text-orange-700 border-orange-200',
};

export default function AttendancePage() {
  const { toast } = useToast();
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [records, setRecords] = useState<BiometricRecord[]>([]);
  const [summary, setSummary] = useState<BiometricSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/biometric/sync?date=${date}`);
      if (r.ok) {
        const d = await r.json();
        setSummary(d.summary);
        setRecords(d.records || []);
      }
    } finally { setLoading(false); }
  }, [date]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const r = await fetch('/api/biometric/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      });
      const d = await r.json();
      if (r.ok) {
        setSummary(d.summary);
        setRecords(d.records || []);
        toast({ title: 'Biometric Synced', description: `${d.summary?.present} present, ${d.summary?.absent} absent, ${d.summary?.late} late` });
      } else {
        toast({ title: 'Sync Failed', description: d.error, variant: 'destructive' });
      }
    } finally { setSyncing(false); }
  };

  const handleDetect = async () => {
    setDetecting(true);
    try {
      const r = await fetch('/api/biometric/detect-absent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      });
      const d = await r.json();
      if (r.ok) {
        toast({ title: 'Absence Detection Complete', description: `${d.totalAbsent} absent, ${d.totalLate} late. ${d.createdSubstitutions} substitutions created.` });
        fetchData();
      } else {
        toast({ title: 'Detection Failed', description: d.error, variant: 'destructive' });
      }
    } finally { setDetecting(false); }
  };

  const filtered = records.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.teacher?.name?.toLowerCase().includes(q) ||
      r.teacher?.subject?.toLowerCase().includes(q) ||
      r.status.toLowerCase().includes(q)
    );
  });

  const attendancePercent = summary && summary.total > 0
    ? Math.round((summary.present / summary.total) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* ── Enterprise SaaS Biometric Attendance Header ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-700 via-indigo-800 to-slate-900 flex items-center justify-center text-white shadow-md shadow-blue-900/30 shrink-0 border border-blue-500/20">
            <Fingerprint className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#081A33]">
                Biometric Attendance & Scanner Sync
              </h1>
              <Badge className="bg-blue-50 text-[#2563EB] border border-blue-200 font-bold text-[10px] uppercase tracking-wider">
                Delhi Public School (DPS)
              </Badge>
            </div>
            <p className="text-xs text-[#64748B] font-medium mt-1">
              Real-time hardware scanner log ingestion, absence detection & automated substitution creation.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-36 h-9 text-xs font-mono bg-white border-[#E2E8F0]" />
          <Button size="sm" variant="outline" onClick={handleSync} disabled={syncing} className="gap-2 text-xs border-[#E2E8F0] text-[#0F2747] bg-white hover:bg-slate-50 font-bold h-9 shadow-xs px-3.5">
            <RefreshCw className={`w-3.5 h-3.5 text-[#2563EB] ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing Hardware…' : 'Sync Hardware Logs'}
          </Button>
          <Button size="sm" onClick={handleDetect} disabled={detecting}
            className="gap-2 bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 hover:from-blue-800 hover:to-slate-950 text-white font-bold h-9 shadow-md text-xs px-3.5 border-none">
            <Brain className={`w-4 h-4 text-amber-300 ${detecting ? 'animate-spin' : ''}`} />
            {detecting ? 'Detecting…' : 'Detect Morning Absences'}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {[
          { label: 'Total', value: summary?.total || 0, icon: Users, color: 'text-slate-600 bg-slate-50 border-slate-200' },
          { label: 'Present', value: summary?.present || 0, icon: CheckCircle2, color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
          { label: 'Absent', value: summary?.absent || 0, icon: AlertTriangle, color: 'text-rose-700 bg-rose-50 border-rose-200' },
          { label: 'Late', value: summary?.late || 0, icon: Clock, color: 'text-amber-700 bg-amber-50 border-amber-200' },
          { label: 'Half Day', value: summary?.halfDay || 0, icon: TrendingUp, color: 'text-orange-700 bg-orange-50 border-orange-200' },
        ].map(s => (
          <Card key={s.label} className={`border ${s.color.split(' ').slice(2).join(' ')}`}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${s.color.split(' ').slice(1, 3).join(' ')} flex items-center justify-center`}>
                <s.icon className={`w-5 h-5 ${s.color.split(' ')[0]}`} />
              </div>
              <div>
                <p className={`text-2xl font-extrabold ${s.color.split(' ')[0]}`}>{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Attendance Meter */}
      {summary && summary.total > 0 && (
        <Card className="border-slate-200">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Fingerprint className="w-4 h-4 text-emerald-500" />
                <span className="text-sm font-semibold text-slate-800">Daily Attendance Rate</span>
              </div>
              <span className="text-xl font-extrabold text-emerald-700">{attendancePercent}%</span>
            </div>
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-1000"
                style={{ width: `${attendancePercent}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-slate-400 mt-2">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input placeholder="Search by teacher name, subject, or status…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Records Table */}
      {loading ? (
        <Card className="border-slate-200">
          <CardContent className="py-16 text-center">
            <RefreshCw className="w-8 h-8 mx-auto text-slate-300 animate-spin mb-3" />
            <p className="text-slate-400">Loading biometric records…</p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed border-slate-200">
          <CardContent className="py-16 text-center">
            <Fingerprint className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <p className="text-slate-600 font-medium">No biometric records for {date}</p>
            <p className="text-slate-400 text-sm mt-1">Click <strong>Sync Devices</strong> to pull data from hardware.</p>
            <Button size="sm" variant="outline" className="mt-3 gap-2" onClick={handleSync} disabled={syncing}>
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              Sync Now
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Teacher</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Subject</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Check In</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Check Out</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Device</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(rec => (
                  <tr key={rec.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                          rec.status === 'present' ? 'bg-emerald-100 text-emerald-700' :
                          rec.status === 'absent' ? 'bg-rose-100 text-rose-700' :
                          rec.status === 'late' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {rec.teacher?.name?.charAt(0) || '?'}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">{rec.teacher?.name || 'Unknown'}</p>
                          <p className="text-[11px] text-slate-400">{rec.teacher?.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{rec.teacher?.subject || '—'}</td>
                    <td className="py-3 px-4 font-mono text-slate-700">{rec.checkInTime || <span className="text-slate-300">—</span>}</td>
                    <td className="py-3 px-4 font-mono text-slate-700">{rec.checkOutTime || <span className="text-slate-300">—</span>}</td>
                    <td className="py-3 px-4 text-xs text-slate-400">{rec.deviceId || 'N/A'}</td>
                    <td className="py-3 px-4">
                      <Badge className={`text-[10px] ${statusBadge[rec.status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                        {rec.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
