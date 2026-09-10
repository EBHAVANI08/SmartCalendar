'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  UserCheck,
  Users,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Search,
  Download,
  CalendarDays,
  History,
  FileSpreadsheet,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Filter,
  Sparkles,
  ShieldAlert,
  ArrowRight,
  Check,
  Building2,
  CalendarCheck2,
  UserX,
  PlaneTakeoff,
  Clock4,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

interface TeacherAttendanceRow {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  employeeId?: string | null;
  subject: string;
  subjects: string[];
  grades: string[];
  sections: string[];
  status: 'present' | 'absent' | 'on_leave' | 'late' | 'half-day' | 'unmarked';
  checkInTime: string | null;
  checkOutTime: string | null;
  syncSource: string | null;
  leaveInfo: {
    id: string;
    leaveType: string;
    reason?: string;
    isEmergency?: boolean;
    startDate: string;
    endDate: string;
  } | null;
  classesCount: number;
  classes: Array<{
    id: string;
    period: number;
    grade: string;
    section: string;
    subject: string;
    startTime?: string;
    endTime?: string;
  }>;
  substitutionsCount: number;
  substitutions: Array<{
    id: string;
    period: number;
    grade: string;
    section: string;
    subject: string;
    status: string;
    substituteName?: string | null;
  }>;
}

interface AttendanceSummary {
  total: number;
  present: number;
  absent: number;
  onLeave: number;
  late: number;
  halfDay: number;
  unmarked: number;
  attendanceRate: number;
}

interface HistoryLog {
  id: string;
  date: string;
  day: string;
  teacherId: string;
  teacherName: string;
  employeeId: string | null;
  subject: string;
  status: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  syncSource: string;
  updatedAt: string;
}

