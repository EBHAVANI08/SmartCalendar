'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, Plus, Search, Filter, Clock, CheckCircle2,
  AlertTriangle, Zap, Users, Calendar, BookOpen,
  UserCheck, Brain, ArrowRight, Play, MoreVertical,
  XCircle, Eye
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

interface Substitution {
  id: string;
  date: string;
  period: number;
  grade: string;
  section: string;
  subject: string;
  source: string;
  status: string;
  reason?: string;
  absentTeacher: { id: string; name: string; subject: string };
  substitute?: { id: string; name: string; subject: string } | null;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending:   { label: 'Pending',   color: 'bg-amber-100 text-amber-700 border-amber-200',   icon: Clock },
  assigned:  { label: 'Assigned',  color: 'bg-blue-100 text-blue-700 border-blue-200',     icon: UserCheck },
  completed: { label: 'Completed', color: 'bg-blue-100 text-blue-900 border-blue-200', icon: CheckCircle2 },
};

export default function SubstitutionsPage() {
  const { toast } = useToast();
  const [subs, setSubs] = useState<Substitution[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewSub, setViewSub] = useState<Substitution | null>(null);

  const fetchSubs = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/substitutions?date=${selectedDate}`);
      if (r.ok) {
        const d = await r.json();
        setSubs(d.substitutions || d.data || []);
      }
    } finally { setLoading(false); }
  }, [selectedDate]);

  useEffect(() => { fetchSubs(); }, [fetchSubs]);

  const filtered = subs.filter(s => {
    const q = search.toLowerCase();
    const matchSearch = !search ||
      s.absentTeacher?.name?.toLowerCase().includes(q) ||
      s.subject?.toLowerCase().includes(q) ||
      s.grade?.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || s.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const counts = {
    pending:   subs.filter(s => s.status === 'pending').length,
    assigned:  subs.filter(s => s.status === 'assigned').length,
    completed: subs.filter(s => s.status === 'completed').length,
  };

  const handleAutoAssignAll = async () => {
    setAutoAssigning(true);
    try {
      const r = await fetch('/api/biometric/ai-assign-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate }),
      });
      const d = await r.json();
      if (r.ok && d.assigned > 0) {
        toast({ title: 'AI Auto-Assign Complete', description: `${d.assigned} periods assigned automatically!` });
        fetchSubs();
      } else {
        toast({ title: d.assigned === 0 ? 'Nothing to Assign' : 'Error', description: d.message || d.error, variant: d.assigned === 0 ? 'default' : 'destructive' });
      }
    } finally { setAutoAssigning(false); }
  };

  return (
    <div className="space-y-6">
      {/* ── Enterprise SaaS Substitution War Room Header ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-700 via-indigo-800 to-slate-900 flex items-center justify-center text-white shadow-md shadow-blue-900/30 shrink-0 border border-blue-500/20">
            <RefreshCw className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#081A33]">
                Substitution War Room
              </h1>
              <Badge className="bg-blue-50 text-[#2563EB] border border-blue-200 font-bold text-[10px] uppercase tracking-wider">
                Delhi Public School (DPS)
              </Badge>
            </div>
            <p className="text-xs text-[#64748B] font-medium mt-1">
              Automated substitute teacher matching & biometric morning absence resolution.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="w-36 h-9 text-xs font-mono bg-white border-[#E2E8F0]" />
          <Button size="sm" variant="outline" onClick={fetchSubs} className="gap-2 text-xs border-[#E2E8F0] text-[#0F2747] bg-white hover:bg-slate-50 font-bold h-9 shadow-xs px-3.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button size="sm" onClick={handleAutoAssignAll} disabled={autoAssigning || counts.pending === 0}
            className="gap-2 bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 hover:from-blue-800 hover:to-slate-950 text-white font-bold h-9 shadow-md text-xs px-3.5 border-none">
            <Brain className={`w-4 h-4 text-amber-300 ${autoAssigning ? 'animate-spin' : ''}`} />
            {autoAssigning ? 'AI Assigning…' : `AI Auto-Assign (${counts.pending})`}
          </Button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Pending', value: counts.pending, color: 'amber', icon: Clock },
          { label: 'Assigned', value: counts.assigned, color: 'blue', icon: UserCheck },
          { label: 'Completed', value: counts.completed, color: 'indigo', icon: CheckCircle2 },
        ].map(s => (
          <Card key={s.label} className="border-slate-200">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <s.icon className="w-5 h-5 text-blue-700" />
              </div>
              <div>
                <p className="text-2xl font-extrabold text-slate-800">{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter Row */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Search teacher, subject, grade…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="assigned">Assigned</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {loading ? (
        <Card className="border-slate-200">
          <CardContent className="py-16 text-center">
            <RefreshCw className="w-8 h-8 mx-auto text-slate-300 animate-spin mb-3" />
            <p className="text-slate-400">Loading substitutions…</p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed border-slate-200">
          <CardContent className="py-16 text-center">
            <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-300 mb-3" />
            <p className="text-slate-600 font-medium">No substitutions found for {selectedDate}</p>
            <p className="text-slate-400 text-sm mt-1">All periods are covered, or no absences were recorded.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Period</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Class</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Subject</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Absent Teacher</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Substitute</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Source</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="py-3 px-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(s => {
                  const sc = statusConfig[s.status] || statusConfig.pending;
                  const StatusIcon = sc.icon;
                  return (
                    <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center font-bold text-slate-700">
                          {s.period}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800">{s.grade} {s.section}</td>
                      <td className="py-3 px-4 text-slate-600">{s.subject}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-rose-100 flex items-center justify-center text-rose-700 font-semibold text-[11px]">
                            {s.absentTeacher?.name?.charAt(0)}
                          </div>
                          <span className="text-slate-700">{s.absentTeacher?.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {s.substitute ? (
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-semibold text-[11px]">
                              {s.substitute.name.charAt(0)}
                            </div>
                            <span className="text-slate-700">{s.substitute.name}</span>
                          </div>
                        ) : (
                          <span className="text-slate-300 text-xs">Unassigned</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <Badge className={`text-[10px] ${s.source === 'biometric' ? 'bg-violet-50 text-violet-700 border-violet-200' : s.source === 'ai-agent' ? 'bg-cyan-50 text-cyan-700 border-cyan-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                          {s.source}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Badge className={`text-[10px] flex items-center gap-1 w-fit ${sc.color}`}>
                          <StatusIcon className="w-3 h-3" /> {sc.label}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => setViewSub(s)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* View Detail Dialog */}
      <Dialog open={!!viewSub} onOpenChange={() => setViewSub(null)}>
        <DialogContent className="max-w-md">
          {viewSub && (
            <>
              <DialogHeader>
                <DialogTitle>Substitution Detail</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Date', value: viewSub.date },
                    { label: 'Period', value: `Period ${viewSub.period}` },
                    { label: 'Class', value: `${viewSub.grade} ${viewSub.section}` },
                    { label: 'Subject', value: viewSub.subject },
                    { label: 'Absent Teacher', value: viewSub.absentTeacher?.name },
                    { label: 'Substitute', value: viewSub.substitute?.name || 'Not Assigned' },
                    { label: 'Source', value: viewSub.source },
                    { label: 'Status', value: viewSub.status },
                  ].map(item => (
                    <div key={item.label} className="bg-slate-50 rounded-xl p-3">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">{item.label}</p>
                      <p className="text-sm font-semibold text-slate-800 capitalize">{item.value}</p>
                    </div>
                  ))}
                </div>
                {viewSub.reason && (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                    <p className="text-[10px] text-amber-600 uppercase tracking-wider mb-1">Reason</p>
                    <p className="text-sm text-slate-700">{viewSub.reason}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
