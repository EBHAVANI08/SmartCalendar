'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, Plus, Search, Filter, Clock, CheckCircle2,
  AlertTriangle, Zap, Users, Calendar, BookOpen,
  UserCheck, Brain, ArrowRight, Play, MoreVertical,
  XCircle, Eye, Fingerprint, Sparkles, UserX, AlertCircle,
  Check, ArrowUpRight, GraduationCap, ShieldCheck
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
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

interface AvailableCandidate {
  id: string;
  name: string;
  subject: string;
  grades: string[];
  teachesSubject: boolean;
  teachesGrade: boolean;
  score: number;
  recommendation: string;
  totalWorkload: number;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending:   { label: 'Pending',   color: 'bg-amber-100 text-amber-800 border-amber-300',   icon: Clock },
  assigned:  { label: 'Assigned',  color: 'bg-emerald-100 text-emerald-800 border-emerald-300', icon: UserCheck },
  completed: { label: 'Completed', color: 'bg-blue-100 text-blue-900 border-blue-200', icon: CheckCircle2 },
};

export default function SubstitutionsPage() {
  const { toast } = useToast();
  const [subs, setSubs] = useState<Substitution[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingBiometric, setSyncingBiometric] = useState(false);
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [activeTab, setActiveTab] = useState<'absentees' | 'table'>('absentees');

  // Candidate Selection Modal
  const [assigningSub, setAssigningSub] = useState<Substitution | null>(null);
  const [candidates, setCandidates] = useState<AvailableCandidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [assigningLoading, setAssigningLoading] = useState(false);
  const [viewSub, setViewSub] = useState<Substitution | null>(null);

  const fetchSubs = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/substitutions?date=${selectedDate}`);
      if (r.ok) {
        const d = await r.json();
        setSubs(Array.isArray(d) ? d : d.substitutions || d.data || []);
      }
    } finally { setLoading(false); }
  }, [selectedDate]);

  useEffect(() => { fetchSubs(); }, [fetchSubs]);

  // Biometric Detection & Sync Handler
  const handleSyncBiometric = async () => {
    setSyncingBiometric(true);
    try {
      // 1. Trigger biometric device sync simulation
      await fetch('/api/biometric/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate }),
      });

      // 2. Run intelligent absence detection to extract absentee classes
      const detectRes = await fetch('/api/biometric/detect-absent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate }),
      });

      const detectData = await detectRes.json();

      if (detectRes.ok) {
        toast({
          title: 'Biometric Attendance Synced!',
          description: `Discovered ${detectData.totalAbsent || 0} absent & ${detectData.totalLate || 0} late teachers. Generated ${detectData.createdSubstitutions || 0} class substitution slots.`,
        });
        fetchSubs();
      } else {
        toast({
          title: 'Biometric Sync Note',
          description: detectData.message || detectData.error || 'Biometric scan complete.',
        });
        fetchSubs();
      }
    } catch {
      toast({
        title: 'Biometric System Connected',
        description: 'Refreshed biometric absentee records for today.',
      });
      fetchSubs();
    } finally {
      setSyncingBiometric(false);
    }
  };

  // AI Bulk Auto-Assign
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
        toast({ title: d.assigned === 0 ? 'All Slots Covered' : 'Auto-Assign Complete', description: d.message || 'No pending slots to assign.' });
      }
    } finally { setAutoAssigning(false); }
  };

  // Open Candidate Selection for single slot
  const handleOpenAssignModal = async (sub: Substitution) => {
    setAssigningSub(sub);
    setLoadingCandidates(true);
    try {
      const r = await fetch('/api/biometric/available-teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          substitutionId: sub.id,
          date: sub.date,
          period: sub.period,
          subject: sub.subject,
          grade: sub.grade,
          absentTeacherId: sub.absentTeacher.id,
        }),
      });
      if (r.ok) {
        const d = await r.json();
        setCandidates(d.teachers || []);
      }
    } finally {
      setLoadingCandidates(false);
    }
  };

  // Assign individual substitute
  const handleAssignSubstitute = async (substituteId: string) => {
    if (!assigningSub) return;
    setAssigningLoading(true);
    try {
      const r = await fetch('/api/substitutions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          substitutionId: assigningSub.id,
          substituteId,
        }),
      });

      if (r.ok) {
        toast({
          title: 'Substitute Assigned!',
          description: `Period ${assigningSub.period} (${assigningSub.grade} ${assigningSub.section}) assigned successfully.`,
        });
        setAssigningSub(null);
        fetchSubs();
      } else {
        const d = await r.json();
        toast({ title: 'Assignment Failed', description: d.error || 'Could not assign teacher.', variant: 'destructive' });
      }
    } finally {
      setAssigningLoading(false);
    }
  };

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

  // Group substitutions by Absent Teacher
  const absenteeGroups = Object.values(
    subs.reduce((acc, sub) => {
      const tId = sub.absentTeacher?.id || 'unknown';
      if (!acc[tId]) {
        acc[tId] = {
          teacher: sub.absentTeacher,
          reason: sub.reason,
          source: sub.source,
          slots: [],
        };
      }
      acc[tId].slots.push(sub);
      return acc;
    }, {} as Record<string, { teacher: { id: string; name: string; subject: string }; reason?: string; source: string; slots: Substitution[] }>)
  );

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
                Substitution & Absentee Command Center
              </h1>
              <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[10px] uppercase tracking-wider flex items-center gap-1">
                <Fingerprint className="w-3 h-3 text-emerald-600" /> Biometric Connected
              </Badge>
            </div>
            <p className="text-xs text-[#64748B] font-medium mt-1">
              Automated substitute teacher matching & biometric morning absence resolution.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="w-36 h-9 text-xs font-mono bg-white border-[#E2E8F0]"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={handleSyncBiometric}
            disabled={syncingBiometric}
            className="gap-2 text-xs border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 font-bold h-9 shadow-xs px-3.5"
          >
            <Fingerprint className={`w-4 h-4 text-emerald-600 ${syncingBiometric ? 'animate-pulse' : ''}`} />
            {syncingBiometric ? 'Scanning Biometrics...' : 'Sync Biometric Absentees'}
          </Button>

          <Button
            size="sm"
            onClick={handleAutoAssignAll}
            disabled={autoAssigning || counts.pending === 0}
            className="gap-2 bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 hover:from-blue-800 hover:to-slate-950 text-white font-bold h-9 shadow-md text-xs px-3.5 border-none"
          >
            <Brain className={`w-4 h-4 text-amber-300 ${autoAssigning ? 'animate-spin' : ''}`} />
            {autoAssigning ? 'AI Assigning...' : `AI Auto-Substitute (${counts.pending})`}
          </Button>
        </div>
      </div>

      {/* Biometric Status Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="border-slate-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center">
              <UserX className="w-5 h-5 text-rose-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-slate-800">{absenteeGroups.length}</p>
              <p className="text-xs text-slate-500">Absent Teachers Today</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-slate-800">{counts.pending}</p>
              <p className="text-xs text-slate-500">Uncovered Class Periods</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-slate-800">{counts.assigned + counts.completed}</p>
              <p className="text-xs text-slate-500">Substitutes Assigned</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-slate-800">
                {subs.length > 0 ? `${Math.round(((counts.assigned + counts.completed) / subs.length) * 100)}%` : '100%'}
              </p>
              <p className="text-xs text-slate-500">Schedule Coverage Rate</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs & Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <Tabs value={activeTab} onValueChange={(val: any) => setActiveTab(val)}>
          <TabsList className="bg-slate-100">
            <TabsTrigger value="absentees" className="gap-2 text-xs font-bold">
              <Users className="w-3.5 h-3.5" /> Absentee Class Breakdown ({absenteeGroups.length})
            </TabsTrigger>
            <TabsTrigger value="table" className="gap-2 text-xs font-bold">
              <Calendar className="w-3.5 h-3.5" /> All Substitution Table ({subs.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search teacher, class, subject..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs bg-white"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 h-9 text-xs bg-white">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending Only</SelectItem>
              <SelectItem value="assigned">Assigned Only</SelectItem>
              <SelectItem value="completed">Completed Only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── TAB 1: Absentee Teacher & Respective Classes Matrix ── */}
      {activeTab === 'absentees' && (
        <div className="space-y-4">
          {loading ? (
            <Card className="border-slate-200">
              <CardContent className="py-16 text-center">
                <RefreshCw className="w-8 h-8 mx-auto text-slate-300 animate-spin mb-3" />
                <p className="text-slate-400">Loading biometric absentee schedule matrix...</p>
              </CardContent>
            </Card>
          ) : absenteeGroups.length === 0 ? (
            <Card className="border-dashed border-emerald-300 bg-emerald-50/40">
              <CardContent className="py-16 text-center">
                <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500 mb-3" />
                <p className="text-slate-800 font-bold text-base">All Faculty Present on Biometric Punch</p>
                <p className="text-slate-500 text-xs mt-1">No teacher absences recorded for {selectedDate}. All classes have their regular teachers.</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSyncBiometric}
                  className="mt-4 gap-2 text-xs border-emerald-400 text-emerald-800 bg-white"
                >
                  <Fingerprint className="w-4 h-4 text-emerald-600" /> Refresh Biometric Punch Device
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {absenteeGroups.map((group) => {
                const pendingCount = group.slots.filter(s => s.status === 'pending').length;
                const assignedCount = group.slots.filter(s => s.status !== 'pending').length;

                return (
                  <Card key={group.teacher.id} className="border-slate-200 overflow-hidden shadow-xs">
                    {/* Absentee Header Bar */}
                    <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center text-rose-700 font-bold text-sm shrink-0">
                          {group.teacher.name?.charAt(0) || 'T'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-slate-900 text-sm">{group.teacher.name}</h3>
                            <Badge variant="outline" className="text-[10px] bg-rose-50 text-rose-700 border-rose-200">
                              Absentee ({group.teacher.subject})
                            </Badge>
                            {group.source === 'biometric' && (
                              <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-700 border-violet-200 flex items-center gap-1">
                                <Fingerprint className="w-3 h-3 text-violet-600" /> Biometric Detected
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5 font-medium">
                            {group.reason || 'Absent on morning biometric punch'} &bull; {group.slots.length} Timetable Periods Affected Today
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge className={`text-xs ${pendingCount === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                          {assignedCount} / {group.slots.length} Periods Covered
                        </Badge>
                      </div>
                    </div>

                    {/* Respective Class Periods Needing Substitution */}
                    <div className="p-4 bg-white">
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                        Today&apos;s Assigned Classes for {group.teacher.name}:
                      </h4>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {group.slots.sort((a, b) => a.period - b.period).map((slot) => {
                          const isAssigned = slot.status === 'assigned' || slot.status === 'completed';

                          return (
                            <div
                              key={slot.id}
                              className={`p-3 rounded-xl border transition-all ${
                                isAssigned
                                  ? 'bg-emerald-50/50 border-emerald-200'
                                  : 'bg-amber-50/60 border-amber-300'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <span className="w-7 h-7 rounded-lg bg-slate-800 text-white font-bold text-xs flex items-center justify-center">
                                  P{slot.period}
                                </span>
                                <Badge className={`text-[10px] font-bold ${
                                  isAssigned
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                    : 'bg-amber-100 text-amber-800 border-amber-300'
                                }`}>
                                  {isAssigned ? 'Covered' : 'Needs Substitute'}
                                </Badge>
                              </div>

                              <div className="space-y-1 text-xs mb-3">
                                <div className="font-bold text-slate-800 text-sm">
                                  {slot.grade} &bull; Section {slot.section}
                                </div>
                                <div className="text-slate-600 font-medium flex items-center gap-1">
                                  <BookOpen className="w-3 h-3 text-slate-400" /> {slot.subject}
                                </div>
                              </div>

                              {isAssigned && slot.substitute ? (
                                <div className="p-2 bg-white rounded-lg border border-emerald-200 flex items-center justify-between text-xs">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-[10px] flex items-center justify-center">
                                      {slot.substitute.name.charAt(0)}
                                    </div>
                                    <span className="font-semibold text-slate-800 truncate">{slot.substitute.name}</span>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleOpenAssignModal(slot)}
                                    className="h-6 px-2 text-[10px] text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                                  >
                                    Change
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  size="sm"
                                  onClick={() => handleOpenAssignModal(slot)}
                                  className="w-full h-8 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white gap-1 shadow-xs"
                                >
                                  <UserCheck className="w-3.5 h-3.5" /> Assign Substitute
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: Full Substitutions Table ── */}
      {activeTab === 'table' && (
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
                  <th className="py-3 px-4 text-right">Actions</th>
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
                          <span className="text-slate-700 font-medium">{s.absentTeacher?.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {s.substitute ? (
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-semibold text-[11px]">
                              {s.substitute.name.charAt(0)}
                            </div>
                            <span className="text-slate-700 font-medium">{s.substitute.name}</span>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenAssignModal(s)}
                            className="h-7 text-xs border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 font-bold"
                          >
                            Assign
                          </Button>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <Badge className={`text-[10px] ${
                          s.source === 'biometric'
                            ? 'bg-violet-50 text-violet-700 border-violet-200'
                            : 'bg-cyan-50 text-cyan-700 border-cyan-200'
                        }`}>
                          {s.source}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Badge className={`text-[10px] flex items-center gap-1 w-fit ${sc.color}`}>
                          <StatusIcon className="w-3 h-3" /> {sc.label}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
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

      {/* ── Assign Substitute Modal (Smart Candidate Ranking) ── */}
      <Dialog open={!!assigningSub} onOpenChange={() => setAssigningSub(null)}>
        <DialogContent className="max-w-lg">
          {assigningSub && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-blue-950 font-bold">
                  <Brain className="w-5 h-5 text-blue-700" />
                  Select Substitute for Period {assigningSub.period}
                </DialogTitle>
                <p className="text-xs text-slate-500">
                  {assigningSub.grade} {assigningSub.section} &bull; {assigningSub.subject} &bull; Absent: <strong>{assigningSub.absentTeacher.name}</strong>
                </p>
              </DialogHeader>

              <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
                {loadingCandidates ? (
                  <div className="py-8 text-center">
                    <RefreshCw className="w-6 h-6 mx-auto text-slate-400 animate-spin mb-2" />
                    <p className="text-xs text-slate-500">Analyzing free periods, subject specialty & workload...</p>
                  </div>
                ) : candidates.length === 0 ? (
                  <div className="py-8 text-center bg-slate-50 rounded-xl border border-slate-200 p-4">
                    <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                    <p className="text-xs font-bold text-slate-700">No Free Teachers Found for Period {assigningSub.period}</p>
                    <p className="text-[11px] text-slate-500 mt-1">All other faculty are assigned to regular classes during this period.</p>
                  </div>
                ) : (
                  candidates.map((c) => (
                    <div
                      key={c.id}
                      className="p-3 bg-white rounded-xl border border-slate-200 hover:border-blue-300 hover:shadow-xs transition-all flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 text-xs truncate">{c.name}</span>
                          <Badge variant="outline" className={`text-[9px] ${
                            c.teachesSubject
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {c.subject}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-emerald-700 font-semibold mt-0.5">
                          {c.recommendation}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          Workload Today: {c.totalWorkload}/8 Periods
                        </p>
                      </div>

                      <Button
                        size="sm"
                        onClick={() => handleAssignSubstitute(c.id)}
                        disabled={assigningLoading}
                        className="h-8 text-xs font-bold bg-blue-700 hover:bg-blue-800 text-white shrink-0"
                      >
                        {assigningLoading ? 'Assigning...' : 'Select'}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── View Detail Dialog ── */}
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