export default function TeacherAttendancePage() {
  const { toast } = useToast();

  // Active view: 'daily' | 'history'
  const [activeTab, setActiveTab] = useState<'daily' | 'history'>('daily');

  // Date selection
  const [date, setDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [dayName, setDayName] = useState<string>('');
  const [isWeekend, setIsWeekend] = useState<boolean>(false);

  // Daily Data State
  const [teachers, setTeachers] = useState<TeacherAttendanceRow[]>([]);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [bulkProcessing, setBulkProcessing] = useState<boolean>(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');

  // Selected for bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Details Modal for Today's Classes & Substitutions
  const [selectedTeacherForModal, setSelectedTeacherForModal] = useState<TeacherAttendanceRow | null>(null);

  // History tab state
  const [historyFrom, setHistoryFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d.toISOString().split('T')[0];
  });
  const [historyTo, setHistoryTo] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [historyStatus, setHistoryStatus] = useState<string>('all');
  const [historyLogs, setHistoryLogs] = useState<HistoryLog[]>([]);
  const [historySummary, setHistorySummary] = useState<any>(null);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);

  // Fetch Daily Attendance
  const fetchDailyAttendance = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/attendance/teachers?date=${date}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setTeachers(data.teachers || []);
        setSummary(data.summary || null);
        setDayName(data.day || '');
        setIsWeekend(Boolean(data.isWeekend));
      } else {
        toast({
          title: 'Error loading attendance',
          description: data.error || 'Failed to fetch data.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Connection error',
        description: 'Could not connect to server.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [date, toast]);

  useEffect(() => {
    fetchDailyAttendance();
  }, [fetchDailyAttendance]);

  // Fetch History
  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const query = new URLSearchParams({
        from: historyFrom,
        to: historyTo,
        status: historyStatus,
      });
      const res = await fetch(`/api/attendance/teachers/history?${query.toString()}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setHistoryLogs(data.records || []);
        setHistorySummary(data.summary || null);
      }
    } catch {
      toast({
        title: 'History load error',
        description: 'Could not load attendance logs.',
        variant: 'destructive',
      });
    } finally {
      setHistoryLoading(false);
    }
  }, [historyFrom, historyTo, historyStatus, toast]);

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab, fetchHistory]);

  // Handle single teacher attendance mark
  const handleMarkStatus = async (
    teacher: TeacherAttendanceRow,
    newStatus: 'present' | 'absent' | 'on_leave' | 'late' | 'half-day'
  ) => {
    setMarkingId(teacher.id);
    try {
      const res = await fetch('/api/attendance/teachers/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacherId: teacher.id,
          date,
          status: newStatus,
          checkInTime: newStatus === 'present' ? teacher.checkInTime || '08:00' : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: 'Attendance Recorded',
          description: data.message || `Marked ${teacher.name} as ${newStatus.toUpperCase()}`,
        });
        await fetchDailyAttendance();
      } else {
        toast({
          title: 'Failed to update',
          description: data.error || 'Server error',
          variant: 'destructive',
        });
      }
    } catch {
      toast({ title: 'Network error', description: 'Could not reach server', variant: 'destructive' });
    } finally {
      setMarkingId(null);
    }
  };

  // Mark all unmarked as Present
  const handleMarkAllPresent = async () => {
    setBulkProcessing(true);
    try {
      const res = await fetch('/api/attendance/teachers/bulk-mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          action: 'mark_all_present',
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: 'Bulk Attendance Completed',
          description: data.message || 'All teachers marked as Present.',
        });
        await fetchDailyAttendance();
      } else {
        toast({
          title: 'Bulk mark failed',
          description: data.error || 'Error updating attendance.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({ title: 'Network error', description: 'Failed to complete bulk mark.', variant: 'destructive' });
    } finally {
      setBulkProcessing(false);
    }
  };

  // Bulk mark selected teachers
  const handleBulkMarkSelected = async (status: 'present' | 'absent') => {
    if (selectedIds.size === 0) return;
    setBulkProcessing(true);
    try {
      const records = Array.from(selectedIds).map((id) => ({
        teacherId: id,
        status,
        checkInTime: status === 'present' ? '08:00' : undefined,
      }));

      const res = await fetch('/api/attendance/teachers/bulk-mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          records,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: 'Batch Update Successful',
          description: `Updated ${selectedIds.size} faculty members to ${status.toUpperCase()}.`,
        });
        setSelectedIds(new Set());
        await fetchDailyAttendance();
      } else {
        toast({
          title: 'Batch update failed',
          description: data.error || 'Error updating records.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({ title: 'Error', description: 'Request failed.', variant: 'destructive' });
    } finally {
      setBulkProcessing(false);
    }
  };

  // Date Navigation Helpers
  const handlePrevDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    setDate(d.toISOString().split('T')[0]);
  };

  const handleNextDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    setDate(d.toISOString().split('T')[0]);
  };

  const handleToday = () => {
    setDate(new Date().toISOString().split('T')[0]);
  };

  // Selection toggle
  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  // Filtered teachers list
  const filteredTeachers = useMemo(() => {
    return teachers.filter((t) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = t.name.toLowerCase().includes(q);
        const matchesSub = t.subject.toLowerCase().includes(q);
        const matchesEmp = t.employeeId?.toLowerCase().includes(q);
        if (!matchesName && !matchesSub && !matchesEmp) return false;
      }

      // Status
      if (statusFilter !== 'all') {
        if (t.status !== statusFilter) return false;
      }

      // Subject
      if (subjectFilter !== 'all') {
        if (t.subject !== subjectFilter) return false;
      }

      return true;
    });
  }, [teachers, searchQuery, statusFilter, subjectFilter]);

  // Unique subjects for filter
  const uniqueSubjects = useMemo(() => {
    const set = new Set<string>();
    teachers.forEach((t) => {
      if (t.subject) set.add(t.subject);
    });
    return Array.from(set).sort();
  }, [teachers]);

  // Export Daily Attendance CSV
  const handleExportCSV = () => {
    if (filteredTeachers.length === 0) return;
    const headers = ['Employee ID', 'Teacher Name', 'Subject', 'Status', 'Check-In', 'Check-Out', 'Leave Reason', 'Classes Today', 'Substitutions'];
    const rows = filteredTeachers.map((t) => [
      t.employeeId || 'N/A',
      `"${t.name}"`,
      `"${t.subject}"`,
      t.status.toUpperCase(),
      t.checkInTime || '',
      t.checkOutTime || '',
      `"${t.leaveInfo ? `${t.leaveInfo.leaveType} (${t.leaveInfo.reason || 'Approved'})` : ''}"`,
      t.classesCount,
      t.substitutionsCount,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Teacher_Attendance_${date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Status color styles helper
  const getStatusBadge = (status: string, leaveInfo?: any) => {
    switch (status) {
      case 'present':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Present
          </span>
        );
      case 'absent':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <UserX className="w-3.5 h-3.5 text-rose-600" />
            Absent
          </span>
        );
      case 'on_leave':
        return (
          <span
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200"
            title={leaveInfo?.reason ? `Leave: ${leaveInfo.reason}` : 'Approved Leave'}
          >
            <PlaneTakeoff className="w-3.5 h-3.5 text-purple-600" />
            On Leave
          </span>
        );
      case 'late':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock4 className="w-3.5 h-3.5 text-amber-600" />
            Late
          </span>
        );
      case 'half-day':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-orange-50 text-orange-700 border border-orange-200">
            <Clock className="w-3.5 h-3.5 text-orange-600" />
            Half-Day
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
            Unmarked
          </span>
        );
    }
  };

  return (
    <div className="w-full min-h-screen pb-16 space-y-6">
      {/* ── Page Header ── */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white/80 backdrop-blur-md p-6 rounded-3xl border border-slate-200/80 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-700 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <UserCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-900 flex items-center gap-2">
                Teacher Attendance Management
                <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50/50 text-[10px] font-bold">
                  Live Sync
                </Badge>
              </h1>
              <p className="text-xs text-slate-500">
                Single and bulk faculty attendance with automated approved-leave detection &amp; real-time substitution sync.
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* View Tab Switcher */}
          <div className="flex items-center p-1 bg-slate-100/90 rounded-2xl border border-slate-200/70">
            <button
              onClick={() => setActiveTab('daily')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'daily'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CalendarCheck2 className="w-3.5 h-3.5" />
              Daily Register
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'history'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              History Log
            </button>
          </div>

          <Link href="/substitutions">
            <Button variant="outline" size="sm" className="h-9 text-xs rounded-xl border-slate-200 bg-white hover:bg-slate-50 gap-1.5 text-slate-700">
              <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
              <span>Go to Substitutions</span>
            </Button>
          </Link>

          <Button
            onClick={handleExportCSV}
            variant="outline"
            size="sm"
            className="h-9 text-xs rounded-xl border-slate-200 bg-white hover:bg-slate-50 gap-1.5 text-slate-700"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export CSV</span>
          </Button>
        </div>
      </div>

      {/* ── DAILY REGISTER TAB ── */}
      {activeTab === 'daily' && (
        <>
          {/* Date Selector Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl shadow-md">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={handlePrevDay}
                className="h-8 w-8 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>

              <div className="flex items-center gap-2 bg-white/10 px-3.5 py-1.5 rounded-xl border border-white/15">
                <Calendar className="w-4 h-4 text-blue-300" />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="bg-transparent text-white text-xs font-bold focus:outline-none cursor-pointer"
                />
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={handleNextDay}
                className="h-8 w-8 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={handleToday}
                className="h-8 text-xs bg-white/15 hover:bg-white/25 text-white border-none rounded-xl"
              >
                Today
              </Button>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-blue-200">
                {dayName} {isWeekend ? '• (Weekend)' : '• Timetable Active'}
              </span>

              <Button
                onClick={handleMarkAllPresent}
                disabled={bulkProcessing || loading}
                className="h-8 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs gap-1.5 border-none"
              >
                {bulkProcessing ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                Mark All Present
              </Button>
            </div>
          </div>

          {/* Metric Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Card className="rounded-2xl border-slate-200 shadow-xs bg-white">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Staff</p>
                  <p className="text-2xl font-black text-slate-900 mt-1">{summary?.total ?? 0}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
                  <Users className="w-5 h-5" />
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-emerald-200 shadow-xs bg-emerald-50/30">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Present</p>
                  <p className="text-2xl font-black text-emerald-800 mt-1">{summary?.present ?? 0}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-rose-200 shadow-xs bg-rose-50/30">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold text-rose-600 uppercase tracking-wider">Absent</p>
                  <p className="text-2xl font-black text-rose-800 mt-1">{summary?.absent ?? 0}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center text-rose-700">
                  <UserX className="w-5 h-5" />
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-purple-200 shadow-xs bg-purple-50/30">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold text-purple-600 uppercase tracking-wider">On Leave</p>
                  <p className="text-2xl font-black text-purple-800 mt-1">{summary?.onLeave ?? 0}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-purple-700">
                  <PlaneTakeoff className="w-5 h-5" />
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-amber-200 shadow-xs bg-amber-50/30">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">Late</p>
                  <p className="text-2xl font-black text-amber-800 mt-1">{summary?.late ?? 0}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700">
                  <Clock4 className="w-5 h-5" />
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-blue-200 shadow-xs bg-blue-50/30">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">Attendance Rate</p>
                  <p className="text-2xl font-black text-blue-800 mt-1">{summary?.attendanceRate ?? 0}%</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700">
                  <Sparkles className="w-5 h-5" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filter Toolbar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex flex-wrap items-center gap-2.5 flex-1">
              {/* Search */}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Search faculty name, staff ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-xs rounded-xl border-slate-200 bg-slate-50/50"
                />
              </div>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 px-3 text-xs rounded-xl border border-slate-200 bg-slate-50/50 text-slate-700 font-medium focus:outline-none"
              >
                <option value="all">All Statuses ({teachers.length})</option>
                <option value="present">Present ({summary?.present || 0})</option>
                <option value="absent">Absent ({summary?.absent || 0})</option>
                <option value="on_leave">On Approved Leave ({summary?.onLeave || 0})</option>
                <option value="late">Late ({summary?.late || 0})</option>
                <option value="half-day">Half-Day ({summary?.halfDay || 0})</option>
                <option value="unmarked">Unmarked ({summary?.unmarked || 0})</option>
              </select>

              {/* Subject Filter */}
              <select
                value={subjectFilter}
                onChange={(e) => setSubjectFilter(e.target.value)}
                className="h-9 px-3 text-xs rounded-xl border border-slate-200 bg-slate-50/50 text-slate-700 font-medium focus:outline-none"
              >
                <option value="all">All Subjects</option>
                {uniqueSubjects.map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}
                  </option>
                ))}
              </select>
            </div>

            {/* Bulk Selection Actions (when items are checked) */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2 bg-blue-50 p-1.5 px-3 rounded-xl border border-blue-200">
                <span className="text-xs font-bold text-blue-900">{selectedIds.size} Selected</span>
                <Button
                  size="sm"
                  onClick={() => handleBulkMarkSelected('present')}
                  disabled={bulkProcessing}
                  className="h-7 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg px-2.5"
                >
                  Mark Present
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleBulkMarkSelected('absent')}
                  disabled={bulkProcessing}
                  className="h-7 text-[11px] bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg px-2.5"
                >
                  Mark Absent
                </Button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-[11px] text-slate-500 hover:text-slate-800 ml-1 font-medium"
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          {/* Faculty Attendance Table */}
          <Card className="rounded-2xl border-slate-200 shadow-xs overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={filteredTeachers.length > 0 && selectedIds.size === filteredTeachers.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds(new Set(filteredTeachers.map((t) => t.id)));
                          } else {
                            setSelectedIds(new Set());
                          }
                        }}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                    </th>
                    <th className="py-3 px-4">Faculty Member</th>
                    <th className="py-3 px-4">Subject &amp; Scope</th>
                    <th className="py-3 px-4 text-center">Today&apos;s Status</th>
                    <th className="py-3 px-4 text-center">Check-In / Out</th>
                    <th className="py-3 px-4 text-center">Timetable &amp; Subs</th>
                    <th className="py-3 px-4 text-center">Quick Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-600 mb-2" />
                        <span>Loading teacher attendance data...</span>
                      </td>
                    </tr>
                  ) : filteredTeachers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        <Users className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                        <p className="font-semibold text-slate-600">No faculty members found</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Try adjusting your search or status filter.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredTeachers.map((t) => {
                      const isSelected = selectedIds.has(t.id);
                      const isMarking = markingId === t.id;

                      return (
                        <tr
                          key={t.id}
                          className={`hover:bg-slate-50/60 transition-colors ${
                            isSelected ? 'bg-blue-50/40' : ''
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="py-3 px-4 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(t.id)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                          </td>

                          {/* Teacher Name & Staff ID */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-700 to-indigo-800 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                                {t.name
                                  .split(' ')
                                  .map((n) => n[0])
                                  .slice(0, 2)
                                  .join('')}
                              </div>
                              <div>
                                <p className="font-bold text-slate-900 leading-snug">{t.name}</p>
                                <p className="text-[11px] text-slate-400 font-mono">
                                  {t.employeeId ? `ID: ${t.employeeId}` : t.email}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Subject & Grades */}
                          <td className="py-3 px-4">
                            <p className="font-semibold text-slate-800">{t.subject || 'General'}</p>
                            {t.grades && t.grades.length > 0 && (
                              <p className="text-[10px] text-slate-400 truncate max-w-[180px]">
                                {t.grades.slice(0, 3).join(', ')}
                                {t.grades.length > 3 ? ` +${t.grades.length - 3}` : ''}
                              </p>
                            )}
                          </td>

                          {/* Current Status Badge */}
                          <td className="py-3 px-4 text-center">
                            <div className="flex flex-col items-center gap-1">
                              {getStatusBadge(t.status, t.leaveInfo)}
                              {t.leaveInfo && (
                                <span className="text-[10px] text-purple-600 font-medium max-w-[140px] truncate">
                                  🏖️ {t.leaveInfo.leaveType}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Check-In / Check-Out */}
                          <td className="py-3 px-4 text-center">
                            <div className="inline-flex flex-col items-center">
                              <span className="text-xs font-mono font-bold text-slate-800">
                                {t.checkInTime || '--:--'}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                Out: {t.checkOutTime || '--:--'}
                              </span>
                            </div>
                          </td>

                          {/* Classes Today & Substitutions Sync */}
                          <td className="py-3 px-4 text-center">
                            <div className="flex flex-col items-center gap-1">
                              {t.classesCount > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => setSelectedTeacherForModal(t)}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                                >
                                  <span>{t.classesCount} Classes</span>
                                  <ExternalLink className="w-3 h-3 text-blue-500" />
                                </button>
                              ) : (
                                <span className="text-[11px] text-slate-400">No classes today</span>
                              )}

                              {/* Active substitution status */}
                              {t.status === 'absent' && t.substitutionsCount > 0 && (
                                <Link
                                  href="/substitutions"
                                  className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 hover:underline"
                                >
                                  ⚡ {t.substitutionsCount} Subs Generated
                                </Link>
                              )}
                            </div>
                          </td>

                          {/* Quick Action Status Buttons */}
                          <td className="py-3 px-4 text-center">
                            <div className="inline-flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                              <button
                                type="button"
                                disabled={isMarking}
                                onClick={() => handleMarkStatus(t, 'present')}
                                title="Mark Present"
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                                  t.status === 'present'
                                    ? 'bg-emerald-600 text-white shadow-xs'
                                    : 'text-slate-600 hover:text-emerald-700 hover:bg-white'
                                }`}
                              >
                                P
                              </button>

                              <button
                                type="button"
                                disabled={isMarking}
                                onClick={() => handleMarkStatus(t, 'absent')}
                                title="Mark Absent (Auto-syncs Substitutions)"
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                                  t.status === 'absent'
                                    ? 'bg-rose-600 text-white shadow-xs'
                                    : 'text-slate-600 hover:text-rose-700 hover:bg-white'
                                }`}
                              >
                                A
                              </button>

                              <button
                                type="button"
                                disabled={isMarking}
                                onClick={() => handleMarkStatus(t, 'late')}
                                title="Mark Late"
                                className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all ${
                                  t.status === 'late'
                                    ? 'bg-amber-600 text-white shadow-xs'
                                    : 'text-slate-600 hover:text-amber-700 hover:bg-white'
                                }`}
                              >
                                L
                              </button>

                              <button
                                type="button"
                                disabled={isMarking}
                                onClick={() => handleMarkStatus(t, 'half-day')}
                                title="Mark Half-Day"
                                className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all ${
                                  t.status === 'half-day'
                                    ? 'bg-orange-600 text-white shadow-xs'
                                    : 'text-slate-600 hover:text-orange-700 hover:bg-white'
                                }`}
                              >
                                HD
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* ── HISTORY & REPORTS TAB ── */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {/* History Query Toolbar */}
          <Card className="rounded-2xl border-slate-200 shadow-xs bg-white">
            <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 text-xs">
                  <Label className="text-slate-500 font-bold">From:</Label>
                  <input
                    type="date"
                    value={historyFrom}
                    onChange={(e) => setHistoryFrom(e.target.value)}
                    className="h-9 px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold"
                  />
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <Label className="text-slate-500 font-bold">To:</Label>
                  <input
                    type="date"
                    value={historyTo}
                    onChange={(e) => setHistoryTo(e.target.value)}
                    className="h-9 px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold"
                  />
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <Label className="text-slate-500 font-bold">Status:</Label>
                  <select
                    value={historyStatus}
                    onChange={(e) => setHistoryStatus(e.target.value)}
                    className="h-9 px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700"
                  >
                    <option value="all">All Statuses</option>
                    <option value="present">Present</option>
                    <option value="absent">Absent</option>
                    <option value="on_leave">On Leave</option>
                    <option value="late">Late</option>
                    <option value="half-day">Half-Day</option>
                  </select>
                </div>

                <Button
                  onClick={fetchHistory}
                  disabled={historyLoading}
                  className="h-9 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
                >
                  {historyLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Filter className="w-3.5 h-3.5" />}
                  Filter Records
                </Button>
              </div>

              {/* History Stats Badge */}
              {historySummary && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-bold text-slate-700">Total Logs: {historySummary.totalLogs}</span>
                  <Badge variant="outline" className="border-emerald-200 text-emerald-700 bg-emerald-50">
                    {historySummary.attendanceRate}% Avg Attendance
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>

          {/* History Records Table */}
          <Card className="rounded-2xl border-slate-200 shadow-xs overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Faculty Member</th>
                    <th className="py-3 px-4">Subject</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Check-In</th>
                    <th className="py-3 px-4 text-center">Check-Out</th>
                    <th className="py-3 px-4 text-center">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {historyLoading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-600 mb-2" />
                        <span>Querying historical attendance logs...</span>
                      </td>
                    </tr>
                  ) : historyLogs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        <History className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                        <p className="font-semibold text-slate-600">No attendance logs found in this date range</p>
                      </td>
                    </tr>
                  ) : (
                    historyLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-800">
                          {log.date} <span className="text-[10px] text-slate-400 font-sans">({log.day})</span>
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-bold text-slate-900">{log.teacherName}</p>
                          {log.employeeId && (
                            <p className="text-[10px] text-slate-400 font-mono">ID: {log.employeeId}</p>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-700 font-medium">{log.subject || 'N/A'}</td>
                        <td className="py-3 px-4 text-center">{getStatusBadge(log.status)}</td>
                        <td className="py-3 px-4 text-center font-mono text-slate-700">{log.checkInTime || '--:--'}</td>
                        <td className="py-3 px-4 text-center font-mono text-slate-700">{log.checkOutTime || '--:--'}</td>
                        <td className="py-3 px-4 text-center">
                          <span className="capitalize text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                            {log.syncSource}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ── Modal: Teacher Today's Classes & Substitutions Detail ── */}
      {selectedTeacherForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-r from-blue-700 to-indigo-800 p-5 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm leading-tight">{selectedTeacherForModal.name}</h3>
                <p className="text-[11px] text-blue-200 mt-0.5">
                  {dayName} Schedule &bull; {selectedTeacherForModal.classesCount} Classes
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTeacherForModal(null)}
                className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors"
              >
                &times;
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto text-xs">
              {/* Status Banner */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-600 font-medium">Status for {date}:</span>
                {getStatusBadge(selectedTeacherForModal.status, selectedTeacherForModal.leaveInfo)}
              </div>

              {/* Classes Schedule */}
              <div className="space-y-2">
                <h4 className="font-bold text-slate-900 text-xs">Timetable Periods for {dayName}:</h4>
                {selectedTeacherForModal.classes.length === 0 ? (
                  <p className="text-slate-400 italic">No classes scheduled on this weekday.</p>
                ) : (
                  <div className="space-y-1.5">
                    {selectedTeacherForModal.classes.map((cls) => (
                      <div
                        key={cls.id}
                        className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200/80 bg-white"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg bg-blue-100 text-blue-800 font-black text-[11px] flex items-center justify-center">
                            P{cls.period}
                          </span>
                          <div>
                            <p className="font-bold text-slate-800">
                              {cls.grade} &bull; Section {cls.section}
                            </p>
                            <p className="text-[10px] text-slate-400 font-medium">{cls.subject}</p>
                          </div>
                        </div>
                        {cls.startTime && cls.endTime && (
                          <span className="text-[10px] font-mono text-slate-500">
                            {cls.startTime} - {cls.endTime}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Active Substitutions */}
              {selectedTeacherForModal.substitutions.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <h4 className="font-bold text-rose-700 text-xs flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5" />
                    Synchronized Substitution Slots ({selectedTeacherForModal.substitutions.length})
                  </h4>
                  <div className="space-y-1.5">
                    {selectedTeacherForModal.substitutions.map((sub) => (
                      <div
                        key={sub.id}
                        className="flex items-center justify-between p-2.5 rounded-xl border border-rose-200 bg-rose-50/50"
                      >
                        <div>
                          <p className="font-bold text-slate-900">
                            Period {sub.period} &bull; {sub.grade} {sub.section}
                          </p>
                          <p className="text-[10px] text-slate-500">{sub.subject}</p>
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-bold ${
                            sub.status === 'assigned'
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                              : 'border-amber-300 bg-amber-50 text-amber-800'
                          }`}
                        >
                          {sub.status === 'assigned'
                            ? `Cover: ${sub.substituteName || 'Assigned'}`
                            : 'Pending Cover'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedTeacherForModal(null)}
                className="text-xs rounded-xl"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
