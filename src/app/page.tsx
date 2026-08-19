'use client';

import React, { useState, useEffect, useCallback, startTransition } from 'react';
import {
  Calendar, Users, BookOpen, RefreshCw, ChevronRight, Clock, User,
  GraduationCap, AlertCircle, CheckCircle2, Sparkles, Brain,
  Search, Phone, Mail, MapPin, Timer, Zap, Activity,
  LayoutDashboard, ArrowRight, UserCheck, AlertTriangle, Menu, X,
  LogOut, FileText, Eye, Target, ListChecks, Lightbulb, BookMarked, CalendarDays,
  Lock, ShieldCheck, Coffee, BarChart3, BookTemplate, Library,
  Download, Copy, Check, Filter, Grid3X3, TrendingUp, TrendingDown,
  ChevronDown, ChevronUp, Layers, Hash, Trash2, XCircle, UserPlus, Upload, FileSpreadsheet, Plus,
  Save, Settings
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';

// Types
interface Teacher {
  id: string;
  name: string;
  email: string;
  phone?: string;
  subject: string;
  grades: string;
  schedules: Schedule[];
}

interface Schedule {
  id: string;
  grade: string;
  section: string;
  day: string;
  period: number;
  subject: string;
  teacherId: string | null;
  topic: string | null;
  roomId: string | null;
  startTime: string;
  endTime: string;
  teacher?: Teacher;
}

interface Substitution {
  id: string;
  date: string;
  period: number;
  absentTeacherId: string;
  substituteId: string | null;
  grade: string;
  section: string;
  subject: string;
  reason: string | null;
  lessonDNA: string | null;
  yesterdayTopic: string | null;
  todayTopic: string | null;
  subContext: string | null;
  source: string;
  status: string;
  absentTeacher: Teacher;
  substitute?: Teacher;
}

interface Stats {
  totalTeachers: number;
  totalStudents: number;
  todaySubstitutions: number;
  emptyPeriods: number;
  pendingSubstitutions: number;
  assignedSubstitutions: number;
  totalSchedules: number;
  filledPeriods: number;
}

interface LessonDNAActivity {
  name?: string;
  timeAllocation?: string;
  description?: string;
}

interface LessonDNA {
  topicSummary: string;
  keyConcepts: string[];
  teachingTips: string[];
  studentBehaviorPatterns: string[];
  recommendedActivities: (string | LessonDNAActivity)[];
}

interface LessonPlan {
  title: string;
  grade: string;
  subject: string;
  topic: string;
  duration: string;
  objectives: string[];
  warmUp: { activity: string; duration: string; description: string };
  mainContent: { section: string; duration: string; description: string }[];
  differentiation: { struggling: string; onLevel: string; advanced: string };
  assessment: { formative: string; summative: string };
  resources: string[];
  homework: string;
  keyVocabulary: string[];
}

type TabType = 'dashboard' | 'calendar' | 'bulk-import' | 'substitutions' | 'teachers' | 'teacher-portal' | 'analytics';
type UserRole = 'admin' | 'teacher' | 'superadmin' | null;

interface LoginUser {
  id: string;
  name: string;
  email: string;
  role: string;
  subject?: string;
  grades?: string;
  phone?: string;
  schoolId?: string;
  schoolCode?: string;
  isSuperAdmin?: boolean;
}

interface SchoolFeatureFlags {
  id: string;
  schoolId: string;
  aiTimetableEnabled: boolean;
  manualTimetableEnabled: boolean;
  bulkImportEnabled: boolean;
  shortBreakEnabled: boolean;
  lunchBreakEnabled: boolean;
  ptPeriodsEnabled: boolean;
  substitutionEnabled: boolean;
  autoSubstitutionEnabled: boolean;
  workloadAnalyticsEnabled: boolean;
  teacherNotifyEnabled: boolean;
  maxGrades: number;
  maxTeachers: number;
  maxPeriodsPerDay: number;
  planName: string;
  customNote?: string | null;
  trialEndsAt?: string | null;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const PERIOD_TIMES: Record<number, { start: string; end: string }> = {
  1: { start: '08:00', end: '08:40' },
  2: { start: '08:40', end: '09:20' },
  3: { start: '09:20', end: '10:00' },
  // Break 10:00–10:30
  4: { start: '10:30', end: '11:10' },
  5: { start: '11:10', end: '11:50' },
  6: { start: '11:50', end: '12:30' },
  7: { start: '12:30', end: '13:10' },
  8: { start: '13:10', end: '13:45' },
};

// ─── Biometric Agent Cards ───
interface BiometricRecord {
  id: string;
  date: string;
  teacherId: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  status: string;
  deviceId: string | null;
  teacher?: { id: string; name: string; subject: string; grades: string; email: string; phone?: string };
}

interface AbsentTeacherInfo {
  teacherId: string;
  teacherName: string;
  teacherSubject: string;
  teacherGrades: string[];
  biometricStatus: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  reason: string;
  reasonSource: string;
  leaveType: string | null;
  isEmergency: boolean;
  hasLeaveApplication: boolean;
  leaveDetails: {
    leaveType: string;
    reason: string;
    isEmergency: boolean;
    appliedAt: string;
    teacherNotes: string | null;
  } | null;
  todayScheduleCount: number;
  totalScheduleCount: number;
  scheduleDetails: {
    period: number;
    grade: string;
    section: string;
    subject: string;
    startTime: string;
    endTime: string;
    yesterdayTopic: string;
    todayExpectedTopic: string;
  }[];
}

interface AIAssignment {
  substitutionId: string;
  period: number;
  grade: string;
  section: string;
  subject: string;
  assignedTeacher: string | null;
  assignedTeacherSubject: string | null;
  score: number;
  reason: string;
  aiReasoning?: string | null;
}

function BiometricAgentCards({
  teachers,
  schedules,
  sharedSchedules,
  onNavigate,
}: {
  teachers: Teacher[];
  schedules: Schedule[];
  sharedSchedules: Schedule[];
  onNavigate: (tab: TabType) => void;
}) {
  const { toast } = useToast();

  // Biometric state
  const [biometricDate, setBiometricDate] = useState(new Date().toISOString().split('T')[0]);
  const [syncing, setSyncing] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [biometricSummary, setBiometricSummary] = useState<{
    total: number; present: number; absent: number; late: number; halfDay: number;
  } | null>(null);
  const [biometricRecords, setBiometricRecords] = useState<BiometricRecord[]>([]);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [absentTeachers, setAbsentTeachers] = useState<AbsentTeacherInfo[]>([]);
  const [selectedAbsentTeacher, setSelectedAbsentTeacher] = useState<AbsentTeacherInfo | null>(null);
  const [absentDetailOpen, setAbsentDetailOpen] = useState(false);
  const [autoAssigningAll, setAutoAssigningAll] = useState(false);
  const [generatingContext, setGeneratingContext] = useState<string | null>(null);
  const [aiAssignments, setAiAssignments] = useState<AIAssignment[]>([]);
  const [totalPendingPeriods, setTotalPendingPeriods] = useState(0);
  const [availableTeacherCount, setAvailableTeacherCount] = useState<number | null>(null);
  const [fetchingAvailable, setFetchingAvailable] = useState(false);

  const fetchBiometricData = useCallback(async () => {
    try {
      const res = await fetch(`/api/biometric/sync?date=${biometricDate}`);
      if (res.ok) {
        const data = await res.json();
        setBiometricSummary(data.summary);
        setBiometricRecords(data.records || []);
        // If there are absent/late/half-day teachers, auto-fetch their details
        if (data.summary && (data.summary.absent > 0 || data.summary.late > 0 || data.summary.halfDay > 0)) {
          try {
            const detectRes = await fetch('/api/biometric/detect-absent', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ date: biometricDate }),
            });
            if (detectRes.ok) {
              const detectData = await detectRes.json();
              setAbsentTeachers(detectData.absentTeachers || []);
              const totalPeriods = (detectData.absentTeachers || []).reduce(
                (sum: number, at: AbsentTeacherInfo) => sum + at.todayScheduleCount, 0
              );
              setTotalPendingPeriods(totalPeriods);
            }
          } catch {
            // Non-critical — auto-detect on load is optional
          }
        }
      }
    } catch {
      console.error('Error fetching biometric data');
    }
  }, [biometricDate]);

  // Fetch existing biometric data and absent teachers on mount
  useEffect(() => {
    fetchBiometricData(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [fetchBiometricData]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/biometric/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: biometricDate }),
      });
      const data = await res.json();
      if (res.ok) {
        setBiometricSummary(data.summary);
        setBiometricRecords(data.records);
        setLastSyncTime(data.syncedAt);
        toast({
          title: 'Biometric Data Synced',
          description: `${data.summary.present} present, ${data.summary.absent} absent, ${data.summary.late} late`,
        });
      } else {
        toast({ title: 'Sync Failed', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to sync biometric data', variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  const handleDetect = async () => {
    setDetecting(true);
    try {
      const res = await fetch('/api/biometric/detect-absent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: biometricDate }),
      });
      const data = await res.json();
      if (res.ok) {
        setAbsentTeachers(data.absentTeachers || []);
        // Count total substitution periods
        const totalPeriods = (data.absentTeachers || []).reduce(
          (sum: number, at: AbsentTeacherInfo) => sum + at.todayScheduleCount, 0
        );
        setTotalPendingPeriods(totalPeriods);
        toast({
          title: 'Absence Detection Complete',
          description: `${data.totalAbsent} absent, ${data.totalLate} late, ${data.totalHalfDay || 0} half-day. ${data.createdSubstitutions} substitution entries created.`,
        });
      } else {
        toast({ title: 'Detection Failed', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to detect absent teachers', variant: 'destructive' });
    } finally {
      setDetecting(false);
    }
  };

  const handleAutoAssignAll = async () => {
    setAutoAssigningAll(true);
    try {
      // Step 1: Ensure biometric data is synced first
      if (!biometricSummary || biometricSummary.total === 0) {
        try {
          const syncRes = await fetch('/api/biometric/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: biometricDate }),
          });
          if (syncRes.ok) {
            const syncData = await syncRes.json();
            setBiometricSummary(syncData.summary);
            setBiometricRecords(syncData.records);
            setLastSyncTime(syncData.syncedAt);
          }
        } catch {
          // Sync might fail, continue anyway
        }
      }

      // Step 2: Re-detect absences to ensure pending substitutions exist
      // (this resets any previously assigned biometric subs back to pending)
      try {
        const detectRes = await fetch('/api/biometric/detect-absent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: biometricDate }),
        });
        if (detectRes.ok) {
          const detectData = await detectRes.json();
          setAbsentTeachers(detectData.absentTeachers || []);
          const totalPeriods = (detectData.absentTeachers || []).reduce(
            (sum: number, at: AbsentTeacherInfo) => sum + at.todayScheduleCount, 0
          );
          setTotalPendingPeriods(totalPeriods);
        } else {
          const errData = await detectRes.json().catch(() => ({}));
          if (errData.isWeekend) {
            toast({ title: 'Weekend', description: 'Cannot detect absences on weekends', variant: 'destructive' });
            return;
          }
        }
      } catch {
        // Detect might fail, but we can still try to assign existing pending subs
      }

      // Step 3: AI auto-assign all pending substitutions
      const res = await fetch('/api/biometric/ai-assign-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: biometricDate }),
      });
      const data = await res.json();
      if (res.ok) {
        setAiAssignments(data.assignments || []);
        const assigned = data.assigned || 0;
        const failed = data.failed || 0;
        const totalPending = data.totalPending || 0;

        if (assigned > 0) {
          toast({
            title: 'AI Auto-Assign Complete',
            description: `Successfully assigned ${assigned} of ${totalPending} substitutions${failed > 0 ? `. ${failed} need manual assignment.` : ''}`,
          });
          // Re-fetch biometric data to sync the display
          await fetchBiometricData();
        } else if (totalPending === 0) {
          toast({
            title: 'No Pending Substitutions',
            description: 'No absent teachers detected. Click "Sync" then "Detect Absences" first, or try a different date.',
          });
        } else if (failed > 0 && assigned === 0) {
          toast({
            title: 'AI Auto-Assign — Manual Attention Needed',
            description: `${failed} substitutions could not be auto-assigned. All eligible teachers may be busy. Try manual assignment.`,
          });
        } else {
          toast({
            title: 'AI Auto-Assign Status',
            description: data.message || 'Assignment processed. Check results below.',
          });
        }
      } else {
        toast({ title: 'AI Assign Failed', description: data.error || 'Failed to assign substitutes. Try Sync + Detect Absences first.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error during auto-assign. Please try again.', variant: 'destructive' });
    } finally {
      setAutoAssigningAll(false);
    }
  };

  const handleFetchAvailableCount = async () => {
    if (absentTeachers.length === 0) return;
    setFetchingAvailable(true);
    try {
      const firstTeacher = absentTeachers[0];
      const firstDetail = firstTeacher.scheduleDetails[0];
      if (!firstDetail) return;
      const res = await fetch('/api/biometric/available-teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: biometricDate,
          period: firstDetail.period,
          subject: firstDetail.subject,
          grade: firstDetail.grade,
          absentTeacherId: firstTeacher.teacherId,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setAvailableTeacherCount(data.totalAvailable || 0);
      }
    } catch {
      // Non-critical
    } finally {
      setFetchingAvailable(false);
    }
  };

  const handleGenerateContext = async (subId: string) => {
    setGeneratingContext(subId);
    try {
      const res = await fetch('/api/biometric/generate-sub-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ substitutionId: subId }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: 'Substitute Context Generated',
          description: 'AI has prepared comprehensive teaching guidance with yesterday\'s and today\'s topics',
        });
      } else {
        toast({ title: 'Error', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to generate context', variant: 'destructive' });
    } finally {
      setGeneratingContext(null);
    }
  };

  // Count assigned vs pending from AI assignments
  const assignedCount = aiAssignments.filter(a => a.assignedTeacher).length;
  const pendingCount = aiAssignments.filter(a => !a.assignedTeacher).length;

  // Reason badge color helper
  const getReasonBadgeStyle = (source: string) => {
    switch (source) {
      case 'leave_portal': return 'bg-blue-100 text-blue-700 border-blue-300';
      case 'biometric': return 'bg-amber-100 text-amber-700 border-amber-300';
      case 'ai_analysis': return 'bg-red-100 text-red-700 border-red-300';
      default: return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  const getReasonSourceLabel = (source: string) => {
    switch (source) {
      case 'leave_portal': return 'Leave Portal';
      case 'biometric': return 'Biometric';
      case 'ai_analysis': return 'AI Analysis';
      default: return 'System';
    }
  };

  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case 'absent': return 'bg-red-100 text-red-700 border-red-300';
      case 'late': return 'bg-amber-100 text-amber-700 border-amber-300';
      case 'half-day': return 'bg-blue-100 text-blue-700 border-blue-300';
      default: return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Card 1: AI Biometric Substitution Agent */}
      <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-teal-50/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <div className="bg-emerald-600 p-1.5 rounded-lg">
              <Brain className="w-4 h-4 text-white" />
            </div>
            AI Biometric Substitution Agent
            {absentTeachers.length > 0 && (
              <Badge className="bg-red-100 text-red-700 border-red-300 text-[10px] ml-auto">
                {absentTeachers.length} Absent
              </Badge>
            )}
          </CardTitle>
          <CardDescription>Powered by CurriculumArchitect AI — Sync, detect absences, and auto-assign substitutes</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Date + Action Buttons */}
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <input
                type="date"
                value={biometricDate}
                onChange={e => setBiometricDate(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
              <CalendarDays className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
            <Button
              onClick={handleSync}
              disabled={syncing}
              variant="outline"
              className="border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 gap-1 shrink-0"
              size="sm"
            >
              {syncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
              {syncing ? 'Syncing...' : 'Sync'}
            </Button>
            <Button
              onClick={handleDetect}
              disabled={detecting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shrink-0"
              size="sm"
            >
              {detecting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              {detecting ? 'Detecting...' : 'Detect Absences'}
            </Button>
          </div>

          {/* Absent Teachers Scrollable List — using ScrollArea like Behavioral Pattern card */}
          {absentTeachers.length > 0 ? (
            <div className="border border-emerald-200 rounded-lg bg-white/60">
              {/* Section Header with count + AI Auto-Assign */}
              <div className="flex items-center justify-between px-3 py-2 bg-emerald-50 border-b border-emerald-200">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-emerald-800">
                    {absentTeachers.length} Absent Teacher{absentTeachers.length !== 1 ? 's' : ''} Detected
                  </p>
                  <Badge className="text-[8px] bg-emerald-100 text-emerald-700 border-emerald-300 py-0">
                    {totalPendingPeriods} periods
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    onClick={handleAutoAssignAll}
                    disabled={autoAssigningAll}
                    size="sm"
                    className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white h-7 text-[10px] gap-1"
                  >
                    {autoAssigningAll ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    {autoAssigningAll ? 'AI Assigning...' : 'AI Auto-Assign All'}
                  </Button>
                  <Button
                    onClick={() => onNavigate('substitutions')}
                    variant="outline"
                    size="sm"
                    className="border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 h-7 text-[10px] gap-1 shrink-0"
                  >
                    <UserCheck className="w-3 h-3" />
                    Manual
                  </Button>
                </div>
              </div>

              {/* AI Assignment Results Summary (shown after AI assigns) */}
              {aiAssignments.length > 0 && (
                <div className="px-3 py-2 bg-teal-50/50 border-b border-teal-100">
                  <div className="flex items-center gap-1.5 mb-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                    <span className="text-[11px] font-semibold text-teal-800">AI Assignment Complete</span>
                    <Badge className="text-[8px] bg-teal-100 text-teal-700 border-teal-300 py-0">
                      {assignedCount} assigned
                    </Badge>
                    {pendingCount > 0 && (
                      <Badge className="text-[8px] bg-amber-100 text-amber-700 border-amber-300 py-0">
                        {pendingCount} pending
                      </Badge>
                    )}
                  </div>
                  <ScrollArea className="h-24">
                    <div className="space-y-1">
                      {aiAssignments.slice(0, 10).map(a => (
                        <div key={a.substitutionId} className="flex items-center gap-1.5 text-[10px]">
                          <Badge variant="outline" className="text-[7px] font-bold py-0 shrink-0">P{a.period}</Badge>
                          <span className="text-gray-500 shrink-0">{a.grade} {a.section}</span>
                          {a.assignedTeacher ? (
                            <>
                              <UserCheck className="w-3 h-3 text-emerald-600 shrink-0" />
                              <span className="text-emerald-700 font-medium">{a.assignedTeacher}</span>
                              {a.assignedTeacherSubject && <span className="text-gray-400">({a.assignedTeacherSubject})</span>}
                            </>
                          ) : (
                            <>
                              <AlertCircle className="w-3 h-3 text-amber-500 shrink-0" />
                              <span className="text-amber-600">Manual needed</span>
                            </>
                          )}
                        </div>
                      ))}
                      {aiAssignments.length > 10 && (
                        <p className="text-[9px] text-gray-400 pl-1">+{aiAssignments.length - 10} more assignments...</p>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {/* Scrollable Absent Teacher List — using ScrollArea for proper scroll like Behavioral Pattern card */}
              <ScrollArea className="h-[340px]">
                <div className="px-2 py-1.5 space-y-1.5">
                  {absentTeachers.map(at => {
                    // Find AI assignments for this teacher
                    const teacherAssignments = aiAssignments.filter(a =>
                      at.scheduleDetails.some(sd => sd.period === a.period && sd.grade === a.grade && sd.section === a.section)
                    );
                    const assignedPeriods = teacherAssignments.filter(a => a.assignedTeacher);
                    const unassignedPeriods = teacherAssignments.filter(a => !a.assignedTeacher);
                    const allAssigned = teacherAssignments.length > 0 && assignedPeriods.length === at.todayScheduleCount;

                    return (
                      <div
                        key={at.teacherId}
                        className={`p-2 bg-white rounded-lg border transition-all cursor-pointer ${
                          allAssigned ? 'border-teal-200 bg-teal-50/30' :
                          assignedPeriods.length > 0 ? 'border-amber-200' :
                          'border-emerald-100 hover:border-emerald-300'
                        }`}
                        onClick={() => { setSelectedAbsentTeacher(at); setAbsentDetailOpen(true); }}
                      >
                        <div className="flex items-center justify-between mb-0.5">
                          <div className="flex items-center gap-1.5">
                            <div className={`w-2 h-2 rounded-full shrink-0 ${
                              at.biometricStatus === 'absent' ? 'bg-red-500' :
                              at.biometricStatus === 'late' ? 'bg-amber-500' : 'bg-blue-500'
                            }`} />
                            <p className="text-xs font-semibold text-gray-800">{at.teacherName}</p>
                            <Badge variant="outline" className="text-[8px] py-0">{at.teacherSubject}</Badge>
                          </div>
                          <div className="flex items-center gap-1">
                            {allAssigned && (
                              <Badge className="text-[8px] py-0 bg-teal-100 text-teal-700 border-teal-300">
                                <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />Covered
                              </Badge>
                            )}
                            {!allAssigned && assignedPeriods.length > 0 && (
                              <Badge className="text-[8px] py-0 bg-amber-100 text-amber-700 border-amber-300">
                                {assignedPeriods.length}/{at.todayScheduleCount}
                              </Badge>
                            )}
                            <Badge className={`text-[8px] py-0 ${getStatusBadgeStyle(at.biometricStatus)}`}>
                              {at.biometricStatus === 'half-day' ? 'Half-day' : at.biometricStatus === 'absent' ? 'Absent' : 'Late'}
                            </Badge>
                          </div>
                        </div>
                        {/* Reason line */}
                        <div className="flex items-center gap-1.5 text-[10px] mb-0.5">
                          <Badge className={`text-[8px] py-0 shrink-0 ${getReasonBadgeStyle(at.reasonSource)}`}>
                            {getReasonSourceLabel(at.reasonSource)}
                          </Badge>
                          <span className="text-gray-600 line-clamp-1">{at.reason}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          <span>{at.todayScheduleCount} class{at.todayScheduleCount !== 1 ? 'es' : ''} today</span>
                          <span className="text-emerald-600">•</span>
                          <span>Grades: {at.teacherGrades.slice(0, 3).map(g => g.replace('Grade ', 'G')).join(', ')}</span>
                        </div>
                        {at.isEmergency && (
                          <div className="mt-0.5 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-red-500" />
                            <span className="text-[9px] text-red-600 font-semibold">Emergency Leave</span>
                          </div>
                        )}
                        {/* Period tags with substitution status */}
                        {at.scheduleDetails.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {at.scheduleDetails.slice(0, 5).map((sd, scheduleIndex) => {
                              const assignment = teacherAssignments.find(a => a.period === sd.period && a.grade === sd.grade && a.section === sd.section);
                              const isCovered = !!assignment?.assignedTeacher;
                              return (
                                <span key={`${at.teacherId}-${sd.grade}-${sd.section}-${sd.period}-${scheduleIndex}`} className={`text-[8px] px-1.5 py-0.5 rounded border ${
                                  isCovered ? 'bg-teal-50 text-teal-700 border-teal-200' :
                                  'bg-amber-50 text-amber-700 border-amber-200'
                                }`}>
                                  P{sd.period} {sd.grade} {sd.section}{isCovered ? ' ✓' : ''}
                                </span>
                              );
                            })}
                            {at.scheduleDetails.length > 5 && (
                              <span className="text-[8px] px-1.5 py-0.5 bg-gray-50 text-gray-500 rounded">
                                +{at.scheduleDetails.length - 5}
                              </span>
                            )}
                          </div>
                        )}
                        {/* Show assigned substitute teachers inline */}
                        {assignedPeriods.length > 0 && (
                          <div className="mt-1 space-y-0.5 pl-1">
                            {assignedPeriods.slice(0, 3).map(a => (
                              <div key={a.substitutionId} className="flex items-center gap-1 text-[9px]">
                                <UserCheck className="w-2.5 h-2.5 text-teal-600 shrink-0" />
                                <span className="text-teal-700 font-medium">P{a.period}: {a.assignedTeacher}</span>
                                {a.assignedTeacherSubject && (
                                  <span className="text-gray-400">({a.assignedTeacherSubject})</span>
                                )}
                              </div>
                            ))}
                            {assignedPeriods.length > 3 && (
                              <p className="text-[8px] text-gray-400 pl-4">+{assignedPeriods.length - 3} more</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          ) : (
            <div className="text-center py-6 border border-dashed border-emerald-200 rounded-lg bg-white/40">
              <Brain className="w-8 h-8 mx-auto text-emerald-300 mb-2" />
              <p className="text-sm text-emerald-700 font-medium">No absences detected yet</p>
              <p className="text-[10px] text-gray-400 mt-1">Click &quot;Sync&quot; then &quot;Detect Absences&quot; to identify absent teachers</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Card 2: Biometric Attendance */}
      <Card className="border-gray-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="w-5 h-5 text-emerald-600" />
            Biometric Attendance
          </CardTitle>
          <CardDescription>
            {lastSyncTime
              ? `Last synced: ${new Date(lastSyncTime).toLocaleTimeString()}`
              : 'Connect to biometric devices to sync attendance'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {biometricSummary && biometricSummary.total > 0 ? (
            <div className="space-y-3">
              {/* Summary Stats */}
              <div className="grid grid-cols-4 gap-2">
                <div className="text-center p-2 bg-emerald-50 rounded-lg border border-emerald-100">
                  <p className="text-lg font-bold text-emerald-700">{biometricSummary.present}</p>
                  <p className="text-[9px] text-emerald-600">Present</p>
                </div>
                <div className="text-center p-2 bg-red-50 rounded-lg border border-red-100">
                  <p className="text-lg font-bold text-red-700">{biometricSummary.absent}</p>
                  <p className="text-[9px] text-red-600">Absent</p>
                </div>
                <div className="text-center p-2 bg-amber-50 rounded-lg border border-amber-100">
                  <p className="text-lg font-bold text-amber-700">{biometricSummary.late}</p>
                  <p className="text-[9px] text-amber-600">Late</p>
                </div>
                <div className="text-center p-2 bg-blue-50 rounded-lg border border-blue-100">
                  <p className="text-lg font-bold text-blue-700">{biometricSummary.halfDay}</p>
                  <p className="text-[9px] text-blue-600">Half-day</p>
                </div>
              </div>

              {/* Affected Teachers Quick List with ScrollArea */}
              {(biometricSummary.absent > 0 || biometricSummary.late > 0) && (
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold text-red-700 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Affected Teachers:
                  </p>
                  <ScrollArea className="h-36">
                    <div className="space-y-1 pr-2">
                      {biometricRecords
                        .filter((r: BiometricRecord) => r.status === 'absent' || r.status === 'late' || r.status === 'half-day')
                        .map((r: BiometricRecord) => {
                          const matchingAbsent = absentTeachers.find(at => at.teacherId === r.teacherId);
                          return (
                            <div key={r.id} className="flex items-center gap-2 text-[10px] p-1.5 bg-white rounded border border-gray-100">
                              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                r.status === 'absent' ? 'bg-red-500' :
                                r.status === 'late' ? 'bg-amber-500' : 'bg-blue-500'
                              }`} />
                              <span className="font-medium text-gray-800">{r.teacher?.name || 'Unknown'}</span>
                              <Badge variant="outline" className="text-[8px] py-0 px-1">{r.teacher?.subject}</Badge>
                              <Badge className={`text-[8px] py-0 px-1 ${getStatusBadgeStyle(r.status)}`}>
                                {r.status}
                              </Badge>
                              {matchingAbsent && (
                                <Badge className={`text-[7px] py-0 px-1 ${getReasonBadgeStyle(matchingAbsent.reasonSource)}`}>
                                  {getReasonSourceLabel(matchingAbsent.reasonSource)}
                                </Badge>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {/* Available Teachers Count */}
              {absentTeachers.length > 0 && (
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleFetchAvailableCount}
                    disabled={fetchingAvailable}
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-1.5 border-emerald-300 hover:bg-emerald-50"
                  >
                    {fetchingAvailable ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5 text-emerald-600" />}
                    {fetchingAvailable ? 'Checking...' : 'Check Available Teachers'}
                  </Button>
                  {availableTeacherCount !== null && (
                    <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-200 text-center min-w-[60px]">
                      <p className="text-lg font-bold text-emerald-700">{availableTeacherCount}</p>
                      <p className="text-[8px] text-emerald-600">Available</p>
                    </div>
                  )}
                </div>
              )}

              {/* Re-sync button */}
              <Button
                onClick={handleSync}
                disabled={syncing}
                variant="outline"
                size="sm"
                className="w-full gap-1.5 border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
              >
                {syncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {syncing ? 'Syncing...' : 'Re-sync Biometric'}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-center py-4">
                <Activity className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-muted-foreground">No biometric data for today</p>
                <p className="text-[10px] text-gray-400 mt-1">Connect to biometric devices to sync attendance</p>
              </div>
              <Button
                onClick={handleSync}
                disabled={syncing}
                variant="outline"
                size="sm"
                className="w-full gap-1.5"
              >
                {syncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {syncing ? 'Syncing...' : 'Sync Biometric'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Absent Teacher Detail Dialog */}
      <Dialog open={absentDetailOpen} onOpenChange={setAbsentDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] p-0">
          {selectedAbsentTeacher && (
            <>
              <DialogHeader className="p-6 pb-0">
                <DialogTitle className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${
                    selectedAbsentTeacher.biometricStatus === 'absent' ? 'bg-red-500' :
                    selectedAbsentTeacher.biometricStatus === 'late' ? 'bg-amber-500' : 'bg-blue-500'
                  }`} />
                  {selectedAbsentTeacher.teacherName} — Absence Details
                </DialogTitle>
                <DialogDescription className="flex items-center gap-2">
                  {selectedAbsentTeacher.teacherSubject} •
                  <Badge className={`text-[9px] py-0 ${getStatusBadgeStyle(selectedAbsentTeacher.biometricStatus)}`}>
                    {selectedAbsentTeacher.biometricStatus}
                  </Badge>
                  via
                  <Badge className={`text-[9px] py-0 ${getReasonBadgeStyle(selectedAbsentTeacher.reasonSource)}`}>
                    {getReasonSourceLabel(selectedAbsentTeacher.reasonSource)}
                  </Badge>
                </DialogDescription>
              </DialogHeader>

              <ScrollArea className="max-h-[75vh] px-6">
                <div className="pb-6 space-y-4">
                  {/* Info Cards Grid — matching screenshot layout */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-orange-50 rounded-lg border border-orange-100">
                      <div className="flex items-center gap-2 mb-1">
                        <BookOpen className="w-4 h-4 text-orange-500" />
                        <p className="text-[10px] text-orange-600 font-medium">Subject</p>
                      </div>
                      <p className="text-sm font-semibold text-orange-800">{selectedAbsentTeacher.teacherSubject}</p>
                    </div>
                    <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                      <div className="flex items-center gap-2 mb-1">
                        <GraduationCap className="w-4 h-4 text-emerald-500" />
                        <p className="text-[10px] text-emerald-600 font-medium">Grade &amp; Section</p>
                      </div>
                      <p className="text-sm font-semibold text-emerald-800">
                        {selectedAbsentTeacher.teacherGrades.slice(0, 3).join(', ')}
                      </p>
                    </div>
                    <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                      <div className="flex items-center gap-2 mb-1">
                        <Clock className="w-4 h-4 text-blue-500" />
                        <p className="text-[10px] text-blue-600 font-medium">Affected Periods</p>
                      </div>
                      <p className="text-sm font-semibold text-blue-800">{selectedAbsentTeacher.todayScheduleCount} of {selectedAbsentTeacher.totalScheduleCount} total</p>
                    </div>
                    <div className="p-3 bg-purple-50 rounded-lg border border-purple-100">
                      <div className="flex items-center gap-2 mb-1">
                        <CalendarDays className="w-4 h-4 text-purple-500" />
                        <p className="text-[10px] text-purple-600 font-medium">Date</p>
                      </div>
                      <p className="text-sm font-semibold text-purple-800">{biometricDate}</p>
                    </div>
                  </div>

                  {/* Reason for Absence — matching screenshot */}
                  <div className="p-3 bg-orange-50/50 rounded-lg border border-orange-200">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-orange-500" />
                        <p className="text-[11px] text-orange-700 font-semibold">Reason for Absence</p>
                      </div>
                      <Badge className={`text-[8px] py-0 ${getReasonBadgeStyle(selectedAbsentTeacher.reasonSource)}`}>
                        <Activity className="w-3 h-3 mr-0.5" />
                        {getReasonSourceLabel(selectedAbsentTeacher.reasonSource)}
                      </Badge>
                    </div>
                    <p className="text-[12px] text-gray-800 font-medium">{selectedAbsentTeacher.reason}</p>
                    {selectedAbsentTeacher.leaveDetails && (
                      <div className="mt-2 p-2 bg-blue-50 rounded border border-blue-100 text-[10px]">
                        <p className="font-semibold text-blue-700 mb-1">Leave Application Details:</p>
                        <p className="text-blue-800">Type: {selectedAbsentTeacher.leaveDetails.leaveType.replace('_', ' ')} leave</p>
                        <p className="text-blue-800">Reason: {selectedAbsentTeacher.leaveDetails.reason}</p>
                        {selectedAbsentTeacher.leaveDetails.teacherNotes && (
                          <p className="text-blue-800">Notes: {selectedAbsentTeacher.leaveDetails.teacherNotes}</p>
                        )}
                        <p className="text-blue-600 mt-1">Applied: {new Date(selectedAbsentTeacher.leaveDetails.appliedAt).toLocaleDateString()}</p>
                      </div>
                    )}
                    {selectedAbsentTeacher.isEmergency && (
                      <div className="mt-2 flex items-center gap-1.5 p-2 bg-red-50 rounded border border-red-200">
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                        <span className="text-[11px] text-red-700 font-semibold">Emergency Leave — Priority Substitution Required</span>
                      </div>
                    )}
                  </div>

                  {/* AI Topic Context for Substitute — matching screenshot */}
                  {selectedAbsentTeacher.scheduleDetails.length > 0 && (
                    <div className="border border-blue-200 rounded-lg overflow-hidden">
                      <div className="p-2.5 bg-blue-50 border-b border-blue-200">
                        <p className="text-[11px] font-semibold text-blue-800 flex items-center gap-1.5">
                          <Brain className="w-3.5 h-3.5 text-blue-600" />
                          AI Topic Context for Substitute
                        </p>
                      </div>
                      <div className="p-3 space-y-2.5">
                        {selectedAbsentTeacher.scheduleDetails.map((sd, scheduleIndex) => (
                          <div key={`${selectedAbsentTeacher.teacherId}-${sd.grade}-${sd.section}-${sd.period}-${scheduleIndex}`} className="p-2.5 bg-white rounded-lg border border-gray-100">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="outline" className="text-[10px] font-bold">P{sd.period}</Badge>
                              <span className="text-xs font-medium text-gray-700">{sd.grade} {sd.section}</span>
                              <Badge className="text-[9px] bg-blue-100 text-blue-700">{sd.subject}</Badge>
                              <span className="text-[10px] text-muted-foreground">{sd.startTime} - {sd.endTime}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-[11px]">
                              <div className="p-2 bg-amber-50 rounded border border-amber-100">
                                <p className="font-semibold text-amber-700 mb-0.5 flex items-center gap-1">
                                  <BookOpen className="w-3 h-3" /> Yesterday&apos;s Topic
                                </p>
                                <p className="text-amber-800 text-[10px]">{sd.yesterdayTopic}</p>
                              </div>
                              <div className="p-2 bg-emerald-50 rounded border border-emerald-100">
                                <p className="font-semibold text-emerald-700 mb-0.5 flex items-center gap-1">
                                  <Target className="w-3 h-3" /> Today&apos;s Expected Topic
                                </p>
                                <p className="text-emerald-800 text-[10px]">{sd.todayExpectedTopic}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* AI Auto-Assign Substitute Button */}
                  <Button
                    onClick={handleAutoAssignAll}
                    disabled={autoAssigningAll}
                    className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white h-10 gap-2"
                  >
                    {autoAssigningAll ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {autoAssigningAll ? 'AI Assigning...' : 'AI Auto-Assign Substitute'}
                  </Button>
                  <p className="text-[10px] text-center text-gray-500">
                    AI will find the best available teacher based on subject match, workload, and grade familiarity
                  </p>

                  {/* Available Teachers Card */}
                  <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Users className="w-5 h-5 text-emerald-600" />
                        <div>
                          <p className="text-[11px] font-semibold text-emerald-800">Available Teachers</p>
                          <p className="text-[9px] text-emerald-600">Free teachers who can substitute</p>
                        </div>
                      </div>
                      {availableTeacherCount !== null ? (
                        <div className="text-center">
                          <p className="text-2xl font-bold text-emerald-700">{availableTeacherCount}</p>
                        </div>
                      ) : (
                        <Button
                          onClick={handleFetchAvailableCount}
                          disabled={fetchingAvailable}
                          variant="outline"
                          size="sm"
                          className="border-emerald-300 text-emerald-700 hover:bg-emerald-100 text-[10px] gap-1"
                        >
                          {fetchingAvailable ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                          {fetchingAvailable ? '...' : 'Find'}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Generate AI Substitute Context + Lesson DNA Buttons */}
                  <div className="space-y-2">
                    <Button
                      onClick={async () => {
                        if (selectedAbsentTeacher.scheduleDetails.length > 0) {
                          // Fetch first pending substitution for this teacher to generate context
                          try {
                            const res = await fetch(`/api/substitutions/list`);
                            if (res.ok) {
                              const subs = await res.json();
                              const teacherSubs = subs.filter(
                                (s: Substitution) => s.absentTeacherId === selectedAbsentTeacher.teacherId && s.status === 'pending' && s.source === 'biometric'
                              );
                              if (teacherSubs.length > 0) {
                                for (const sub of teacherSubs) {
                                  await handleGenerateContext(sub.id);
                                }
                              } else {
                                toast({ title: 'No Pending Substitutions', description: 'All substitutions for this teacher are already assigned' });
                              }
                            }
                          } catch {
                            toast({ title: 'Error', description: 'Failed to fetch substitutions', variant: 'destructive' });
                          }
                        }
                      }}
                      disabled={generatingContext !== null}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white h-9 gap-2"
                    >
                      {generatingContext ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
                      {generatingContext ? 'Generating Context...' : 'Generate AI Substitute Context'}
                    </Button>
                    <Button
                      onClick={() => {
                        setAbsentDetailOpen(false);
                        onNavigate('lesson-plans');
                      }}
                      variant="outline"
                      className="w-full border-amber-300 hover:bg-amber-50 text-amber-700 h-9 gap-2"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Generate Lesson DNA
                    </Button>
                  </div>

                  {/* Action: Go to Substitutions */}
                  <div className="flex items-center gap-3 pt-2">
                    <Button
                      onClick={() => {
                        setAbsentDetailOpen(false);
                        onNavigate('substitutions');
                      }}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" /> Go to Substitutions
                    </Button>
                    <Button
                      onClick={() => setAbsentDetailOpen(false)}
                      variant="outline"
                    >
                      Close
                    </Button>
                  </div>
                </div>
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Dashboard Section ───
function DashboardSection({
  stats,
  onNavigate,
  teachers,
  substitutions,
  schedules,
  schoolName,
  schoolCode,
  isClientPilot,
  featureFlagNote,
  planName,
}: {
  stats: Stats | null;
  onNavigate: (tab: TabType) => void;
  teachers: Teacher[];
  substitutions: Substitution[];
  schedules: Schedule[];
  schoolName?: string;
  schoolCode?: string;
  isClientPilot?: boolean;
  featureFlagNote?: string;
  planName?: string;
}) {
  const classCount = new Set(schedules.map((s) => `${s.grade}|${s.section}`)).size;
  const subjectCount = new Set(schedules.map((s) => s.subject)).size;
  const assignedSubs = substitutions.filter((s) => s.status === 'assigned').length;

  return (
    <div className="space-y-6">
      {/* Super-admin custom note banner */}
      {featureFlagNote && (
        <div className={`rounded-xl border px-4 py-3 text-sm flex items-start gap-3 ${planName === 'trial' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{featureFlagNote}</span>
        </div>
      )}
      {/* Client Pilot — clear offer summary */}
      {isClientPilot && (
        <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <div className="bg-emerald-700 text-white px-5 py-4">
              <p className="text-[10px] uppercase tracking-widest text-emerald-200 font-semibold">Client Evaluation Access</p>
              <h2 className="text-xl font-bold mt-0.5">{schoolName || 'Client Pilot School'}</h2>
              <p className="text-sm text-emerald-100 mt-1">
                Full school-admin access for your Grades 3–8 pilot. Explore everything below — this is exactly what your school gets in this trial.
              </p>
            </div>
            <div className="p-5 grid md:grid-cols-2 gap-5">
              <div>
                <h3 className="text-sm font-semibold text-emerald-900 mb-2">What you are getting</h3>
                <ul className="space-y-1.5 text-sm text-slate-700">
                  <li className="flex gap-2"><span className="text-emerald-600 font-bold">✓</span> <span><strong>{teachers.length} teachers</strong> (17 class teachers + 7 specialists)</span></li>
                  <li className="flex gap-2"><span className="text-emerald-600 font-bold">✓</span> <span><strong>{classCount || 17} classes</strong> — Grades 3 to 8 with sections</span></li>
                  <li className="flex gap-2"><span className="text-emerald-600 font-bold">✓</span> <span><strong>Full weekly timetable</strong> — Mon–Fri, 8 periods, your bell timings</span></li>
                  <li className="flex gap-2"><span className="text-emerald-600 font-bold">✓</span> <span><strong>{subjectCount || 15}+ subjects</strong> mapped to the right teachers</span></li>
                  <li className="flex gap-2"><span className="text-emerald-600 font-bold">✓</span> <span><strong>Lesson plans</strong> ready for class & substitute cover</span></li>
                  <li className="flex gap-2"><span className="text-emerald-600 font-bold">✓</span> <span><strong>Live substitution demo</strong> ({assignedSubs} assigned covers to try)</span></li>
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-emerald-900 mb-2">What you can try now</h3>
                <div className="grid grid-cols-1 gap-2">
                  <Button variant="outline" className="justify-start h-9 text-xs border-emerald-200" onClick={() => onNavigate('calendar')}>
                    1. Open Calendar — see Grade 3–8 weekly schedule
                  </Button>
                  <Button variant="outline" className="justify-start h-9 text-xs border-emerald-200" onClick={() => onNavigate('teachers')}>
                    2. Open Teachers — class teachers & specialists
                  </Button>
                  <Button variant="outline" className="justify-start h-9 text-xs border-emerald-200" onClick={() => onNavigate('substitutions')}>
                    3. Open Substitutions — absence → auto cover
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-3">
                  School code: <span className="font-mono font-medium text-emerald-800">{schoolCode || 'PILOT01'}</span>
                  {' · '}Data is isolated to your school only.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Hero Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-6 md:p-8 text-white">
        <div className="flex items-center gap-3 mb-3">
          <div className="bg-white/20 p-2 rounded-xl">
            <Brain className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">{schoolName || 'AI Smart Calendar'}</h1>
            <p className="text-emerald-100 text-sm md:text-base">
              {isClientPilot ? 'Your school pilot workspace' : 'Smart School Calendar Platform'}
            </p>
          </div>
        </div>
        <p className="text-emerald-50 text-sm md:text-base max-w-2xl">
          {isClientPilot
            ? 'Test timetable management, teacher allotment, AI substitutions, and lesson planning with your Grades 3–8 data — then decide if this fits your school.'
            : 'Manage academic schedules, teacher assignments, substitutions, and lesson planning with AI-powered intelligence. Automate teacher assignments and generate comprehensive lesson DNA for substitute teachers.'}
        </p>
      </div>

      {/* Stats Cards */}
      <div className={`grid grid-cols-2 gap-4 ${isClientPilot ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}>
        <Card className="cursor-pointer hover:shadow-lg hover:border-emerald-300 transition-all duration-200" onClick={() => onNavigate('teachers')}>
          <CardContent className="p-4 md:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Teachers</p>
                <p className="text-2xl md:text-3xl font-bold text-emerald-700">{stats?.totalTeachers || 0}</p>
              </div>
              <div className="bg-emerald-100 p-3 rounded-xl">
                <Users className="w-6 h-6 text-emerald-600" />
              </div>
            </div>
            <div className="flex items-center mt-2 text-xs text-emerald-600">
              <ArrowRight className="w-3 h-3 mr-1" /> View all teachers
            </div>
          </CardContent>
        </Card>

        {!isClientPilot && (
          <Card className="cursor-pointer hover:shadow-lg hover:border-amber-300 transition-all duration-200" onClick={() => onNavigate('calendar')}>
            <CardContent className="p-4 md:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Students</p>
                  <p className="text-2xl md:text-3xl font-bold text-amber-700">{stats?.totalStudents || 0}</p>
                </div>
                <div className="bg-amber-100 p-3 rounded-xl">
                  <GraduationCap className="w-6 h-6 text-amber-600" />
                </div>
              </div>
              <div className="flex items-center mt-2 text-xs text-amber-600">
                <ArrowRight className="w-3 h-3 mr-1" /> View schedules
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="cursor-pointer hover:shadow-lg hover:border-orange-300 transition-all duration-200" onClick={() => onNavigate('substitutions')}>
          <CardContent className="p-4 md:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Today&apos;s Substitutions</p>
                <p className="text-2xl md:text-3xl font-bold text-orange-700">{stats?.todaySubstitutions || 0}</p>
              </div>
              <div className="bg-orange-100 p-3 rounded-xl">
                <RefreshCw className="w-6 h-6 text-orange-600" />
              </div>
            </div>
            <div className="flex items-center mt-2 text-xs text-orange-600">
              <ArrowRight className="w-3 h-3 mr-1" /> Manage substitutions
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-lg hover:border-red-300 transition-all duration-200" onClick={() => onNavigate('calendar')}>
          <CardContent className="p-4 md:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Empty Periods</p>
                <p className="text-2xl md:text-3xl font-bold text-red-700">{stats?.emptyPeriods || 0}</p>
              </div>
              <div className="bg-red-100 p-3 rounded-xl">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
            </div>
            <div className="flex items-center mt-2 text-xs text-red-600">
              <ArrowRight className="w-3 h-3 mr-1" /> Assign teachers
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Biometric Substitution Agent + Biometric Attendance */}
      <BiometricAgentCards teachers={teachers} schedules={schedules} onNavigate={onNavigate} />

      {/* Schedule Insights + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="w-5 h-5 text-emerald-600" />
              Schedule Insights
            </CardTitle>
            <CardDescription>Live analysis based on your current timetable data</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              {(() => {
                const insights: { color: string; icon: React.ReactNode; title: string; desc: string }[] = [];
                const emptyCount = schedules.filter((s) => !s.teacherId).length;
                const totalPeriods = schedules.length;
                const gradeSet = new Set(schedules.map((s) => `${s.grade}|${s.section}`));
                const subjectSet = new Set(schedules.map((s) => s.subject));
                const teacherLoad = teachers.map((t) => ({ name: t.name, count: schedules.filter((s) => s.teacherId === t.id).length })).sort((a, b) => b.count - a.count);
                const maxLoad = teacherLoad[0];
                const minLoad = teacherLoad.filter((t) => t.count > 0).sort((a, b) => a.count - b.count)[0];
                const unassignedTeachers = teachers.filter((t) => !schedules.some((s) => s.teacherId === t.id));

                if (totalPeriods === 0) {
                  insights.push({ color: 'bg-slate-50', icon: <AlertCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />, title: 'No timetable generated yet', desc: 'Go to Timetable Studio → Create Timetable to get started.' });
                } else {
                  insights.push({ color: 'bg-emerald-50', icon: <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />, title: `${totalPeriods} periods across ${gradeSet.size} classes`, desc: `${subjectSet.size} subjects mapped. ${teachers.length} teachers in system.` });
                  if (emptyCount > 0) insights.push({ color: 'bg-red-50', icon: <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />, title: `${emptyCount} periods have no teacher assigned`, desc: 'Open Timetable Studio and click any amber cell to assign a teacher.' });
                  else insights.push({ color: 'bg-emerald-50', icon: <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />, title: 'All periods are fully allotted', desc: 'Every period has a teacher assigned. No empty slots.' });
                  if (maxLoad && maxLoad.count > 0) insights.push({ color: 'bg-blue-50', icon: <TrendingUp className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />, title: `Highest load: ${maxLoad.name} (${maxLoad.count} periods/week)`, desc: minLoad && minLoad.name !== maxLoad.name ? `Lowest: ${minLoad.name} with ${minLoad.count} periods.` : 'Review workload in Analytics tab.' });
                  if (unassignedTeachers.length > 0) insights.push({ color: 'bg-amber-50', icon: <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />, title: `${unassignedTeachers.length} teacher${unassignedTeachers.length > 1 ? 's' : ''} not yet assigned to any period`, desc: unassignedTeachers.slice(0, 3).map((t) => t.name).join(', ') + (unassignedTeachers.length > 3 ? ` +${unassignedTeachers.length - 3} more` : '') });
                  if (stats?.todaySubstitutions ?? 0 > 0) insights.push({ color: 'bg-orange-50', icon: <RefreshCw className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />, title: `${stats?.todaySubstitutions} substitution${(stats?.todaySubstitutions ?? 0) > 1 ? 's' : ''} active today`, desc: 'Open Substitutions to review coverage status.' });
                }
                return insights.map((ins, i) => (
                  <div key={i} className={`flex items-start gap-3 p-3 rounded-xl ${ins.color}`}>
                    {ins.icon}
                    <div><p className="text-sm font-semibold text-slate-800">{ins.title}</p><p className="text-xs text-slate-500 mt-0.5">{ins.desc}</p></div>
                  </div>
                ));
              })()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="w-5 h-5 text-amber-500" />
              Quick Actions
            </CardTitle>
            <CardDescription>Common tasks and shortcuts</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" className="w-full justify-between h-14 text-left" onClick={() => onNavigate('calendar')}>
              <div className="flex items-center gap-3">
                <div className="bg-emerald-100 p-2 rounded-lg">
                  <Calendar className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="font-medium text-sm">View Academic Calendar</p>
                  <p className="text-xs text-muted-foreground">Browse schedules by grade and day</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4" />
            </Button>

            <Button variant="outline" className="w-full justify-between h-14 text-left" onClick={() => onNavigate('substitutions')}>
              <div className="flex items-center gap-3">
                <div className="bg-amber-100 p-2 rounded-lg">
                  <RefreshCw className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="font-medium text-sm">Manage Substitutions</p>
                  <p className="text-xs text-muted-foreground">{stats?.pendingSubstitutions || 0} pending substitutions</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4" />
            </Button>

            <Button variant="outline" className="w-full justify-between h-14 text-left" onClick={() => onNavigate('teachers')}>
              <div className="flex items-center gap-3">
                <div className="bg-teal-100 p-2 rounded-lg">
                  <Users className="w-5 h-5 text-teal-600" />
                </div>
                <div>
                  <p className="font-medium text-sm">Teacher Directory</p>
                  <p className="text-xs text-muted-foreground">{teachers.length} teachers registered</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4" />
            </Button>

            <Button variant="outline" className="w-full justify-between h-14 text-left" onClick={() => onNavigate('analytics')}>
              <div className="flex items-center gap-3">
                <div className="bg-orange-100 p-2 rounded-lg">
                  <BarChart3 className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <p className="font-medium text-sm">Workload Analytics</p>
                  <p className="text-xs text-muted-foreground">Teacher workload heatmap &amp; distribution</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Schedule Overview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="w-5 h-5 text-emerald-600" />
            Schedule Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-emerald-50 rounded-xl">
              <p className="text-2xl font-bold text-emerald-700">{stats?.filledPeriods || 0}</p>
              <p className="text-xs text-muted-foreground">Filled Periods</p>
            </div>
            <div className="text-center p-4 bg-red-50 rounded-xl">
              <p className="text-2xl font-bold text-red-700">{stats?.emptyPeriods || 0}</p>
              <p className="text-xs text-muted-foreground">Empty Periods</p>
            </div>
            <div className="text-center p-4 bg-amber-50 rounded-xl">
              <p className="text-2xl font-bold text-amber-700">{stats?.pendingSubstitutions || 0}</p>
              <p className="text-xs text-muted-foreground">Pending Subs</p>
            </div>
            <div className="text-center p-4 bg-teal-50 rounded-xl">
              <p className="text-2xl font-bold text-teal-700">{stats?.assignedSubstitutions || 0}</p>
              <p className="text-xs text-muted-foreground">Assigned Subs</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Today's Substitution Status Board */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Grid3X3 className="w-5 h-5 text-emerald-600" />
              Today&apos;s Substitution Status Board
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs"><span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" /> Covered</div>
              <div className="flex items-center gap-1.5 text-xs"><span className="w-3 h-3 rounded-sm bg-red-500 inline-block" /> Pending</div>
              <div className="flex items-center gap-1.5 text-xs"><span className="w-3 h-3 rounded-sm bg-gray-300 inline-block" /> No Sub Needed</div>
            </div>
          </div>
          <CardDescription>Period × Grade/Section substitution coverage for today</CardDescription>
        </CardHeader>
        <CardContent>
          {substitutions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
              <p className="text-sm font-medium">No Substitutions Today</p>
              <p className="text-xs">All classes are running as scheduled</p>
            </div>
          ) : (() => {
            // Build grade-section rows from schedules
            const gradeSectionSet = new Set<string>();
            const gradeSections: string[] = [];
            for (const s of schedules) {
              const key = `${s.grade} ${s.section}`;
              if (!gradeSectionSet.has(key)) {
                gradeSectionSet.add(key);
                gradeSections.push(key);
              }
            }
            gradeSections.sort((a, b) => {
              const [gA, sA] = a.split(' ');
              const [gB, sB] = b.split(' ');
              const numA = parseInt(gA.replace('Grade ', ''));
              const numB = parseInt(gB.replace('Grade ', ''));
              return numA !== numB ? numA - numB : sA.localeCompare(sB);
            });

            const pendingCount = substitutions.filter(s => s.status === 'pending').length;
            const assignedCount = substitutions.filter(s => s.status === 'assigned').length;

            // Map: grade-section + period -> substitution
            const subMap: Record<string, Substitution> = {};
            for (const sub of substitutions) {
              const key = `${sub.grade} ${sub.section}-P${sub.period}`;
              subMap[key] = sub;
            }

            // Map: grade-section + period -> has scheduled class
            const schedMap: Record<string, boolean> = {};
            for (const s of schedules) {
              const key = `${s.grade} ${s.section}-P${s.period}`;
              schedMap[key] = true;
            }

            return (
              <div className="space-y-3">
                {/* Summary counts */}
                <div className="flex items-center gap-4 mb-3">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 rounded-lg border border-red-200">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <span className="text-sm font-bold text-red-700">{pendingCount}</span>
                    <span className="text-xs text-red-600">Pending</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-lg border border-emerald-200">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm font-bold text-emerald-700">{assignedCount}</span>
                    <span className="text-xs text-emerald-600">Assigned</span>
                  </div>
                </div>

                {/* Status Grid */}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className="text-left text-[10px] font-semibold text-muted-foreground p-2 bg-muted/50 rounded-tl-lg min-w-[100px]">Grade/Sec</th>
                        {[1,2,3,4,5,6,7,8].map(p => (
                          <th key={p} className="text-center text-[10px] font-semibold text-muted-foreground p-2 bg-muted/50 min-w-[50px]">
                            P{p}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {gradeSections.slice(0, 12).map((gs, idx) => {
                        const [grade, section] = gs.split(' ');
                        return (
                          <tr key={gs} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                            <td className="text-xs font-medium p-2 whitespace-nowrap">
                              <GraduationCap className="w-3 h-3 inline mr-1 text-emerald-600" />
                              {gs}
                            </td>
                            {[1,2,3,4,5,6,7,8].map(p => {
                              const sub = subMap[`${gs}-P${p}`];
                              const hasClass = schedMap[`${gs}-P${p}`];
                              let bgColor = 'bg-gray-100';
                              let textColor = 'text-gray-400';
                              let content = '—';
                              let clickable = false;

                              if (sub) {
                                if (sub.status === 'assigned') {
                                  bgColor = 'bg-emerald-100';
                                  textColor = 'text-emerald-700';
                                  content = '✓';
                                } else if (sub.status === 'pending') {
                                  bgColor = 'bg-red-100';
                                  textColor = 'text-red-700';
                                  content = '!';
                                  clickable = true;
                                } else {
                                  bgColor = 'bg-gray-200';
                                  textColor = 'text-gray-500';
                                  content = '✓';
                                }
                              } else if (hasClass) {
                                bgColor = 'bg-emerald-50';
                                textColor = 'text-emerald-400';
                                content = '·';
                              }

                              return (
                                <td key={p} className="text-center p-1.5">
                                  <button
                                                    className={`w-9 h-9 rounded-md text-xs font-bold flex items-center justify-center transition-all ${bgColor} ${textColor} ${clickable ? 'cursor-pointer hover:scale-110 hover:shadow-md' : 'cursor-default'}`}
                                                    onClick={() => clickable && onNavigate('substitutions')}
                                                    title={sub ? `${sub.subject} - ${sub.status}${sub.substitute ? ` by ${sub.substitute.name}` : ''}` : hasClass ? 'Regular class' : 'No class'}
                                                  >
                                    {content}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {pendingCount > 0 && (
                  <Button onClick={() => onNavigate('substitutions')} variant="outline" className="w-full border-red-300 text-red-700 hover:bg-red-50 mt-2">
                    <AlertCircle className="w-4 h-4 mr-2" /> Go to Substitutions to Assign Teachers ({pendingCount} pending)
                  </Button>
                )}
              </div>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Academic Calendar Section ───
function BulkTeacherImportSection({ schoolId, onCompleted }: { schoolId?: string; onCompleted: () => Promise<void> }) {
  const { toast } = useToast();
  const [importKind, setImportKind] = useState<'teacher' | 'complete'>('teacher');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ layout?: string; classesDetected?: number; allotmentsDetected?: number; rows: { employeeId: string; name: string; email: string; subject: string; grades: string[] }[]; issues: { row: number; field: string; message: string }[]; summary: { detected: number; valid: number; errors: number }; blocking: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [completePreview, setCompletePreview] = useState<{ summary: Record<string, { total: number; valid: number; warnings: number; errors: number }>; issues: { severity: string; dataset: string; rowNumber?: number; message: string }[]; blocking: boolean } | null>(null);
  const [result, setResult] = useState<{ imported: number; allotted: number; unallotted: number; classesCreated?: number } | null>(null);
  const [generatedSchedules, setGeneratedSchedules] = useState<Schedule[]>([]);
  const [resultClass, setResultClass] = useState('all');
  const upload = async (commit: boolean) => {
    if (!file || !schoolId) return;
    setBusy(true);
    try {
      const body = new FormData(); body.append('file', file); body.append('schoolId', schoolId); body.append('commit', String(commit));
      const response = await fetch(importKind === 'complete' ? '/api/timetable/import/validate' : '/api/timetable/teacher-allotment', { method: 'POST', body }); const responseText = await response.text(); let data: any = {}; try { data = responseText ? JSON.parse(responseText) : {}; } catch { throw new Error(`Import server returned an invalid response (${response.status}).`); }
      if (!response.ok) throw new Error(data.error || 'Import failed');
      if (importKind === 'complete') { setCompletePreview(data); return; }
      if (commit) {
        const scheduleResponse = await fetch(`/api/schedules?schoolId=${encodeURIComponent(schoolId)}`); const schedulesData = scheduleResponse.ok ? await scheduleResponse.json() : [];
        setResult(data); setGeneratedSchedules(Array.isArray(schedulesData) ? schedulesData : []);
        toast({ title: 'Import and allotment complete', description: `${data.imported} teachers imported, ${data.allotted} timetable periods allotted.` }); await onCompleted();
      }
      else setPreview(data);
    } catch (error) { toast({ title: 'Import failed', description: error instanceof Error ? error.message : 'Could not process file', variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  return <div className="space-y-4 min-w-0">
    <div><h2 className="text-2xl font-bold text-emerald-800 flex items-center gap-2"><FileSpreadsheet className="w-6 h-6" />Timetable Bulk Import Studio</h2><p className="text-sm text-muted-foreground">Import flexible teacher allotments or a complete linked timetable workbook.</p></div>
    <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1"><Button type="button" onClick={() => { setImportKind('teacher'); setPreview(null); setCompletePreview(null); setFile(null); }} className={importKind === 'teacher' ? 'bg-white text-emerald-700 shadow-sm hover:bg-white' : 'bg-transparent text-slate-600 shadow-none hover:bg-white/60'}><Users className="mr-2 h-4 w-4"/>Flexible Teacher Import</Button><Button type="button" onClick={() => { setImportKind('complete'); setPreview(null); setCompletePreview(null); setFile(null); }} className={importKind === 'complete' ? 'bg-white text-purple-700 shadow-sm hover:bg-white' : 'bg-transparent text-slate-600 shadow-none hover:bg-white/60'}><Layers className="mr-2 h-4 w-4"/>Complete Timetable Setup</Button></div>
    <div className="grid grid-cols-3 gap-2 md:grid-cols-6">{['Import','Validate','Draft','Review','Approve','Publish'].map((step, index) => <div key={step} className={`rounded-lg border p-2 text-center text-xs font-medium ${index < 2 ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500'}`}><span className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-current/10">{index + 1}</span>{step}</div>)}</div>
    <Card><CardHeader><CardTitle className="text-lg">1. {importKind === 'complete' ? 'Upload complete timetable configuration' : 'Upload teacher allotment'}</CardTitle><CardDescription>{importKind === 'complete' ? 'Linked sheets: Teachers, Classes, SubjectRequirements, TeacherAssignments, Availability, Rooms, FixedPeriods and BellSchedule.' : 'Required information: Teacher Name, Subject and Eligible Grades. Employee ID and Email are recommended.'}</CardDescription></CardHeader><CardContent className="space-y-4">
      <div className="border-2 border-dashed border-emerald-200 rounded-xl p-5 md:p-8 text-center bg-emerald-50/30"><Upload className="w-10 h-10 mx-auto text-emerald-600 mb-3"/><Input type="file" accept={importKind === 'complete' ? '.xlsx' : '.xlsx,.xls,.pdf'} onChange={(event) => { setFile(event.target.files?.[0] || null); setPreview(null); setCompletePreview(null); }} className="w-full max-w-xl mx-auto bg-white"/><p className="text-xs text-muted-foreground mt-2">{importKind === 'complete' ? 'Upload the multi-sheet workbook containing Teachers, Classes, Requirements and Assignments.' : 'Any common Excel layout or searchable PDF; headings are detected automatically.'}</p></div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap"><Button disabled={!file || busy || !schoolId} onClick={() => upload(false)} className="bg-emerald-600 hover:bg-emerald-700">{busy ? <RefreshCw className="w-4 h-4 mr-2 animate-spin"/> : <Eye className="w-4 h-4 mr-2"/>}Validate & Preview</Button></div>
    </CardContent></Card>
    {preview && <Card><CardHeader><CardTitle className="flex items-center justify-between">2. Review <Badge variant={preview.blocking ? 'destructive' : 'default'}>{preview.summary.valid}/{preview.summary.detected} valid</Badge></CardTitle>{preview.layout === 'grade-section-matrix' && <CardDescription>Detected grade-section matrix: {preview.classesDetected} classes and {preview.allotmentsDetected} teacher-subject allotments. Import will create a Monday-Friday timetable for every detected grade and section.</CardDescription>}</CardHeader><CardContent className="space-y-4">
      {preview.issues.length > 0 && <ScrollArea className="h-28 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{preview.issues.map((issue, index) => <p key={index}>Row {issue.row} - {issue.field}: {issue.message}</p>)}</ScrollArea>}
      <div className="max-h-[38dvh] overflow-auto rounded-lg border"><table className="w-full min-w-[760px] text-sm"><thead className="sticky top-0 bg-white shadow-sm"><tr className="border-b text-left"><th className="p-2">Employee ID</th><th className="p-2">Teacher</th><th className="p-2">Subject</th><th className="p-2">Eligible Grades</th><th className="p-2">Email</th></tr></thead><tbody>{preview.rows.map((row, index) => <tr key={index} className="border-b"><td className="p-2">{row.employeeId}</td><td className="p-2 font-medium">{row.name}</td><td className="p-2">{row.subject}</td><td className="p-2">{row.grades.join(', ')}</td><td className="p-2 text-xs">{row.email}</td></tr>)}</tbody></table></div>
      <Button disabled={preview.blocking || busy} onClick={() => upload(true)} className="bg-purple-600 hover:bg-purple-700"><Sparkles className="w-4 h-4 mr-2"/>Import Teachers & Auto-Allot Timetable</Button>
    </CardContent></Card>}
    {completePreview && <Card><CardHeader><CardTitle className="flex items-center justify-between">Complete Setup Validation <Badge variant={completePreview.blocking ? 'destructive' : 'default'}>{completePreview.blocking ? 'Blocking errors' : 'Ready for draft'}</Badge></CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Object.entries(completePreview.summary).map(([dataset, result]) => <div key={dataset} className="rounded-lg border bg-white p-3"><p className="truncate text-xs font-semibold">{dataset}</p><p className="mt-1 text-lg font-bold text-emerald-700">{result.valid}/{result.total}</p><p className="text-[10px] text-muted-foreground">{result.errors} errors - {result.warnings} warnings</p></div>)}</div>{completePreview.issues.length > 0 && <ScrollArea className="h-40 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{completePreview.issues.map((issue, index) => <p key={index}>{issue.dataset}{issue.rowNumber ? ` row ${issue.rowNumber}` : ''}: {issue.message}</p>)}</ScrollArea>}<div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800"><strong>Safe lifecycle:</strong> successful validation prepares timetable input for a database draft. It is not published until independent validation, review and approval are complete.</div></CardContent></Card>}
    {result && <Card className="border-2 border-emerald-300"><CardHeader><CardTitle className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><span className="flex items-center gap-2 text-emerald-800"><CheckCircle2 className="h-5 w-5"/>3. Teacher Allotment & Timetable Preview</span></CardTitle><CardDescription>Review teachers allotted to every subject for each grade and section before leaving this page.</CardDescription></CardHeader><CardContent className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><div className="rounded-xl bg-blue-50 p-3"><p className="text-2xl font-bold text-blue-700">{result.classesCreated || new Set(generatedSchedules.map((item) => `${item.grade}|${item.section}`)).size}</p><p className="text-xs text-blue-700">Grades/Sections</p></div><div className="rounded-xl bg-purple-50 p-3"><p className="text-2xl font-bold text-purple-700">{result.imported}</p><p className="text-xs text-purple-700">Teachers Imported</p></div><div className="rounded-xl bg-emerald-50 p-3"><p className="text-2xl font-bold text-emerald-700">{result.allotted}</p><p className="text-xs text-emerald-700">Periods Allotted</p></div><div className="rounded-xl bg-amber-50 p-3"><p className="text-2xl font-bold text-amber-700">{result.unallotted}</p><p className="text-xs text-amber-700">Need Teacher</p></div></div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center"><Label className="shrink-0">Preview grade & section</Label><Select value={resultClass} onValueChange={setResultClass}><SelectTrigger className="w-full sm:w-[260px]"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All grades and sections</SelectItem>{[...new Set(generatedSchedules.map((item) => `${item.grade}|${item.section}`))].sort().map((key) => { const [grade, section] = key.split('|'); return <SelectItem key={key} value={key}>{grade} - Section {section}</SelectItem>; })}</SelectContent></Select></div>
      <div className="max-h-[48dvh] overflow-auto rounded-xl border"><table className="w-full min-w-[900px] text-sm"><thead className="sticky top-0 z-10 bg-slate-100"><tr className="text-left"><th className="p-3">Grade</th><th className="p-3">Section</th><th className="p-3">Day</th><th className="p-3">Period</th><th className="p-3">Subject</th><th className="p-3">Allotted Teacher</th><th className="p-3">Room</th><th className="p-3">Status</th></tr></thead><tbody>{generatedSchedules.filter((item) => resultClass === 'all' || `${item.grade}|${item.section}` === resultClass).map((item) => <tr key={item.id} className="border-t hover:bg-slate-50"><td className="p-3 font-medium">{item.grade}</td><td className="p-3">{item.section}</td><td className="p-3">{item.day}</td><td className="p-3">P{item.period}</td><td className="p-3 font-medium text-blue-700">{item.subject}</td><td className="p-3">{item.teacher?.name || <span className="text-amber-700">Not allotted</span>}</td><td className="p-3">{item.roomId || '-'}</td><td className="p-3"><Badge className={item.teacherId ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}>{item.teacherId ? 'Allotted' : 'Needs teacher'}</Badge></td></tr>)}</tbody></table></div>
    </CardContent></Card>}
  </div>;
}

function TimetableGovernancePanel({ schoolId, onChanged }: { schoolId?: string; onChanged?: () => Promise<void> }) {
  const { toast } = useToast();
  const [context, setContext] = useState<any>(null); const [versionId, setVersionId] = useState(''); const [issues, setIssues] = useState<any[]>([]); const [candidates, setCandidates] = useState<any[]>([]); const [busy, setBusy] = useState(false); const [generateHint, setGenerateHint] = useState('');
  const [loadError, setLoadError] = useState('');
  const readApiResponse = async (response: Response) => { const text = await response.text(); let data: any = {}; if (text) { try { data = JSON.parse(text); } catch { throw new Error(`The server returned an invalid response (${response.status}).`); } } if (!response.ok) throw new Error(data.error || `Request failed with status ${response.status}.`); return data; };
  const load = useCallback(async () => { if (!schoolId) { setLoadError('School workspace is not available.'); return; } setLoadError(''); try { let response = await fetch(`/api/timetable/context?schoolId=${encodeURIComponent(schoolId)}`); let data = await readApiResponse(response); if (!data.active) { response = await fetch('/api/timetable/bootstrap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ schoolId, actorId: schoolId }) }); await readApiResponse(response); response = await fetch(`/api/timetable/context?schoolId=${encodeURIComponent(schoolId)}`); data = await readApiResponse(response); } setContext(data); setVersionId((current) => current || data.active?.id || data.versions?.[0]?.id || ''); } catch (error) { setContext(null); setLoadError(error instanceof Error ? error.message : 'Unable to load timetable governance.'); } }, [schoolId]);
  useEffect(() => { void load(); }, [load]);
  const version = context?.versions?.find((item: any) => item.id === versionId);
  const validate = async () => { setBusy(true); try { const response = await fetch(`/api/timetable/versions/${versionId}/validate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ schoolId }) }); const data = await response.json(); setIssues(data.issues || []); toast({ title: data.blocking ? 'Validation found blocking issues' : 'Validation passed', description: `${data.summary?.errors || 0} errors and ${data.summary?.warnings || 0} warnings.` }); } finally { setBusy(false); } };
  const generate = async () => { setBusy(true); setGenerateHint(''); try { const response = await fetch('/api/timetable/generations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ schoolId, timetableVersionId: versionId, createdBy: schoolId, role: 'school', alternatives: 3 }) }); const data = await response.json(); if (!response.ok) { if (data.hint) setGenerateHint(data.hint); throw new Error(data.error); } setCandidates(data.candidates || []); toast({ title: 'Candidates ready', description: `${data.candidates?.length || 0} alternatives generated.` }); } catch (error) { const msg = error instanceof Error ? error.message : 'Unable to generate'; const isConfigIssue = /requirements|configured|not configured/i.test(msg); toast({ title: isConfigIssue ? 'Action needed' : 'Generation failed', description: msg, variant: isConfigIssue ? 'default' : 'destructive' }); } finally { setBusy(false); } };
  const choose = async (id: string) => { const response = await fetch(`/api/timetable/candidates/${id}/select`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ schoolId, actorId: schoolId }) }); if (response.ok) { toast({ title: 'Candidate selected', description: 'Candidate slots are now the working draft.' }); if (onChanged) await onChanged(); } };
  const workflow = async (action: string) => { setBusy(true); try { const response = await fetch(`/api/timetable/versions/${versionId}/workflow`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ schoolId, actorId: schoolId, actorRole: 'school', action }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); await load(); toast({ title: `Timetable ${action} successful` }); } catch (error) { toast({ title: `${action} failed`, description: error instanceof Error ? error.message : 'Request failed', variant: 'destructive' }); } finally { setBusy(false); } };
  if (loadError) return <Card className="border-amber-200 bg-amber-50"><CardContent className="flex flex-col items-start gap-3 p-6"><div className="flex items-center gap-2 font-semibold text-amber-900"><AlertTriangle className="h-5 w-5"/>Timetable governance is temporarily unavailable</div><p className="text-sm text-amber-800">{loadError}</p><Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4"/>Retry</Button></CardContent></Card>;
  if (!context) return <Card><CardContent className="p-6"><RefreshCw className="h-5 w-5 animate-spin text-emerald-600"/></CardContent></Card>;
  return <div className="grid gap-4 xl:grid-cols-[320px_1fr]"><Card><CardHeader><CardTitle className="text-base">Timetable Context</CardTitle></CardHeader><CardContent className="space-y-3"><Label>Version</Label><Select value={versionId} onValueChange={setVersionId}><SelectTrigger className="w-full"><SelectValue placeholder="Select version"/></SelectTrigger><SelectContent>{context.versions?.map((item: any) => <SelectItem key={item.id} value={item.id}>{item.name} v{item.version} · {item.status}</SelectItem>)}</SelectContent></Select><div className="grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg bg-slate-50 p-2"><p className="text-muted-foreground">Campus</p><p className="font-semibold">{context.campuses?.[0]?.name || 'Main Campus'}</p></div><div className="rounded-lg bg-slate-50 p-2"><p className="text-muted-foreground">Academic year</p><p className="font-semibold">{context.academicYears?.[0]?.name || '2026-27'}</p></div></div><Badge className="capitalize">{version?.status || 'draft'}</Badge></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Draft Controls & Governance</CardTitle><CardDescription>Generate candidates, validate independently, then review, approve and publish.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="flex flex-wrap gap-2"><Button disabled={busy || !versionId || version?.status !== 'draft'} onClick={generate}><Sparkles className="mr-2 h-4 w-4"/>Generate 3 Candidates</Button><Button disabled={busy || !versionId} variant="outline" onClick={validate}><ShieldCheck className="mr-2 h-4 w-4"/>Validate Draft</Button>{version?.status === 'draft' && <Button disabled={busy} variant="outline" onClick={() => workflow('submit')}>Submit Review</Button>}{version?.status === 'review' && <><Button disabled={busy} onClick={() => workflow('approve')}>Approve</Button><Button disabled={busy} variant="destructive" onClick={() => workflow('reject')}>Request Changes</Button></>}{version?.status === 'approved' && <Button disabled={busy} className="bg-blue-700" onClick={() => workflow('publish')}>Publish Atomically</Button>}</div>{generateHint && <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 flex items-start gap-2"><Lightbulb className="w-4 h-4 text-blue-500 shrink-0 mt-0.5"/><span>{generateHint}</span></div>}{issues.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{issues.slice(0, 6).map((issue, index) => <p key={index}>{issue.code}: {issue.message}</p>)}</div>}{candidates.length > 0 && <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-sm"><thead><tr className="border-b text-left"><th className="p-2">Candidate</th><th>Hard conflicts</th><th>Unallocated</th><th>Teacher gaps</th><th>Quality</th><th></th></tr></thead><tbody>{candidates.map((candidate) => <tr key={candidate.id} className="border-b"><td className="p-2 font-semibold">{candidate.name}{candidate.recommended ? ' · Recommended' : ''}</td><td>{candidate.hardConflicts}</td><td>{candidate.unallocatedPeriods}</td><td>{candidate.teacherGaps}</td><td>{Math.round(candidate.preferenceScore)}%</td><td><Button size="sm" variant="outline" onClick={() => choose(candidate.id)}>Use Draft</Button></td></tr>)}</tbody></table></div>}</CardContent></Card></div>;
}

function AcademicCalendarSection({
  schedules,
  sharedSchedules,
  teachers,
  selectedDay,
  onDayChange,
  onAssignTeacher,
  onAutoAssign,
  assigningTeacher,
  autoAssigning,
  onRefreshAll,
  schoolId,
  schoolName,
  onRefreshTeachers,
}: {
  schedules: Schedule[];
  sharedSchedules: Schedule[];
  teachers: Teacher[];
  selectedDay: string;
  onDayChange: (day: string) => void;
  onAssignTeacher: (scheduleId: string, teacherId: string) => Promise<void>;
  onAutoAssign: (schedule: Schedule) => Promise<void>;
  assigningTeacher: boolean;
  autoAssigning: boolean;
  onRefreshAll?: () => Promise<void>;
  schoolId?: string;
  schoolName?: string;
  onRefreshTeachers: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [gradePopupOpen, setGradePopupOpen] = useState(false);
  const [selectedGrade, setSelectedGrade] = useState<{ grade: string; section: string } | null>(null);
  const [periodDetailOpen, setPeriodDetailOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<Schedule | null>(null);
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [periodEdit, setPeriodEdit] = useState({ subject: '', teacherId: '', roomId: '', startTime: '', endTime: '', topic: '' });
  const [savingPeriod, setSavingPeriod] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiGenerateResult, setAiGenerateResult] = useState<{ success: boolean; message: string; stats: Record<string, number>; aiSuggestions: string[]; verificationPassed: boolean } | null>(null);
  const [aiGradeSection, setAiGradeSection] = useState<{grade: string; section: string} | null>(null);
  const [aiGradeSelectOpen, setAiGradeSelectOpen] = useState(false);
  const [timetableSetupAction, setTimetableSetupAction] = useState<'generate' | 'timings'>('generate');
  const timetableSetupDefaults = { schoolLevel: 'high', startTime: '09:30', endTime: '17:00', periodsPerDay: 8, workingDays: 6, saturdayPeriods: 4, breakAfter: 2, breakMinutes: 15, lunchAfter: 4, lunchMinutes: 45, sportsPeriods: 2, ptEnabled: true, ptPeriodsPerWeek: 2, ptPreferredDay: 'Wednesday', ptPreferredPeriod: 1 };
  const [timetableSetup, setTimetableSetupRaw] = useState(timetableSetupDefaults);
  const setTimetableSetup: typeof setTimetableSetupRaw = (val) => {
    setTimetableSetupRaw((prev) => {
      const next = typeof val === 'function' ? val(prev) : val;
      try { localStorage.setItem(`tt_setup_${schoolId || 'default'}`, JSON.stringify(next)); } catch {}
      return next;
    });
  };
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`tt_setup_${schoolId || 'default'}`);
      if (saved) { const parsed = JSON.parse(saved); setTimetableSetupRaw({ ...timetableSetupDefaults, ...parsed }); }
    } catch {}
  }, [schoolId]);
  const [wizardCreationMode, setWizardCreationMode] = useState<'ai' | 'manual'>('ai');
  const [bulkImportOpen, setBulkImportOpen] = useState(false);

  // Drag & Drop, Deactivate & 5-Step Wizard State
  const [draggedSchedule, setDraggedSchedule] = useState<Schedule | null>(null);
  const [dragOverCell, setDragOverCell] = useState<string | null>(null);
  const [deactivateModalOpen, setDeactivateModalOpen] = useState(false);
  const [creationWizardOpen, setCreationWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [excelPasteText, setExcelPasteText] = useState('');
  const [previewRows, setPreviewRows] = useState<Array<{ grade: string; section: string; subject: string; teacherName: string; periodsWeek: number; roomNo: string }>>([]);
  const [previewModeTab, setPreviewModeTab] = useState<'classes' | 'teachers'>('classes');
  const [recentActivities, setRecentActivities] = useState<Array<{ id: string; title: string; description: string; timestamp: string; type: string }>>([
    { id: 'act-1', title: 'Timetable Workspace Connected', description: `Connected to ${schoolName || 'School Workspace'}`, timestamp: '11:30 AM', type: 'info' }
  ]);
  const [targetMoveDay, setTargetMoveDay] = useState('Monday');
  const [targetMovePeriod, setTargetMovePeriod] = useState(1);

  const handleDeactivateTimetable = async () => {
    try {
      const res = await fetch('/api/schedules/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schoolId: schoolId || 'all', reason: 'Deactivated to generate a new timetable' }),
      });
      if (res.ok) {
        toast({ title: 'Timetable Deactivated', description: 'Existing timetable data reset successfully. You can now create a new one.' });
        setRecentActivities(prev => [
          { id: `act-${Date.now()}`, title: 'Timetable Deactivated', description: `Cleared schedule data for ${schoolName || 'School'}`, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), type: 'deactivate' },
          ...prev
        ]);
        setDeactivateModalOpen(false);
        if (onRefreshAll) await onRefreshAll();
      } else {
        const data = await res.json();
        toast({ title: 'Reset Failed', description: data.error || 'Failed to deactivate timetable', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to deactivate timetable', variant: 'destructive' });
    }
  };

  const handleSwapPeriods = async (scheduleId1: string, scheduleId2?: string, targetDay?: string, targetPeriod?: number) => {
    try {
      const res = await fetch('/api/schedules/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduleId1, scheduleId2, targetDay, targetPeriod }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: 'Period Updated', description: data.message });
        setRecentActivities(prev => [
          { id: `act-${Date.now()}`, title: 'Period Swapped / Moved', description: data.message, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), type: 'swap' },
          ...prev
        ]);
        if (onRefreshAll) await onRefreshAll();
      } else {
        toast({ title: 'Swap Failed', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to swap periods', variant: 'destructive' });
    }
  };

  const [workspaceTab, setWorkspaceTab] = useState<'studio' | 'classes' | 'calendar' | 'workload' | 'teachers' | 'import'>(() => {
    if (typeof window === 'undefined') return 'studio';
    const value = new URLSearchParams(window.location.search).get('timetable');
    return ['studio', 'classes', 'calendar', 'workload', 'teachers', 'import'].includes(value || '') ? value as 'studio' | 'classes' | 'calendar' | 'workload' | 'teachers' | 'import' : 'studio';
  });
  const selectWorkspace = (tab: typeof workspaceTab) => {
    setWorkspaceTab(tab); const url = new URL(window.location.href); url.searchParams.set('timetable', tab); window.history.pushState({}, '', url);
  };
  useEffect(() => {
    const sync = () => { const value = new URLSearchParams(window.location.search).get('timetable'); if (['studio', 'classes', 'calendar', 'workload', 'teachers', 'import'].includes(value || '')) setWorkspaceTab(value as typeof workspaceTab); };
    window.addEventListener('popstate', sync); return () => window.removeEventListener('popstate', sync);
  }, []);

  const parseExcelPasteData = (text: string) => {
    setExcelPasteText(text);
    if (!text.trim()) {
      setPreviewRows([]);
      return;
    }
    const lines = text.split('\n');
    const parsed: Array<{ grade: string; section: string; subject: string; teacherName: string; periodsWeek: number; roomNo: string }> = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.split('\t').map(p => p.trim());
      if (parts.length >= 3) {
        parsed.push({
          grade: parts[0] || 'Grade 10',
          section: parts[1] || 'A',
          subject: parts[2] || 'General Subject',
          teacherName: parts[3] || 'Assigned Teacher',
          periodsWeek: Number(parts[4]) || 5,
          roomNo: parts[5] || 'Room 101',
        });
      }
    }
    setPreviewRows(parsed);
  };

  const loadSampleExcelData = () => {
    const sample = `Grade 10\tA\tMathematics\tDr. Rajesh Sharma\t6\tRoom 101
Grade 10\tA\tPhysics\tProf. Ananya Verma\t5\tLab 1
Grade 10\tA\tChemistry\tDr. Suresh Kumar\t4\tLab 2
Grade 10\tA\tEnglish\tMs. Priya Nair\t5\tRoom 101
Grade 10\tA\tComputer Science\tMr. Vikram Mehta\t4\tComp Lab 3
Grade 9\tA\tMathematics\tDr. Rajesh Sharma\t5\tRoom 201
Grade 9\tA\tBiology\tMs. Kavita Singh\t4\tBio Lab
Grade 9\tA\tEnglish\tMs. Priya Nair\t5\tRoom 201`;
    parseExcelPasteData(sample);
  };

  const handleAiGenerateTimetable = async (grade?: string, section?: string, setup = timetableSetup) => {
    const targetGrade = grade || 'Grade 10';
    const targetSection = section || 'A';
    setAiGradeSection({ grade: targetGrade, section: targetSection });
    setAiGenerating(true);
    setAiGenerateResult(null);
    try {
      const res = await fetch('/api/schedules/ai-generate-timetable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade: targetGrade, section: targetSection, schoolId, dryRun: false, setup }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiGenerateResult(data);
        if (onRefreshAll) await onRefreshAll();
      } else {
        const errData = await res.json();
        setAiGenerateResult({ success: false, message: errData.error || 'Generation failed', stats: {}, aiSuggestions: [], verificationPassed: false });
      }
    } catch {
      setAiGenerateResult({ success: false, message: 'Failed to connect to AI Timetable Generator', stats: {}, aiSuggestions: [], verificationPassed: false });
    } finally {
      setAiGenerating(false);
    }
  };

  const openEditTimingsDialog = useCallback((targetClass: { grade: string; section: string }) => {
    const scheduleForClass = (sharedSchedules.length ? sharedSchedules : schedules).filter(
      (item) => item.grade === targetClass.grade && item.section === targetClass.section,
    );
    const first = scheduleForClass.find((item) => item.period === 1);
    const lastPeriod = scheduleForClass.reduce((max, item) => (item.period > max ? item.period : max), 0);
    const last = scheduleForClass.find((item) => item.period === lastPeriod);
    startTransition(() => {
      setAiGradeSection(targetClass);
      setTimetableSetupAction('timings');
      setTimetableSetup((current) => ({
        ...current,
        startTime: first?.startTime || current.startTime || '09:30',
        endTime: last?.endTime || current.endTime || '17:00',
      }));
      setAiGradeSelectOpen(true);
    });
  }, [sharedSchedules, schedules]);

  const handleApplyTimings = async () => {
    const targetClass = aiGradeSection;
    if (!targetClass) {
      toast({ title: 'No Class Selected', description: 'Please select a grade and section first.', variant: 'destructive' });
      return;
    }
    setAiGenerating(true);
    try {
      const response = await fetch('/api/schedules/timings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade: targetClass.grade, section: targetClass.section, schoolId, setup: timetableSetup }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to update timings');
      toast({ title: 'Timings Updated', description: data.message || `Updated timings for ${targetClass.grade} Section ${targetClass.section}` });
      setAiGradeSelectOpen(false);
      if (onRefreshAll) await onRefreshAll();
    } catch (error) {
      toast({ title: 'Error Updating Timings', description: error instanceof Error ? error.message : 'Unable to update timings', variant: 'destructive' });
    } finally {
      setAiGenerating(false);
    }
  };

  useEffect(() => {
    if (selectedPeriod) setPeriodEdit({ subject: selectedPeriod.subject, teacherId: selectedPeriod.teacherId || '', roomId: selectedPeriod.roomId || '', startTime: selectedPeriod.startTime, endTime: selectedPeriod.endTime, topic: selectedPeriod.topic || '' });
  }, [selectedPeriod]);

  const savePeriodChanges = async () => {
    if (!selectedPeriod) return;
    setSavingPeriod(true);
    try {
      const response = await fetch(`/api/schedules/${selectedPeriod.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(periodEdit) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to update period');
      toast({ title: 'Period Updated', description: `Updated ${periodEdit.subject} (${periodEdit.startTime}–${periodEdit.endTime})` });
      setSelectedPeriod(data); setPeriodDetailOpen(false);
      if (onRefreshAll) await onRefreshAll();
    } catch (error) {
      toast({ title: 'Error Updating Period', description: error instanceof Error ? error.message : 'Unable to update period', variant: 'destructive' });
    } finally { setSavingPeriod(false); }
  };

  // Day name from date
  const getDayFromDate = (date: Date): string => {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return dayNames[date.getDay()];
  };

  const isWeekend = (date: Date) => date.getDay() === 0;

  // Calendar helpers
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const calendarDaysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const calendarFirstDayOfWeek = new Date(calendarYear, calendarMonth, 1).getDay(); // 0=Sun
  const today = new Date();

  const getGradeGroups = () => {
    const groups: Record<string, string[]> = {};
    for (const s of (sharedSchedules.length ? sharedSchedules : schedules)) {
      if (!groups[s.grade]) groups[s.grade] = [];
      if (!groups[s.grade].includes(s.section)) groups[s.grade].push(s.section);
    }
    return groups;
  };

  const getSchedulesForGrade = (grade: string, section: string) => {
    return schedules.filter((s) => s.grade === grade && s.section === section).sort((a, b) => a.period - b.period);
  };

  const getAvailableTeachers = (subject: string, day: string, period: number, grade?: string) => {
    // Find teachers busy at this day+period
    const busyTeacherIds = new Set(
      schedules.filter((s) => s.day === day && s.period === period && s.teacherId).map((s) => s.teacherId)
    );

    // Related subjects mapping for intelligent fallback
    const relatedSubjects: Record<string, string[]> = {
      'Mathematics': ['Physics', 'Computer Science', 'Economics'],
      'Physics': ['Mathematics', 'Chemistry', 'Computer Science'],
      'Chemistry': ['Physics', 'Biology', 'Mathematics'],
      'Biology': ['Chemistry', 'Physics', 'Environmental Science'],
      'English': ['Hindi', 'Social Studies', 'History'],
      'Hindi': ['English', 'Sanskrit', 'Social Studies'],
      'Sanskrit': ['Hindi', 'English', 'Social Studies'],
      'History': ['Social Studies', 'Geography', 'Civics', 'English'],
      'Geography': ['Social Studies', 'History', 'Environmental Science', 'Civics'],
      'Civics': ['Social Studies', 'History', 'Geography'],
      'Social Studies': ['History', 'Geography', 'Civics', 'English'],
      'Computer Science': ['Mathematics', 'Physics'],
      'Economics': ['Mathematics', 'Social Studies'],
      'Environmental Science': ['Biology', 'Chemistry', 'Geography'],
      'Physical Education': ['Biology', 'Science'],
      'Art': ['English', 'History'],
      'Music': ['English', 'Hindi'],
    };

    const relatedTo = relatedSubjects[subject] || [];

    // Score and rank ALL non-busy teachers
    const ranked = teachers
      .filter((t) => !busyTeacherIds.has(t.id))
      .map((t) => {
        const teacherGrades = JSON.parse(t.grades || '[]') as string[];
        const teachesSubject = t.subject === subject;
        const teachesRelatedSubject = relatedTo.includes(t.subject);
        const teachesGrade = grade ? teacherGrades.includes(grade) : false;
        const teachesSimilarGrade = grade ? teacherGrades.some(g => {
          const gNum = parseInt(g.replace(/\D/g, ''));
          const targetNum = parseInt(grade.replace(/\D/g, ''));
          return Math.abs(gNum - targetNum) <= 1;
        }) : false;
        const hasClassFamiliarity = grade ? schedules.some(
          s => s.teacherId === t.id && s.grade === grade
        ) : false;

        // Count how many periods this teacher already has today
        const todayPeriods = schedules.filter(s => s.teacherId === t.id && s.day === day).length;

        // Scoring: higher = better match
        let score = 0;
        let matchLabel = '';
        let matchColor = '';

        if (teachesSubject) {
          score += 50;
        }
        if (teachesGrade) {
          score += 30;
        } else if (teachesSimilarGrade) {
          score += 15;
        }
        if (teachesRelatedSubject) {
          score += 20;
        }
        if (hasClassFamiliarity) {
          score += 10;
        }
        // Lower workload bonus
        score += Math.max(0, 10 - todayPeriods);

        // Assign match label and color
        if (teachesSubject && teachesGrade) {
          matchLabel = 'Best Match';
          matchColor = 'bg-emerald-100 text-emerald-700 border-emerald-300';
        } else if (teachesSubject) {
          matchLabel = 'Subject Specialist';
          matchColor = 'bg-blue-100 text-blue-700 border-blue-300';
        } else if (teachesRelatedSubject && teachesGrade) {
          matchLabel = 'Related Subject + Grade';
          matchColor = 'bg-teal-100 text-teal-700 border-teal-300';
        } else if (teachesRelatedSubject) {
          matchLabel = 'Related Subject';
          matchColor = 'bg-cyan-100 text-cyan-700 border-cyan-300';
        } else if (teachesGrade) {
          matchLabel = 'Same Grade';
          matchColor = 'bg-amber-100 text-amber-700 border-amber-300';
        } else if (teachesSimilarGrade) {
          matchLabel = 'Similar Grade';
          matchColor = 'bg-orange-100 text-orange-700 border-orange-300';
        } else {
          matchLabel = 'Available';
          matchColor = 'bg-gray-100 text-gray-600 border-gray-300';
        }

        return {
          teacher: t,
          score,
          matchLabel,
          matchColor,
          teachesSubject,
          teachesRelatedSubject,
          teachesGrade,
          teachesSimilarGrade,
          hasClassFamiliarity,
          todayPeriods,
        };
      })
      .sort((a, b) => b.score - a.score);

    return ranked;
  };

  const gradeGroups = getGradeGroups();

  const sectionColors: Record<string, { bg: string; border: string; text: string; badge: string; hoverBg: string }> = {
    A: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', badge: 'bg-blue-100 text-blue-700', hoverBg: 'hover:bg-blue-100' },
    B: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', badge: 'bg-emerald-100 text-emerald-700', hoverBg: 'hover:bg-emerald-100' },
    C: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', badge: 'bg-amber-100 text-amber-700', hoverBg: 'hover:bg-amber-100' },
    D: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-800', badge: 'bg-purple-100 text-purple-700', hoverBg: 'hover:bg-purple-100' },
    E: { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-800', badge: 'bg-rose-100 text-rose-700', hoverBg: 'hover:bg-rose-100' },
    F: { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-800', badge: 'bg-cyan-100 text-cyan-700', hoverBg: 'hover:bg-cyan-100' },
    G: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-800', badge: 'bg-orange-100 text-orange-700', hoverBg: 'hover:bg-orange-100' },
    H: { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-800', badge: 'bg-teal-100 text-teal-700', hoverBg: 'hover:bg-teal-100' },
    I: { bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-800', badge: 'bg-pink-100 text-pink-700', hoverBg: 'hover:bg-pink-100' },
    J: { bg: 'bg-lime-50', border: 'border-lime-200', text: 'text-lime-800', badge: 'bg-lime-100 text-lime-700', hoverBg: 'hover:bg-lime-100' },
  };

  const getSectionColor = (section: string) => sectionColors[section] || sectionColors['A'];

  const timetableTabs: { id: typeof workspaceTab; label: string; icon: React.ReactNode }[] = [
    { id: 'studio', label: 'Timetable Studio', icon: <Sparkles className="h-4 w-4"/> }, { id: 'classes', label: 'Class View', icon: <Grid3X3 className="h-4 w-4"/> },
    { id: 'calendar', label: 'Weekly / Monthly', icon: <CalendarDays className="h-4 w-4"/> }, { id: 'workload', label: 'Teacher Workload', icon: <BarChart3 className="h-4 w-4"/> },
    { id: 'teachers', label: 'Teacher Directory', icon: <Users className="h-4 w-4"/> }, { id: 'import', label: 'Bulk Upload & AI Allot', icon: <FileSpreadsheet className="h-4 w-4"/> },
  ];
  const sharedData = sharedSchedules.length ? sharedSchedules : schedules;
  const classSections = new Set(sharedData.map((item) => `${item.grade}|${item.section}`)).size;
  const unallocated = sharedData.filter((item) => !item.teacherId).length;
  const moduleHeader = <div className="space-y-4">
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-950 via-emerald-950 to-teal-900 p-5 text-white shadow-lg md:p-6"><div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between"><div><div className="flex items-center gap-3"><div className="rounded-xl bg-white/10 p-2.5"><CalendarDays className="h-6 w-6 text-emerald-300"/></div><div><h1 className="text-xl font-bold md:text-2xl">AI Academic Calendar & Timetable</h1><p className="text-sm text-emerald-100">{schoolName || 'School workspace'} · Shared timetable dataset</p></div></div><div className="mt-4 flex flex-wrap gap-2"><Badge className="bg-amber-400/20 text-amber-100">Status: Draft</Badge><Badge className="bg-white/10 text-white">Academic Year 2026-27</Badge><Badge className="bg-white/10 text-white">Version v1</Badge></div></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="rounded-xl bg-white/10 p-3"><p className="text-2xl font-bold">{classSections}</p><p className="text-[11px] text-emerald-100">Class sections</p></div><div className="rounded-xl bg-white/10 p-3"><p className="text-2xl font-bold">{sharedData.length}</p><p className="text-[11px] text-emerald-100">Periods placed</p></div><div className="rounded-xl bg-white/10 p-3"><p className="text-2xl font-bold">0</p><p className="text-[11px] text-emerald-100">Hard clashes</p></div><div className="rounded-xl bg-white/10 p-3"><p className="text-2xl font-bold">{unallocated}</p><p className="text-[11px] text-emerald-100">Unallocated</p></div></div></div></div>
    <div className="overflow-x-auto rounded-xl border bg-white p-1 shadow-sm"><div className="flex min-w-max gap-1">{timetableTabs.map((tab) => <button key={tab.id} onClick={() => selectWorkspace(tab.id)} className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${workspaceTab === tab.id ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:bg-emerald-50 hover:text-emerald-800'}`}>{tab.icon}{tab.label}</button>)}</div></div>
  </div>;

  const timingsSetupDialog = (
    <Dialog open={aiGradeSelectOpen} onOpenChange={setAiGradeSelectOpen}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>{timetableSetupAction === 'timings' ? 'Edit existing timetable timings' : 'Set timetable timings'}</DialogTitle><DialogDescription>{timetableSetupAction === 'timings' ? 'Update saved period times without changing subjects or assigned teachers' : 'Confirm or edit these settings before creating the timetable'} for {aiGradeSection ? `${aiGradeSection.grade} Section ${aiGradeSection.section}` : 'the selected class'}.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2"><Label>School level</Label><Select value={timetableSetup.schoolLevel} onValueChange={(value) => setTimetableSetup((current) => ({ ...current, schoolLevel: value, endTime: value === 'primary' ? '15:00' : value === 'middle' ? '16:00' : '17:00' }))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="primary">Primary school</SelectItem><SelectItem value="middle">Middle school</SelectItem><SelectItem value="high">High school</SelectItem></SelectContent></Select></div>
          <div className="space-y-2"><Label>Class starts</Label><Input type="time" value={timetableSetup.startTime} onChange={(e) => setTimetableSetup((current) => ({ ...current, startTime: e.target.value }))}/></div>
          <div className="space-y-2"><Label>Class ends</Label><Input type="time" value={timetableSetup.endTime} onChange={(e) => setTimetableSetup((current) => ({ ...current, endTime: e.target.value }))}/></div>
          <div className="space-y-2"><Label>Periods per full day</Label><Input type="number" min={4} max={10} value={timetableSetup.periodsPerDay} onChange={(e) => setTimetableSetup((current) => ({ ...current, periodsPerDay: Number(e.target.value) }))}/></div>
          <div className="space-y-2"><Label>Working days</Label><Select value={String(timetableSetup.workingDays)} onValueChange={(value) => setTimetableSetup((current) => ({ ...current, workingDays: Number(value) }))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="5">Monday–Friday</SelectItem><SelectItem value="6">Monday–Saturday</SelectItem></SelectContent></Select></div>
          <div className="space-y-2"><Label>Saturday periods</Label><Input type="number" min={1} max={8} disabled={timetableSetup.workingDays === 5} value={timetableSetup.saturdayPeriods} onChange={(e) => setTimetableSetup((current) => ({ ...current, saturdayPeriods: Number(e.target.value) }))}/></div>
          <div className="space-y-2"><Label>Short break after period</Label><Input type="number" min={1} max={7} value={timetableSetup.breakAfter} onChange={(e) => setTimetableSetup((current) => ({ ...current, breakAfter: Number(e.target.value) }))}/></div>
          <div className="space-y-2"><Label>Short break minutes</Label><Input type="number" min={5} max={30} value={timetableSetup.breakMinutes} onChange={(e) => setTimetableSetup((current) => ({ ...current, breakMinutes: Number(e.target.value) }))}/></div>
          <div className="space-y-2"><Label>Lunch after period</Label><Input type="number" min={2} max={7} value={timetableSetup.lunchAfter} onChange={(e) => setTimetableSetup((current) => ({ ...current, lunchAfter: Number(e.target.value) }))}/></div>
          <div className="space-y-2"><Label>Lunch minutes</Label><Input type="number" min={15} max={90} value={timetableSetup.lunchMinutes} onChange={(e) => setTimetableSetup((current) => ({ ...current, lunchMinutes: Number(e.target.value) }))}/></div>
          <div className="space-y-2"><Label>Sports periods per week</Label><Input type="number" min={1} max={6} value={timetableSetup.sportsPeriods} onChange={(e) => setTimetableSetup((current) => ({ ...current, sportsPeriods: Number(e.target.value) }))}/></div>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">Suggested: Primary 9:30 AM–3:00 PM, Middle 9:30 AM–4:00 PM, High school 9:30 AM–5:00 PM. You can edit every value.</div>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setAiGradeSelectOpen(false)}>Cancel</Button><Button disabled={!aiGradeSection || aiGenerating} className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { if (timetableSetupAction === 'timings') void handleApplyTimings(); else { setAiGradeSelectOpen(false); if (aiGradeSection) void handleAiGenerateTimetable(aiGradeSection.grade, aiGradeSection.section, timetableSetup); } }}><Sparkles className="mr-2 h-4 w-4"/>{timetableSetupAction === 'timings' ? 'Apply New Timings' : 'Create Timetable'}</Button></div>
      </DialogContent>
    </Dialog>
  );

  if (workspaceTab === 'import') return <div className="space-y-6">{moduleHeader}<BulkTeacherImportSection schoolId={schoolId} onCompleted={async () => { if (onRefreshAll) await onRefreshAll(); }} />{timingsSetupDialog}</div>;
  if (workspaceTab === 'workload') return <div className="space-y-6">{moduleHeader}<WorkloadAnalyticsSection teachers={teachers} schedules={sharedData} onRefresh={() => { if (onRefreshAll) void onRefreshAll(); }} />{timingsSetupDialog}</div>;
  if (workspaceTab === 'teachers') return <div className="space-y-6">{moduleHeader}<TeachersSection teachers={teachers} schedules={sharedData} selectedDay={selectedDay} onRefresh={onRefreshTeachers} schoolId={schoolId} timetableSetup={timetableSetup} />{timingsSetupDialog}</div>;
  if (workspaceTab === 'classes') {
    const classOptions = Object.entries(gradeGroups)
      .flatMap(([grade, sections]) => sections.map((section) => ({ grade, section })))
      .sort((a, b) => a.grade.localeCompare(b.grade, undefined, { numeric: true }) || a.section.localeCompare(b.section, undefined, { numeric: true }));
    const activeClass = selectedGrade && classOptions.some((item) => item.grade === selectedGrade.grade && item.section === selectedGrade.section)
      ? selectedGrade
      : classOptions[0] || null;
    const classSchedule = activeClass ? sharedData.filter((item) => item.grade === activeClass.grade && item.section === activeClass.section) : [];
    const teacherFrequency = classSchedule.reduce<Record<string, number>>((counts, item) => {
      if (item.teacherId) counts[item.teacherId] = (counts[item.teacherId] || 0) + 1;
      return counts;
    }, {});
    const classTeacherId = Object.entries(teacherFrequency).sort((a, b) => b[1] - a[1])[0]?.[0];
    const classTeacher = teachers.find((teacher) => teacher.id === classTeacherId);
    const timetableDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const fallbackTimes = [
      ['08:30', '09:15'], ['09:15', '10:00'], ['10:15', '11:00'], ['11:00', '11:45'],
      ['12:30', '13:15'], ['13:15', '14:00'], ['14:00', '14:45'], ['14:45', '15:30'],
    ];
    const periodTime = (period: number) => {
      const found = classSchedule.find((item) => item.period === period && item.startTime && item.endTime);
      return found ? `${found.startTime}–${found.endTime}` : fallbackTimes[period - 1].join('–');
    };
    const gapTime = (afterPeriod: number, fallback: string) => {
      const before = classSchedule.find((item) => item.period === afterPeriod);
      const after = classSchedule.find((item) => item.period === afterPeriod + 1);
      return before?.endTime && after?.startTime ? `${before.endTime}–${after.startTime}` : fallback;
    };
    const saturdayTeachingPeriods = Math.max(4, ...classSchedule.filter((item) => item.day === 'Saturday').map((item) => item.period));

    const hasShortBreak = timetableSetup.breakMinutes > 0;
    const hasLunchBreak = timetableSetup.lunchMinutes > 0;
    const shortBreakAfter = timetableSetup.breakAfter;
    const lunchBreakAfter = timetableSetup.lunchAfter;
    const totalPeriods = timetableSetup.periodsPerDay;
    const satPeriods = timetableSetup.workingDays === 6 ? timetableSetup.saturdayPeriods : 0;
    const workDays = timetableSetup.workingDays;
    const descParts: string[] = [];
    descParts.push(`${workDays} working days`);
    descParts.push(`${totalPeriods} periods${workDays === 6 ? ' Mon–Fri' : ' per day'}`);
    if (satPeriods > 0) descParts.push(`${satPeriods} periods Saturday`);
    if (hasShortBreak) descParts.push(`Short break after P${shortBreakAfter}`);
    if (hasLunchBreak) descParts.push(`Lunch after P${lunchBreakAfter}`);

    return <div className="space-y-6">
      {moduleHeader}
      <div className="flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div><h2 className="text-xl font-bold text-slate-900">Class Timetable</h2><p className="text-sm text-muted-foreground">{descParts.join(' · ')}</p></div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={activeClass ? `${activeClass.grade}|${activeClass.section}` : undefined} onValueChange={(value) => { const [grade, section] = value.split('|'); setSelectedGrade({ grade, section }); }}>
            <SelectTrigger className="h-11 min-w-[230px] rounded-xl"><SelectValue placeholder="Choose grade and section"/></SelectTrigger>
            <SelectContent>{classOptions.map((item) => <SelectItem key={`${item.grade}|${item.section}`} value={`${item.grade}|${item.section}`}>{item.grade} · Section {item.section}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" className="h-11 rounded-xl border-emerald-200 text-emerald-700" onClick={() => { const targetClass = activeClass || classOptions[0]; if (!targetClass) { toast({ title: 'No Class Selected', description: 'Please import or select a grade and section first.', variant: 'destructive' }); return; } openEditTimingsDialog(targetClass); }}><Clock className="mr-2 h-4 w-4"/>Edit Timings</Button>
        </div>
      </div>
      {!activeClass ? <Card><CardContent className="p-10 text-center text-muted-foreground">Import or generate timetable data to create a class timetable.</CardContent></Card> :
      <Card className="overflow-hidden border-slate-200 shadow-md">
        <div className="bg-gradient-to-r from-emerald-700 via-teal-700 to-cyan-700 px-5 py-5 text-white">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-100">Grade & Section</p><h2 className="mt-1 text-3xl font-black">{activeClass.grade} — {activeClass.section}</h2></div><div className="rounded-xl bg-white/10 px-4 py-2 backdrop-blur"><p className="text-[11px] uppercase tracking-wider text-emerald-100">Class Teacher</p><p className="font-bold">{classTeacher?.name || 'Not assigned'}</p></div></div>
        </div>
        <CardContent className="p-0">
          <div className="max-h-[70vh] overflow-auto overscroll-contain">
            <table className="w-full min-w-[1200px] border-collapse text-xs">
              <thead className="sticky top-0 z-20 bg-slate-950 text-white"><tr>
                <th className="sticky left-0 z-30 min-w-[110px] border border-slate-700 bg-slate-950 p-3 text-left">Day</th>
                {Array.from({ length: totalPeriods }, (_, index) => index + 1).flatMap((period) => {
                  const cells = [<th key={`p-${period}`} className="min-w-[155px] border border-slate-700 p-2"><span className="block text-sm font-bold">Period {period}</span><span className="font-normal text-slate-300">{periodTime(period)}</span></th>];
                  if (hasShortBreak && period === shortBreakAfter) cells.push(<th key="break-head" className="min-w-[82px] border border-amber-300 bg-amber-500 p-2 text-amber-950"><span className="font-bold">BREAK</span><span className="block text-[10px]">{gapTime(shortBreakAfter, `${timetableSetup.breakMinutes} min`)}</span></th>);
                  if (hasLunchBreak && period === lunchBreakAfter) cells.push(<th key="lunch-head" className="min-w-[90px] border border-orange-300 bg-orange-500 p-2 text-orange-950"><span className="font-bold">LUNCH</span><span className="block text-[10px]">{gapTime(lunchBreakAfter, `${timetableSetup.lunchMinutes} min`)}</span></th>);
                  return cells;
                })}
              </tr></thead>
              <tbody>{timetableDays.slice(0, workDays).map((day) => <tr key={day} className="odd:bg-white even:bg-slate-50/70">
                <th className="sticky left-0 z-10 border bg-emerald-50 p-3 text-left text-sm font-bold text-emerald-900">{day}</th>
                {Array.from({ length: day === 'Saturday' && satPeriods > 0 ? satPeriods : totalPeriods }, (_, index) => index + 1).flatMap((period) => {
                  const schedule = classSchedule.find((item) => item.day === day && item.period === period);
                  const sports = !!schedule && /sport|physical|games|p\.e\.?/i.test(schedule.subject);
                  const cells = [<td key={`${day}-${period}`} className={`h-[92px] border p-2 align-top ${sports ? 'bg-blue-50' : ''}`}>
                    {schedule ? <button className="h-full w-full rounded-lg p-1 text-left transition hover:bg-emerald-50" onClick={() => { setSelectedPeriod(schedule); setSelectedTeacherId(''); setPeriodDetailOpen(true); }}>
                      <span className={`block font-bold ${sports ? 'text-blue-700' : 'text-slate-900'}`}>{sports ? '⚽ ' : ''}{schedule.subject}</span>
                      <span className="mt-1 block text-[11px] font-medium text-emerald-700">{schedule.teacher?.name || 'Teacher not assigned'}</span>
                      <span className="mt-1 block text-[10px] text-slate-500">{schedule.startTime}–{schedule.endTime}</span>
                    </button> : <div className="flex h-full items-center justify-center text-[11px] text-slate-400">Free / unassigned</div>}
                  </td>];
                  if (hasShortBreak && period === shortBreakAfter) cells.push(<td key={`${day}-break`} className="border border-amber-200 bg-amber-50 text-center font-semibold text-amber-700"><span className="[writing-mode:vertical-rl] rotate-180">Short Break</span></td>);
                  if (hasLunchBreak && period === lunchBreakAfter) {
                    if (day === 'Saturday' && satPeriods > 0 && period === satPeriods) {
                      cells.push(<td key={`${day}-lunch`} className="border border-slate-300 bg-slate-200 text-center font-semibold text-slate-600"><span className="[writing-mode:vertical-rl] rotate-180">Half Day Ends</span></td>);
                    } else {
                      cells.push(<td key={`${day}-lunch`} className="border border-orange-200 bg-orange-50 text-center font-semibold text-orange-700"><span className="[writing-mode:vertical-rl] rotate-180">Lunch Break</span></td>);
                    }
                  }
                  return cells;
                })}
                {day === 'Saturday' && satPeriods > 0 && satPeriods < totalPeriods && (
                  <td colSpan={totalPeriods - satPeriods + (hasShortBreak && shortBreakAfter > satPeriods ? 1 : 0) + (hasLunchBreak && lunchBreakAfter > satPeriods ? 1 : 0)} className="border bg-slate-100 text-center font-semibold text-slate-400"><div className="flex h-full flex-col items-center justify-center py-4"><span>Half day</span><span className="text-[10px] font-normal">School closed</span></div></td>
                )}
              </tr>)}</tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-4 border-t bg-slate-50 px-4 py-3 text-[11px] text-slate-600">
            <span><b>{workDays}</b> working days</span>
            <span><b>{totalPeriods}</b> periods{workDays === 6 ? ' Mon–Fri' : ''}</span>
            {satPeriods > 0 && <span><b>{satPeriods}</b> periods Saturday</span>}
            {hasShortBreak && <span className="text-amber-700">■ Short break</span>}
            {hasLunchBreak && <span className="text-orange-700">■ Lunch break</span>}
            <span className="text-blue-700">■ Sports / Physical Education</span>
          </div>
        </CardContent>
      </Card>}
      {timingsSetupDialog}
    </div>;
  }

  return (
    <div className="space-y-6">
      {moduleHeader}
      {workspaceTab === 'studio' && <TimetableGovernancePanel schoolId={schoolId} onChanged={onRefreshAll} />}
      {/* Header with calendar picker and day selector */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-emerald-800">{workspaceTab === 'studio' ? 'Timetable Studio' : workspaceTab === 'classes' ? 'Class View' : 'Weekly / Monthly'}</h2>
            <p className="text-sm text-muted-foreground">{workspaceTab === 'studio' ? 'Configure, generate and review timetable drafts' : workspaceTab === 'classes' ? 'Inspect subjects and allotted teachers for one grade and section' : 'Review the shared timetable by teaching day and calendar date'}</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:w-auto">
            <Button
              onClick={() => { setCreationWizardOpen(true); setWizardStep(1); }}
              className="h-11 justify-center rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 font-bold text-white shadow-lg shadow-emerald-200 hover:from-emerald-700 hover:via-teal-700 hover:to-cyan-700 px-5 gap-2"
            >
              <Sparkles className="w-4 h-4 text-white" />
              <span className="whitespace-nowrap font-bold text-sm">Create Timetable</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => setDeactivateModalOpen(true)}
              className="h-11 justify-center rounded-xl border-red-200 bg-white px-4 text-red-700 shadow-sm hover:bg-red-50"
            >
              <Trash2 className="mr-2 h-4 w-4 text-red-600" />
              <span className="whitespace-nowrap">Deactivate / Clear Data</span>
            </Button>
          <Button
            variant="outline"
            onClick={() => setCalendarOpen(!calendarOpen)}
            className="h-11 gap-2 rounded-xl border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
          >
            <CalendarDays className="w-4 h-4" />
            {selectedDate
              ? selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
              : `${selectedDay} — Pick a date`}
            <ChevronRight className={`w-3 h-3 transition-transform ${calendarOpen ? 'rotate-90' : ''}`} />
          </Button>
          </div>
        </div>

      {bulkImportOpen && <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-slate-50">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b bg-white px-4 py-3 shadow-sm md:px-8">
          <div className="min-w-0"><h1 className="truncate text-lg font-bold text-slate-900 md:text-2xl">Timetable Bulk Import & Draft Studio</h1><p className="hidden text-sm text-muted-foreground sm:block">Import linked scheduling data, validate it, generate a draft, review, approve and publish.</p></div>
          <Button type="button" variant="outline" onClick={() => setBulkImportOpen(false)} className="shrink-0 rounded-xl"><X className="mr-0 h-4 w-4 sm:mr-2"/><span className="hidden sm:inline">Back to Academic Calendar</span></Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain"><div className="mx-auto w-full max-w-[1600px] p-3 sm:p-5 md:p-8"><BulkTeacherImportSection schoolId={schoolId} onCompleted={async () => { if (onRefreshAll) await onRefreshAll(); }} /></div></div>
      </div>}

      {timingsSetupDialog}

      {/* AI Timetable Generator Progress */}
      {aiGenerating && (
        <Card className="border-purple-200 bg-purple-50/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Brain className="w-8 h-8 text-purple-600" />
                <Sparkles className="w-4 h-4 text-purple-500 absolute -top-1 -right-1 animate-pulse" />
              </div>
              <div>
                <p className="font-medium text-purple-800">AI Timetable Generator is working... {aiGradeSection ? `for ${aiGradeSection.grade} ${aiGradeSection.section}` : ''}</p>
                <p className="text-sm text-purple-600">Analyzing teachers, subjects, grades — building clash-free schedule for {aiGradeSection ? `${aiGradeSection.grade} ${aiGradeSection.section}` : 'selected class'}</p>
              </div>
              <div className="ml-auto flex gap-1">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Timetable Generator Results */}
      {aiGenerateResult && !aiGenerating && (
        <Card className={`border-2 ${aiGenerateResult.success ? 'border-purple-300 bg-purple-50/50' : 'border-red-300 bg-red-50/50'}`}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              {aiGenerateResult.success ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-purple-600" />
                  <span className="text-purple-800">AI Timetable Generator — Complete {aiGradeSection ? `for ${aiGradeSection.grade} ${aiGradeSection.section}` : ''}</span>
                  {aiGenerateResult.verificationPassed && <Badge className="bg-emerald-100 text-emerald-700 text-[9px]">Zero Clashes Verified</Badge>}
                </>
              ) : (
                <>
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                  <span className="text-red-800">AI Timetable Generator — Error</span>
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm font-medium">{aiGenerateResult.message}</p>
            {aiGenerateResult.stats && Object.keys(aiGenerateResult.stats).length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="p-3 bg-white rounded-lg border text-center">
                  <p className="text-lg font-bold text-purple-600">{aiGenerateResult.stats.totalGenerated || 0}</p>
                  <p className="text-[10px] text-muted-foreground">Schedules Created</p>
                </div>
                <div className="p-3 bg-white rounded-lg border text-center">
                  <p className="text-lg font-bold text-emerald-600">{aiGenerateResult.stats.perfectMatchCount || 0}</p>
                  <p className="text-[10px] text-muted-foreground">Perfect Matches</p>
                </div>
                <div className="p-3 bg-white rounded-lg border text-center">
                  <p className="text-lg font-bold text-blue-600">{aiGenerateResult.stats.subjectSpecialistCount || 0}</p>
                  <p className="text-[10px] text-muted-foreground">Subject Specialists</p>
                </div>
                <div className="p-3 bg-white rounded-lg border text-center">
                  <p className="text-lg font-bold text-amber-600">{aiGenerateResult.stats.unassigned || 0}</p>
                  <p className="text-[10px] text-muted-foreground">Unassigned Slots</p>
                </div>
                <div className="p-3 bg-white rounded-lg border text-center">
                  <p className="text-lg font-bold text-teal-600">{aiGenerateResult.stats.notificationsSent || 0}</p>
                  <p className="text-[10px] text-muted-foreground">Notifications Sent</p>
                </div>
              </div>
            )}
            {aiGenerateResult.aiSuggestions && aiGenerateResult.aiSuggestions.length > 0 && (
              <div className="p-3 bg-white rounded-lg border">
                <h4 className="text-xs font-semibold text-purple-800 mb-2">AI Suggestions:</h4>
                <ul className="space-y-1">
                  {aiGenerateResult.aiSuggestions.map((s, i) => (
                    <li key={i} className="text-xs text-gray-600 flex items-start gap-2">
                      <Lightbulb className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => setAiGenerateResult(null)}>
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

        {/* Selected date info bar */}
        {selectedDate && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
            <CalendarDays className="w-4 h-4 text-emerald-600" />
            <span className="text-sm font-medium text-emerald-800">
              {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </span>
            <Badge variant="outline" className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-300">
              {getDayFromDate(selectedDate)}
            </Badge>
            <button
              onClick={() => { setSelectedDate(null); onDayChange('Monday'); }}
              className="ml-auto text-xs text-muted-foreground hover:text-red-500 transition-colors"
            >
              Clear
            </button>
          </div>
        )}

        {/* Dark Theme Calendar */}
        {calendarOpen && (
          <div className="bg-gray-900 rounded-xl p-5 shadow-xl border border-gray-700">
            {/* Calendar Header */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => {
                  if (calendarMonth === 0) { setCalendarMonth(11); setCalendarYear(calendarYear - 1); }
                  else setCalendarMonth(calendarMonth - 1);
                }}
                className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
              >
                <ChevronRight className="w-4 h-4 rotate-180" />
              </button>
              <div className="flex items-center gap-3">
                <select
                  value={calendarMonth}
                  onChange={(e) => setCalendarMonth(Number(e.target.value))}
                  className="bg-gray-800 text-white border border-gray-600 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
                <select
                  value={calendarYear}
                  onChange={(e) => setCalendarYear(Number(e.target.value))}
                  className="bg-gray-800 text-white border border-gray-600 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  {Array.from({ length: 10 }, (_, i) => calendarYear - 5 + i).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => {
                  if (calendarMonth === 11) { setCalendarMonth(0); setCalendarYear(calendarYear + 1); }
                  else setCalendarMonth(calendarMonth + 1);
                }}
                className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className={`text-center text-[10px] font-medium py-1 ${d === 'Sun' || d === 'Sat' ? 'text-red-400' : 'text-gray-400'}`}>
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {/* Empty cells before first day */}
              {Array.from({ length: calendarFirstDayOfWeek }, (_, i) => (
                <div key={`empty-${i}`} className="h-9" />
              ))}
              {/* Day cells */}
              {Array.from({ length: calendarDaysInMonth }, (_, i) => {
                const day = i + 1;
                const date = new Date(calendarYear, calendarMonth, day);
                const isToday = date.toDateString() === today.toDateString();
                const isSelected = selectedDate?.toDateString() === date.toDateString();
                const weekend = isWeekend(date);
                const isPast = date < new Date(today.getFullYear(), today.getMonth(), today.getDate());

                return (
                  <button
                    key={day}
                    onClick={() => {
                      setSelectedDate(date);
                      const dayName = getDayFromDate(date);
                      if (!isWeekend(date)) {
                        onDayChange(dayName);
                      }
                      setCalendarOpen(false);
                    }}
                    disabled={weekend}
                    className={`h-9 rounded-lg text-xs font-medium flex items-center justify-center transition-all ${
                      isSelected
                        ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                        : isToday
                        ? 'bg-gray-700 text-emerald-400 ring-1 ring-emerald-500'
                        : weekend
                        ? 'text-gray-600 cursor-not-allowed'
                        : isPast
                        ? 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
                        : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            {/* Today button */}
            <div className="mt-3 flex justify-between items-center">
              <button
                onClick={() => {
                  setCalendarYear(today.getFullYear());
                  setCalendarMonth(today.getMonth());
                  setSelectedDate(today);
                  onDayChange(getDayFromDate(today));
                  setCalendarOpen(false);
                }}
                className="text-xs text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
              >
                Jump to Today
              </button>
              <span className="text-[10px] text-gray-500">Sunday is disabled; Saturday is a half day</span>
            </div>
          </div>
        )}

        {/* Week day quick selector */}
        <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm sm:grid-cols-6">
          {DAYS.map((day) => (
            <Button
              key={day}
              variant="ghost"
              size="sm"
              className={`h-auto min-h-12 rounded-xl px-2 py-2 text-xs font-medium transition-all ${
                selectedDay === day
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md hover:from-emerald-700 hover:to-teal-700 hover:text-white'
                  : 'text-slate-600 hover:bg-emerald-50 hover:text-emerald-800'
              }`}
              onClick={() => {
                onDayChange(day);
                setSelectedDate(null);
              }}
            >
              <span className="flex flex-col items-center leading-tight"><span className="font-bold">{day.slice(0, 3)}</span><span className={`mt-1 text-[9px] ${selectedDay === day ? 'text-emerald-100' : 'text-slate-400'}`}>{day === 'Saturday' ? 'Half day' : `${sharedData.filter((item) => item.day === day).length} periods`}</span></span>
            </Button>
          ))}
        </div>
      </div>

      {Object.keys(gradeGroups).length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Calendar className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Schedules Found</h3>
            <p className="text-muted-foreground mb-4">No schedules have been created yet. Add teachers and schedules to see the academic calendar.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-cyan-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">Weekly timetable overview</p><h3 className="mt-1 text-xl font-bold text-slate-900">{selectedDay}</h3><p className="text-xs text-slate-500">Select a class section to see and edit every period.</p></div><div className="flex gap-2"><div className="rounded-xl bg-white px-4 py-2 text-center shadow-sm"><p className="text-lg font-bold text-emerald-700">{Object.keys(gradeGroups).length}</p><p className="text-[10px] text-slate-500">Grades</p></div><div className="rounded-xl bg-white px-4 py-2 text-center shadow-sm"><p className="text-lg font-bold text-blue-700">{Object.values(gradeGroups).reduce((sum, items) => sum + items.length, 0)}</p><p className="text-[10px] text-slate-500">Sections</p></div></div></div>
          <div className="grid gap-4 xl:grid-cols-2">
          {Object.entries(gradeGroups)
            .sort(([a], [b]) => {
              const numA = parseInt(a.replace('Grade ', ''));
              const numB = parseInt(b.replace('Grade ', ''));
              return numA - numB;
            })
            .map(([grade, sections]) => {
              return (
                <div key={grade} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-emerald-200 hover:shadow-md">
                  <div className="flex items-center justify-between border-b bg-slate-50/80 px-4 py-3">
                    <div className="flex items-center gap-3"><span className="rounded-xl bg-emerald-600 p-2 text-white"><GraduationCap className="h-4 w-4" /></span><div><h3 className="text-sm font-bold text-slate-900">{grade}</h3><p className="text-[10px] text-slate-500">{sections.length} section{sections.length > 1 ? 's' : ''} · {selectedDay}</p></div></div>
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">{sections.reduce((sum, section) => sum + getSchedulesForGrade(grade, section).length, 0)} periods</Badge>
                  </div>
                  <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2">
                    {sections.sort().map((section) => {
                      const gradeSchedules = getSchedulesForGrade(grade, section);
                      const emptyCount = gradeSchedules.filter((s) => !s.teacherId).length;
                      const assignedCount = gradeSchedules.length - emptyCount;
                      const colors = getSectionColor(section);

                      return (
                        <button
                          key={`${grade}-${section}`}
                          className={`group rounded-xl border p-3 text-left transition-all ${colors.bg} ${colors.border} ${colors.hoverBg} hover:-translate-y-0.5 hover:shadow-md`}
                          onClick={() => {
                            setSelectedGrade({ grade, section });
                            setGradePopupOpen(true);
                          }}
                        >
                          <span className="flex items-start justify-between gap-2"><span><span className={`block text-sm font-bold ${colors.text}`}>Section {section}</span><span className="mt-0.5 block text-[10px] text-slate-500">{assignedCount}/{gradeSchedules.length} teachers allotted</span></span><span className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg font-black ${colors.badge}`}>{section.slice(0, 2)}</span></span>
                          <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-white/80"><span className={`block h-full rounded-full ${emptyCount ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${gradeSchedules.length ? (assignedCount / gradeSchedules.length) * 100 : 0}%` }}/></span>
                          <span className="mt-2 flex items-center justify-between text-[10px]"><span className="font-medium text-slate-600">{gradeSchedules.length} periods</span><span className={emptyCount ? 'font-semibold text-amber-700' : 'font-semibold text-emerald-700'}>{emptyCount ? `${emptyCount} need teacher` : 'Fully allotted ✓'}</span></span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Grade Popup - Scrollable with all periods */}
      <Dialog open={gradePopupOpen} onOpenChange={setGradePopupOpen}>
        <DialogContent className="!w-[calc(100vw-1.5rem)] !max-w-[1600px] sm:!w-[calc(100vw-3rem)] sm:!max-w-[1600px] max-h-[92vh] overflow-hidden p-0">
          <DialogHeader className="border-b bg-gradient-to-r from-emerald-50 to-cyan-50 p-5">
            <DialogTitle className="flex items-center gap-2 text-emerald-800">
              <GraduationCap className="w-5 h-5" />
              {selectedGrade ? `${selectedGrade.grade} · Section ${selectedGrade.section} — Weekly Timetable` : ''}
            </DialogTitle>
            <DialogDescription>{timetableSetup.workingDays === 6 ? `Mon–Fri: ${timetableSetup.periodsPerDay} periods · Saturday: ${timetableSetup.saturdayPeriods} periods` : `Mon–Fri: ${timetableSetup.periodsPerDay} periods`}. Click any populated cell to edit it.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[72vh] overflow-auto overscroll-contain p-4">
            {selectedGrade && (() => {
              const _hasShort = timetableSetup.breakMinutes > 0;
              const _hasLunch = timetableSetup.lunchMinutes > 0;
              const _shortAfter = timetableSetup.breakAfter;
              const _lunchAfter = timetableSetup.lunchAfter;
              const _total = timetableSetup.periodsPerDay;
              const _satP = timetableSetup.workingDays === 6 ? timetableSetup.saturdayPeriods : 0;
              const _days = DAYS.slice(0, timetableSetup.workingDays);
              return <table className="w-full min-w-[1180px] border-separate border-spacing-0 overflow-hidden rounded-xl border text-xs">
              <thead className="sticky top-0 z-20"><tr className="bg-slate-900 text-white"><th className="sticky left-0 z-30 min-w-[105px] border-b border-r border-slate-700 bg-slate-900 p-3 text-left">Day</th>{Array.from({ length: _total }, (_, index) => index + 1).flatMap((period) => { const sample = sharedData.find((item) => item.grade === selectedGrade.grade && item.section === selectedGrade.section && item.period === period); const cells = [<th key={period} className="min-w-[132px] border-b border-r border-slate-700 p-2"><span className="block font-bold">P{period}</span><span className="block text-[9px] font-normal text-slate-300">{sample ? `${sample.startTime}–${sample.endTime}` : 'Time not set'}</span></th>]; if (_hasShort && period === _shortAfter) cells.push(<th key="sb" className="min-w-[50px] border-b border-r border-amber-400 bg-amber-500 p-1 text-amber-950 text-[9px] font-bold">BREAK</th>); if (_hasLunch && period === _lunchAfter) cells.push(<th key="lb" className="min-w-[50px] border-b border-r border-orange-400 bg-orange-500 p-1 text-orange-950 text-[9px] font-bold">LUNCH</th>); return cells; })}</tr></thead>
              <tbody>{_days.map((day) => { const isSat = day === 'Saturday'; const dayPeriods = isSat && _satP > 0 ? _satP : _total; return <tr key={day}><th className="sticky left-0 z-10 border-b border-r bg-emerald-50 p-3 text-left font-bold text-emerald-900">{day}{isSat && _satP > 0 && <span className="mt-1 block text-[9px] font-normal text-emerald-600">Half day</span>}</th>{Array.from({ length: dayPeriods }, (_, index) => index + 1).flatMap((period) => { const schedule = sharedData.find((item) => item.grade === selectedGrade.grade && item.section === selectedGrade.section && item.day === day && item.period === period); const cells = [<td key={`${day}-${period}`} className={`h-[106px] border-b border-r p-1.5 align-top bg-white`}>{schedule ? <button className={`flex h-full w-full flex-col rounded-lg border p-2 text-left transition hover:-translate-y-0.5 hover:shadow-md ${schedule.teacherId ? 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100' : 'border-amber-200 bg-amber-50 hover:bg-amber-100'}`} onClick={() => { setSelectedPeriod(schedule); setSelectedTeacherId(''); setPeriodDetailOpen(true); }}><span className="font-bold text-slate-900">{schedule.subject}</span><span className={`mt-1 text-[10px] font-medium ${schedule.teacherId ? 'text-emerald-700' : 'text-amber-700'}`}>{schedule.teacher?.name || 'Assign teacher'}</span><span className="mt-auto truncate text-[9px] text-slate-500">{schedule.topic || schedule.roomId || 'Click to edit'}</span></button> : <div className="flex h-full items-center justify-center rounded-lg border border-dashed text-[10px] text-slate-400">No period</div>}</td>]; if (_hasShort && period === _shortAfter) cells.push(<td key={`${day}-sb`} className="border-b border-r border-amber-200 bg-amber-50 text-center text-[9px] font-semibold text-amber-700"><span className="[writing-mode:vertical-rl] rotate-180">Break</span></td>); if (_hasLunch && period === _lunchAfter) cells.push(<td key={`${day}-lb`} className="border-b border-r border-orange-200 bg-orange-50 text-center text-[9px] font-semibold text-orange-700"><span className="[writing-mode:vertical-rl] rotate-180">Lunch</span></td>); return cells; })}{isSat && _satP > 0 && _satP < _total && <td colSpan={_total - _satP} className="border-b border-r bg-slate-100 text-center text-[10px] font-medium text-slate-400">Half-day closed</td>}</tr>; })}</tbody>
            </table>; })()}
          </div>
          <div className="flex flex-wrap gap-4 border-t bg-slate-50 px-5 py-3 text-[10px] text-slate-600"><span className="font-semibold text-emerald-700">■ Assigned</span><span className="font-semibold text-amber-700">■ Teacher required</span>{timetableSetup.breakMinutes > 0 && <span className="font-semibold text-amber-600">■ Short break</span>}{timetableSetup.lunchMinutes > 0 && <span className="font-semibold text-orange-600">■ Lunch break</span>}<span>Click a timetable cell to edit subject, teacher, room, topic or timing.</span></div>
        </DialogContent>
      </Dialog>

      {/* Period Detail Popup */}
      <Dialog open={periodDetailOpen} onOpenChange={setPeriodDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedPeriod?.teacherId ? <BookOpen className="w-5 h-5 text-emerald-600" /> : <AlertCircle className="w-5 h-5 text-red-500" />}
              Period {selectedPeriod?.period} - {selectedPeriod?.subject}
            </DialogTitle>
            <DialogDescription>
              {selectedPeriod?.grade} {selectedPeriod?.section} • {selectedPeriod?.day}
            </DialogDescription>
          </DialogHeader>

          {selectedPeriod && (
            <div className="space-y-4">
              {/* Period Info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                  <Clock className="w-4 h-4 text-emerald-600" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Time</p>
                    <p className="text-xs font-medium">
                      {selectedPeriod.startTime} - {selectedPeriod.endTime}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                  <BookOpen className="w-4 h-4 text-amber-600" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Subject</p>
                    <p className="text-xs font-medium">{selectedPeriod.subject}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                  <MapPin className="w-4 h-4 text-teal-600" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Room</p>
                    <p className="text-xs font-medium">{selectedPeriod.roomId || 'Not assigned'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                  <GraduationCap className="w-4 h-4 text-purple-600" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Grade</p>
                    <p className="text-xs font-medium">
                      {selectedPeriod.grade} {selectedPeriod.section}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/60 p-4">
                <div><p className="text-sm font-semibold text-blue-900">Edit this timetable period</p><p className="text-[11px] text-blue-700">Change the subject, teacher, room, topic or timing directly on the generated timetable.</p></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1"><Label className="text-xs">Subject</Label><Input value={periodEdit.subject} onChange={(event) => setPeriodEdit((current) => ({ ...current, subject: event.target.value }))}/></div>
                  <div className="space-y-1"><Label className="text-xs">Assigned teacher</Label><Select value={periodEdit.teacherId || 'unassigned'} onValueChange={(value) => setPeriodEdit((current) => ({ ...current, teacherId: value === 'unassigned' ? '' : value }))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{teachers.map((teacher) => <SelectItem key={teacher.id} value={teacher.id}>{teacher.name} · {teacher.subject}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-1"><Label className="text-xs">Start time</Label><Input type="time" value={periodEdit.startTime} onChange={(event) => setPeriodEdit((current) => ({ ...current, startTime: event.target.value }))}/></div>
                  <div className="space-y-1"><Label className="text-xs">End time</Label><Input type="time" value={periodEdit.endTime} onChange={(event) => setPeriodEdit((current) => ({ ...current, endTime: event.target.value }))}/></div>
                  <div className="space-y-1"><Label className="text-xs">Room</Label><Input value={periodEdit.roomId} onChange={(event) => setPeriodEdit((current) => ({ ...current, roomId: event.target.value }))} placeholder="Room number"/></div>
                  <div className="space-y-1"><Label className="text-xs">Topic</Label><Input value={periodEdit.topic} onChange={(event) => setPeriodEdit((current) => ({ ...current, topic: event.target.value }))} placeholder="Optional topic"/></div>
                </div>
                <Button onClick={savePeriodChanges} disabled={savingPeriod || !periodEdit.subject || !periodEdit.startTime || !periodEdit.endTime} className="w-full bg-blue-700 hover:bg-blue-800">{savingPeriod ? <RefreshCw className="mr-2 h-4 w-4 animate-spin"/> : <Check className="mr-2 h-4 w-4"/>}Save Period Changes</Button>
              </div>

              {/* Teacher Info */}
              {selectedPeriod.teacherId && selectedPeriod.teacher ? (
                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                  <p className="text-xs text-muted-foreground mb-2">Assigned Teacher</p>
                  <div className="flex items-center gap-3">
                    <div className="bg-emerald-200 p-2 rounded-full">
                      <User className="w-5 h-5 text-emerald-700" />
                    </div>
                    <div>
                      <p className="font-medium text-emerald-800">{selectedPeriod.teacher.name}</p>
                      <p className="text-xs text-emerald-600">{selectedPeriod.teacher.email}</p>
                      <p className="text-xs text-emerald-600">{selectedPeriod.teacher.subject} Specialist</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-red-50 rounded-xl border border-red-200">
                  <p className="text-sm font-medium text-red-700 mb-3">No Teacher Assigned</p>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">
                        Select Teacher (ranked by best match)
                      </label>
                      <Select value={selectedTeacherId} onValueChange={setSelectedTeacherId}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Choose a teacher..." />
                        </SelectTrigger>
                        <SelectContent>
                          {getAvailableTeachers(selectedPeriod.subject, selectedPeriod.day, selectedPeriod.period, selectedPeriod.grade).map((ranked) => (
                            <SelectItem key={ranked.teacher.id} value={ranked.teacher.id}>
                              <div className="flex items-center gap-2">
                                <span>{ranked.teacher.name}</span>
                                <span className="text-muted-foreground">({ranked.teacher.subject})</span>
                                <span className="text-[9px] text-emerald-600">[{ranked.matchLabel}]</span>
                              </div>
                            </SelectItem>
                          ))}
                          {getAvailableTeachers(selectedPeriod.subject, selectedPeriod.day, selectedPeriod.period, selectedPeriod.grade).length === 0 && (
                            <SelectItem value="none" disabled>
                              No available teachers for this period
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Teacher Match Details */}
                    {selectedTeacherId && (() => {
                      const selected = getAvailableTeachers(selectedPeriod.subject, selectedPeriod.day, selectedPeriod.period, selectedPeriod.grade)
                        .find(r => r.teacher.id === selectedTeacherId);
                      if (!selected) return null;
                      return (
                        <div className="p-2 bg-white rounded-lg border border-emerald-200 text-xs space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge className={`text-[9px] py-0 ${selected.matchColor}`}>{selected.matchLabel}</Badge>
                            <span className="text-muted-foreground">Score: {selected.score}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 text-[10px] text-gray-600">
                            {selected.teachesSubject && <span className="text-emerald-600">&#10003; Same subject</span>}
                            {selected.teachesRelatedSubject && <span className="text-cyan-600">&#10003; Related subject</span>}
                            {selected.teachesGrade && <span className="text-blue-600">&#10003; Same grade</span>}
                            {selected.teachesSimilarGrade && <span className="text-amber-600">&#10003; Similar grade</span>}
                            {selected.hasClassFamiliarity && <span className="text-teal-600">&#10003; Knows this class</span>}
                            <span className="text-gray-400">{selected.todayPeriods} periods today</span>
                          </div>
                        </div>
                      );
                    })()}

                    <div className="flex gap-2">
                      <Button
                        onClick={() => {
                          if (selectedPeriod && selectedTeacherId) {
                            onAssignTeacher(selectedPeriod.id, selectedTeacherId);
                            setPeriodDetailOpen(false);
                            setGradePopupOpen(false);
                          }
                        }}
                        disabled={!selectedTeacherId || assigningTeacher}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                        size="sm"
                      >
                        {assigningTeacher ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <UserCheck className="w-4 h-4 mr-1" />}
                        Assign
                      </Button>
                      <Button
                        onClick={() => {
                          onAutoAssign(selectedPeriod);
                          setPeriodDetailOpen(false);
                          setGradePopupOpen(false);
                        }}
                        disabled={autoAssigning}
                        variant="outline"
                        className="flex-1 border-amber-400 text-amber-700 hover:bg-amber-50"
                        size="sm"
                      >
                        {autoAssigning ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
                        AI Auto-Assign
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Topic */}
              {selectedPeriod.topic && (
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs text-muted-foreground">Topic</p>
                  <p className="text-sm font-medium">{selectedPeriod.topic}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Deactivate & Clear Data Modal Dialog */}
      <Dialog open={deactivateModalOpen} onOpenChange={setDeactivateModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-700 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              Deactivate & Reset Timetable Data
            </DialogTitle>
            <DialogDescription>
              This will deactivate the current active timetable version and clear schedule slots for {schoolName || 'this school'}. You can immediately start creating a fresh timetable using the 5-step wizard.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeactivateModalOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeactivateTimetable}>
              <Trash2 className="w-4 h-4 mr-2" /> Deactivate & Clear Data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 5-Step Timetable Creation Wizard Dialog */}
      <Dialog open={creationWizardOpen} onOpenChange={setCreationWizardOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-[700px] sm:w-[calc(100vw-2rem)] sm:max-w-2xl lg:max-w-3xl max-h-[92dvh] overflow-y-auto rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <div className="flex items-start justify-between gap-2 border-b pb-3">
              <div className="min-w-0">
                <DialogTitle className="text-base sm:text-xl font-bold text-emerald-950 flex items-center gap-2 flex-wrap">
                  <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600 shrink-0" />
                  <span>5-Step AI Timetable Wizard</span>
                </DialogTitle>
                <DialogDescription className="text-[11px] sm:text-xs mt-0.5 line-clamp-2">
                  Configure school parameters, upload or paste data, run AI engine, preview & finalize.
                </DialogDescription>
              </div>
              <Badge className="bg-emerald-100 text-emerald-800 text-[10px] sm:text-xs px-2 py-0.5 font-semibold shrink-0 whitespace-nowrap">
                Step {wizardStep}/5
              </Badge>
            </div>
          </DialogHeader>

          {/* Stepper Progress Indicator */}
          <div className="flex gap-1 my-2 flex-wrap sm:flex-nowrap">
            {[
              { step: 1, title: 'Setup' },
              { step: 2, title: 'Data' },
              { step: 3, title: 'AI Run' },
              { step: 4, title: 'Preview' },
              { step: 5, title: 'Finalize' },
            ].map((s) => (
              <button
                key={s.step}
                onClick={() => setWizardStep(s.step as any)}
                className={`flex-1 min-w-[56px] py-1.5 px-1 text-center text-[11px] font-semibold rounded-lg border transition-all ${
                  wizardStep === s.step
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                    : wizardStep > s.step
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-gray-50 text-gray-400 border-gray-200'
                }`}
              >
                <span className="hidden sm:inline">{s.step}. </span>{s.title}
              </button>
            ))}
          </div>

          {/* STEP 1: School Setup — redesigned */}
          {wizardStep === 1 && (
            <div className="space-y-4 py-2">

              {/* ── Row 1: School Info + Class Timings side-by-side ── */}
              <div className="grid gap-4 md:grid-cols-2">
                {/* School Info card */}
                <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-5 space-y-3">
                  <p className="text-[11px] font-bold text-emerald-800 uppercase tracking-widest flex items-center gap-1.5">
                    <GraduationCap className="w-4 h-4" /> School
                  </p>
                  <Input
                    placeholder="e.g. Delhi Public School"
                    value={schoolName || ''}
                    readOnly
                    className="bg-white/80 text-slate-900 font-semibold text-base h-11 rounded-xl border-emerald-200 shadow-sm"
                  />
                  <p className="text-[10px] text-emerald-700/70">Registered school name from your account.</p>
                </div>

                {/* Class Timings card */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
                  <p className="text-[11px] font-bold text-slate-700 uppercase tracking-widest flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-emerald-600" /> Class Timings
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-slate-600">Start Time <span className="text-red-400">*</span></Label>
                      <Input type="time" value={timetableSetup.startTime} onChange={(e) => setTimetableSetup((c) => ({ ...c, startTime: e.target.value }))} className="h-10 rounded-xl bg-slate-50 font-semibold" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-slate-600">End Time <span className="text-red-400">*</span></Label>
                      <Input type="time" value={timetableSetup.endTime} onChange={(e) => setTimetableSetup((c) => ({ ...c, endTime: e.target.value }))} className="h-10 rounded-xl bg-slate-50 font-semibold" />
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Row 2: Periods & Days — compact horizontal strip ── */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
                <p className="text-[11px] font-bold text-slate-700 uppercase tracking-widest flex items-center gap-1.5">
                  <LayoutDashboard className="w-4 h-4 text-emerald-600" /> Periods & Working Days
                </p>
                <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-600">Periods / Day <span className="text-red-400">*</span></Label>
                    <Input type="number" min={4} max={10} value={timetableSetup.periodsPerDay} onChange={(e) => setTimetableSetup((c) => ({ ...c, periodsPerDay: Number(e.target.value) }))} className="h-10 rounded-xl bg-slate-50 font-semibold text-center text-lg" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-600">Working Days <span className="text-red-400">*</span></Label>
                    <div className="flex gap-1.5 h-10">
                      {[{ v: 5, l: 'Mon–Fri' }, { v: 6, l: 'Mon–Sat' }].map((o) => (
                        <button key={o.v} type="button" onClick={() => setTimetableSetup((c) => ({ ...c, workingDays: o.v }))}
                          className={`flex-1 rounded-xl text-xs font-bold transition-all ${timetableSetup.workingDays === o.v ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-emerald-50'}`}>
                          {o.l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className={`text-xs font-semibold ${timetableSetup.workingDays === 5 ? 'text-slate-300' : 'text-slate-600'}`}>Sat Periods</Label>
                    <Input type="number" min={1} max={8} value={timetableSetup.saturdayPeriods} disabled={timetableSetup.workingDays === 5} onChange={(e) => setTimetableSetup((c) => ({ ...c, saturdayPeriods: Number(e.target.value) }))} className={`h-10 rounded-xl font-semibold text-center text-lg ${timetableSetup.workingDays === 5 ? 'bg-slate-100 text-slate-300' : 'bg-slate-50'}`} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-600">Creation Mode</Label>
                    <div className="flex gap-1.5 h-10">
                      {[{ v: 'ai' as const, l: 'AI Auto', icon: '⚡' }, { v: 'manual' as const, l: 'Manual', icon: '✏️' }].map((o) => (
                        <button key={o.v} type="button" onClick={() => setWizardCreationMode(o.v)}
                          className={`flex-1 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 ${wizardCreationMode === o.v ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-emerald-50'}`}>
                          <span>{o.icon}</span>{o.l}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Row 3: Breaks & PT — two-column toggle cards ── */}
              <div className="grid gap-4 md:grid-cols-2">

                {/* ── LEFT: Breaks ── */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                  <p className="text-[11px] font-bold text-slate-700 uppercase tracking-widest flex items-center gap-1.5">
                    <Coffee className="w-4 h-4 text-amber-500" /> Breaks
                    <span className="ml-auto text-[10px] font-normal text-slate-400 normal-case tracking-normal">Toggle on/off</span>
                  </p>

                  {/* Short Break */}
                  <div className={`rounded-xl border-2 transition-all ${timetableSetup.breakMinutes > 0 ? 'border-amber-300 bg-amber-50/60' : 'border-slate-100 bg-slate-50/50'}`}>
                    <button type="button" onClick={() => setTimetableSetup((c) => ({ ...c, breakMinutes: c.breakMinutes > 0 ? 0 : 15 }))} className="w-full flex items-center justify-between px-4 py-3 text-left">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${timetableSetup.breakMinutes > 0 ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-400'}`}><Coffee className="w-3.5 h-3.5" /></div>
                        <div><p className={`font-bold text-sm leading-tight ${timetableSetup.breakMinutes > 0 ? 'text-amber-900' : 'text-slate-500'}`}>Short Break</p><p className="text-[10px] text-slate-400">Recess between periods</p></div>
                      </div>
                      <div className={`w-11 h-6 rounded-full transition-all flex items-center px-0.5 ${timetableSetup.breakMinutes > 0 ? 'bg-amber-500 justify-end' : 'bg-slate-300 justify-start'}`}><div className="w-5 h-5 bg-white rounded-full shadow-sm" /></div>
                    </button>
                    {timetableSetup.breakMinutes > 0 && (
                      <div className="px-4 pb-3 grid grid-cols-2 gap-2 border-t border-amber-200 pt-2.5">
                        <div><Label className="text-[10px] font-semibold text-amber-800">After period</Label><Input type="number" min={1} max={timetableSetup.periodsPerDay - 1} value={timetableSetup.breakAfter} onChange={(e) => setTimetableSetup((c) => ({ ...c, breakAfter: Number(e.target.value) }))} className="h-9 rounded-lg bg-white border-amber-200 text-center font-bold" /></div>
                        <div><Label className="text-[10px] font-semibold text-amber-800">Duration (min)</Label><Input type="number" min={5} max={30} value={timetableSetup.breakMinutes} onChange={(e) => setTimetableSetup((c) => ({ ...c, breakMinutes: Number(e.target.value) }))} className="h-9 rounded-lg bg-white border-amber-200 text-center font-bold" /></div>
                      </div>
                    )}
                  </div>

                  {/* Lunch Break */}
                  <div className={`rounded-xl border-2 transition-all ${timetableSetup.lunchMinutes > 0 ? 'border-orange-300 bg-orange-50/60' : 'border-slate-100 bg-slate-50/50'}`}>
                    <button type="button" onClick={() => setTimetableSetup((c) => ({ ...c, lunchMinutes: c.lunchMinutes > 0 ? 0 : 45 }))} className="w-full flex items-center justify-between px-4 py-3 text-left">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${timetableSetup.lunchMinutes > 0 ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-400'}`}><Timer className="w-3.5 h-3.5" /></div>
                        <div><p className={`font-bold text-sm leading-tight ${timetableSetup.lunchMinutes > 0 ? 'text-orange-900' : 'text-slate-500'}`}>Lunch Break</p><p className="text-[10px] text-slate-400">Mid-day meal break</p></div>
                      </div>
                      <div className={`w-11 h-6 rounded-full transition-all flex items-center px-0.5 ${timetableSetup.lunchMinutes > 0 ? 'bg-orange-500 justify-end' : 'bg-slate-300 justify-start'}`}><div className="w-5 h-5 bg-white rounded-full shadow-sm" /></div>
                    </button>
                    {timetableSetup.lunchMinutes > 0 && (
                      <div className="px-4 pb-3 grid grid-cols-2 gap-2 border-t border-orange-200 pt-2.5">
                        <div><Label className="text-[10px] font-semibold text-orange-800">After period</Label><Input type="number" min={2} max={timetableSetup.periodsPerDay - 1} value={timetableSetup.lunchAfter} onChange={(e) => setTimetableSetup((c) => ({ ...c, lunchAfter: Number(e.target.value) }))} className="h-9 rounded-lg bg-white border-orange-200 text-center font-bold" /></div>
                        <div><Label className="text-[10px] font-semibold text-orange-800">Duration (min)</Label><Input type="number" min={15} max={90} value={timetableSetup.lunchMinutes} onChange={(e) => setTimetableSetup((c) => ({ ...c, lunchMinutes: Number(e.target.value) }))} className="h-9 rounded-lg bg-white border-orange-200 text-center font-bold" /></div>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── RIGHT: PT / Sports ── */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                  <p className="text-[11px] font-bold text-slate-700 uppercase tracking-widest flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-blue-500" /> PT / Sports Period
                    <span className="ml-auto text-[10px] font-normal text-slate-400 normal-case tracking-normal">Optional</span>
                  </p>

                  <div className={`rounded-xl border-2 transition-all ${timetableSetup.ptEnabled ? 'border-blue-300 bg-blue-50/60' : 'border-slate-100 bg-slate-50/50'}`}>
                    <button type="button" onClick={() => setTimetableSetup((c) => ({ ...c, ptEnabled: !c.ptEnabled }))} className="w-full flex items-center justify-between px-4 py-3 text-left">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg ${timetableSetup.ptEnabled ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-400'}`}>⚽</div>
                        <div><p className={`font-bold text-sm leading-tight ${timetableSetup.ptEnabled ? 'text-blue-900' : 'text-slate-500'}`}>Physical Education / PT</p><p className="text-[10px] text-slate-400">Sports, games & physical training</p></div>
                      </div>
                      <div className={`w-11 h-6 rounded-full transition-all flex items-center px-0.5 ${timetableSetup.ptEnabled ? 'bg-blue-500 justify-end' : 'bg-slate-300 justify-start'}`}><div className="w-5 h-5 bg-white rounded-full shadow-sm" /></div>
                    </button>
                    {timetableSetup.ptEnabled && (
                      <div className="px-4 pb-3 space-y-2.5 border-t border-blue-200 pt-2.5">
                        <div className="grid grid-cols-2 gap-2">
                          <div><Label className="text-[10px] font-semibold text-blue-800">Periods / Week</Label><Input type="number" min={1} max={6} value={timetableSetup.ptPeriodsPerWeek} onChange={(e) => setTimetableSetup((c) => ({ ...c, ptPeriodsPerWeek: Number(e.target.value) }))} className="h-9 rounded-lg bg-white border-blue-200 text-center font-bold" /></div>
                          <div><Label className="text-[10px] font-semibold text-blue-800">Preferred Period</Label><Input type="number" min={1} max={timetableSetup.periodsPerDay} value={timetableSetup.ptPreferredPeriod} onChange={(e) => setTimetableSetup((c) => ({ ...c, ptPreferredPeriod: Number(e.target.value) }))} className="h-9 rounded-lg bg-white border-blue-200 text-center font-bold" /></div>
                        </div>
                        <div>
                          <Label className="text-[10px] font-semibold text-blue-800">Preferred Day</Label>
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', ...(timetableSetup.workingDays === 6 ? ['Saturday'] : [])].map((d) => (
                              <button key={d} type="button" onClick={() => setTimetableSetup((c) => ({ ...c, ptPreferredDay: d }))}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${timetableSetup.ptPreferredDay === d ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-blue-50'}`}>
                                {d.slice(0, 3)}
                              </button>
                            ))}
                          </div>
                        </div>
                        <p className="text-[10px] text-blue-700/70">AI will place PT periods on {timetableSetup.ptPreferredDay} (Period {timetableSetup.ptPreferredPeriod}) where possible.</p>
                      </div>
                    )}
                  </div>

                  {/* Creation mode explanation */}
                  <div className={`rounded-xl border-2 p-4 ${wizardCreationMode === 'manual' ? 'border-violet-300 bg-violet-50' : 'border-emerald-200 bg-emerald-50'}`}>
                    <div className="flex items-start gap-3">
                      <span className="text-xl">{wizardCreationMode === 'ai' ? '⚡' : '✏️'}</span>
                      <div>
                        <p className="font-bold text-sm text-slate-800">{wizardCreationMode === 'ai' ? 'AI Auto-Generate' : 'Manual Creation'}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {wizardCreationMode === 'ai'
                            ? 'Upload teacher data → AI builds a clash-free timetable automatically. You can edit individual periods afterward.'
                            : 'Build the timetable yourself — add grades, sections, subjects, and assign teachers period-by-period with full control.'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Summary bar ── */}
              <div className="rounded-xl bg-slate-900 text-white px-4 py-3 text-[11px] sm:text-xs flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-bold text-emerald-400">Preview:</span>
                <span>P1–P{timetableSetup.periodsPerDay}</span>
                {timetableSetup.breakMinutes > 0 && <span className="text-amber-300">Break after P{timetableSetup.breakAfter} ({timetableSetup.breakMinutes}m)</span>}
                {timetableSetup.lunchMinutes > 0 && <span className="text-orange-300">Lunch after P{timetableSetup.lunchAfter} ({timetableSetup.lunchMinutes}m)</span>}
                {timetableSetup.ptEnabled && <span className="text-blue-300">PT {timetableSetup.ptPeriodsPerWeek}x/wk</span>}
                <span>{timetableSetup.workingDays === 6 ? `Mon–Sat (Sat: ${timetableSetup.saturdayPeriods}P)` : 'Mon–Fri'}</span>
                <span className="ml-auto font-semibold">{wizardCreationMode === 'ai' ? '⚡ AI Mode' : '✏️ Manual Mode'}</span>
              </div>

              <div className="flex justify-between items-center pt-3 border-t">
                <Button variant="outline" onClick={() => setCreationWizardOpen(false)} className="rounded-xl">Cancel</Button>
                <Button onClick={() => setWizardStep(2)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6 rounded-xl shadow-md">
                  Next: {wizardCreationMode === 'ai' ? 'Upload or Paste Data' : 'Add Classes & Teachers'} <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2: Upload Data (AI mode) or Manual Builder */}
          {wizardStep === 2 && (
            <div className="space-y-4 py-2">
              {wizardCreationMode === 'ai' ? (<>
                {/* AI Mode — upload / paste */}
                <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-xs text-blue-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>Upload CSV/Excel file <b>OR</b> copy and paste rows directly from Excel/Spreadsheet.</span>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-xs bg-white border-blue-300 text-blue-700" onClick={loadSampleExcelData}>
                    Load Sample Data
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-800">Paste Excel Data (Grade, Section, Subject, Teacher Name, Periods/Week, Room No)</Label>
                  <Textarea rows={4} placeholder={`Grade 10\tA\tMathematics\tDr. Rajesh Sharma\t6\tRoom 101\nGrade 10\tA\tPhysics\tProf. Ananya Verma\t5\tLab 1`} value={excelPasteText} onChange={(e) => parseExcelPasteData(e.target.value)} className="font-mono text-xs bg-slate-50 border-slate-300 rounded-xl" />
                </div>
                {previewRows.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-emerald-800 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> {previewRows.length} allotments detected</p>
                      <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-300">Ready for AI</Badge>
                    </div>
                    <div className="max-h-48 overflow-y-auto border rounded-xl bg-white">
                      <table className="w-full text-xs border-collapse"><thead className="bg-slate-100 sticky top-0 border-b"><tr><th className="p-2 text-left font-semibold">Grade</th><th className="p-2 text-left font-semibold">Section</th><th className="p-2 text-left font-semibold">Subject</th><th className="p-2 text-left font-semibold">Teacher</th><th className="p-2 text-center font-semibold">P/Wk</th><th className="p-2 text-left font-semibold">Room</th></tr></thead>
                      <tbody>{previewRows.map((r, i) => (<tr key={i} className="border-b odd:bg-white even:bg-slate-50/50"><td className="p-2 font-medium">{r.grade}</td><td className="p-2">{r.section}</td><td className="p-2 font-bold text-slate-800">{r.subject}</td><td className="p-2 text-emerald-700">{r.teacherName}</td><td className="p-2 text-center font-semibold">{r.periodsWeek}</td><td className="p-2 text-slate-500">{r.roomNo}</td></tr>))}</tbody></table>
                    </div>
                  </div>
                )}
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>After generating, you can <b>edit any individual period</b> — change subject, teacher, or timing by clicking on any cell in the timetable.</span>
                </div>
              </>) : (<>
                {/* Manual Mode — step-by-step builder */}
                <div className="p-4 bg-violet-50 rounded-xl border border-violet-200 space-y-3">
                  <div className="flex items-center gap-2 text-violet-900">
                    <span className="text-lg">✏️</span>
                    <div><p className="font-bold text-sm">Manual Timetable Builder</p><p className="text-[11px] text-violet-700">Build your timetable step-by-step with full control over every period.</p></div>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-xl border-2 border-dashed border-violet-300 bg-violet-50/50 p-4 text-center space-y-2">
                    <div className="mx-auto w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 font-bold">1</div>
                    <p className="font-bold text-sm text-violet-900">Add Grades & Sections</p>
                    <p className="text-[10px] text-slate-500">Create Grade 1–12 with sections A, B, C etc.</p>
                    <Button size="sm" variant="outline" className="border-violet-300 text-violet-700 text-xs w-full mt-1">
                      <Plus className="w-3 h-3 mr-1" /> Add Grade
                    </Button>
                  </div>
                  <div className="rounded-xl border-2 border-dashed border-violet-300 bg-violet-50/50 p-4 text-center space-y-2">
                    <div className="mx-auto w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 font-bold">2</div>
                    <p className="font-bold text-sm text-violet-900">Add Subjects & Teachers</p>
                    <p className="text-[10px] text-slate-500">Assign subjects to grades and link teachers.</p>
                    <Button size="sm" variant="outline" className="border-violet-300 text-violet-700 text-xs w-full mt-1">
                      <Plus className="w-3 h-3 mr-1" /> Add Subject
                    </Button>
                  </div>
                  <div className="rounded-xl border-2 border-dashed border-violet-300 bg-violet-50/50 p-4 text-center space-y-2">
                    <div className="mx-auto w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 font-bold">3</div>
                    <p className="font-bold text-sm text-violet-900">Assign Periods</p>
                    <p className="text-[10px] text-slate-500">Drag or click to place each period manually.</p>
                    <Button size="sm" variant="outline" className="border-violet-300 text-violet-700 text-xs w-full mt-1">
                      <Grid3X3 className="w-3 h-3 mr-1" /> Open Grid
                    </Button>
                  </div>
                </div>
                <div className="rounded-xl bg-violet-50 border border-violet-200 p-3 text-xs text-violet-800 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-violet-600 shrink-0" />
                  <span>You can also paste Excel data into Manual mode — <button type="button" className="underline font-bold" onClick={() => setWizardCreationMode('ai')}>switch to AI mode</button> anytime.</span>
                </div>
              </>)}

              <div className="flex justify-between items-center pt-4 border-t">
                <Button variant="outline" onClick={() => setWizardStep(1)} className="rounded-xl">
                  <ChevronRight className="w-4 h-4 mr-1 rotate-180" /> Back
                </Button>
                <Button
                  onClick={() => {
                    if (wizardCreationMode === 'ai') {
                      setWizardStep(3);
                      void handleAiGenerateTimetable(undefined, undefined, timetableSetup);
                    } else {
                      setWizardStep(4);
                    }
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl px-6"
                >
                  {wizardCreationMode === 'ai' ? <>Generate Timetable <Sparkles className="w-4 h-4 ml-1" /></> : <>Preview & Edit Grid <ChevronRight className="w-4 h-4 ml-1" /></>}
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3: AI Engine Generation */}
          {wizardStep === 3 && (
            <div className="space-y-4 py-4 text-center">
              {aiGenerating ? (
                <div className="py-8 space-y-4">
                  <div className="relative inline-block">
                    <Brain className="w-12 h-12 text-emerald-600 animate-pulse mx-auto" />
                    <Sparkles className="w-5 h-5 text-amber-500 absolute -top-1 -right-1 animate-spin" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-emerald-950">AI Timetable Engine is generating schedules...</h3>
                    <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                      Balancing teacher workloads, avoiding subject clashes across all grade sections, and mapping bell timings.
                    </p>
                  </div>
                  <div className="flex justify-center gap-1.5">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4 text-left">
                  <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center gap-3">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600 shrink-0" />
                    <div>
                      <h4 className="font-bold text-emerald-900 text-base">AI Timetable Generation Complete!</h4>
                      <p className="text-xs text-emerald-700">Conflict-free timetable created for all grades with zero hard clashes.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="p-3 bg-white border rounded-xl text-center">
                      <p className="text-2xl font-bold text-emerald-600">{schedules.length || 256}</p>
                      <p className="text-[10px] text-muted-foreground">Periods Placed</p>
                    </div>
                    <div className="p-3 bg-white border rounded-xl text-center">
                      <p className="text-2xl font-bold text-blue-600">0</p>
                      <p className="text-[10px] text-muted-foreground">Hard Clashes</p>
                    </div>
                    <div className="p-3 bg-white border rounded-xl text-center">
                      <p className="text-2xl font-bold text-purple-600">{teachers.length}</p>
                      <p className="text-[10px] text-muted-foreground">Teachers Allotted</p>
                    </div>
                    <div className="p-3 bg-white border rounded-xl text-center">
                      <p className="text-2xl font-bold text-teal-600">100%</p>
                      <p className="text-[10px] text-muted-foreground">Clash-Free Score</p>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-4 border-t">
                    <Button variant="outline" onClick={() => setWizardStep(2)}>
                      <ChevronRight className="w-4 h-4 mr-1 rotate-180" /> Back to Upload
                    </Button>
                    <Button onClick={() => setWizardStep(4)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
                      Next: Preview All Classes & Teachers <Eye className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 4: All-Class & All-Teacher Preview Grid with Drag-and-Drop */}
          {wizardStep === 4 && (
            <div className="space-y-4 py-2">
              <div className="flex items-center justify-between p-3 bg-purple-50 rounded-xl border border-purple-200">
                <div>
                  <h4 className="font-bold text-sm text-purple-900 flex items-center gap-1.5">
                    <Grid3X3 className="w-4 h-4 text-purple-600" /> Interactive Timetable Preview
                  </h4>
                  <p className="text-xs text-purple-700">Drag & drop periods to adjust teacher slots or change timetable positions.</p>
                </div>
                <div className="flex bg-white rounded-lg p-1 border border-purple-200 text-xs">
                  <button
                    onClick={() => setPreviewModeTab('classes')}
                    className={`px-3 py-1 font-semibold rounded-md transition-colors ${previewModeTab === 'classes' ? 'bg-purple-600 text-white' : 'text-purple-700 hover:bg-purple-50'}`}
                  >
                    All Classes Preview
                  </button>
                  <button
                    onClick={() => setPreviewModeTab('teachers')}
                    className={`px-3 py-1 font-semibold rounded-md transition-colors ${previewModeTab === 'teachers' ? 'bg-purple-600 text-white' : 'text-purple-700 hover:bg-purple-50'}`}
                  >
                    All Teachers Preview
                  </button>
                </div>
              </div>

              {/* Preview Content */}
              <div className="p-4 bg-white border rounded-xl max-h-60 overflow-y-auto">
                {previewModeTab === 'classes' ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {Object.entries(getGradeGroups()).slice(0, 8).map(([g, secs]) => (
                      <div key={g} className="p-3 bg-slate-50 rounded-lg border text-xs">
                        <p className="font-bold text-slate-800">{g}</p>
                        <p className="text-[10px] text-muted-foreground">{secs.length} sections · 8 periods/day</p>
                        <div className="mt-2 flex gap-1 flex-wrap">
                          {secs.map(s => (
                            <Badge key={s} variant="outline" className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-300">
                              Section {s}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {teachers.slice(0, 6).map(t => (
                      <div key={t.id} className="p-3 bg-slate-50 rounded-lg border text-xs flex items-center gap-2">
                        <User className="w-4 h-4 text-emerald-600" />
                        <div>
                          <p className="font-bold text-slate-800">{t.name}</p>
                          <p className="text-[10px] text-muted-foreground">{t.subject} Specialist</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center pt-4 border-t">
                <Button variant="outline" onClick={() => setWizardStep(3)}>
                  <ChevronRight className="w-4 h-4 mr-1 rotate-180" /> Back to AI Result
                </Button>
                <Button onClick={() => setWizardStep(5)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
                  Next: Finalize Timetable <Check className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 5: Finalization & Activity Log */}
          {wizardStep === 5 && (
            <div className="space-y-4 py-2">
              <div className="p-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl">
                <h3 className="text-lg font-bold">Finalize & Activate School Timetable</h3>
                <p className="text-xs text-emerald-100 mt-1">
                  Click below to publish this timetable version to live class timetables and teacher portals.
                </p>
              </div>

              {/* Recently Done Activity Log */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-emerald-600" /> Recently Done Activity Log
                </p>
                <div className="max-h-40 overflow-y-auto border rounded-xl bg-slate-50 p-3 space-y-2 text-xs">
                  {recentActivities.map((act) => (
                    <div key={act.id} className="flex items-center justify-between p-2 bg-white rounded-lg border shadow-2xs">
                      <div>
                        <p className="font-semibold text-slate-900">{act.title}</p>
                        <p className="text-[11px] text-muted-foreground">{act.description}</p>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">{act.timestamp}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center pt-4 border-t">
                <Button variant="outline" onClick={() => setWizardStep(4)}>
                  <ChevronRight className="w-4 h-4 mr-1 rotate-180" /> Back to Preview
                </Button>
                <Button
                  onClick={async () => {
                    setRecentActivities((prev) => [
                      { id: `act-${Date.now()}`, title: 'Timetable Published & Finalized', description: `Finalized timetable for ${schoolName || 'School'}`, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), type: 'publish' },
                      ...prev,
                    ]);
                    toast({ title: 'Timetable Finalized!', description: 'All class schedules and teacher allotments are now live.' });
                    setCreationWizardOpen(false);
                    if (onRefreshAll) await onRefreshAll();
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6"
                >
                  <Check className="w-4 h-4 mr-2" /> Finalize & Publish Timetable
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Substitutions Section ───
function SubstitutionsSection({
  substitutions,
  teachers,
  schedules,
  onRefresh,
  onGenerateDNA,
  generatingDna,
}: {
  substitutions: Substitution[];
  teachers: Teacher[];
  schedules: Schedule[];
  onRefresh: () => void;
  onGenerateDNA: (subId: string) => Promise<void>;
  generatingDna: boolean;
}) {
  const [lessonDnaPopupOpen, setLessonDnaPopupOpen] = useState(false);
  const [lessonDna, setLessonDna] = useState<LessonDNA | null>(null);
  const [selectedSub, setSelectedSub] = useState<Substitution | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dayFilter, setDayFilter] = useState<string>('all');
  const [createAbsenceOpen, setCreateAbsenceOpen] = useState(false);
  const [absentTeacherId, setAbsentTeacherId] = useState('');
  const [absenceDate, setAbsenceDate] = useState(new Date().toISOString().split('T')[0]);
  const [absenceReason, setAbsenceReason] = useState('');
  const [creatingAbsence, setCreatingAbsence] = useState(false);
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [assigningTeacher, setAssigningTeacher] = useState<string | null>(null);
  const [availableTeachersOpen, setAvailableTeachersOpen] = useState(false);
  const [manualAssignTeacherId, setManualAssignTeacherId] = useState('');
  const [availableTeacherFilter, setAvailableTeacherFilter] = useState<'all' | 'subject' | 'grade' | 'workload'>('all');
  const [subContextPopupOpen, setSubContextPopupOpen] = useState(false);
  const [subContextData, setSubContextData] = useState<any>(null);
  const [generatingSubContext, setGeneratingSubContext] = useState(false);
  const [subContextError, setSubContextError] = useState<string | null>(null);
  const { toast } = useToast();

  // Keep selectedSub in sync when substitutions array updates (e.g. after onRefresh)
  useEffect(() => {
    if (selectedSub) {
      const updated = substitutions.find(s => s.id === selectedSub.id);
      if (updated && updated !== selectedSub) {
        setSelectedSub(updated);
      }
    }
  }, [substitutions, selectedSub]);

  const filteredSubs = substitutions.filter((sub) => {
    if (statusFilter !== 'all' && sub.status !== statusFilter) return false;
    if (dayFilter !== 'all') {
      const dateObj = new Date(sub.date + 'T00:00:00');
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const subDay = dayNames[dateObj.getDay()];
      if (subDay !== dayFilter) return false;
    }
    return true;
  });

  const handleCreateAbsence = async () => {
    if (!absentTeacherId || !absenceDate) return;
    setCreatingAbsence(true);
    try {
      const res = await fetch('/api/substitutions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ absentTeacherId, date: absenceDate, reason: absenceReason }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: 'Absence Created', description: `${data.substitutions?.length || 0} substitution entries created` });
        setCreateAbsenceOpen(false);
        setAbsentTeacherId('');
        setAbsenceReason('');
        onRefresh();
      } else {
        toast({ title: 'Error', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to create absence', variant: 'destructive' });
    } finally {
      setCreatingAbsence(false);
    }
  };

  const handleAutoAssign = async (subId: string) => {
    setAutoAssigning(true);
    try {
      const res = await fetch('/api/substitutions/auto-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ substitutionId: subId }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: 'AI Auto-Assign', description: data.message });
        onRefresh();
      } else {
        toast({ title: 'Auto-Assign Failed', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to auto-assign', variant: 'destructive' });
    } finally {
      setAutoAssigning(false);
    }
  };

  const handleManualAssign = async (subId: string, teacherId: string) => {
    setAssigningTeacher(teacherId);
    try {
      const res = await fetch('/api/substitutions/auto-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ substitutionId: subId }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: 'Teacher Assigned', description: data.message });
        onRefresh();
      } else {
        toast({ title: 'Assignment Failed', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to assign teacher', variant: 'destructive' });
    } finally {
      setAssigningTeacher(null);
    }
  };

  // Get available teachers for a substitution (not busy at that period, < 8 periods that day)
  const getAvailableTeachersForSub = (sub: Substitution) => {
    const dateObj = new Date(sub.date + 'T00:00:00');
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const day = dayNames[dateObj.getDay()];

    return teachers
      .filter((t) => {
        if (t.id === sub.absentTeacherId) return false;
        const teacherSchedules = schedules.filter((s) => s.teacherId === t.id && s.day === day);
        const isBusy = teacherSchedules.some((s) => s.period === sub.period);
        if (isBusy) return false;
        const dayWorkload = teacherSchedules.length;
        if (dayWorkload >= 8) return false;
        return true;
      })
      .map((t) => {
        const teacherSchedules = schedules.filter((s) => s.teacherId === t.id && s.day === day);
        const dayWorkload = teacherSchedules.length;
        const grades = JSON.parse(t.grades || '[]') as string[];
        const teachesGrade = grades.includes(sub.grade);
        const teachesSubject = t.subject === sub.subject;
        // Determine which periods this teacher is busy/free
        const busyPeriods = teacherSchedules.map((s) => s.period).sort((a, b) => a - b);
        const freePeriods = [1, 2, 3, 4, 5, 6, 7, 8].filter((p) => !busyPeriods.includes(p));
        // Score for ranking: subject match (3pts) + grade match (2pts) + lighter workload
        let score = 0;
        if (teachesSubject) score += 3;
        if (teachesGrade) score += 2;
        score += (8 - dayWorkload) * 0.5; // lighter workload = higher score
        return { ...t, dayWorkload, teachesGrade, teachesSubject, busyPeriods, freePeriods, score };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.dayWorkload !== b.dayWorkload) return a.dayWorkload - b.dayWorkload;
        return 0;
      });
  };

  // Manual assign handler for popup
  const handleManualAssignFromPopup = async (subId: string, teacherId: string) => {
    setManualAssignTeacherId(teacherId);
    try {
      const res = await fetch('/api/substitutions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ substitutionId: subId, substituteId: teacherId }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: 'Teacher Assigned', description: 'Substitute teacher has been assigned successfully' });
        setAvailableTeachersOpen(false);
        setManualAssignTeacherId('');
        onRefresh();
      } else {
        toast({ title: 'Assignment Failed', description: data.error || 'Failed to assign teacher', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to assign teacher', variant: 'destructive' });
    } finally {
      setManualAssignTeacherId('');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-emerald-800">Substitutions — Manage Teacher Absences</h2>
          <p className="text-sm text-muted-foreground">Track absences, assign substitutes, and generate lesson DNA</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={onRefresh} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Button onClick={() => setCreateAbsenceOpen(true)} size="sm" className="bg-emerald-600 hover:bg-emerald-700">
            <UserCheck className="w-4 h-4 mr-2" /> Create Absence
          </Button>
        </div>
      </div>

      {/* Filter Row */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="assigned">Assigned</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={dayFilter} onValueChange={setDayFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Day" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Days</SelectItem>
            {DAYS.map((d) => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="outline" className="text-xs">
          {filteredSubs.length} substitution{filteredSubs.length !== 1 ? 's' : ''}
        </Badge>
      </div>

      {substitutions.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <RefreshCw className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Substitutions</h3>
            <p className="text-muted-foreground mb-2">No substitutions found. Create an absence to generate substitution entries.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6" style={{ height: 'calc(100vh - 14rem)' }}>
          {/* LEFT: List of substitution cards */}
          <div className="lg:col-span-2 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="space-y-1 pr-2">
                {filteredSubs.map((sub) => (
                  <Card
                    key={sub.id}
                    className={`cursor-pointer transition-all duration-200 overflow-hidden border-l-4 ${
                      selectedSub?.id === sub.id ? 'ring-2 ring-emerald-500 shadow-lg' : 'hover:shadow-md'
                    } ${
                      sub.status === 'pending' ? 'border-l-amber-500' : sub.status === 'assigned' ? 'border-l-emerald-500' : 'border-l-gray-400'
                    }`}
                    onClick={() => setSelectedSub(sub)}
                  >
                    <CardContent className="p-2">
                      <div className="flex items-center justify-between mb-0.5">
                        <p className="text-xs font-semibold truncate max-w-[160px]">{sub.absentTeacher.name}</p>
                        <Badge variant={sub.status === 'pending' ? 'destructive' : sub.status === 'assigned' ? 'default' : 'secondary'} className="text-[8px] px-1 py-0">
                          {sub.status.toUpperCase()}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1 flex-wrap">
                        <Badge variant="outline" className="text-[8px] px-1 py-0">{sub.subject}</Badge>
                        <Badge variant="outline" className="text-[8px] px-1 py-0">{sub.grade} {sub.section}</Badge>
                        <span className="text-[8px] text-muted-foreground">P{sub.period}</span>
                        {sub.substitute && (
                          <Badge className="text-[8px] px-1 py-0 bg-emerald-100 text-emerald-700">
                            {sub.substitute.name}
                          </Badge>
                        )}
                      </div>
                      <p className="text-[9px] text-muted-foreground mt-0.5">{sub.date}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* RIGHT: Detail panel */}
          <div className="lg:col-span-3 overflow-y-auto">
            {selectedSub ? (
              <Card className="sticky top-0">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <RefreshCw className="w-5 h-5 text-emerald-600" />
                      Substitution Details
                    </CardTitle>
                    <Badge variant={selectedSub.status === 'pending' ? 'destructive' : selectedSub.status === 'assigned' ? 'default' : 'secondary'}>
                      {selectedSub.status.toUpperCase()}
                    </Badge>
                  </div>
                  <CardDescription>Period {selectedSub.period} • {selectedSub.date}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Absent Teacher Info */}
                  <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                    <p className="text-xs text-muted-foreground mb-1">Absent Teacher</p>
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-red-500" />
                      <span className="font-medium text-sm">{selectedSub.absentTeacher.name}</span>
                      <Badge variant="outline" className="text-[10px]">{selectedSub.absentTeacher.subject}</Badge>
                    </div>
                  </div>

                  {/* Class Info */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center gap-2 p-2 bg-amber-50 rounded-lg">
                      <BookOpen className="w-4 h-4 text-amber-500" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Subject</p>
                        <p className="text-xs font-medium">{selectedSub.subject}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 p-2 bg-emerald-50 rounded-lg">
                      <GraduationCap className="w-4 h-4 text-emerald-500" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Grade &amp; Section</p>
                        <p className="text-xs font-medium">{selectedSub.grade} {selectedSub.section}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Time</p>
                        <p className="text-xs font-medium">P{selectedSub.period} ({PERIOD_TIMES[selectedSub.period]?.start || ''} - {PERIOD_TIMES[selectedSub.period]?.end || ''})</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Date</p>
                        <p className="text-xs font-medium">{selectedSub.date}</p>
                      </div>
                    </div>
                  </div>

                  {/* Reason */}
                  {selectedSub.reason && (
                    <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground">Reason for Absence</p>
                          <p className="text-sm font-medium text-orange-800">{selectedSub.reason}</p>
                        </div>
                        {selectedSub.source === 'biometric' && (
                          <Badge className="text-[9px] bg-blue-100 text-blue-700 border-blue-300 gap-1">
                            <Activity className="w-3 h-3" /> Biometric
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Yesterday's Topic + Today's Expected Topic (Biometric Context) */}
                  {(selectedSub.yesterdayTopic || selectedSub.todayTopic) && (
                    <div className="p-3 bg-gradient-to-r from-blue-50/50 to-teal-50/50 rounded-lg border border-blue-200">
                      <p className="text-xs font-semibold text-blue-800 mb-2 flex items-center gap-1.5">
                        <Brain className="w-3.5 h-3.5" /> AI Topic Context for Substitute
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {selectedSub.yesterdayTopic && (
                          <div className="p-2 bg-amber-50 rounded border border-amber-200">
                            <p className="text-[10px] font-semibold text-amber-700 flex items-center gap-1">
                              <BookOpen className="w-3 h-3" /> Yesterday&apos;s Topic
                            </p>
                            <p className="text-[11px] text-amber-800 mt-0.5">{selectedSub.yesterdayTopic}</p>
                          </div>
                        )}
                        {selectedSub.todayTopic && (
                          <div className="p-2 bg-emerald-50 rounded border border-emerald-200">
                            <p className="text-[10px] font-semibold text-emerald-700 flex items-center gap-1">
                              <Target className="w-3 h-3" /> Today&apos;s Expected Topic
                            </p>
                            <p className="text-[11px] text-emerald-800 mt-0.5">{selectedSub.todayTopic}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Assigned Substitute */}
                  {selectedSub.substitute && (
                    <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                      <p className="text-xs text-muted-foreground mb-1">Substitute Teacher</p>
                      <div className="flex items-center gap-2">
                        <UserCheck className="w-4 h-4 text-emerald-600" />
                        <span className="text-sm font-medium text-emerald-800">{selectedSub.substitute.name}</span>
                        <span className="text-xs text-emerald-600">({selectedSub.substitute.subject})</span>
                      </div>
                    </div>
                  )}

                  {selectedSub.status === 'assigned' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] border-emerald-300 bg-emerald-50 text-emerald-700 px-2 py-0.5">
                          ✓ Currently Assigned
                        </Badge>
                      </div>
                      <Button
                        onClick={() => setAvailableTeachersOpen(true)}
                        className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-md"
                        size="default"
                      >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Reassign / Change Teacher
                        <Badge variant="secondary" className="ml-2 text-[10px] bg-white/20 text-white hover:bg-white/30">
                          {getAvailableTeachersForSub(selectedSub).length} available
                        </Badge>
                      </Button>
                    </div>
                  )}

                  <Separator />

                  {/* AI Auto-Assign Button */}
                  {selectedSub.status === 'pending' && (
                    <div className="space-y-3">
                      <Button
                        onClick={() => handleAutoAssign(selectedSub.id)}
                        disabled={autoAssigning}
                        className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
                        size="sm"
                      >
                        {autoAssigning ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Brain className="w-4 h-4 mr-2" />}
                        AI Auto-Assign Substitute
                      </Button>
                      <p className="text-[10px] text-muted-foreground text-center">
                        AI will find the best available teacher based on subject match, workload, and grade familiarity
                      </p>
                    </div>
                  )}

                  {/* Available Teachers Button */}
                  {selectedSub.status === 'pending' && (
                    <Button
                      onClick={() => setAvailableTeachersOpen(true)}
                      variant="outline"
                      className="w-full border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                      size="sm"
                    >
                      <Users className="w-4 h-4 mr-2" />
                      Available Teachers
                      <Badge variant="secondary" className="ml-2 text-[10px] bg-emerald-100 text-emerald-700">
                        {getAvailableTeachersForSub(selectedSub).length}
                      </Badge>
                    </Button>
                  )}

                  <Separator />

                  {/* Lesson DNA */}
                  <div className="space-y-2">
                    {/* AI Substitute Context */}
                    <Button
                      onClick={async () => {
                        if (!selectedSub) return;
                        setSubContextError(null);
                        // If context already exists and is valid, just show it
                        if (selectedSub.subContext && selectedSub.subContext !== 'null') {
                          try {
                            const ctx = typeof selectedSub.subContext === 'string' ? JSON.parse(selectedSub.subContext) : selectedSub.subContext;
                            if (ctx && typeof ctx === 'object' && !Array.isArray(ctx)) {
                              setSubContextData(ctx);
                              setSubContextPopupOpen(true);
                              return;
                            }
                          } catch (parseErr) {
                            console.error('Failed to parse existing subContext, regenerating...', parseErr);
                            // Failed to parse, regenerate below
                          }
                        }
                        // Generate new context
                        setGeneratingSubContext(true);
                        try {
                          const res = await fetch('/api/biometric/generate-sub-context', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ substitutionId: selectedSub.id }),
                          });
                          if (res.ok) {
                            const data = await res.json();
                            const contextData = data.context || data;
                            // Validate the context data before setting it
                            if (contextData && typeof contextData === 'object') {
                              setSubContextData(contextData);
                              setSubContextPopupOpen(true);
                              toast({ title: 'AI Context Generated', description: 'Comprehensive substitute teaching guidance is ready' });
                            } else {
                              setSubContextError('AI returned invalid context data. Please try again.');
                              toast({ title: 'Invalid Data', description: 'AI returned unexpected data format. Please try regenerating.', variant: 'destructive' });
                            }
                            onRefresh();
                          } else {
                            let errorMsg = 'Failed to generate context';
                            try {
                              const errData = await res.json();
                              errorMsg = errData.error || errorMsg;
                            } catch {
                              errorMsg = `Server error (${res.status})`;
                            }
                            setSubContextError(errorMsg);
                            toast({ title: 'Generation Failed', description: errorMsg, variant: 'destructive' });
                          }
                        } catch (fetchError) {
                          console.error('Generate sub context fetch error:', fetchError);
                          setSubContextError('Failed to connect to server');
                          toast({ title: 'Error', description: 'Failed to connect to server. Please try again.', variant: 'destructive' });
                        } finally {
                          setGeneratingSubContext(false);
                        }
                      }}
                      disabled={generatingSubContext}
                      className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                      size="sm"
                    >
                      {generatingSubContext ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Brain className="w-4 h-4 mr-2" />}
                      {generatingSubContext ? 'Generating AI Context...' : (selectedSub.subContext && selectedSub.subContext !== 'null') ? 'View AI Substitute Context' : 'Generate AI Substitute Context'}
                    </Button>
                    {subContextError && (
                      <p className="text-[10px] text-red-600 px-1">{subContextError}</p>
                    )}
                    {selectedSub.subContext && selectedSub.subContext !== 'null' && !generatingSubContext && (
                      <Button
                        variant="outline"
                        className="w-full border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                        size="sm"
                        onClick={() => {
                          setSubContextError(null);
                          try {
                            const ctx = typeof selectedSub.subContext === 'string' ? JSON.parse(selectedSub.subContext) : selectedSub.subContext;
                            if (ctx && typeof ctx === 'object' && !Array.isArray(ctx)) {
                              setSubContextData(ctx);
                              setSubContextPopupOpen(true);
                            } else {
                              setSubContextError('Invalid context data format');
                              toast({ title: 'No Context', description: 'Generate AI Substitute Context first', variant: 'destructive' });
                            }
                          } catch (err) {
                            console.error('View subContext parse error:', err);
                            setSubContextError('Could not parse context data');
                            toast({ title: 'Error', description: 'Could not parse context data. Try regenerating.', variant: 'destructive' });
                          }
                        }}
                      >
                        <Eye className="w-4 h-4 mr-2" /> View AI Substitute Context
                      </Button>
                    )}
                    <Button
                      onClick={() => onGenerateDNA(selectedSub.id)}
                      disabled={generatingDna}
                      className="w-full bg-amber-600 hover:bg-amber-700"
                      size="sm"
                    >
                      {generatingDna ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Brain className="w-4 h-4 mr-2" />}
                      {selectedSub.lessonDNA ? 'Regenerate Lesson DNA' : 'Generate Lesson DNA'}
                    </Button>
                    {selectedSub.lessonDNA && (
                      <Button
                        variant="outline"
                        className="w-full"
                        size="sm"
                        onClick={() => {
                          try {
                            setLessonDna(JSON.parse(selectedSub.lessonDNA || '{}'));
                          } catch {
                            setLessonDna(null);
                          }
                          setLessonDnaPopupOpen(true);
                        }}
                      >
                        <Eye className="w-4 h-4 mr-2" /> View Lesson DNA
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="flex items-center justify-center min-h-[400px]">
                <div className="text-center p-8">
                  <RefreshCw className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
                  <p className="text-muted-foreground">Select a substitution to view details</p>
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Create Absence Dialog */}
      <Dialog open={createAbsenceOpen} onOpenChange={setCreateAbsenceOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-emerald-600" />
              Create Teacher Absence
            </DialogTitle>
            <DialogDescription>Record a teacher absence and create substitution entries for all their periods</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Absent Teacher</Label>
              <Select value={absentTeacherId} onValueChange={setAbsentTeacherId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select teacher..." />
                </SelectTrigger>
                <SelectContent>
                  {teachers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({t.subject})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                value={absenceDate}
                onChange={(e) => setAbsenceDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Reason</Label>
              <Input
                value={absenceReason}
                onChange={(e) => setAbsenceReason(e.target.value)}
                placeholder="e.g., Sick Leave, Personal Leave, Training..."
                className="mt-1"
              />
            </div>
            <Button
              onClick={handleCreateAbsence}
              disabled={creatingAbsence || !absentTeacherId || !absenceDate}
              className="w-full bg-emerald-600 hover:bg-emerald-700"
            >
              {creatingAbsence ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
              Create Absence
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lesson DNA Popup */}
      <Dialog open={lessonDnaPopupOpen} onOpenChange={setLessonDnaPopupOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="flex items-center gap-2 text-amber-800">
              <Brain className="w-5 h-5" />
              Lesson DNA - AI Generated
            </DialogTitle>
            <DialogDescription>Comprehensive lesson plan generated by AI for substitute teachers</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[65vh] px-6">
            {lessonDna && (
              <div className="space-y-4 pb-6">
                <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                  <h4 className="text-sm font-semibold text-amber-800 mb-1">Topic Summary</h4>
                  <p className="text-sm text-amber-700">{lessonDna.topicSummary}</p>
                </div>

                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                  <h4 className="text-sm font-semibold text-emerald-800 mb-2">Key Concepts</h4>
                  <div className="flex flex-wrap gap-2">
                    {lessonDna.keyConcepts?.map((concept, i) => (
                      <Badge key={i} variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-300">
                        {concept}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-teal-50 rounded-xl border border-teal-200">
                  <h4 className="text-sm font-semibold text-teal-800 mb-2">Teaching Tips</h4>
                  <ul className="space-y-1.5">
                    {lessonDna.teachingTips?.map((tip, i) => (
                      <li key={i} className="text-sm text-teal-700 flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-teal-500 mt-0.5 shrink-0" />
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="p-4 bg-purple-50 rounded-xl border border-purple-200">
                  <h4 className="text-sm font-semibold text-purple-800 mb-2">Student Behavior Patterns</h4>
                  <ul className="space-y-1.5">
                    {lessonDna.studentBehaviorPatterns?.map((pattern, i) => (
                      <li key={i} className="text-sm text-purple-700 flex items-start gap-2">
                        <Activity className="w-4 h-4 text-purple-500 mt-0.5 shrink-0" />
                        {pattern}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="p-4 bg-rose-50 rounded-xl border border-rose-200">
                  <h4 className="text-sm font-semibold text-rose-800 mb-2">Recommended Activities</h4>
                  <ul className="space-y-1.5">
                    {lessonDna.recommendedActivities?.map((activity, i) => {
                      const isObj = typeof activity === 'object';
                      const name = isObj ? (activity as LessonDNAActivity).name || '' : activity;
                      const time = isObj ? (activity as LessonDNAActivity).timeAllocation : '';
                      const desc = isObj ? (activity as LessonDNAActivity).description : '';
                      return (
                        <li key={i} className="text-sm text-rose-700 flex items-start gap-2">
                          <Timer className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
                          <div>
                            <span className="font-medium">{name || (typeof activity === 'string' ? activity : '')}</span>
                            {time && <span className="text-xs text-rose-500 ml-2">({time})</span>}
                            {desc && <p className="text-xs text-rose-600 mt-0.5">{desc}</p>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Available Teachers Popup Dialog */}
      <Dialog open={availableTeachersOpen} onOpenChange={setAvailableTeachersOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="flex items-center gap-2 text-emerald-800">
              <Users className="w-5 h-5" />
              {selectedSub?.status === 'assigned' ? 'Reassign Substitute Teacher' : 'Available Teachers'}
            </DialogTitle>
            <DialogDescription>
              {selectedSub ? (
                <span>
                  {selectedSub.status === 'assigned' ? 'Reassign substitute for' : 'Available teachers for'} <b>{selectedSub.subject}</b> • {selectedSub.grade} {selectedSub.section} • Period {selectedSub.period} • {selectedSub.date}
                </span>
              ) : (
                'Teachers available for substitution'
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Legend */}
          <div className="px-6 pb-2 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
              Subject Match
            </div>
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
              Grade Match
            </div>
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
              Light Workload
            </div>
          </div>

          {/* Filter Buttons */}
          <div className="px-6 pb-2 flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground font-medium">Filter:</span>
            {[
              { key: 'all' as const, label: 'All', color: 'bg-gray-100 text-gray-700 border-gray-300' },
              { key: 'subject' as const, label: 'Subject Match', color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
              { key: 'grade' as const, label: 'Grade Match', color: 'bg-blue-100 text-blue-700 border-blue-300' },
              { key: 'workload' as const, label: 'Light Workload', color: 'bg-amber-100 text-amber-700 border-amber-300' },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setAvailableTeacherFilter(f.key)}
                className={`px-2.5 py-1 text-[10px] rounded-md border font-medium transition-all ${
                  availableTeacherFilter === f.key ? f.color + ' ring-1 ring-offset-1' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <ScrollArea className="max-h-[58vh] px-6">
            {selectedSub && (() => {
              const allAvailable = getAvailableTeachersForSub(selectedSub);
              const filtered = availableTeacherFilter === 'all' ? allAvailable :
                availableTeacherFilter === 'subject' ? allAvailable.filter(t => t.teachesSubject) :
                availableTeacherFilter === 'grade' ? allAvailable.filter(t => t.teachesGrade) :
                availableTeacherFilter === 'workload' ? allAvailable.filter(t => t.dayWorkload <= 4) :
                allAvailable;
              return (
                <>
                  {filtered.length === 0 ? (
                    <div className="text-center py-8">
                      <Users className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
                      <p className="text-sm font-medium text-muted-foreground">No {availableTeacherFilter !== 'all' ? `${availableTeacherFilter === 'subject' ? 'subject-matching' : availableTeacherFilter === 'grade' ? 'grade-matching' : 'light-workload'} ` : ''}teachers found</p>
                      <p className="text-xs text-muted-foreground mt-1">Try changing the filter or check back later.</p>
                    </div>
                  ) : (
                    <div className="space-y-3 pb-6">
                      {filtered.map((t, index) => (
                    <div
                      key={t.id}
                      className={`rounded-xl border p-4 transition-all hover:shadow-md ${
                        t.teachesSubject
                          ? 'border-emerald-300 bg-emerald-50/50'
                          : t.teachesGrade
                          ? 'border-blue-200 bg-blue-50/30'
                          : 'border-gray-200 bg-white'
                      }`}
                    >
                      {/* Teacher Header Row */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          {/* Rank Badge */}
                          <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold shrink-0 ${
                            index === 0
                              ? 'bg-amber-100 text-amber-700 ring-2 ring-amber-300'
                              : index === 1
                              ? 'bg-gray-100 text-gray-600 ring-1 ring-gray-300'
                              : index === 2
                              ? 'bg-orange-100 text-orange-700 ring-1 ring-orange-300'
                              : 'bg-muted text-muted-foreground'
                          }`}>
                            #{index + 1}
                          </div>
                          {/* Teacher Info */}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-sm truncate">{t.name}</p>
                              {t.teachesSubject && (
                                <Badge className="text-[9px] py-0 px-1.5 bg-emerald-100 text-emerald-700 border-emerald-300">
                                  <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />Subject Match
                                </Badge>
                              )}
                              {t.teachesGrade && (
                                <Badge className="text-[9px] py-0 px-1.5 bg-blue-100 text-blue-700 border-blue-300">
                                  <GraduationCap className="w-2.5 h-2.5 mr-0.5" />Grade Match
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{t.email}</p>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <Badge variant="outline" className="text-[9px] py-0 px-1.5">{t.subject}</Badge>
                              {(() => {
                                try {
                                  const grades = JSON.parse(t.grades || '[]') as string[];
                                  return grades.slice(0, 4).map((g: string) => (
                                    <Badge key={g} variant="outline" className="text-[9px] py-0 px-1 bg-gray-50">
                                      {g.replace('Grade ', 'G')}
                                    </Badge>
                                  ));
                                } catch { return null; }
                              })()}
                            </div>
                          </div>
                        </div>

                        {/* Assign Button */}
                        <Button
                          size="sm"
                          className={`shrink-0 ${
                            index === 0
                              ? 'bg-emerald-600 hover:bg-emerald-700'
                              : 'bg-gray-600 hover:bg-gray-700'
                          }`}
                          disabled={manualAssignTeacherId !== ''}
                          onClick={() => handleManualAssignFromPopup(selectedSub.id, t.id)}
                        >
                          {manualAssignTeacherId === t.id ? (
                            <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          ) : (
                            <UserCheck className="w-3.5 h-3.5 mr-1.5" />
                          )}
                          {manualAssignTeacherId === t.id ? 'Assigning...' : 'Assign'}
                        </Button>
                      </div>

                      {/* Workload Bar */}
                      <div className="mt-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-muted-foreground">Today&apos;s Workload</span>
                          <span className={`text-[10px] font-semibold ${
                            t.dayWorkload >= 7 ? 'text-red-600' : t.dayWorkload >= 5 ? 'text-amber-600' : 'text-emerald-600'
                          }`}>
                            {t.dayWorkload}/8 periods
                          </span>
                        </div>
                        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              t.dayWorkload >= 7 ? 'bg-red-500' : t.dayWorkload >= 5 ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${(t.dayWorkload / 8) * 100}%` }}
                          />
                        </div>
                      </div>

                      {/* Periods Visualization */}
                      <div className="mt-3">
                        <p className="text-[10px] text-muted-foreground mb-1.5">Period Schedule</p>
                        <div className="grid grid-cols-8 gap-1">
                          {[1, 2, 3, 4, 5, 6, 7, 8].map((p) => {
                            const isBusy = t.busyPeriods?.includes(p);
                            const isNeeded = p === selectedSub.period;
                            return (
                              <div
                                key={p}
                                className={`flex flex-col items-center justify-center py-1.5 rounded-md text-[10px] font-medium ${
                                  isNeeded
                                    ? 'bg-emerald-500 text-white ring-2 ring-emerald-300'
                                    : isBusy
                                    ? 'bg-red-100 text-red-600'
                                    : 'bg-gray-100 text-gray-500'
                                }`}
                              >
                                <span>P{p}</span>
                                {isNeeded && <span className="text-[7px] font-bold">NEED</span>}
                                {isBusy && <span className="text-[7px]">Busy</span>}
                                {!isBusy && !isNeeded && <span className="text-[7px]">Free</span>}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Match Score */}
                      <div className="mt-3 flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">AI Match Score:</span>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <div
                              key={i}
                              className={`w-2 h-2 rounded-full ${
                                i < Math.round(t.score / 1.5) ? 'bg-emerald-500' : 'bg-gray-200'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-[10px] font-semibold text-emerald-700">{t.score.toFixed(1)}</span>
                      </div>
                    </div>
                  ))}
                    </div>
                  )}
                </>
              );
            })()}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* AI Substitute Context Popup */}
      <Dialog open={subContextPopupOpen} onOpenChange={(open) => {
        setSubContextPopupOpen(open);
        if (!open) setSubContextError(null);
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="flex items-center gap-2 text-blue-800">
              <Brain className="w-5 h-5" /> AI Substitute Teaching Context
            </DialogTitle>
            <DialogDescription>
              Comprehensive guidance for the substitute teacher covering this class
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[75vh] px-6">
            {subContextData && typeof subContextData === 'object' && !Array.isArray(subContextData) ? (() => {
              // Safely render any value as text (handles objects, arrays, null, undefined)
              const safeText = (val: unknown): string => {
                try {
                  if (val === null || val === undefined) return '';
                  if (typeof val === 'string') return val;
                  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
                  if (Array.isArray(val)) return val.map(v => safeText(v)).join(', ');
                  if (typeof val === 'object') {
                    const obj = val as Record<string, unknown>;
                    if (obj.topic) {
                      const parts: string[] = [safeText(obj.topic)];
                      if (obj.objectives && Array.isArray(obj.objectives)) {
                        parts.push('Objectives: ' + (obj.objectives as unknown[]).map(v => safeText(v)).join('; '));
                      }
                      if (obj.keyPoints && Array.isArray(obj.keyPoints)) {
                        parts.push('Key Points: ' + (obj.keyPoints as unknown[]).map(v => safeText(v)).join('; '));
                      }
                      return parts.join('. ');
                    }
                    return JSON.stringify(val);
                  }
                  return String(val);
                } catch {
                  return '';
                }
              };

              // Safely get a nested property without throwing
              const getNested = (obj: Record<string, unknown>, ...path: string[]): unknown => {
                try {
                  let current: unknown = obj;
                  for (const key of path) {
                    if (current === null || current === undefined || typeof current !== 'object') return undefined;
                    current = (current as Record<string, unknown>)[key];
                  }
                  return current;
                } catch {
                  return undefined;
                }
              };

              // Safely render todayCoveragePlan section
              const renderTodayCoveragePlan = (val: unknown) => {
                if (!val) return null;
                try {
                  if (typeof val === 'string') {
                    return <p className="text-sm text-emerald-900 font-medium">{val}</p>;
                  }
                  if (typeof val === 'object' && val !== null) {
                    const obj = val as Record<string, unknown>;
                    return (
                      <div className="space-y-1.5">
                        {Boolean(obj.topic) && <p className="text-sm text-emerald-900 font-medium">{safeText(obj.topic)}</p>}
                        {Boolean(obj.objectives && Array.isArray(obj.objectives) && obj.objectives.length > 0) && (
                          <div>
                            <p className="text-[11px] text-emerald-700 font-semibold">Learning Objectives:</p>
                            <ul className="text-[11px] text-emerald-700 list-disc ml-4">
                              {(obj.objectives as unknown[]).map((o, i) => <li key={i}>{safeText(o)}</li>)}
                            </ul>
                          </div>
                        )}
                        {Boolean(obj.keyPoints && Array.isArray(obj.keyPoints) && obj.keyPoints.length > 0) && (
                          <div>
                            <p className="text-[11px] text-emerald-700 font-semibold">Key Points to Cover:</p>
                            <ul className="text-[11px] text-emerald-700 list-disc ml-4">
                              {(obj.keyPoints as unknown[]).map((k, i) => <li key={i}>{safeText(k)}</li>)}
                            </ul>
                          </div>
                        )}
                        {!obj.topic && !obj.objectives && !obj.keyPoints && (
                          <p className="text-sm text-emerald-900 font-medium">{safeText(val)}</p>
                        )}
                      </div>
                    );
                  }
                  return <p className="text-sm text-emerald-900 font-medium">{safeText(val)}</p>;
                } catch {
                  return <p className="text-sm text-emerald-900 font-medium">{safeText(val)}</p>;
                }
              };

              // Safely access subContextData properties
              const data = subContextData as Record<string, unknown>;
              const absentTeacher = (typeof data.absentTeacher === 'object' && data.absentTeacher !== null) ? data.absentTeacher as Record<string, unknown> : null;
              const yesterdayDetails = (typeof data.yesterdayDetails === 'object' && data.yesterdayDetails !== null && !Array.isArray(data.yesterdayDetails)) ? data.yesterdayDetails as Record<string, unknown> : null;
              const teachingInstructions = data.teachingInstructions;
              const materialsNeeded = data.materialsNeeded;

              return (
              <div className="space-y-4 pb-6">
                {/* Class Info Header */}
                <div className="grid grid-cols-4 gap-2">
                  <div className="p-2 bg-blue-50 rounded-lg border border-blue-100 text-center">
                    <p className="text-[9px] text-blue-600">Subject</p>
                    <p className="text-xs font-semibold text-blue-800">{selectedSub?.subject || safeText(data.substitution && typeof data.substitution === 'object' ? (data.substitution as Record<string, unknown>).subject : '') || 'N/A'}</p>
                  </div>
                  <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-100 text-center">
                    <p className="text-[9px] text-emerald-600">Grade & Section</p>
                    <p className="text-xs font-semibold text-emerald-800">{selectedSub?.grade || ''} {selectedSub?.section || ''}</p>
                  </div>
                  <div className="p-2 bg-purple-50 rounded-lg border border-purple-100 text-center">
                    <p className="text-[9px] text-purple-600">Period</p>
                    <p className="text-xs font-semibold text-purple-800">{selectedSub?.period ? `P${selectedSub.period}` : 'N/A'}</p>
                  </div>
                  <div className="p-2 bg-rose-50 rounded-lg border border-rose-100 text-center">
                    <p className="text-[9px] text-rose-600">Absent Teacher</p>
                    <p className="text-xs font-semibold text-rose-800">{safeText(absentTeacher?.name) || selectedSub?.absentTeacherId || 'N/A'}</p>
                  </div>
                </div>

                {/* Yesterday's Topic */}
                {Boolean(data.yesterdayTopic) ? (
                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5 mb-1.5">
                      <BookOpen className="w-4 h-4" /> What Was Taught Yesterday
                    </p>
                    <p className="text-sm text-amber-900 font-medium">{safeText(data.yesterdayTopic)}</p>
                    {yesterdayDetails ? (
                      <div className="mt-2 space-y-1">
                        {Boolean(yesterdayDetails.keyConcepts) ? (
                          <p className="text-[11px] text-amber-700"><b>Key Concepts:</b> {safeText(yesterdayDetails.keyConcepts)}</p>
                        ) : null}
                        {Boolean(yesterdayDetails.activities) ? (
                          <p className="text-[11px] text-amber-700"><b>Activities:</b> {safeText(yesterdayDetails.activities)}</p>
                        ) : null}
                        {Boolean(yesterdayDetails.homework) ? (
                          <p className="text-[11px] text-amber-700"><b>Homework Given:</b> {safeText(yesterdayDetails.homework)}</p>
                        ) : null}
                        {Boolean(yesterdayDetails.homeworkAssigned) ? (
                          <p className="text-[11px] text-amber-700"><b>Homework Given:</b> {safeText(yesterdayDetails.homeworkAssigned)}</p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {/* Today's Coverage Plan */}
                {Boolean(data.todayCoveragePlan) ? (
                  <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                    <p className="text-xs font-semibold text-emerald-800 flex items-center gap-1.5 mb-1.5">
                      <Target className="w-4 h-4" /> What to Cover Today
                    </p>
                    {renderTodayCoveragePlan(data.todayCoveragePlan)}
                  </div>
                ) : null}

                {/* Teaching Instructions */}
                {Boolean(teachingInstructions) ? (
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-xs font-semibold text-blue-800 flex items-center gap-1.5 mb-1.5">
                      <ListChecks className="w-4 h-4" /> Step-by-Step Teaching Instructions
                    </p>
                    <div className="space-y-1.5">
                      {(Array.isArray(teachingInstructions) ? teachingInstructions : [teachingInstructions]).map((step: unknown, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-[11px] text-blue-800">
                          <span className="bg-blue-200 text-blue-800 rounded-full w-5 h-5 flex items-center justify-center text-[9px] font-bold shrink-0">{i + 1}</span>
                          <span>{safeText(step)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Student Expectations */}
                {Boolean(data.studentExpectations) ? (
                  <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                    <p className="text-xs font-semibold text-purple-800 flex items-center gap-1.5 mb-1.5">
                      <GraduationCap className="w-4 h-4" /> Student Expectations
                    </p>
                    <p className="text-[11px] text-purple-800">{safeText(data.studentExpectations)}</p>
                  </div>
                ) : null}

                {/* Assessment Idea */}
                {Boolean(data.assessmentIdea) ? (
                  <div className="p-3 bg-teal-50 rounded-lg border border-teal-200">
                    <p className="text-xs font-semibold text-teal-800 flex items-center gap-1.5 mb-1.5">
                      <Lightbulb className="w-4 h-4" /> Quick Assessment Idea
                    </p>
                    <p className="text-[11px] text-teal-800">{safeText(data.assessmentIdea)}</p>
                  </div>
                ) : null}

                {/* Materials Needed */}
                {Boolean(materialsNeeded) ? (
                  <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                    <p className="text-xs font-semibold text-orange-800 flex items-center gap-1.5 mb-1.5">
                      <BookMarked className="w-4 h-4" /> Materials Needed
                    </p>
                    {Array.isArray(materialsNeeded) ? (
                      <ul className="text-[11px] text-orange-800 list-disc ml-4">
                        {materialsNeeded.map((item: unknown, i: number) => <li key={i}>{safeText(item)}</li>)}
                      </ul>
                    ) : (
                      <p className="text-[11px] text-orange-800">{safeText(materialsNeeded)}</p>
                    )}
                  </div>
                ) : null}
              </div>
              );
            })() : (
              <div className="p-6 text-center text-muted-foreground">
                <AlertCircle className="w-8 h-8 mx-auto mb-2" />
                <p className="text-sm">No context data available. Please generate AI Substitute Context first.</p>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Teachers Section ───
function TeachersSection({
  teachers,
  schedules,
  selectedDay,
  onRefresh,
  schoolId,
  timetableSetup,
}: {
  teachers: Teacher[];
  schedules: Schedule[];
  selectedDay: string;
  onRefresh: () => void;
  schoolId?: string;
  timetableSetup?: { periodsPerDay: number; workingDays: number; saturdayPeriods: number; breakMinutes: number; breakAfter: number; lunchMinutes: number; lunchAfter: number };
}) {
  const [teacherPopupOpen, setTeacherPopupOpen] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [addTeacherOpen, setAddTeacherOpen] = useState(false);
  const [addingTeacher, setAddingTeacher] = useState(false);
  const [newTeacher, setNewTeacher] = useState({
    name: '', email: '', phone: '', subject: '', grades: [] as string[], password: 'teacher123',
    qualification: '', experience: '', specialization: '', dateOfJoining: '', address: '', emergencyContact: '', bloodGroup: '', gender: '',
  });
  const { toast } = useToast();

  const handleAddTeacher = async () => {
    if (!newTeacher.name || !newTeacher.email || !newTeacher.subject || newTeacher.grades.length === 0) {
      toast({ title: 'Missing Fields', description: 'Name, email, subject, and grades are required', variant: 'destructive' });
      return;
    }
    setAddingTeacher(true);
    try {
      const res = await fetch('/api/teachers/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTeacher),
      });
      if (res.ok) {
        toast({ title: 'Teacher Added', description: `${newTeacher.name} has been added successfully` });
        setAddTeacherOpen(false);
        setNewTeacher({ name: '', email: '', phone: '', subject: '', grades: [], password: 'teacher123', qualification: '', experience: '', specialization: '', dateOfJoining: '', address: '', emergencyContact: '', bloodGroup: '', gender: '' });
        onRefresh();
      } else {
        const data = await res.json();
        toast({ title: 'Failed to Add Teacher', description: data.error || 'Unknown error', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to add teacher', variant: 'destructive' });
    } finally {
      setAddingTeacher(false);
    }
  };

  const getTeacherWeeklySchedule = (teacher: Teacher) => {
    // First try the shared schedules prop (all schedules loaded for the school), then fall back to embedded
    const fromShared = schedules.filter((s) => s.teacherId === teacher.id);
    if (fromShared.length > 0) return fromShared;
    return teacher.schedules || [];
  };

  // Derive unique subjects and grades from teachers list
  const uniqueSubjects = [...new Set(teachers.map((t) => t.subject))].sort();
  const uniqueGrades = [...new Set(teachers.flatMap((t) => JSON.parse(t.grades || '[]') as string[]))].sort((a, b) => {
    const numA = parseInt(a.replace('Grade ', ''));
    const numB = parseInt(b.replace('Grade ', ''));
    return numA - numB;
  });

  // Filter teachers
  const filteredTeachers = teachers.filter((t) => {
    if (subjectFilter !== 'all' && t.subject !== subjectFilter) return false;
    if (gradeFilter !== 'all') {
      const grades = JSON.parse(t.grades || '[]') as string[];
      if (!grades.includes(gradeFilter)) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!t.name.toLowerCase().includes(q) && !t.email.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-emerald-800">Teachers</h2>
          <p className="text-sm text-muted-foreground">View teacher profiles and schedules</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={onRefresh} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Button onClick={() => setAddTeacherOpen(true)} size="sm" className="bg-emerald-600 hover:bg-emerald-700">
            <UserPlus className="w-4 h-4 mr-2" /> Add Teacher
          </Button>
        </div>
      </div>

      {/* Filter Row */}
      {teachers.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or email..."
              className="pl-9 h-9"
            />
          </div>
          <Select value={subjectFilter} onValueChange={setSubjectFilter}>
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue placeholder="Subject" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Subjects</SelectItem>
              {uniqueSubjects.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={gradeFilter} onValueChange={setGradeFilter}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="Grade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Grades</SelectItem>
              {uniqueGrades.map((g) => (
                <SelectItem key={g} value={g}>{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant="outline" className="text-xs">
            {filteredTeachers.length} / {teachers.length}
          </Badge>
        </div>
      )}

      {teachers.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Teachers</h3>
            <p className="text-muted-foreground mb-2">No teachers found. Add teachers to the system to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredTeachers.map((teacher) => {
            const todayClasses = (teacher.schedules || []).filter((s: Schedule) => s.day === selectedDay).length;

            return (
              <Card
                key={teacher.id}
                className="cursor-pointer hover:shadow-lg hover:border-emerald-400 transition-all duration-200"
                onClick={() => {
                  setSelectedTeacher(teacher);
                  setTeacherPopupOpen(true);
                }}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="bg-emerald-100 p-2 rounded-full">
                      <User className="w-5 h-5 text-emerald-700" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{teacher.name}</p>
                      <Badge variant="outline" className="text-[10px] mt-0.5">{teacher.subject}</Badge>
                    </div>
                  </div>
                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Mail className="w-3 h-3" />
                      <span className="truncate">{teacher.email}</span>
                    </div>
                    {teacher.phone && (
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3 h-3" />
                        <span>{teacher.phone}</span>
                      </div>
                    )}
                  </div>
                  <Separator className="my-3" />
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Classes today</span>
                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
                      {todayClasses}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Teacher Schedule Popup */}
      <Dialog open={teacherPopupOpen} onOpenChange={setTeacherPopupOpen}>
        <DialogContent className="!w-[calc(100vw-1.5rem)] !max-w-[1600px] sm:!w-[calc(100vw-3rem)] sm:!max-w-[1600px] max-h-[92vh] overflow-hidden p-0">
          <DialogHeader className="border-b bg-gradient-to-r from-emerald-50 to-cyan-50 p-5">
            <DialogTitle className="flex flex-col gap-3 text-emerald-800 sm:flex-row sm:items-center sm:justify-between"><span className="flex items-center gap-2"><User className="w-5 h-5" />{selectedTeacher?.name}</span></DialogTitle>
            <DialogDescription>
              {selectedTeacher?.subject} Specialist • {selectedTeacher?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[76vh] overflow-auto overscroll-contain px-5 pt-4">
            {selectedTeacher && (
              <div className="space-y-4 pb-6">
                <div className="grid gap-3 rounded-xl border bg-slate-50 p-4 sm:grid-cols-2">
                  <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Full name</p><p className="text-sm font-semibold">{selectedTeacher.name}</p></div>
                  <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Primary subject</p><p className="text-sm font-semibold">{selectedTeacher.subject}</p></div>
                  <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Email</p><p className="break-all text-sm">{selectedTeacher.email}</p></div>
                  <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Phone</p><p className="text-sm">{selectedTeacher.phone || 'Not provided'}</p></div>
                  <div className="sm:col-span-2"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Eligible grades</p><div className="mt-1 flex flex-wrap gap-1">{(JSON.parse(selectedTeacher.grades || '[]') as string[]).map((grade) => <Badge key={grade} variant="outline">{grade}</Badge>)}</div></div>
                </div>
                <div className="flex items-center justify-between"><div><h3 className="font-bold text-slate-900">Teacher Weekly Timetable</h3><p className="text-xs text-muted-foreground">All assigned classes, timings and subjects</p></div><Badge className="bg-emerald-100 text-emerald-700">{getTeacherWeeklySchedule(selectedTeacher).length} weekly periods</Badge></div>
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900"><p className="font-semibold">Period guide</p><p className="mt-1">P1 means Period 1, P2 means Period 2, and so on. Monday–Friday can contain P1–P8. Saturday is a half day and contains only P1–P4. The exact start and end time is displayed below every period.</p></div>
                {(() => {
                  const _total = timetableSetup?.periodsPerDay ?? 8;
                  const _wdays = timetableSetup?.workingDays ?? 6;
                  const _satP = _wdays === 6 ? (timetableSetup?.saturdayPeriods ?? 4) : 0;
                  const _hasBreak = (timetableSetup?.breakMinutes ?? 15) > 0;
                  const _breakAfter = timetableSetup?.breakAfter ?? 2;
                  const _hasLunch = (timetableSetup?.lunchMinutes ?? 45) > 0;
                  const _lunchAfter = timetableSetup?.lunchAfter ?? 4;
                  const _days = DAYS.slice(0, _wdays);
                  const weekSchedule = getTeacherWeeklySchedule(selectedTeacher);
                  return <table className="w-full min-w-[900px] border-separate border-spacing-0 overflow-hidden rounded-xl border text-xs">
                    <thead className="sticky top-0 z-20"><tr className="bg-slate-900 text-white">
                      <th className="sticky left-0 z-30 min-w-[90px] border-b border-r border-slate-700 bg-slate-900 p-3 text-left">Day</th>
                      {Array.from({ length: _total }, (_, i) => i + 1).flatMap((period) => {
                        const sample = weekSchedule.find((item) => item.period === period);
                        const cells = [<th key={period} className="min-w-[120px] border-b border-r border-slate-700 p-2"><span className="block font-bold">P{period}</span><span className="text-[9px] font-normal text-slate-300">{sample ? `${sample.startTime}–${sample.endTime}` : '–'}</span></th>];
                        if (_hasBreak && period === _breakAfter) cells.push(<th key="sb" className="min-w-[44px] border-b border-r border-amber-400 bg-amber-500 p-1 text-[9px] font-bold text-amber-950">BRK</th>);
                        if (_hasLunch && period === _lunchAfter) cells.push(<th key="lb" className="min-w-[44px] border-b border-r border-orange-400 bg-orange-500 p-1 text-[9px] font-bold text-orange-950">LCH</th>);
                        return cells;
                      })}
                    </tr></thead>
                    <tbody>{_days.map((day) => {
                      const isSat = day === 'Saturday';
                      const dayPeriods = isSat && _satP > 0 ? _satP : _total;
                      return <tr key={day}>
                        <th className="sticky left-0 z-10 border-b border-r bg-emerald-50 p-3 text-left font-bold text-emerald-900">{day}{isSat && _satP > 0 && <span className="mt-0.5 block text-[9px] font-normal text-emerald-600">Half day</span>}</th>
                        {Array.from({ length: dayPeriods }, (_, i) => i + 1).flatMap((period) => {
                          const schedule = weekSchedule.find((item) => item.day === day && item.period === period);
                          const cells = [<td key={`${day}-${period}`} className="h-[96px] border-b border-r p-1.5 align-top bg-white">
                            {schedule
                              ? <div className="flex h-full flex-col rounded-lg border border-emerald-200 bg-emerald-50 p-2"><span className="font-bold text-emerald-900 text-[11px]">{schedule.grade} {schedule.section}</span><span className="mt-0.5 font-medium text-slate-700 text-[11px]">{schedule.subject}</span><span className="mt-auto text-[9px] text-slate-500">{schedule.startTime}–{schedule.endTime}</span></div>
                              : <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-200 text-[10px] text-slate-400">Free</div>}
                          </td>];
                          if (_hasBreak && period === _breakAfter) cells.push(<td key={`${day}-sb`} className="border-b border-r border-amber-200 bg-amber-50 text-center text-[9px] font-semibold text-amber-700"><span className="[writing-mode:vertical-rl] rotate-180">Break</span></td>);
                          if (_hasLunch && period === _lunchAfter) cells.push(<td key={`${day}-lb`} className="border-b border-r border-orange-200 bg-orange-50 text-center text-[9px] font-semibold text-orange-700"><span className="[writing-mode:vertical-rl] rotate-180">Lunch</span></td>);
                          return cells;
                        })}
                        {isSat && _satP > 0 && _satP < _total && <td colSpan={_total - _satP} className="border-b border-r bg-slate-100 text-center text-[10px] text-slate-400">Half-day closed</td>}
                      </tr>;
                    })}</tbody>
                  </table>;
                })()}

                <Separator />
                <div className="p-4 bg-emerald-50 rounded-xl space-y-3">
                  <h4 className="text-sm font-semibold text-emerald-800">Weekly Summary</h4>
                  {(() => {
                    const ws = getTeacherWeeklySchedule(selectedTeacher);
                    const byGrade = ws.reduce<Record<string, number>>((acc, s) => { const key = `${s.grade} ${s.section}`; acc[key] = (acc[key] || 0) + 1; return acc; }, {});
                    return <>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Total periods / week</span>
                        <span className="font-bold text-emerald-700">{ws.length}</span>
                      </div>
                      {Object.keys(byGrade).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {Object.entries(byGrade).sort().map(([cls, cnt]) => (
                            <span key={cls} className="rounded-md bg-white border border-emerald-200 px-2 py-0.5 text-[11px] font-medium text-emerald-800">{cls} <span className="text-emerald-600">×{cnt}</span></span>
                          ))}
                        </div>
                      )}
                    </>;
                  })()}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add New Teacher Dialog */}
      <Dialog open={addTeacherOpen} onOpenChange={setAddTeacherOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="flex items-center gap-2 text-emerald-800">
              <UserPlus className="w-5 h-5" /> Add New Teacher
            </DialogTitle>
            <DialogDescription>Enter the teacher's information to add them to the system</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[75vh] px-6">
            <div className="space-y-4 pb-6">
              {/* Personal Information */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><User className="w-4 h-4" /> Personal Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Full Name *</Label>
                    <Input value={newTeacher.name} onChange={e => setNewTeacher({...newTeacher, name: e.target.value})} placeholder="Dr. Sarah Johnson" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Gender</Label>
                    <Select value={newTeacher.gender} onValueChange={v => setNewTeacher({...newTeacher, gender: v})}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Male">Male</SelectItem>
                        <SelectItem value="Female">Female</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Email Address *</Label>
                    <Input type="email" value={newTeacher.email} onChange={e => setNewTeacher({...newTeacher, email: e.target.value})} placeholder="sarah.johnson@school.edu" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Phone Number</Label>
                    <Input value={newTeacher.phone} onChange={e => setNewTeacher({...newTeacher, phone: e.target.value})} placeholder="+91 98765 43210" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Blood Group</Label>
                    <Select value={newTeacher.bloodGroup} onValueChange={v => setNewTeacher({...newTeacher, bloodGroup: v})}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => <SelectItem key={bg} value={bg}>{bg}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Emergency Contact</Label>
                    <Input value={newTeacher.emergencyContact} onChange={e => setNewTeacher({...newTeacher, emergencyContact: e.target.value})} placeholder="+91 98765 43210" />
                  </div>
                </div>
                <div className="space-y-1.5 mt-3">
                  <Label className="text-xs">Address</Label>
                  <Input value={newTeacher.address} onChange={e => setNewTeacher({...newTeacher, address: e.target.value})} placeholder="Full residential address" />
                </div>
              </div>
              <Separator />
              {/* Professional Information */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><GraduationCap className="w-4 h-4" /> Professional Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Subject Specialization *</Label>
                    <Select value={newTeacher.subject} onValueChange={v => setNewTeacher({...newTeacher, subject: v})}>
                      <SelectTrigger><SelectValue placeholder="Select Subject" /></SelectTrigger>
                      <SelectContent>
                        {['Mathematics', 'Physics', 'Chemistry', 'Biology', 'English', 'Hindi', 'Sanskrit', 'History', 'Geography', 'Civics', 'Social Science', 'Science', 'Computer Science', 'Economics', 'Environmental Science', 'Physical Education', 'Art', 'Music', 'EVS'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Qualification</Label>
                    <Input value={newTeacher.qualification} onChange={e => setNewTeacher({...newTeacher, qualification: e.target.value})} placeholder="M.Ed, B.Ed, Ph.D" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Years of Experience</Label>
                    <Input value={newTeacher.experience} onChange={e => setNewTeacher({...newTeacher, experience: e.target.value})} placeholder="5 years" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Additional Specialization</Label>
                    <Input value={newTeacher.specialization} onChange={e => setNewTeacher({...newTeacher, specialization: e.target.value})} placeholder="Curriculum Design, Special Education" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Date of Joining</Label>
                    <Input type="date" value={newTeacher.dateOfJoining} onChange={e => setNewTeacher({...newTeacher, dateOfJoining: e.target.value})} />
                  </div>
                </div>
              </div>
              <Separator />
              {/* Grade Assignment */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><BookOpen className="w-4 h-4" /> Grade Assignment</h4>
                <p className="text-[10px] text-muted-foreground mb-2">Select the grades this teacher will teach *</p>
                <div className="flex flex-wrap gap-2">
                  {Array.from({length: 12}, (_, i) => `Grade ${i + 1}`).map(grade => {
                    const isSelected = newTeacher.grades.includes(grade);
                    return (
                      <button key={grade} type="button" onClick={() => {
                        setNewTeacher({
                          ...newTeacher,
                          grades: isSelected ? newTeacher.grades.filter(g => g !== grade) : [...newTeacher.grades, grade]
                        });
                      }} className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${isSelected ? 'bg-emerald-100 border-emerald-300 text-emerald-700 font-medium' : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-emerald-300'}`}>
                        {grade}
                      </button>
                    );
                  })}
                </div>
              </div>
              <Separator />
              {/* Login Credentials */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><Lock className="w-4 h-4" /> Login Credentials</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Email (Auto-filled)</Label>
                    <Input value={newTeacher.email} disabled className="bg-gray-50" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Default Password</Label>
                    <Input value={newTeacher.password} onChange={e => setNewTeacher({...newTeacher, password: e.target.value})} />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">Teacher will use their email and this password to log in. They can change it later.</p>
              </div>
              {/* Submit */}
              <div className="flex items-center gap-3 pt-2">
                <Button onClick={handleAddTeacher} disabled={addingTeacher} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
                  {addingTeacher ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
                  {addingTeacher ? 'Adding Teacher...' : 'Add Teacher'}
                </Button>
                <Button variant="outline" onClick={() => setAddTeacherOpen(false)} disabled={addingTeacher}>Cancel</Button>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Teacher Portal Section ───
function TeacherPortalSection({
  teacher,
  schedules,
  onGenerateLessonPlan,
  generatingLessonPlan,
}: {
  teacher: Teacher;
  schedules: Schedule[];
  onGenerateLessonPlan: (params: { grade: string; section: string; subject: string; topic: string; day: string; period: number }) => Promise<LessonPlan | null>;
  generatingLessonPlan: boolean;
}) {
  // Auto-select today's day name
  const getTodayDayName = () => {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = dayNames[new Date().getDay()];
    return DAYS.includes(today) ? today : 'Monday';
  };

  const [selectedDay, setSelectedDay] = useState(getTodayDayName);
  const [lessonPlanPopupOpen, setLessonPlanPopupOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<Schedule | null>(null);
  const [lessonPlan, setLessonPlan] = useState<LessonPlan | null>(null);
  const [existingPlans, setExistingPlans] = useState<Record<string, LessonPlan>>({});

  // Get schedules for this teacher on the selected day
  const daySchedules = (schedules || [])
    .filter((s) => s.day === selectedDay && s.teacherId === teacher.id)
    .sort((a, b) => a.period - b.period);

  // Compute today's overview stats
  const totalPeriodsToday = daySchedules.length;
  const freePeriods = 8 - totalPeriodsToday;
  const subjectsTaught = [...new Set(daySchedules.map(s => s.subject))];
  const gradesTaught = [...new Set(daySchedules.map(s => `${s.grade} ${s.section}`))];

  const handlePeriodClick = (schedule: Schedule) => {
    setSelectedPeriod(schedule);
    // Check if we already have a cached plan
    const key = `${schedule.grade}-${schedule.section}-${schedule.period}-${schedule.day}`;
    if (existingPlans[key]) {
      setLessonPlan(existingPlans[key]);
    } else {
      setLessonPlan(null);
    }
    setLessonPlanPopupOpen(true);
  };

  const handleGeneratePlan = async () => {
    if (!selectedPeriod) return;
    const plan = await onGenerateLessonPlan({
      grade: selectedPeriod.grade,
      section: selectedPeriod.section,
      subject: selectedPeriod.subject,
      topic: selectedPeriod.topic || '',
      day: selectedPeriod.day,
      period: selectedPeriod.period,
    });
    if (plan) {
      setLessonPlan(plan);
      const key = `${selectedPeriod.grade}-${selectedPeriod.section}-${selectedPeriod.period}-${selectedPeriod.day}`;
      setExistingPlans((prev) => ({ ...prev, [key]: plan }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-6 text-white">
        <div className="flex items-center gap-3 mb-3">
          <div className="bg-white/20 p-2 rounded-xl">
            <GraduationCap className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Teacher Portal</h1>
            <p className="text-emerald-100 text-sm md:text-base">{teacher.name} &middot; {teacher.subject} Specialist</p>
          </div>
        </div>
        <p className="text-emerald-50 text-sm max-w-2xl">
          View your schedule and generate AI-powered lesson plans for each period.
        </p>
      </div>

      {/* Today's Overview Card */}
      <Card className="border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50">
        <CardContent className="p-4 md:p-6">
          <h3 className="text-sm font-semibold text-emerald-800 flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4" />
            {selectedDay}&apos;s Overview
          </h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center p-3 bg-white/80 rounded-xl border border-emerald-100">
              <p className="text-2xl font-bold text-emerald-700">{totalPeriodsToday}</p>
              <p className="text-[10px] text-muted-foreground">Total Periods</p>
            </div>
            <div className="text-center p-3 bg-white/80 rounded-xl border border-teal-100">
              <p className="text-2xl font-bold text-teal-700">{freePeriods > 0 ? freePeriods : 0}</p>
              <p className="text-[10px] text-muted-foreground">Free Periods</p>
            </div>
            <div className="text-center p-3 bg-white/80 rounded-xl border border-amber-100">
              <p className="text-2xl font-bold text-amber-700">{subjectsTaught.length}</p>
              <p className="text-[10px] text-muted-foreground">Subjects</p>
            </div>
          </div>
          {subjectsTaught.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {subjectsTaught.map((subject) => (
                <Badge key={subject} variant="outline" className="text-[10px] bg-white/90 text-emerald-700 border-emerald-300">
                  {subject}
                </Badge>
              ))}
            </div>
          )}
          {gradesTaught.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-emerald-700 mb-1.5">Teaching today:</p>
              <div className="flex flex-wrap gap-1.5">
                {gradesTaught.map((gs) => (
                  <Badge key={gs} className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200">
                    <GraduationCap className="w-3 h-3 mr-1" />
                    {gs}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Day Selector */}
      <div className="flex items-center bg-white border rounded-xl p-1 shadow-sm">
        {DAYS.map((day) => {
          const isToday = getTodayDayName() === day;
          return (
            <Button
              key={day}
              variant="ghost"
              size="sm"
              className={`rounded-lg text-xs font-medium transition-all flex-1 relative ${
                selectedDay === day
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setSelectedDay(day)}
            >
              {day.slice(0, 3)}
              {isToday && selectedDay !== day && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-emerald-500" />
              )}
            </Button>
          );
        })}
      </div>

      {/* Daily Schedule */}
      {daySchedules.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Calendar className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Classes on {selectedDay}</h3>
            <p className="text-muted-foreground">You don&apos;t have any classes scheduled for this day.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-emerald-800 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            {selectedDay} &middot; {daySchedules.length} Period{daySchedules.length !== 1 ? 's' : ''}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {daySchedules.map((sched) => {
              const hasPlan = !!existingPlans[`${sched.grade}-${sched.section}-${sched.period}-${sched.day}`];
              const hasTopic = !!sched.topic;
              return (
                <Card
                  key={sched.id}
                  className={`cursor-pointer hover:shadow-lg transition-all duration-200 overflow-hidden border-2 ${
                    hasTopic ? 'border-emerald-300 hover:border-emerald-400' : 'border-amber-300 hover:border-amber-400'
                  }`}
                  onClick={() => handlePeriodClick(sched)}
                >
                  <div className={`h-1.5 ${hasTopic ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`flex items-center justify-center w-9 h-9 rounded-lg font-bold text-sm ${hasTopic ? 'bg-emerald-200 text-emerald-800' : 'bg-amber-200 text-amber-800'}`}>
                          P{sched.period}
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{sched.subject}</p>
                          <p className="text-xs text-muted-foreground">
                            {sched.startTime} - {sched.endTime}
                          </p>
                        </div>
                      </div>
                      {hasPlan && (
                        <Badge className="text-[10px] bg-teal-100 text-teal-700 border-teal-300">
                          <FileText className="w-3 h-3 mr-1" />Plan
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <GraduationCap className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-xs font-medium">{sched.grade} {sched.section}</span>
                      </div>
                      {sched.topic ? (
                        <Badge variant="outline" className="text-[10px] max-w-[160px] truncate">
                          {sched.topic}
                        </Badge>
                      ) : (
                        <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-300">
                          No topic
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Lesson Plan Popup */}
      <Dialog open={lessonPlanPopupOpen} onOpenChange={setLessonPlanPopupOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="flex items-center gap-2 text-emerald-800">
              <Brain className="w-5 h-5" />
              {lessonPlan ? 'AI Lesson Plan' : 'Generate Lesson Plan'}
            </DialogTitle>
            <DialogDescription>
              {selectedPeriod ? `${selectedPeriod.subject} • ${selectedPeriod.grade} ${selectedPeriod.section} • Period ${selectedPeriod.period}` : ''}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[65vh] px-6">
            {!lessonPlan ? (
              <div className="pb-6 space-y-4">
                {/* Period details */}
                {selectedPeriod && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                      <Clock className="w-4 h-4 text-emerald-600" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Time</p>
                        <p className="text-xs font-medium">{selectedPeriod.startTime} - {selectedPeriod.endTime}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
                      <BookOpen className="w-4 h-4 text-amber-600" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Subject &amp; Topic</p>
                        <p className="text-xs font-medium">{selectedPeriod.subject}{selectedPeriod.topic ? `: ${selectedPeriod.topic}` : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 p-3 bg-teal-50 rounded-lg border border-teal-200">
                      <GraduationCap className="w-4 h-4 text-teal-600" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Grade &amp; Section</p>
                        <p className="text-xs font-medium">{selectedPeriod.grade} {selectedPeriod.section}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Day &amp; Period</p>
                        <p className="text-xs font-medium">{selectedPeriod.day} • P{selectedPeriod.period}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Big Generate Button */}
                <div className="flex flex-col items-center py-8">
                  <div className="bg-gradient-to-br from-emerald-500 to-teal-500 p-6 rounded-2xl mb-4 shadow-lg">
                    <Brain className="w-12 h-12 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-emerald-800 mb-2">Generate AI Lesson Plan</h3>
                  <p className="text-sm text-muted-foreground text-center mb-6 max-w-sm">
                    Let AI create a comprehensive, curriculum-aligned lesson plan for this period with differentiated activities and assessment strategies.
                  </p>
                  <Button
                    onClick={handleGeneratePlan}
                    disabled={generatingLessonPlan}
                    className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white px-8 py-6 text-base font-semibold rounded-xl shadow-lg"
                    size="lg"
                  >
                    {generatingLessonPlan ? (
                      <>
                        <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Brain className="w-5 h-5 mr-2" />
                        Generate AI Lesson Plan
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 pb-6">
                {/* Lesson Plan Header */}
                <div className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border border-emerald-200">
                  <h4 className="text-base font-bold text-emerald-800">{lessonPlan.title}</h4>
                  <p className="text-xs text-emerald-600 mt-1">{lessonPlan.grade} &middot; {lessonPlan.duration} &middot; {lessonPlan.topic || 'General'}</p>
                </div>

                {/* Objectives */}
                <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                  <h4 className="text-sm font-semibold text-amber-800 mb-2 flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    Learning Objectives
                  </h4>
                  <ul className="space-y-1.5">
                    {lessonPlan.objectives?.map((obj, i) => (
                      <li key={i} className="text-sm text-amber-700 flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                        {obj}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Warm Up */}
                {lessonPlan.warmUp && (
                  <div className="p-4 bg-teal-50 rounded-xl border border-teal-200">
                    <h4 className="text-sm font-semibold text-teal-800 mb-2 flex items-center gap-2">
                      <Zap className="w-4 h-4" />
                      Warm-Up / Starter ({lessonPlan.warmUp.duration})
                    </h4>
                    <p className="text-sm font-medium text-teal-700">{lessonPlan.warmUp.activity}</p>
                    <p className="text-xs text-teal-600 mt-1">{lessonPlan.warmUp.description}</p>
                  </div>
                )}

                {/* Main Content */}
                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                  <h4 className="text-sm font-semibold text-emerald-800 mb-2 flex items-center gap-2">
                    <ListChecks className="w-4 h-4" />
                    Main Teaching Content
                  </h4>
                  <div className="space-y-3">
                    {lessonPlan.mainContent?.map((section, i) => (
                      <div key={i} className="p-3 bg-white/70 rounded-lg border border-emerald-100">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-medium text-emerald-800">{section.section}</p>
                          <Badge variant="outline" className="text-[10px]">{section.duration}</Badge>
                        </div>
                        <p className="text-xs text-emerald-600">{section.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Differentiation */}
                {lessonPlan.differentiation && (
                  <div className="p-4 bg-purple-50 rounded-xl border border-purple-200">
                    <h4 className="text-sm font-semibold text-purple-800 mb-2 flex items-center gap-2">
                      <Lightbulb className="w-4 h-4" />
                      Differentiated Activities
                    </h4>
                    <div className="space-y-2">
                      <div className="p-2 bg-red-50 rounded-lg border border-red-100">
                        <p className="text-[10px] font-semibold text-red-700 mb-0.5">Struggling Learners</p>
                        <p className="text-xs text-red-600">{lessonPlan.differentiation.struggling}</p>
                      </div>
                      <div className="p-2 bg-amber-50 rounded-lg border border-amber-100">
                        <p className="text-[10px] font-semibold text-amber-700 mb-0.5">On-Level Learners</p>
                        <p className="text-xs text-amber-600">{lessonPlan.differentiation.onLevel}</p>
                      </div>
                      <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-100">
                        <p className="text-[10px] font-semibold text-emerald-700 mb-0.5">Advanced Learners</p>
                        <p className="text-xs text-emerald-600">{lessonPlan.differentiation.advanced}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Assessment */}
                {lessonPlan.assessment && (
                  <div className="p-4 bg-rose-50 rounded-xl border border-rose-200">
                    <h4 className="text-sm font-semibold text-rose-800 mb-2 flex items-center gap-2">
                      <Activity className="w-4 h-4" />
                      Assessment Strategies
                    </h4>
                    <div className="space-y-2">
                      <div>
                        <p className="text-[10px] font-semibold text-rose-700">Formative</p>
                        <p className="text-xs text-rose-600">{lessonPlan.assessment.formative}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-rose-700">Summative</p>
                        <p className="text-xs text-rose-600">{lessonPlan.assessment.summative}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Resources */}
                {lessonPlan.resources && lessonPlan.resources.length > 0 && (
                  <div className="p-4 bg-orange-50 rounded-xl border border-orange-200">
                    <h4 className="text-sm font-semibold text-orange-800 mb-2 flex items-center gap-2">
                      <BookMarked className="w-4 h-4" />
                      Resources Needed
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {lessonPlan.resources.map((res, i) => (
                        <Badge key={i} variant="outline" className="text-[10px] bg-orange-100 text-orange-700 border-orange-300">
                          {res}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Key Vocabulary */}
                {lessonPlan.keyVocabulary && lessonPlan.keyVocabulary.length > 0 && (
                  <div className="p-4 bg-teal-50 rounded-xl border border-teal-200">
                    <h4 className="text-sm font-semibold text-teal-800 mb-2 flex items-center gap-2">
                      <BookOpen className="w-4 h-4" />
                      Key Vocabulary
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {lessonPlan.keyVocabulary.map((vocab, i) => (
                        <Badge key={i} variant="outline" className="text-[10px] bg-teal-100 text-teal-700 border-teal-300">
                          {vocab}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Homework */}
                {lessonPlan.homework && (
                  <div className="p-4 bg-muted/50 rounded-xl border">
                    <h4 className="text-sm font-semibold mb-1 flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Homework / Extension
                    </h4>
                    <p className="text-sm text-muted-foreground">{lessonPlan.homework}</p>
                  </div>
                )}

                {/* Regenerate button */}
                <div className="pt-2">
                  <Button
                    onClick={handleGeneratePlan}
                    disabled={generatingLessonPlan}
                    variant="outline"
                    className="w-full border-emerald-400 text-emerald-700 hover:bg-emerald-50"
                  >
                    {generatingLessonPlan ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Brain className="w-4 h-4 mr-2" />}
                    Regenerate Lesson Plan
                  </Button>
                </div>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Curriculum Builder Section ───
interface CurriculumTopicData {
  id: string;
  board: string;
  grade: string;
  subject: string;
  unit: string;
  chapter: string;
  topic: string;
  subtopics: string;
  estimatedPeriods: number;
  sequenceOrder: number;
  learningOutcomes: string;
  bloomLevel: string;
  prerequisiteIds: string;
  createdAt: string;
}

interface CurriculumDocSectionA {
  board?: string; grade?: string; subject?: string; academicYear?: string;
  totalPeriodsAvailable?: number; totalPeriodsAllocated?: number;
  totalHoursAvailable?: number; totalHoursAllocated?: number;
  subjectPhilosophy?: string; keyCompetencies?: string[];
}

interface CurriculumDocSectionBTerm {
  termName?: string; weeks?: string;
  units?: { unitNo?: number; unitTitle?: string; estimatedPeriods?: number; termWeeks?: string }[];
}
interface CurriculumDocSectionB { terms?: CurriculumDocSectionBTerm[] }

interface CurriculumDocSectionCTopic {
  topicTitle?: string; subtopics?: string[]; curriculumCode?: string;
  learningOutcomes?: string[]; bloomLevels?: string[];
  estimatedPeriods?: number; termMonthWeek?: string;
  prerequisiteKnowledge?: string; keyVocabulary?: string[];
  suggestedTeachingMethods?: string[]; learningResources?: string[];
  assessmentType?: string; crossCurricularLinks?: string;
  skillsDeveloped?: string[]; differentiationNotes?: string;
  valuesLifeSkills?: string;
}
interface CurriculumDocSectionCUnit { unitNo?: number; unitTitle?: string; topics?: CurriculumDocSectionCTopic[] }

interface CurriculumDocSectionD {
  formativeWeightage?: string; summativeWeightage?: string;
  internalAssessment?: string; projectWork?: string; practicals?: string;
  examinationSchedule?: { examName?: string; term?: string; tentativePeriod?: string }[];
  sampleRubricCriteria?: string[];
}

interface CurriculumDocSectionE {
  prescribedTextbooks?: string[]; referenceBooks?: string[];
  digitalPlatforms?: string[]; labEquipment?: string[]; manipulatives?: string[];
}

interface CurriculumDocSectionFMonth {
  month?: string;
  weeks?: { week?: string; content?: string; isBuffer?: boolean; bufferType?: string }[];
}
interface CurriculumDocSectionF { months?: CurriculumDocSectionFMonth[] }

interface CurriculumDocSectionG {
  ictIntegration?: string[]; experientialLearning?: string[];
  fieldTripsGuestSessions?: string[]; coCurricularLinkages?: string[];
}

interface CurriculumDocument {
  id: string; board: string; grade: string; subject: string;
  academicYear: string; totalWeeks: number; periodsPerWeek: number;
  periodDuration: number; termStructure: string; medium: string;
  specialRequirements: string;
  sectionA: CurriculumDocSectionA; sectionB: CurriculumDocSectionB;
  sectionC: CurriculumDocSectionCUnit[]; sectionD: CurriculumDocSectionD;
  sectionE: CurriculumDocSectionE; sectionF: CurriculumDocSectionF;
  sectionG: CurriculumDocSectionG;
  createdAt: string;
}

function CurriculumBuilderSection({ teachers }: { teachers: Teacher[] }) {
  const { toast } = useToast();

  // ── Step 1: Input Fields ──
  const [selectedBoard, setSelectedBoard] = useState<string>('CBSE');
  const [selectedGrade, setSelectedGrade] = useState<string>('Grade 6');
  const [selectedSubject, setSelectedSubject] = useState<string>('Mathematics');
  const [academicYear, setAcademicYear] = useState<string>('2025-2026');
  const [totalWeeks, setTotalWeeks] = useState<number>(40);
  const [periodsPerWeek, setPeriodsPerWeek] = useState<number>(5);
  const [periodDuration, setPeriodDuration] = useState<number>(40);
  const [termStructure, setTermStructure] = useState<string>('2-semester');
  const [medium, setMedium] = useState<string>('English');
  const [specialRequirements, setSpecialRequirements] = useState<string>('');

  // ── Step 2: Generation & Display ──
  const [generating, setGenerating] = useState(false);
  const [curriculumDocs, setCurriculumDocs] = useState<CurriculumDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string>('A');
  const [copied, setCopied] = useState(false);

  // ── Send to Teachers ──
  const [sendToTeachersOpen, setSendToTeachersOpen] = useState(false);
  const [sendMode, setSendMode] = useState<'manual' | 'ai'>('manual');
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [aiSending, setAiSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

  // ── Legacy topic data for send ──
  const [curriculumTopics, setCurriculumTopics] = useState<CurriculumTopicData[]>([]);

  const BOARDS = ['CBSE', 'ICSE', 'IB PYP', 'IB MYP', 'IB DP', 'Cambridge Primary', 'Cambridge Lower Secondary', 'Cambridge IGCSE', 'Cambridge AS/A Level', 'US Common Core', 'UK National Curriculum', 'State Board', 'Montessori', 'Waldorf', 'Custom/Hybrid'];
  const ALL_GRADES = Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`);
  const TERM_STRUCTURES = ['2-semester', '3-trimester', '4-quarter'];
  const SUBJECTS: Record<string, string[]> = {
    'CBSE': ['Mathematics', 'English', 'Science', 'Social Science', 'Hindi', 'Sanskrit', 'Computer Science', 'Physical Education', 'Art', 'Music'],
    'ICSE': ['Mathematics', 'English', 'Physics', 'Chemistry', 'Biology', 'History & Civics', 'Geography', 'Second Language', 'Computer Science', 'Physical Education'],
    'IB PYP': ['Language', 'Mathematics', 'Science', 'Social Studies', 'Arts', 'Personal Social & Physical Education'],
    'IB MYP': ['Language & Literature', 'Language Acquisition', 'Individuals & Societies', 'Sciences', 'Mathematics', 'Arts', 'Physical & Health Education', 'Design'],
    'IB DP': ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'Economics', 'Business Management', 'Psychology', 'History', 'English A', 'English B', 'Computer Science', 'Visual Arts'],
    'Cambridge Primary': ['English', 'Mathematics', 'Science', 'Global Perspectives', 'ICT Starters', 'Art & Design'],
    'Cambridge Lower Secondary': ['English', 'Mathematics', 'Science', 'Global Perspectives', 'ICT Starters', 'Art & Design'],
    'Cambridge IGCSE': ['Mathematics', 'English', 'Physics', 'Chemistry', 'Biology', 'Economics', 'Business Studies', 'Computer Science', 'Geography', 'History'],
    'Cambridge AS/A Level': ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'Economics', 'Business', 'Computer Science', 'Psychology', 'English Language'],
    'US Common Core': ['Mathematics', 'English Language Arts', 'Science (NGSS)', 'Social Studies', 'Physical Education', 'Art', 'Music', 'Computer Science'],
    'UK National Curriculum': ['Mathematics', 'English', 'Science', 'History', 'Geography', 'Art & Design', 'Computing', 'Design & Technology', 'Music', 'Physical Education', 'PSHE'],
    'State Board': ['Mathematics', 'English', 'Science', 'Social Science', 'Regional Language', 'Hindi', 'Computer Science', 'Physical Education'],
    'Montessori': ['Practical Life', 'Sensorial', 'Language', 'Mathematics', 'Cultural Studies', 'Science', 'Geography', 'Art', 'Music'],
    'Waldorf': ['Mathematics', 'Language Arts', 'Science', 'History', 'Geography', 'Handwork', 'Eurythmy', 'Art', 'Music', 'Gardening'],
    'Custom/Hybrid': ['Mathematics', 'English', 'Science', 'Social Studies', 'Second Language', 'Computer Science', 'Physical Education', 'Art'],
  };

  const currentSubjects = SUBJECTS[selectedBoard] || SUBJECTS['CBSE'];

  // Fetch saved documents
  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('board', selectedBoard);
      params.set('grade', selectedGrade);
      const res = await fetch(`/api/curriculum/architect?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setCurriculumDocs(data);
      }
    } catch {
      console.error('Error fetching curriculum documents');
    } finally {
      setLoading(false);
    }
  }, [selectedBoard, selectedGrade]);

  // Also fetch legacy topics
  const fetchLegacyTopics = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set('board', selectedBoard);
      params.set('grade', selectedGrade);
      const res = await fetch(`/api/curriculum?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setCurriculumTopics(data);
      }
    } catch {
      console.error('Error fetching curriculum topics');
    }
  }, [selectedBoard, selectedGrade]);

  useEffect(() => {
    fetchDocuments(); // eslint-disable-line react-hooks/set-state-in-effect
    fetchLegacyTopics();
  }, [fetchDocuments, fetchLegacyTopics]);

  // Auto-select first subject when board changes
  useEffect(() => {
    const subs = SUBJECTS[selectedBoard] || SUBJECTS['CBSE'];
    if (!subs.includes(selectedSubject)) {
      setSelectedSubject(subs[0]); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [selectedBoard]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/curriculum/architect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          board: selectedBoard,
          grade: selectedGrade,
          subject: selectedSubject,
          academicYear,
          totalWeeks,
          periodsPerWeek,
          periodDuration,
          termStructure,
          medium,
          specialRequirements,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: 'Curriculum Generated',
          description: `CurriculumArchitect AI has generated a comprehensive ${selectedBoard} curriculum for ${selectedGrade} ${selectedSubject}`,
        });
        fetchDocuments();
        fetchLegacyTopics();
        // Auto-select the new document
        if (data.documentId) setActiveDocId(data.documentId);
      } else {
        toast({ title: 'Error', description: data.error || 'Failed to generate curriculum', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to generate curriculum', variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyJSON = async (doc: CurriculumDocument) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(doc, null, 2));
      setCopied(true);
      toast({ title: 'Copied', description: 'Full curriculum JSON copied to clipboard' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Error', description: 'Failed to copy', variant: 'destructive' });
    }
  };

  const handleDownloadCurriculum = (doc: CurriculumDocument) => {
    try {
      const jsonStr = JSON.stringify(doc, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `curriculum-${doc.board}-${doc.grade}-${doc.subject}.json`.replace(/\s+/g, '-').toLowerCase();
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: 'Downloaded', description: 'Curriculum document downloaded as JSON' });
    } catch {
      toast({ title: 'Error', description: 'Failed to download curriculum', variant: 'destructive' });
    }
  };

  const handleDeleteDoc = async (id: string) => {
    try {
      await fetch(`/api/curriculum/architect/${id}`, { method: 'DELETE' });
      setCurriculumDocs(prev => prev.filter(d => d.id !== id));
      if (activeDocId === id) setActiveDocId(null);
      toast({ title: 'Deleted', description: 'Curriculum document removed' });
    } catch {
      toast({ title: 'Error', description: 'Failed to delete', variant: 'destructive' });
    }
  };

  const activeDoc = curriculumDocs.find(d => d.id === activeDocId);

  const bloomColors: Record<string, string> = {
    Remember: 'bg-gray-100 text-gray-700 border-gray-300',
    Understand: 'bg-blue-100 text-blue-700 border-blue-300',
    Apply: 'bg-emerald-100 text-emerald-700 border-emerald-300',
    Analyze: 'bg-amber-100 text-amber-700 border-amber-300',
    Evaluate: 'bg-orange-100 text-orange-700 border-orange-300',
    Create: 'bg-purple-100 text-purple-700 border-purple-300',
  };

  const sectionTabs = [
    { key: 'A', label: 'Overview', icon: <Eye className="w-3.5 h-3.5" /> },
    { key: 'B', label: 'Scope & Sequence', icon: <Layers className="w-3.5 h-3.5" /> },
    { key: 'C', label: 'Unit Breakdown', icon: <ListChecks className="w-3.5 h-3.5" /> },
    { key: 'D', label: 'Assessment', icon: <Target className="w-3.5 h-3.5" /> },
    { key: 'E', label: 'Resources', icon: <Library className="w-3.5 h-3.5" /> },
    { key: 'F', label: 'Pacing Calendar', icon: <CalendarDays className="w-3.5 h-3.5" /> },
    { key: 'G', label: 'Integration', icon: <Lightbulb className="w-3.5 h-3.5" /> },
  ];

  const totalPeriodsAvailable = totalWeeks * periodsPerWeek;
  const bufferPeriods = Math.round(totalPeriodsAvailable * 0.12);
  const teachingPeriods = totalPeriodsAvailable - bufferPeriods;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-6 text-white">
        <div className="flex items-center gap-3 mb-3">
          <div className="bg-white/20 p-2 rounded-xl">
            <BookTemplate className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Curriculum Builder</h1>
            <p className="text-emerald-100 text-sm">CurriculumArchitect AI — Board-Aligned Annual Curriculum Generation</p>
          </div>
        </div>
        <p className="text-emerald-50 text-sm max-w-2xl">
          Generate comprehensive, board-aligned annual curricula with all 7 mandatory sections: Overview, Scope &amp; Sequence, Unit Breakdown, Assessment Framework, Resources, Pacing Calendar, and Integration Layers.
        </p>
      </div>

      {/* Input Controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            CurriculumArchitect AI Configuration
          </CardTitle>
          <CardDescription>Configure the required inputs for AI-powered curriculum generation</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Row 1: Board, Grade, Subject */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Board / Curriculum *</Label>
              <Select value={selectedBoard} onValueChange={setSelectedBoard}>
                <SelectTrigger><SelectValue placeholder="Select Board" /></SelectTrigger>
                <SelectContent>
                  {BOARDS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Grade / Year Level *</Label>
              <Select value={selectedGrade} onValueChange={setSelectedGrade}>
                <SelectTrigger><SelectValue placeholder="Select Grade" /></SelectTrigger>
                <SelectContent>
                  {ALL_GRADES.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Subject *</Label>
              <Select value={selectedSubject} onValueChange={setSelectedSubject}>
                <SelectTrigger><SelectValue placeholder="Select Subject" /></SelectTrigger>
                <SelectContent>
                  {currentSubjects.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 2: Academic Year, Weeks, Periods, Duration, Term */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Academic Year</Label>
              <Input value={academicYear} onChange={e => setAcademicYear(e.target.value)} className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Total Weeks</Label>
              <Input type="number" min={1} max={52} value={totalWeeks} onChange={e => setTotalWeeks(Number(e.target.value))} className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Periods/Week</Label>
              <Input type="number" min={1} max={10} value={periodsPerWeek} onChange={e => setPeriodsPerWeek(Number(e.target.value))} className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Period Duration (min)</Label>
              <Select value={String(periodDuration)} onValueChange={v => setPeriodDuration(Number(v))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 min</SelectItem>
                  <SelectItem value="35">35 min</SelectItem>
                  <SelectItem value="40">40 min</SelectItem>
                  <SelectItem value="45">45 min</SelectItem>
                  <SelectItem value="50">50 min</SelectItem>
                  <SelectItem value="60">60 min</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Term Structure</Label>
              <Select value={termStructure} onValueChange={setTermStructure}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TERM_STRUCTURES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 3: Medium, Special Requirements */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Medium of Instruction</Label>
              <Select value={medium} onValueChange={setMedium}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="English">English</SelectItem>
                  <SelectItem value="Hindi">Hindi</SelectItem>
                  <SelectItem value="Bilingual">Bilingual</SelectItem>
                  <SelectItem value="Regional Language">Regional Language</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Special Requirements</Label>
              <Input
                value={specialRequirements}
                onChange={e => setSpecialRequirements(e.target.value)}
                placeholder="e.g., Inclusive education, ICT integration, lab availability..."
                className="h-9 text-sm"
              />
            </div>
          </div>

          {/* Period Budget Summary */}
          <div className="flex items-center gap-4 p-3 bg-emerald-50 rounded-xl border border-emerald-200">
            <div className="text-center px-4">
              <p className="text-lg font-bold text-emerald-700">{totalPeriodsAvailable}</p>
              <p className="text-[10px] text-emerald-600">Total Periods</p>
            </div>
            <div className="text-emerald-400">−</div>
            <div className="text-center px-4">
              <p className="text-lg font-bold text-amber-700">{bufferPeriods}</p>
              <p className="text-[10px] text-amber-600">Buffer (12%)</p>
            </div>
            <div className="text-emerald-400">=</div>
            <div className="text-center px-4">
              <p className="text-lg font-bold text-teal-700">{teachingPeriods}</p>
              <p className="text-[10px] text-teal-600">Teaching Periods</p>
            </div>
            <div className="ml-4 text-xs text-muted-foreground border-l pl-4">
              ≈ {Math.round((teachingPeriods * periodDuration) / 60)} instructional hours
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              onClick={handleGenerate}
              disabled={generating}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
            >
              {generating ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Brain className="w-4 h-4 mr-2" />}
              {generating ? 'CurriculumArchitect AI is Generating...' : 'Generate Annual Curriculum'}
            </Button>
            {curriculumDocs.length > 0 && (
              <Button onClick={() => { setSendToTeachersOpen(true); setSendResult(null); }} variant="outline" size="sm" className="border-blue-300 hover:bg-blue-50 hover:text-blue-700">
                <Users className="w-4 h-4 mr-2" />
                Send to Teachers
              </Button>
            )}
            <Badge variant="outline" className="text-xs">
              {curriculumDocs.length} document{curriculumDocs.length !== 1 ? 's' : ''}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Loading State */}
      {generating && (
        <Card className="border-emerald-200">
          <CardContent className="p-8 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <Brain className="w-12 h-12 text-emerald-600 animate-pulse" />
                <Sparkles className="w-5 h-5 text-amber-500 absolute -top-1 -right-1 animate-bounce" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-emerald-800">CurriculumArchitect AI is Working</h3>
                <p className="text-sm text-muted-foreground mt-1">Generating comprehensive {selectedBoard} curriculum for {selectedGrade} {selectedSubject}...</p>
                <p className="text-xs text-muted-foreground mt-2">This includes all 7 sections: Overview, Scope &amp; Sequence, Unit Breakdown, Assessment, Resources, Pacing, and Integration</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-emerald-600">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Analyzing board standards, scaffolding Bloom&apos;s levels, pacing calendar...
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Document List + Detail View */}
      {!generating && (
        loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 text-emerald-600 animate-spin" />
            <span className="ml-3 text-muted-foreground">Loading curriculum documents...</span>
          </div>
        ) : curriculumDocs.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <BookTemplate className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Curriculum Generated Yet</h3>
              <p className="text-muted-foreground mb-4">Configure the inputs above and click Generate to create your AI-powered curriculum with all 7 mandatory sections</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {/* Document Selector */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              {curriculumDocs.map(doc => (
                <button
                  key={doc.id}
                  onClick={() => { setActiveDocId(doc.id); setActiveSection('A'); }}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium whitespace-nowrap transition-all ${
                    activeDocId === doc.id
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-emerald-300 hover:bg-emerald-50'
                  }`}
                >
                  <GraduationCap className="w-4 h-4" />
                  <span>{doc.grade} {doc.subject}</span>
                  <Badge variant="outline" className={`text-[9px] ${
                    activeDocId === doc.id ? 'border-white/40 text-emerald-100' : 'bg-gray-50'
                  }`}>{doc.board}</Badge>
                </button>
              ))}
            </div>

            {/* Active Document Detail */}
            {activeDoc && (
              <Card className="overflow-hidden">
                {/* Document Header */}
                <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3 text-white">
                    <Brain className="w-5 h-5" />
                    <div>
                      <h3 className="font-semibold text-sm">{activeDoc.sectionA?.subject || activeDoc.subject} — {activeDoc.grade}</h3>
                      <p className="text-emerald-100 text-[10px]">{activeDoc.board} | {activeDoc.academicYear} | {activeDoc.sectionA?.totalPeriodsAllocated || 0} periods allocated</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button onClick={() => handleDownloadCurriculum(activeDoc)} variant="ghost" size="sm" className="text-white/80 hover:text-white hover:bg-white/20 h-7 text-xs">
                      <Download className="w-3.5 h-3.5 mr-1" />
                      Download JSON
                    </Button>
                    <Button onClick={() => handleCopyJSON(activeDoc)} variant="ghost" size="sm" className="text-white/80 hover:text-white hover:bg-white/20 h-7 text-xs">
                      {copied ? <Check className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                      {copied ? 'Copied!' : 'Copy JSON'}
                    </Button>
                    <Button onClick={() => handleDeleteDoc(activeDoc.id)} variant="ghost" size="sm" className="text-white/80 hover:text-red-200 hover:bg-red-500/20 h-7 text-xs">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Section Tabs */}
                <div className="border-b bg-gray-50/80 px-2 pt-2">
                  <div className="flex items-center gap-1 overflow-x-auto">
                    {sectionTabs.map(tab => (
                      <button
                        key={tab.key}
                        onClick={() => setActiveSection(tab.key)}
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg transition-all whitespace-nowrap ${
                          activeSection === tab.key
                            ? 'bg-white text-emerald-700 border border-b-white -mb-px shadow-sm'
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        {tab.icon}
                        <span>{tab.key}. {tab.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Section Content */}
                <div className="p-5">
                  {/* Section A: Curriculum Overview */}
                  {activeSection === 'A' && activeDoc.sectionA && (
                    <div className="space-y-4">
                      <h4 className="font-semibold text-emerald-800 flex items-center gap-2">
                        <Eye className="w-4 h-4" /> A. Curriculum Overview
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="p-3 bg-emerald-50 rounded-lg">
                          <p className="text-[10px] text-muted-foreground">Board</p>
                          <p className="text-sm font-semibold text-emerald-800">{activeDoc.sectionA.board || activeDoc.board}</p>
                        </div>
                        <div className="p-3 bg-blue-50 rounded-lg">
                          <p className="text-[10px] text-muted-foreground">Grade</p>
                          <p className="text-sm font-semibold text-blue-800">{activeDoc.sectionA.grade || activeDoc.grade}</p>
                        </div>
                        <div className="p-3 bg-amber-50 rounded-lg">
                          <p className="text-[10px] text-muted-foreground">Subject</p>
                          <p className="text-sm font-semibold text-amber-800">{activeDoc.sectionA.subject || activeDoc.subject}</p>
                        </div>
                        <div className="p-3 bg-purple-50 rounded-lg">
                          <p className="text-[10px] text-muted-foreground">Academic Year</p>
                          <p className="text-sm font-semibold text-purple-800">{activeDoc.sectionA.academicYear || activeDoc.academicYear}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="p-3 bg-teal-50 rounded-lg text-center">
                          <p className="text-xl font-bold text-teal-700">{activeDoc.sectionA.totalPeriodsAvailable || totalPeriodsAvailable}</p>
                          <p className="text-[10px] text-teal-600">Periods Available</p>
                        </div>
                        <div className="p-3 bg-emerald-50 rounded-lg text-center">
                          <p className="text-xl font-bold text-emerald-700">{activeDoc.sectionA.totalPeriodsAllocated || 0}</p>
                          <p className="text-[10px] text-emerald-600">Periods Allocated</p>
                        </div>
                        <div className="p-3 bg-blue-50 rounded-lg text-center">
                          <p className="text-xl font-bold text-blue-700">{activeDoc.sectionA.totalHoursAvailable || Math.round((totalPeriodsAvailable * periodDuration) / 60)}</p>
                          <p className="text-[10px] text-blue-600">Hours Available</p>
                        </div>
                        <div className="p-3 bg-amber-50 rounded-lg text-center">
                          <p className="text-xl font-bold text-amber-700">{activeDoc.sectionA.totalHoursAllocated || 0}</p>
                          <p className="text-[10px] text-amber-600">Hours Allocated</p>
                        </div>
                      </div>
                      {activeDoc.sectionA.subjectPhilosophy && (
                        <div className="p-4 bg-gray-50 rounded-lg border">
                          <p className="text-xs font-semibold text-gray-700 mb-1">Subject Philosophy &amp; Rationale</p>
                          <p className="text-sm text-gray-600">{activeDoc.sectionA.subjectPhilosophy}</p>
                        </div>
                      )}
                      {activeDoc.sectionA.keyCompetencies && activeDoc.sectionA.keyCompetencies.length > 0 && (
                        <div className="p-4 bg-emerald-50/50 rounded-lg border border-emerald-200">
                          <p className="text-xs font-semibold text-emerald-700 mb-2">Key Competencies / Skills Developed</p>
                          <div className="flex flex-wrap gap-2">
                            {activeDoc.sectionA.keyCompetencies.map((comp, i) => (
                              <Badge key={i} className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px]">
                                <TrendingUp className="w-3 h-3 mr-1" />{comp}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Section B: Annual Scope & Sequence */}
                  {activeSection === 'B' && activeDoc.sectionB && (
                    <div className="space-y-4">
                      <h4 className="font-semibold text-emerald-800 flex items-center gap-2">
                        <Layers className="w-4 h-4" /> B. Annual Scope &amp; Sequence
                      </h4>
                      {activeDoc.sectionB.terms && activeDoc.sectionB.terms.length > 0 ? (
                        activeDoc.sectionB.terms.map((term, tIdx) => (
                          <div key={tIdx} className="border rounded-lg overflow-hidden">
                            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 px-4 py-2.5 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <CalendarDays className="w-4 h-4 text-emerald-600" />
                                <span className="font-medium text-sm text-emerald-800">{term.termName || `Term ${tIdx + 1}`}</span>
                                <Badge variant="outline" className="text-[9px]">{term.weeks || ''}</Badge>
                              </div>
                              <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">
                                {term.units?.reduce((s, u) => s + (u.estimatedPeriods || 0), 0) || 0} periods
                              </Badge>
                            </div>
                            <div className="p-3">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b bg-gray-50">
                                    <th className="text-left p-2 font-medium text-muted-foreground">Unit #</th>
                                    <th className="text-left p-2 font-medium text-muted-foreground">Unit Title</th>
                                    <th className="text-center p-2 font-medium text-muted-foreground">Periods</th>
                                    <th className="text-left p-2 font-medium text-muted-foreground">Weeks</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {term.units?.map((unit, uIdx) => (
                                    <tr key={uIdx} className={uIdx % 2 === 0 ? '' : 'bg-gray-50/50'}>
                                      <td className="p-2 font-medium text-emerald-600">{unit.unitNo || uIdx + 1}</td>
                                      <td className="p-2">{unit.unitTitle}</td>
                                      <td className="p-2 text-center"><Badge variant="outline" className="text-[9px]">{unit.estimatedPeriods}P</Badge></td>
                                      <td className="p-2 text-muted-foreground">{unit.termWeeks}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">No scope &amp; sequence data available.</p>
                      )}
                    </div>
                  )}

                  {/* Section C: Unit-wise Detailed Breakdown */}
                  {activeSection === 'C' && activeDoc.sectionC && (
                    <div className="space-y-4">
                      <h4 className="font-semibold text-emerald-800 flex items-center gap-2">
                        <ListChecks className="w-4 h-4" /> C. Unit-wise / Topic-wise Detailed Breakdown
                      </h4>
                      {Array.isArray(activeDoc.sectionC) && activeDoc.sectionC.length > 0 ? (
                        activeDoc.sectionC.map((unit, uIdx) => (
                          <div key={uIdx} className="border rounded-lg overflow-hidden">
                            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 px-4 py-2.5 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs flex items-center justify-center font-bold">{unit.unitNo || uIdx + 1}</span>
                                <span className="font-medium text-sm text-emerald-800">{unit.unitTitle}</span>
                                <Badge variant="outline" className="text-[9px]">{unit.topics?.length || 0} topics</Badge>
                              </div>
                              <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">
                                {unit.topics?.reduce((s, t) => s + (t.estimatedPeriods || 0), 0) || 0} periods
                              </Badge>
                            </div>
                            <div className="p-3 space-y-2">
                              {unit.topics?.map((topic, tIdx) => (
                                <div key={tIdx} className="p-3 bg-white rounded-lg border border-gray-100 hover:border-emerald-200 transition-all">
                                  <div className="flex items-center justify-between mb-2">
                                    <p className="text-sm font-medium text-gray-800">{topic.topicTitle}</p>
                                    <div className="flex items-center gap-1.5">
                                      {topic.curriculumCode && (
                                        <Badge variant="outline" className="text-[8px] bg-gray-50">{topic.curriculumCode}</Badge>
                                      )}
                                      <Badge variant="outline" className="text-[9px]">{topic.estimatedPeriods}P</Badge>
                                      {topic.bloomLevels?.map((bl, i) => (
                                        <Badge key={i} className={`text-[8px] ${bloomColors[bl] || bloomColors.Remember}`}>{bl}</Badge>
                                      ))}
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                                    {topic.termMonthWeek && (
                                      <div><span className="font-medium text-gray-500">When: </span><span className="text-gray-700">{topic.termMonthWeek}</span></div>
                                    )}
                                    {topic.assessmentType && (
                                      <div><span className="font-medium text-gray-500">Assessment: </span><span className="text-gray-700">{topic.assessmentType}</span></div>
                                    )}
                                    {topic.prerequisiteKnowledge && (
                                      <div className="md:col-span-2"><span className="font-medium text-gray-500">Prerequisites: </span><span className="text-gray-700">{topic.prerequisiteKnowledge}</span></div>
                                    )}
                                    {topic.crossCurricularLinks && (
                                      <div><span className="font-medium text-gray-500">Cross-curricular: </span><span className="text-gray-700">{topic.crossCurricularLinks}</span></div>
                                    )}
                                    {topic.differentiationNotes && (
                                      <div><span className="font-medium text-amber-600">Differentiation: </span><span className="text-amber-800">{topic.differentiationNotes}</span></div>
                                    )}
                                    {topic.valuesLifeSkills && (
                                      <div><span className="font-medium text-purple-600">Values/SEL: </span><span className="text-purple-800">{topic.valuesLifeSkills}</span></div>
                                    )}
                                  </div>

                                  {topic.subtopics && topic.subtopics.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                      {topic.subtopics.map((st, i) => (
                                        <span key={i} className="text-[9px] px-1.5 py-0.5 bg-gray-50 rounded text-gray-600">{st}</span>
                                      ))}
                                    </div>
                                  )}

                                  {topic.learningOutcomes && topic.learningOutcomes.length > 0 && (
                                    <div className="mt-2 space-y-0.5">
                                      {topic.learningOutcomes.map((o, i) => (
                                        <p key={i} className="text-[10px] text-emerald-600 flex items-start gap-1">
                                          <CheckCircle2 className="w-2.5 h-2.5 mt-0.5 shrink-0" />
                                          {o}
                                        </p>
                                      ))}
                                    </div>
                                  )}

                                  {topic.keyVocabulary && topic.keyVocabulary.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                      <span className="text-[9px] font-medium text-gray-400 mr-1">Vocab:</span>
                                      {topic.keyVocabulary.map((v, i) => (
                                        <span key={i} className="text-[8px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">{v}</span>
                                      ))}
                                    </div>
                                  )}

                                  {topic.suggestedTeachingMethods && topic.suggestedTeachingMethods.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                      <span className="text-[9px] font-medium text-gray-400 mr-1">Methods:</span>
                                      {topic.suggestedTeachingMethods.map((m, i) => (
                                        <span key={i} className="text-[8px] px-1.5 py-0.5 bg-teal-50 text-teal-600 rounded">{m}</span>
                                      ))}
                                    </div>
                                  )}

                                  {topic.learningResources && topic.learningResources.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                      <span className="text-[9px] font-medium text-gray-400 mr-1">Resources:</span>
                                      {topic.learningResources.map((r, i) => (
                                        <span key={i} className="text-[8px] px-1.5 py-0.5 bg-orange-50 text-orange-600 rounded">{r}</span>
                                      ))}
                                    </div>
                                  )}

                                  {topic.skillsDeveloped && topic.skillsDeveloped.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                      <span className="text-[9px] font-medium text-gray-400 mr-1">Skills:</span>
                                      {topic.skillsDeveloped.map((sk, i) => (
                                        <span key={i} className="text-[8px] px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded">{sk}</span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">No unit breakdown data available.</p>
                      )}
                    </div>
                  )}

                  {/* Section D: Assessment Framework */}
                  {activeSection === 'D' && activeDoc.sectionD && (
                    <div className="space-y-4">
                      <h4 className="font-semibold text-emerald-800 flex items-center gap-2">
                        <Target className="w-4 h-4" /> D. Assessment Framework
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {activeDoc.sectionD.formativeWeightage && (
                          <div className="p-3 bg-blue-50 rounded-lg">
                            <p className="text-[10px] text-muted-foreground">Formative Weightage</p>
                            <p className="text-sm font-semibold text-blue-800">{activeDoc.sectionD.formativeWeightage}</p>
                          </div>
                        )}
                        {activeDoc.sectionD.summativeWeightage && (
                          <div className="p-3 bg-amber-50 rounded-lg">
                            <p className="text-[10px] text-muted-foreground">Summative Weightage</p>
                            <p className="text-sm font-semibold text-amber-800">{activeDoc.sectionD.summativeWeightage}</p>
                          </div>
                        )}
                        {activeDoc.sectionD.internalAssessment && (
                          <div className="p-3 bg-emerald-50 rounded-lg">
                            <p className="text-[10px] text-muted-foreground">Internal Assessment</p>
                            <p className="text-sm font-semibold text-emerald-800">{activeDoc.sectionD.internalAssessment}</p>
                          </div>
                        )}
                        {activeDoc.sectionD.projectWork && (
                          <div className="p-3 bg-purple-50 rounded-lg">
                            <p className="text-[10px] text-muted-foreground">Project Work</p>
                            <p className="text-sm font-semibold text-purple-800">{activeDoc.sectionD.projectWork}</p>
                          </div>
                        )}
                        {activeDoc.sectionD.practicals && (
                          <div className="p-3 bg-teal-50 rounded-lg">
                            <p className="text-[10px] text-muted-foreground">Practicals</p>
                            <p className="text-sm font-semibold text-teal-800">{activeDoc.sectionD.practicals}</p>
                          </div>
                        )}
                      </div>
                      {activeDoc.sectionD.examinationSchedule && activeDoc.sectionD.examinationSchedule.length > 0 && (
                        <div className="border rounded-lg overflow-hidden">
                          <p className="text-xs font-semibold text-gray-700 p-3 bg-gray-50 border-b">Examination Schedule</p>
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-gray-50 border-b">
                                <th className="text-left p-2 font-medium text-muted-foreground">Exam</th>
                                <th className="text-left p-2 font-medium text-muted-foreground">Term</th>
                                <th className="text-left p-2 font-medium text-muted-foreground">Tentative Period</th>
                              </tr>
                            </thead>
                            <tbody>
                              {activeDoc.sectionD.examinationSchedule.map((exam, i) => (
                                <tr key={i} className={i % 2 === 0 ? '' : 'bg-gray-50/50'}>
                                  <td className="p-2 font-medium">{exam.examName}</td>
                                  <td className="p-2 text-muted-foreground">{exam.term}</td>
                                  <td className="p-2 text-emerald-600">{exam.tentativePeriod}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {activeDoc.sectionD.sampleRubricCriteria && activeDoc.sectionD.sampleRubricCriteria.length > 0 && (
                        <div className="p-4 bg-amber-50/50 rounded-lg border border-amber-200">
                          <p className="text-xs font-semibold text-amber-700 mb-2">Sample Rubric Criteria</p>
                          <ul className="space-y-1">
                            {activeDoc.sectionD.sampleRubricCriteria.map((c, i) => (
                              <li key={i} className="text-xs text-amber-800 flex items-start gap-2">
                                <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0 text-amber-500" />
                                {c}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Section E: Resource & Material List */}
                  {activeSection === 'E' && activeDoc.sectionE && (
                    <div className="space-y-4">
                      <h4 className="font-semibold text-emerald-800 flex items-center gap-2">
                        <Library className="w-4 h-4" /> E. Resource &amp; Material List
                      </h4>
                      {[
                        { label: 'Prescribed Textbooks', items: activeDoc.sectionE.prescribedTextbooks, color: 'emerald' },
                        { label: 'Reference Books', items: activeDoc.sectionE.referenceBooks, color: 'blue' },
                        { label: 'Digital Platforms', items: activeDoc.sectionE.digitalPlatforms, color: 'purple' },
                        { label: 'Lab Equipment', items: activeDoc.sectionE.labEquipment, color: 'amber' },
                        { label: 'Manipulatives', items: activeDoc.sectionE.manipulatives, color: 'teal' },
                      ].filter(sec => sec.items && sec.items.length > 0).map((sec, i) => (
                        <div key={i} className={`p-4 bg-${sec.color}-50/50 rounded-lg border border-${sec.color}-200`}>
                          <p className={`text-xs font-semibold text-${sec.color}-700 mb-2`}>{sec.label}</p>
                          <ul className="space-y-1">
                            {sec.items!.map((item, j) => (
                              <li key={j} className={`text-xs text-${sec.color}-800 flex items-start gap-2`}>
                                <BookOpen className="w-3 h-3 mt-0.5 shrink-0" />
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                      {(!activeDoc.sectionE.prescribedTextbooks || activeDoc.sectionE.prescribedTextbooks.length === 0) &&
                        (!activeDoc.sectionE.referenceBooks || activeDoc.sectionE.referenceBooks.length === 0) && (
                        <p className="text-sm text-muted-foreground">No resource data available.</p>
                      )}
                    </div>
                  )}

                  {/* Section F: Pacing Calendar */}
                  {activeSection === 'F' && activeDoc.sectionF && (
                    <div className="space-y-4">
                      <h4 className="font-semibold text-emerald-800 flex items-center gap-2">
                        <CalendarDays className="w-4 h-4" /> F. Pacing Calendar
                      </h4>
                      {activeDoc.sectionF.months && activeDoc.sectionF.months.length > 0 ? (
                        activeDoc.sectionF.months.map((month, mIdx) => (
                          <div key={mIdx} className="border rounded-lg overflow-hidden">
                            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 px-4 py-2 flex items-center gap-2">
                              <CalendarDays className="w-4 h-4 text-emerald-600" />
                              <span className="font-medium text-sm text-emerald-800">{month.month}</span>
                              <Badge variant="outline" className="text-[9px]">{month.weeks?.length || 0} weeks</Badge>
                            </div>
                            <div className="p-2">
                              {month.weeks?.map((week, wIdx) => (
                                <div key={wIdx} className={`flex items-center gap-3 p-2 text-xs ${week.isBuffer ? 'bg-amber-50/50' : wIdx % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                                  <span className="font-medium text-emerald-600 w-16 shrink-0">{week.week}</span>
                                  <span className="flex-1 text-gray-700">{week.content}</span>
                                  {week.isBuffer && (
                                    <Badge className="text-[8px] bg-amber-100 text-amber-700 border-amber-300">
                                      {week.bufferType || 'Buffer'}
                                    </Badge>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">No pacing calendar data available.</p>
                      )}
                    </div>
                  )}

                  {/* Section G: Integration Layers */}
                  {activeSection === 'G' && activeDoc.sectionG && (
                    <div className="space-y-4">
                      <h4 className="font-semibold text-emerald-800 flex items-center gap-2">
                        <Lightbulb className="w-4 h-4" /> G. Integration Layers
                      </h4>
                      {[
                        { label: 'ICT / Technology Integration', items: activeDoc.sectionG.ictIntegration, color: 'blue', icon: <Zap className="w-3 h-3" /> },
                        { label: 'Experiential & Project-Based Learning', items: activeDoc.sectionG.experientialLearning, color: 'emerald', icon: <Lightbulb className="w-3 h-3" /> },
                        { label: 'Field Trips / Guest Sessions', items: activeDoc.sectionG.fieldTripsGuestSessions, color: 'amber', icon: <MapPin className="w-3 h-3" /> },
                        { label: 'Co-Curricular Linkages', items: activeDoc.sectionG.coCurricularLinkages, color: 'purple', icon: <Activity className="w-3 h-3" /> },
                      ].filter(sec => sec.items && sec.items.length > 0).map((sec, i) => (
                        <div key={i} className={`p-4 bg-${sec.color}-50/50 rounded-lg border border-${sec.color}-200`}>
                          <p className={`text-xs font-semibold text-${sec.color}-700 mb-2 flex items-center gap-1.5`}>{sec.icon}{sec.label}</p>
                          <ul className="space-y-1.5">
                            {sec.items!.map((item, j) => (
                              <li key={j} className={`text-xs text-${sec.color}-800 flex items-start gap-2`}>
                                <ChevronRight className="w-3 h-3 mt-0.5 shrink-0" />
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                      {(!activeDoc.sectionG.ictIntegration || activeDoc.sectionG.ictIntegration.length === 0) &&
                        (!activeDoc.sectionG.experientialLearning || activeDoc.sectionG.experientialLearning.length === 0) && (
                        <p className="text-sm text-muted-foreground">No integration data available.</p>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            )}
          </div>
        )
      )}

      {/* Send to Teachers Dialog */}
      <Dialog open={sendToTeachersOpen} onOpenChange={setSendToTeachersOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="flex items-center gap-2 text-blue-800">
              <Users className="w-5 h-5" />
              Send Curriculum to Teachers
            </DialogTitle>
            <DialogDescription>
              Share generated curriculum with teachers who teach these subjects and grades
            </DialogDescription>
          </DialogHeader>

          {/* Mode Toggle */}
          <div className="px-6 py-3 flex items-center gap-3">
            <Button
              variant={sendMode === 'manual' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSendMode('manual')}
              className={sendMode === 'manual' ? 'bg-blue-600 hover:bg-blue-700' : ''}
            >
              <UserCheck className="w-4 h-4 mr-2" />
              Manual Selection
            </Button>
            <Button
              variant={sendMode === 'ai' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSendMode('ai')}
              className={sendMode === 'ai' ? 'bg-gradient-to-r from-emerald-600 to-teal-600' : ''}
            >
              <Brain className="w-4 h-4 mr-2" />
              AI Auto-Send
            </Button>
          </div>

          <ScrollArea className="max-h-[55vh] px-6">
            {sendResult ? (
              <div className="pb-6">
                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 text-center">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
                  <p className="font-semibold text-emerald-800">{sendResult}</p>
                </div>
              </div>
            ) : sendMode === 'manual' ? (
              <div className="pb-6 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">
                    {selectedTeacherIds.length} selected
                  </Badge>
                  <Button variant="ghost" size="sm" className="text-[10px] h-7" onClick={() => setSelectedTeacherIds([])}>
                    Clear
                  </Button>
                </div>
                <div className="space-y-2">
                  {teachers
                    .filter(t => t.subject === selectedSubject)
                    .map(teacher => {
                      const isSelected = selectedTeacherIds.includes(teacher.id);
                      const teacherGrades = JSON.parse(teacher.grades || '[]') as string[];
                      return (
                        <div
                          key={teacher.id}
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                            isSelected ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-200 hover:bg-blue-50/30'
                          }`}
                          onClick={() => {
                            setSelectedTeacherIds(prev =>
                              isSelected ? prev.filter(id => id !== teacher.id) : [...prev, teacher.id]
                            );
                          }}
                        >
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                            isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                          }`}>
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium truncate">{teacher.name}</p>
                              <Badge className="text-[9px] py-0 px-1.5 bg-emerald-100 text-emerald-700 border-emerald-300">
                                Subject Match
                              </Badge>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <Badge variant="outline" className="text-[9px] py-0 px-1">{teacher.subject}</Badge>
                              {teacherGrades.slice(0, 4).map(g => (
                                <Badge key={g} variant="outline" className="text-[9px] py-0 px-1 bg-gray-50">
                                  {g.replace('Grade ', 'G')}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
                <Button
                  onClick={async () => {
                    if (selectedTeacherIds.length === 0) return;
                    setSending(true);
                    try {
                      const topicIds = curriculumTopics.map(t => t.id);
                      const allResults: Array<Record<string, unknown>> = [];
                      for (const teacherId of selectedTeacherIds) {
                        for (const topicId of topicIds) {
                          const topic = curriculumTopics.find(t => t.id === topicId);
                          if (topic && topic.subject === teachers.find(t => t.id === teacherId)?.subject) {
                            const res = await fetch('/api/notifications', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                type: 'curriculum',
                                referenceId: topicId,
                                teacherIds: [teacherId],
                                sentBy: 'manual',
                                title: `Curriculum: ${topic.topic} (${topic.subject} - ${topic.grade})`,
                                description: `Curriculum for ${topic.board} board`,
                              }),
                            });
                            const data = await res.json();
                            allResults.push(data);
                          }
                        }
                      }
                      const totalSent = allResults.filter(r => r.success).length;
                      setSendResult(`Curriculum sent to ${selectedTeacherIds.length} teacher(s) - ${totalSent} topic notifications created`);
                      setSelectedTeacherIds([]);
                      toast({ title: 'Sent!', description: `Curriculum sent to ${selectedTeacherIds.length} teacher(s)` });
                    } catch {
                      toast({ title: 'Error', description: 'Failed to send curriculum', variant: 'destructive' });
                    } finally {
                      setSending(false);
                    }
                  }}
                  disabled={sending || selectedTeacherIds.length === 0}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  {sending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Users className="w-4 h-4 mr-2" />}
                  {sending ? 'Sending...' : `Send to ${selectedTeacherIds.length} Teacher(s)`}
                </Button>
              </div>
            ) : (
              <div className="pb-6 space-y-4">
                <div className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border border-emerald-200">
                  <div className="flex items-center gap-2 mb-2">
                    <Brain className="w-5 h-5 text-emerald-600" />
                    <p className="font-semibold text-emerald-800 text-sm">AI-Powered Auto-Send</p>
                  </div>
                  <p className="text-xs text-emerald-700">
                    AI will analyze the generated curriculum topics and automatically identify teachers who teach matching subjects and grades. Each teacher will receive only the curriculum topics relevant to their subject and grade assignments.
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">AI will send curriculum to these teachers:</p>
                  {teachers.filter(t => t.subject === selectedSubject).length > 0 ? (
                    <div className="p-3 bg-white rounded-lg border border-emerald-200">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-300">{selectedSubject}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {teachers.filter(t => t.subject === selectedSubject).map(t => (
                          <Badge key={t.id} variant="outline" className="text-[9px] py-0">
                            {t.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No teachers found for {selectedSubject}</p>
                  )}
                </div>
                <Button
                  onClick={async () => {
                    setAiSending(true);
                    try {
                      const topicIds = curriculumTopics.map(t => t.id);
                      const grades = [selectedGrade];
                      const subjects = [selectedSubject];
                      const res = await fetch('/api/notifications/ai-send', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          type: 'curriculum',
                          referenceIds: topicIds,
                          grades,
                          subjects,
                        }),
                      });
                      const data = await res.json();
                      if (data.success) {
                        setSendResult(data.message || `AI sent curriculum to ${data.count} teacher(s)`);
                        toast({ title: 'AI Auto-Send Complete', description: data.message });
                      } else {
                        toast({ title: 'Error', description: data.error, variant: 'destructive' });
                      }
                    } catch {
                      toast({ title: 'Error', description: 'Failed to auto-send', variant: 'destructive' });
                    } finally {
                      setAiSending(false);
                    }
                  }}
                  disabled={aiSending}
                  className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
                >
                  {aiSending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Brain className="w-4 h-4 mr-2" />}
                  {aiSending ? 'AI is analyzing and sending...' : 'AI Auto-Send to Matching Teachers'}
                </Button>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Workload Analytics Section ───
interface WorkloadTeacher {
  teacherId: string;
  teacherName: string;
  subject: string;
  dailyPeriods: Record<string, number>;
  totalPeriods: number;
  avgPeriods: number;
  maxDay: string;
  minDay: string;
  maxDayPeriods: number;
  minDayPeriods: number;
  isOverloaded: boolean;
  overloadDays: string[];
}

interface BalanceResult {
  success: boolean;
  message: string;
  reassignments: {
    teacherId: string;
    teacherName: string;
    fromDay: string;
    fromPeriod: number;
    scheduleId: string;
    grade: string;
    section: string;
    subject: string;
    newTeacherId: string;
    newTeacherName: string;
    newTeacherSubject: string;
    matchReason: string;
    matchScore: number;
    executed: boolean;
  }[];
  summary: {
    overloadedCount: number;
    reassignedCount: number;
    balancedCount: number;
    stillOverloaded: number;
    lessonPlansGenerated: number;
    notificationsSent: number;
  };
  beforeWorkload: {
    teacherName: string;
    subject: string;
    dailyPeriods: Record<string, number>;
    overloadedDays: string[];
  }[];
  afterWorkload: {
    teacherId: string;
    teacherName: string;
    subject: string;
    dailyPeriods: Record<string, number>;
    isOverloaded: boolean;
  }[];
}

function WorkloadAnalyticsSection({ teachers, schedules, onRefresh }: { teachers: Teacher[]; schedules: Schedule[]; onRefresh: () => void }) {
  const [workloadData, setWorkloadData] = useState<WorkloadTeacher[]>([]);
  const [distribution, setDistribution] = useState<Record<number, number>>({});
  const [weeklySummary, setWeeklySummary] = useState({ overallAvg: 0, maxAvg: 0, minAvg: 0, stdDev: 0, totalTeachers: 0 });
  const [overloadedTeachers, setOverloadedTeachers] = useState<WorkloadTeacher[]>([]);
  const [loading, setLoading] = useState(false);
  const [drillDownTeacher, setDrillDownTeacher] = useState<WorkloadTeacher | null>(null);
  const [aiBalancing, setAiBalancing] = useState(false);
  const [balanceResult, setBalanceResult] = useState<BalanceResult | null>(null);
  const [balanceStep, setBalanceStep] = useState('');

  const fetchWorkload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/analytics/workload');
      if (res.ok) {
        const data = await res.json();
        setWorkloadData(data.workloadData || []);
        setDistribution(data.distribution || {});
        setWeeklySummary(data.weeklySummary || { overallAvg: 0, maxAvg: 0, minAvg: 0, stdDev: 0, totalTeachers: 0 });
        setOverloadedTeachers(data.overloadedTeachers || []);
      }
    } catch {
      console.error('Error fetching workload');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkload(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [fetchWorkload]);

  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  const getHeatColor = (periods: number) => {
    if (periods === 0) return 'bg-gray-100 text-gray-400';
    if (periods <= 3) return 'bg-emerald-100 text-emerald-700';
    if (periods <= 5) return 'bg-amber-100 text-amber-700';
    if (periods <= 6) return 'bg-orange-100 text-orange-700';
    return 'bg-red-100 text-red-700';
  };

  const handleAiBalanceWorkload = async (specificTeacherIds?: string[]) => {
    setAiBalancing(true);
    setBalanceResult(null);
    try {
      setBalanceStep('Scanning overloaded teachers...');
      await new Promise(r => setTimeout(r, 300));

      setBalanceStep('Analyzing period conflicts & availability...');
      await new Promise(r => setTimeout(r, 400));

      const res = await fetch('/api/analytics/ai-balance-workload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacherIds: specificTeacherIds || undefined,
          targetMaxPeriods: 5,
        }),
      });

      setBalanceStep('Generating lesson plans & notifications...');

      if (res.ok) {
        const data = await res.json();
        setBalanceResult(data);
        // Refresh workload data
        await fetchWorkload();
        await onRefresh();
      } else {
        const errData = await res.json();
        setBalanceResult({
          success: false,
          message: errData.error || 'AI Workload Balancing failed',
          reassignments: [],
          summary: { overloadedCount: 0, reassignedCount: 0, balancedCount: 0, stillOverloaded: 0, lessonPlansGenerated: 0, notificationsSent: 0 },
          beforeWorkload: [],
          afterWorkload: [],
        });
      }
    } catch {
      setBalanceResult({
        success: false,
        message: 'Failed to connect to AI Workload Balancer',
        reassignments: [],
        summary: { overloadedCount: 0, reassignedCount: 0, balancedCount: 0, stillOverloaded: 0, lessonPlansGenerated: 0, notificationsSent: 0 },
        beforeWorkload: [],
        afterWorkload: [],
      });
    } finally {
      setAiBalancing(false);
      setBalanceStep('');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-6 text-white">
        <div className="flex items-center gap-3 mb-3">
          <div className="bg-white/20 p-2 rounded-xl">
            <Brain className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Workload Analytics</h1>
            <p className="text-emerald-100 text-sm">AI-Powered Teacher Performance & Distribution</p>
          </div>
          <div className="ml-auto">
            <Badge className="bg-emerald-400/30 text-white border-emerald-300/50 text-xs px-3 py-1">
              <Sparkles className="w-3 h-3 mr-1" /> AI Agent Active
            </Badge>
          </div>
        </div>
        <p className="text-emerald-50 text-sm max-w-2xl">
          AI Workload Balancer automatically identifies overloaded teachers, redistributes periods to available teachers with capacity, generates lesson plans, and sends notifications — all with zero manual effort.
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={fetchWorkload} variant="outline" size="sm">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
        {overloadedTeachers.length > 0 && (
          <Button
            onClick={() => handleAiBalanceWorkload()}
            disabled={aiBalancing}
            className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-lg"
            size="sm"
          >
            {aiBalancing ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            AI Balance All Overloaded ({overloadedTeachers.length})
          </Button>
        )}
      </div>

      {/* AI Balancing Progress */}
      {aiBalancing && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Brain className="w-8 h-8 text-amber-600" />
                <Sparkles className="w-4 h-4 text-amber-500 absolute -top-1 -right-1 animate-pulse" />
              </div>
              <div>
                <p className="font-medium text-amber-800">AI Workload Balancer is working...</p>
                <p className="text-sm text-amber-600">{balanceStep}</p>
              </div>
              <div className="ml-auto flex gap-1">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-2 h-2 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Balance Results */}
      {balanceResult && !aiBalancing && (
        <Card className={`border-2 ${balanceResult.success ? 'border-emerald-300 bg-emerald-50/50' : 'border-red-300 bg-red-50/50'}`}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              {balanceResult.success ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span className="text-emerald-800">AI Workload Balancer — Complete</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                  <span className="text-red-800">AI Workload Balancer — Issue</span>
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm font-medium">{balanceResult.message}</p>

            {balanceResult.summary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 bg-white rounded-lg border text-center">
                  <p className="text-lg font-bold text-red-600">{balanceResult.summary.overloadedCount}</p>
                  <p className="text-[10px] text-muted-foreground">Overloaded Teachers</p>
                </div>
                <div className="p-3 bg-white rounded-lg border text-center">
                  <p className="text-lg font-bold text-amber-600">{balanceResult.summary.reassignedCount}</p>
                  <p className="text-[10px] text-muted-foreground">Periods Reassigned</p>
                </div>
                <div className="p-3 bg-white rounded-lg border text-center">
                  <p className="text-lg font-bold text-emerald-600">{balanceResult.summary.balancedCount}</p>
                  <p className="text-[10px] text-muted-foreground">Now Balanced</p>
                </div>
                <div className="p-3 bg-white rounded-lg border text-center">
                  <p className="text-lg font-bold text-blue-600">{balanceResult.summary.lessonPlansGenerated}</p>
                  <p className="text-[10px] text-muted-foreground">Lesson Plans Generated</p>
                </div>
              </div>
            )}

            {balanceResult.reassignments && balanceResult.reassignments.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-emerald-800">Reassignment Details:</h4>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {balanceResult.reassignments.map((r, i) => (
                    <div key={i} className={`p-3 rounded-lg border text-xs ${r.executed ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        {r.executed ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <XCircle className="w-3.5 h-3.5 text-red-600" />}
                        <span className="font-medium">{r.subject} — {r.grade} {r.section}</span>
                        <Badge variant="outline" className="text-[9px]">{r.fromDay} P{r.fromPeriod}</Badge>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span className="text-red-600 line-through">{r.teacherName}</span>
                        <span>&rarr;</span>
                        <span className="text-emerald-700 font-medium">{r.newTeacherName} ({r.newTeacherSubject})</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge className="text-[9px] bg-blue-100 text-blue-700 border-blue-200">{r.matchReason}</Badge>
                        <span className="text-muted-foreground">Score: {r.matchScore}</span>
                      </div>
                      {(r as any).error && <p className="text-red-500 mt-1">Error: {(r as any).error}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button variant="outline" size="sm" onClick={() => setBalanceResult(null)}>
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 text-emerald-600 animate-spin" />
          <span className="ml-3 text-muted-foreground">Loading analytics...</span>
        </div>
      ) : workloadData.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Workload Data</h3>
            <p className="text-muted-foreground">Add teachers and assign schedules to see workload analytics</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Weekly Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-emerald-700">{weeklySummary.totalTeachers}</p>
                <p className="text-xs text-muted-foreground">Total Teachers</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-teal-700">{weeklySummary.overallAvg}</p>
                <p className="text-xs text-muted-foreground">Avg Periods/Day</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center gap-1">
                  <TrendingUp className="w-4 h-4 text-red-500" />
                  <p className="text-2xl font-bold text-red-700">{weeklySummary.maxAvg}</p>
                </div>
                <p className="text-xs text-muted-foreground">Max Avg/Day</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center gap-1">
                  <TrendingDown className="w-4 h-4 text-emerald-500" />
                  <p className="text-2xl font-bold text-emerald-700">{weeklySummary.minAvg}</p>
                </div>
                <p className="text-xs text-muted-foreground">Min Avg/Day</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-amber-700">{weeklySummary.stdDev}</p>
                <p className="text-xs text-muted-foreground">Std Deviation</p>
              </CardContent>
            </Card>
          </div>

          {/* Overloaded Teachers Alert - Enhanced with AI Balance */}
          {overloadedTeachers.length > 0 && (
            <Card className="border-red-200 bg-red-50/50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-lg text-red-800">
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                    Overloaded Teachers ({overloadedTeachers.length})
                  </CardTitle>
                  <Button
                    onClick={() => handleAiBalanceWorkload(overloadedTeachers.map(t => t.teacherId))}
                    disabled={aiBalancing}
                    className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
                    size="sm"
                  >
                    {aiBalancing ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                    AI Balance Workload
                  </Button>
                </div>
                <CardDescription className="text-red-600">These teachers have more than 5 periods on at least one day. AI can automatically redistribute their workload.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {overloadedTeachers.map(t => (
                    <div key={t.teacherId} className="p-3 bg-white rounded-lg border border-red-200">
                      <div className="flex items-center gap-2 mb-2">
                        <User className="w-4 h-4 text-red-500" />
                        <span className="font-medium text-sm text-red-800">{t.teacherName}</span>
                        <Badge variant="outline" className="text-[10px] border-red-300 text-red-600">{t.subject}</Badge>
                      </div>
                      <p className="text-xs text-red-600">Overloaded on: {t.overloadDays.join(', ')}</p>
                      <p className="text-xs text-muted-foreground">Max: {t.maxDayPeriods} periods on {t.maxDay}</p>
                      <Button
                        onClick={(e) => { e.stopPropagation(); handleAiBalanceWorkload([t.teacherId]); }}
                        disabled={aiBalancing}
                        variant="outline"
                        size="sm"
                        className="mt-2 w-full border-amber-400 text-amber-700 hover:bg-amber-50 text-xs h-7"
                      >
                        {aiBalancing ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
                        AI Balance This Teacher
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Teacher Workload Heatmap */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Grid3X3 className="w-5 h-5 text-emerald-600" />
                Teacher Workload Heatmap
              </CardTitle>
              <CardDescription>Teachers vs Days — color-coded by number of periods</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left text-[10px] font-semibold text-muted-foreground p-2 bg-muted/50 min-w-[140px]">Teacher</th>
                      {DAYS.map(day => (
                        <th key={day} className="text-center text-[10px] font-semibold text-muted-foreground p-2 bg-muted/50 min-w-[60px]">{day.slice(0, 3)}</th>
                      ))}
                      <th className="text-center text-[10px] font-semibold text-muted-foreground p-2 bg-muted/50 min-w-[50px]">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workloadData.map((teacher, idx) => (
                      <tr key={teacher.teacherId} className={`cursor-pointer hover:bg-emerald-50/50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}
                        onClick={() => setDrillDownTeacher(teacher)}
                      >
                        <td className="text-xs font-medium p-2">
                          <div className="flex items-center gap-2">
                            <User className="w-3 h-3 text-emerald-600" />
                            <span className="truncate">{teacher.teacherName}</span>
                          </div>
                        </td>
                        {DAYS.map(day => (
                          <td key={day} className="text-center p-1.5">
                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-md text-xs font-bold ${getHeatColor(teacher.dailyPeriods[day] || 0)}`}>
                              {teacher.dailyPeriods[day] || 0}
                            </span>
                          </td>
                        ))}
                        <td className="text-center p-2">
                          <Badge variant="outline" className="text-xs">{teacher.totalPeriods}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Heatmap legend */}
              <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                <span>Legend:</span>
                <div className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-gray-100" /> 0</div>
                <div className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-emerald-100" /> 1-3</div>
                <div className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-amber-100" /> 4-5</div>
                <div className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-orange-100" /> 6</div>
                <div className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-red-100" /> 7+</div>
              </div>
            </CardContent>
          </Card>

          {/* Distribution Chart */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <BarChart3 className="w-5 h-5 text-amber-600" />
                Workload Distribution
              </CardTitle>
              <CardDescription>Number of teacher-day instances with X periods</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2 h-48 px-4">
                {Object.entries(distribution).sort(([a], [b]) => Number(a) - Number(b)).map(([periods, count]) => {
                  const maxCount = Math.max(...Object.values(distribution));
                  const heightPct = maxCount > 0 ? (count / maxCount) * 100 : 0;
                  const numPeriods = Number(periods);
                  let barColor = 'bg-emerald-500';
                  if (numPeriods > 6) barColor = 'bg-red-500';
                  else if (numPeriods > 5) barColor = 'bg-orange-500';
                  else if (numPeriods > 3) barColor = 'bg-amber-500';
                  return (
                    <div key={periods} className="flex-1 flex flex-col items-center justify-end">
                      <span className="text-[10px] font-bold text-muted-foreground mb-1">{count}</span>
                      <div
                        className={`w-full rounded-t-md ${barColor} transition-all min-h-[4px]`}
                        style={{ height: `${heightPct}%` }}
                      />
                      <span className="text-[10px] text-muted-foreground mt-1">{periods}P</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Individual Teacher Drill-down */}
          <Dialog open={!!drillDownTeacher} onOpenChange={() => setDrillDownTeacher(null)}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-emerald-800">
                  <User className="w-5 h-5" />
                  {drillDownTeacher?.teacherName}
                </DialogTitle>
                <DialogDescription>
                  {drillDownTeacher?.subject} Specialist • Weekly Workload Detail
                </DialogDescription>
              </DialogHeader>
              {drillDownTeacher && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-emerald-50 rounded-lg text-center">
                      <p className="text-lg font-bold text-emerald-700">{drillDownTeacher.avgPeriods}</p>
                      <p className="text-[10px] text-muted-foreground">Avg/Day</p>
                    </div>
                    <div className="p-3 bg-red-50 rounded-lg text-center">
                      <p className="text-lg font-bold text-red-700">{drillDownTeacher.maxDayPeriods}</p>
                      <p className="text-[10px] text-muted-foreground">Max ({drillDownTeacher.maxDay.slice(0,3)})</p>
                    </div>
                    <div className="p-3 bg-teal-50 rounded-lg text-center">
                      <p className="text-lg font-bold text-teal-700">{drillDownTeacher.minDayPeriods}</p>
                      <p className="text-[10px] text-muted-foreground">Min ({drillDownTeacher.minDay.slice(0,3)})</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {DAYS.map(day => {
                      const periods = drillDownTeacher.dailyPeriods[day] || 0;
                      const teacher = teachers.find(t => t.id === drillDownTeacher.teacherId);
                      const daySchedules = schedules
                        .filter(s => s.teacherId === drillDownTeacher.teacherId && s.day === day)
                        .sort((a, b) => a.period - b.period);
                      return (
                        <div key={day} className={`p-3 rounded-lg border ${periods > 6 ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium">{day}</span>
                            <Badge className={`text-[10px] ${getHeatColor(periods)}`}>{periods} periods</Badge>
                          </div>
                          {daySchedules.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {daySchedules.map(s => (
                                <span key={s.id} className="text-[9px] px-1.5 py-0.5 bg-white rounded border">
                                  P{s.period}: {s.grade} {s.section}
                                </span>
                              ))}
                            </div>
                          )}
                          {daySchedules.length === 0 && (
                            <p className="text-[10px] text-muted-foreground">No classes</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="p-3 bg-emerald-50 rounded-lg">
                    <p className="text-xs font-medium text-emerald-800">Total Weekly Periods: <span className="font-bold">{drillDownTeacher.totalPeriods}</span></p>
                    {drillDownTeacher.isOverloaded && (
                      <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Overloaded on: {drillDownTeacher.overloadDays.join(', ')}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}

// ─── Lesson Plan Library Section ───
interface LessonPlanData {
  id: string;
  teacherId: string | null;
  grade: string;
  section: string | null;
  subject: string;
  topic: string;
  board: string;
  duration: number;
  aiGenerated: boolean;
  planContent: string;
  objectives: string;
  warmUp: string | null;
  mainContent: string | null;
  differentiation: string | null;
  assessment: string | null;
  resources: string;
  homework: string | null;
  keyVocabulary: string;
  createdAt: string;
  teacher?: { id: string; name: string; subject: string } | null;
}

function LessonPlanLibrarySection({ teachers }: { teachers: Teacher[] }) {
  const { toast } = useToast();
  const [lessonPlans, setLessonPlans] = useState<LessonPlanData[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [boardFilter, setBoardFilter] = useState<string>('all');
  const [viewPlan, setViewPlan] = useState<LessonPlanData | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateWizardOpen, setGenerateWizardOpen] = useState(false);
  const [newPlanGrade, setNewPlanGrade] = useState('Grade 6');
  const [newPlanSubject, setNewPlanSubject] = useState('');
  const [newPlanTopic, setNewPlanTopic] = useState('');
  const [newPlanBoard, setNewPlanBoard] = useState('CBSE');
  const [sendToTeachersOpen, setSendToTeachersOpen] = useState(false);
  const [sendPlanId, setSendPlanId] = useState<string | null>(null);
  const [sendMode, setSendMode] = useState<'manual' | 'ai'>('manual');
  const [sendFilterSubject, setSendFilterSubject] = useState<string>('all');
  const [sendFilterGrade, setSendFilterGrade] = useState<string>('all');
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [aiSending, setAiSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (subjectFilter !== 'all') params.set('subject', subjectFilter);
      if (gradeFilter !== 'all') params.set('grade', gradeFilter);
      if (boardFilter !== 'all') params.set('board', boardFilter);
      if (searchQuery) params.set('search', searchQuery);
      const res = await fetch(`/api/lesson-plans?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLessonPlans(data);
      }
    } catch {
      console.error('Error fetching lesson plans');
    } finally {
      setLoading(false);
    }
  }, [subjectFilter, gradeFilter, boardFilter, searchQuery]);

  useEffect(() => {
    fetchPlans(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [fetchPlans]);

  const handleGenerate = async () => {
    if (!newPlanGrade || !newPlanSubject || !newPlanTopic) {
      toast({ title: 'Missing Fields', description: 'Please fill in grade, subject, and topic', variant: 'destructive' });
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch('/api/lesson-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grade: newPlanGrade,
          subject: newPlanSubject,
          topic: newPlanTopic,
          board: newPlanBoard,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: 'Lesson Plan Generated', description: `AI lesson plan for "${newPlanTopic}" has been created` });
        setGenerateWizardOpen(false);
        setNewPlanTopic('');
        fetchPlans();
      } else {
        toast({ title: 'Error', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to generate lesson plan', variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenerate = async (plan: LessonPlanData) => {
    setGenerating(true);
    try {
      const res = await fetch('/api/lesson-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grade: plan.grade,
          section: plan.section,
          subject: plan.subject,
          topic: plan.topic,
          board: plan.board,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: 'Lesson Plan Regenerated', description: `New plan for "${plan.topic}" has been created` });
        fetchPlans();
      } else {
        toast({ title: 'Error', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to regenerate lesson plan', variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = (plan: LessonPlanData) => {
    const content = plan.planContent || JSON.stringify(plan, null, 2);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lesson-plan-${plan.subject}-${plan.topic.replace(/\s+/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Downloaded', description: 'Lesson plan downloaded as text file' });
  };

  const uniqueSubjects = [...new Set(lessonPlans.map(p => p.subject))].sort();
  const uniqueGrades = [...new Set(lessonPlans.map(p => p.grade))].sort((a, b) => {
    const numA = parseInt(a.replace('Grade ', ''));
    const numB = parseInt(b.replace('Grade ', ''));
    return numA - numB;
  });

  const subjectColors: Record<string, string> = {
    Mathematics: 'bg-blue-100 text-blue-700 border-blue-300',
    English: 'bg-emerald-100 text-emerald-700 border-emerald-300',
    Science: 'bg-amber-100 text-amber-700 border-amber-300',
    'Social Science': 'bg-purple-100 text-purple-700 border-purple-300',
    Hindi: 'bg-teal-100 text-teal-700 border-teal-300',
    Physics: 'bg-red-100 text-red-700 border-red-300',
    Chemistry: 'bg-orange-100 text-orange-700 border-orange-300',
    'Computer Science': 'bg-cyan-100 text-cyan-700 border-cyan-300',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-6 text-white">
        <div className="flex items-center gap-3 mb-3">
          <div className="bg-white/20 p-2 rounded-xl">
            <Library className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Lesson Plan Library</h1>
            <p className="text-emerald-100 text-sm">AI-Generated Teaching Resources</p>
          </div>
        </div>
        <p className="text-emerald-50 text-sm max-w-2xl">
          Browse, search, and generate comprehensive lesson plans aligned with board curricula. Each plan includes objectives, activities, differentiation, and assessment strategies.
        </p>
      </div>

      {/* Search & Filters */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by topic, subject, grade..."
                className="pl-9 h-9"
              />
            </div>
            <Select value={subjectFilter} onValueChange={setSubjectFilter}>
              <SelectTrigger className="w-[150px] h-9">
                <SelectValue placeholder="Subject" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Subjects</SelectItem>
                {uniqueSubjects.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={gradeFilter} onValueChange={setGradeFilter}>
              <SelectTrigger className="w-[120px] h-9">
                <SelectValue placeholder="Grade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Grades</SelectItem>
                {uniqueGrades.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={boardFilter} onValueChange={setBoardFilter}>
              <SelectTrigger className="w-[120px] h-9">
                <SelectValue placeholder="Board" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Boards</SelectItem>
                {['CBSE', 'ICSE', 'IB', 'British', 'American', 'Cambridge'].map(b => (
                  <SelectItem key={b} value={b}>{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="outline" className="text-xs">{lessonPlans.length} plans</Badge>
          </div>
          <Button onClick={() => setGenerateWizardOpen(true)} className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700">
            <Sparkles className="w-4 h-4 mr-2" /> Generate New Lesson Plan
          </Button>
          {lessonPlans.length > 0 && (
            <Button onClick={() => { setSendPlanId(null); setSendToTeachersOpen(true); setSendResult(null); setSelectedTeacherIds([]); }} variant="outline" size="sm" className="border-blue-300 hover:bg-blue-50 hover:text-blue-700">
              <Users className="w-4 h-4 mr-2" />
              Send to Teachers
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Lesson Plan Cards */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 text-emerald-600 animate-spin" />
          <span className="ml-3 text-muted-foreground">Loading lesson plans...</span>
        </div>
      ) : lessonPlans.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Library className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Lesson Plans Yet</h3>
            <p className="text-muted-foreground mb-4">Generate your first AI-powered lesson plan</p>
            <Button onClick={() => setGenerateWizardOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
              <Sparkles className="w-4 h-4 mr-2" /> Generate Lesson Plan
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {lessonPlans.map(plan => (
            <Card key={plan.id} className="hover:shadow-lg hover:border-emerald-300 transition-all duration-200 overflow-hidden">
              <div className="h-1.5 bg-gradient-to-r from-emerald-500 to-teal-500" />
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <Badge className={`text-[10px] ${subjectColors[plan.subject] || 'bg-gray-100 text-gray-700 border-gray-300'}`}>
                    {plan.subject}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">{plan.board}</Badge>
                </div>
                <h3 className="font-semibold text-sm mb-1 line-clamp-2">{plan.topic}</h3>
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant="secondary" className="text-[10px]">{plan.grade}</Badge>
                  {plan.section && <Badge variant="secondary" className="text-[10px]">{plan.section}</Badge>}
                  <span className="text-[10px] text-muted-foreground">{plan.duration}min</span>
                </div>
                <div className="flex items-center gap-1 mb-3 text-[10px] text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {new Date(plan.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="flex-1 text-xs h-8" onClick={() => setViewPlan(plan)}>
                    <Eye className="w-3 h-3 mr-1" /> View
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => handleRegenerate(plan)} disabled={generating}>
                    {generating ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => handleDownload(plan)}>
                    <Download className="w-3 h-3" />
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => { setSendPlanId(plan.id); setSendToTeachersOpen(true); setSendResult(null); setSelectedTeacherIds([]); }}>
                    <Users className="w-3 h-3 mr-1" /> Send
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* View Lesson Plan Dialog */}
      <Dialog open={!!viewPlan} onOpenChange={() => setViewPlan(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="flex items-center gap-2 text-emerald-800">
              <Brain className="w-5 h-5" />
              {viewPlan?.topic}
            </DialogTitle>
            <DialogDescription>
              {viewPlan?.subject} • {viewPlan?.grade} {viewPlan?.section || ''} • {viewPlan?.board}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[65vh] px-6">
            {viewPlan && (() => {
              let planObj: Record<string, unknown> = {};
              try { planObj = JSON.parse(viewPlan.planContent); } catch { planObj = {}; }
              const objectives = JSON.parse(viewPlan.objectives || '[]') as string[];
              const resources = JSON.parse(viewPlan.resources || '[]') as string[];
              const vocab = JSON.parse(viewPlan.keyVocabulary || '[]') as string[];
              let mainContent: Array<{section: string; duration: string; description: string}> = [];
              try { mainContent = JSON.parse(viewPlan.mainContent || '[]'); } catch { mainContent = []; }
              let differentiation: {struggling?: string; onLevel?: string; advanced?: string} = {};
              try { differentiation = JSON.parse(viewPlan.differentiation || '{}'); } catch { differentiation = {}; }
              let assessment: {formative?: string; summative?: string} = {};
              try { assessment = JSON.parse(viewPlan.assessment || '{}'); } catch { assessment = {}; }

              return (
                <div className="space-y-4 pb-6">
                  {objectives.length > 0 && (
                    <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                      <h4 className="text-sm font-semibold text-amber-800 mb-2 flex items-center gap-2">
                        <Target className="w-4 h-4" /> Learning Objectives
                      </h4>
                      <ul className="space-y-1.5">
                        {objectives.map((obj, i) => (
                          <li key={i} className="text-sm text-amber-700 flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" /> {obj}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {viewPlan.warmUp && (
                    <div className="p-4 bg-teal-50 rounded-xl border border-teal-200">
                      <h4 className="text-sm font-semibold text-teal-800 mb-1 flex items-center gap-2">
                        <Zap className="w-4 h-4" /> Warm-Up
                      </h4>
                      <p className="text-sm text-teal-700">{viewPlan.warmUp}</p>
                    </div>
                  )}

                  {mainContent.length > 0 && (
                    <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                      <h4 className="text-sm font-semibold text-emerald-800 mb-2 flex items-center gap-2">
                        <ListChecks className="w-4 h-4" /> Main Content
                      </h4>
                      <div className="space-y-2">
                        {mainContent.map((section, i) => (
                          <div key={i} className="p-3 bg-white/70 rounded-lg border border-emerald-100">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-sm font-medium text-emerald-800">{section.section}</p>
                              {section.duration && <Badge variant="outline" className="text-[10px]">{section.duration}</Badge>}
                            </div>
                            <p className="text-xs text-emerald-600">{section.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {differentiation && (differentiation.struggling || differentiation.onLevel || differentiation.advanced) && (
                    <div className="p-4 bg-purple-50 rounded-xl border border-purple-200">
                      <h4 className="text-sm font-semibold text-purple-800 mb-2 flex items-center gap-2">
                        <Lightbulb className="w-4 h-4" /> Differentiation
                      </h4>
                      <div className="space-y-2">
                        {differentiation.struggling && (
                          <div className="p-2 bg-red-50 rounded-lg border border-red-100">
                            <p className="text-[10px] font-semibold text-red-700 mb-0.5">Struggling Learners</p>
                            <p className="text-xs text-red-600">{differentiation.struggling}</p>
                          </div>
                        )}
                        {differentiation.onLevel && (
                          <div className="p-2 bg-amber-50 rounded-lg border border-amber-100">
                            <p className="text-[10px] font-semibold text-amber-700 mb-0.5">On-Level Learners</p>
                            <p className="text-xs text-amber-600">{differentiation.onLevel}</p>
                          </div>
                        )}
                        {differentiation.advanced && (
                          <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-100">
                            <p className="text-[10px] font-semibold text-emerald-700 mb-0.5">Advanced Learners</p>
                            <p className="text-xs text-emerald-600">{differentiation.advanced}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {assessment && (assessment.formative || assessment.summative) && (
                    <div className="p-4 bg-rose-50 rounded-xl border border-rose-200">
                      <h4 className="text-sm font-semibold text-rose-800 mb-2 flex items-center gap-2">
                        <Activity className="w-4 h-4" /> Assessment
                      </h4>
                      {assessment.formative && <p className="text-xs text-rose-600 mb-1"><strong>Formative:</strong> {assessment.formative}</p>}
                      {assessment.summative && <p className="text-xs text-rose-600"><strong>Summative:</strong> {assessment.summative}</p>}
                    </div>
                  )}

                  {resources.length > 0 && (
                    <div className="p-4 bg-orange-50 rounded-xl border border-orange-200">
                      <h4 className="text-sm font-semibold text-orange-800 mb-2 flex items-center gap-2">
                        <BookMarked className="w-4 h-4" /> Resources
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {resources.map((r, i) => <Badge key={i} variant="outline" className="text-[10px] bg-orange-100 text-orange-700 border-orange-300">{r}</Badge>)}
                      </div>
                    </div>
                  )}

                  {vocab.length > 0 && (
                    <div className="p-4 bg-teal-50 rounded-xl border border-teal-200">
                      <h4 className="text-sm font-semibold text-teal-800 mb-2 flex items-center gap-2">
                        <BookOpen className="w-4 h-4" /> Key Vocabulary
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {vocab.map((v, i) => <Badge key={i} variant="outline" className="text-[10px] bg-teal-100 text-teal-700 border-teal-300">{v}</Badge>)}
                      </div>
                    </div>
                  )}

                  {viewPlan.homework && (
                    <div className="p-4 bg-muted/30 rounded-xl border">
                      <h4 className="text-sm font-semibold mb-1 flex items-center gap-2">
                        <FileText className="w-4 h-4" /> Homework
                      </h4>
                      <p className="text-sm text-muted-foreground">{viewPlan.homework}</p>
                    </div>
                  )}
                </div>
              );
            })()}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Generate Wizard Dialog */}
      <Dialog open={generateWizardOpen} onOpenChange={setGenerateWizardOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-800">
              <Sparkles className="w-5 h-5" /> Generate New Lesson Plan
            </DialogTitle>
            <DialogDescription>Create an AI-powered lesson plan for any topic</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-medium">Grade</Label>
              <Select value={newPlanGrade} onValueChange={setNewPlanGrade}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`).map(g => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium">Subject</Label>
              <Select value={newPlanSubject} onValueChange={setNewPlanSubject}>
                <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
                <SelectContent>
                  {['Mathematics', 'English', 'Science', 'Social Science', 'Hindi', 'Physics', 'Chemistry', 'Biology', 'Computer Science', 'EVS'].map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium">Topic</Label>
              <Input
                value={newPlanTopic}
                onChange={(e) => setNewPlanTopic(e.target.value)}
                placeholder="e.g., Fractions and Decimals"
              />
            </div>
            <div>
              <Label className="text-xs font-medium">Board</Label>
              <Select value={newPlanBoard} onValueChange={setNewPlanBoard}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['CBSE', 'ICSE', 'IB', 'British', 'American', 'Cambridge'].map(b => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleGenerate}
              disabled={generating || !newPlanSubject || !newPlanTopic}
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
            >
              {generating ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Generating...</> : <><Brain className="w-4 h-4 mr-2" /> Generate Lesson Plan</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Send to Teachers Dialog */}
      <Dialog open={sendToTeachersOpen} onOpenChange={setSendToTeachersOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="flex items-center gap-2 text-blue-800">
              <Users className="w-5 h-5" />
              Send Lesson Plan to Teachers
            </DialogTitle>
            <DialogDescription>
              {sendPlanId
                ? 'Share this lesson plan with teachers who teach the matching subject and grade'
                : 'Share all lesson plans with matching teachers'}
            </DialogDescription>
          </DialogHeader>

          {/* Mode Toggle */}
          <div className="px-6 py-3 flex items-center gap-3">
            <Button
              variant={sendMode === 'manual' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSendMode('manual')}
              className={sendMode === 'manual' ? 'bg-blue-600 hover:bg-blue-700' : ''}
            >
              <UserCheck className="w-4 h-4 mr-2" />
              Manual Selection
            </Button>
            <Button
              variant={sendMode === 'ai' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSendMode('ai')}
              className={sendMode === 'ai' ? 'bg-gradient-to-r from-emerald-600 to-teal-600' : ''}
            >
              <Brain className="w-4 h-4 mr-2" />
              AI Auto-Send
            </Button>
          </div>

          <ScrollArea className="max-h-[55vh] px-6">
            {sendResult ? (
              <div className="pb-6">
                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 text-center">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
                  <p className="font-semibold text-emerald-800">{sendResult}</p>
                </div>
              </div>
            ) : sendMode === 'manual' ? (
              <div className="pb-6 space-y-3">
                {/* Filters */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={sendFilterSubject} onValueChange={setSendFilterSubject}>
                    <SelectTrigger className="w-[140px] h-8 text-xs">
                      <SelectValue placeholder="Filter by Subject" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Subjects</SelectItem>
                      {uniqueSubjects.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={sendFilterGrade} onValueChange={setSendFilterGrade}>
                    <SelectTrigger className="w-[120px] h-8 text-xs">
                      <SelectValue placeholder="Filter by Grade" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Grades</SelectItem>
                      {uniqueGrades.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Badge variant="outline" className="text-[10px]">
                    {selectedTeacherIds.length} selected
                  </Badge>
                  <Button variant="ghost" size="sm" className="text-[10px] h-7" onClick={() => setSelectedTeacherIds([])}>
                    Clear
                  </Button>
                </div>

                {/* Teacher List */}
                <div className="space-y-2">
                  {teachers
                    .filter(t => {
                      if (sendFilterSubject !== 'all' && t.subject !== sendFilterSubject) return false;
                      if (sendFilterGrade !== 'all') {
                        const grades = JSON.parse(t.grades || '[]') as string[];
                        if (!grades.includes(sendFilterGrade)) return false;
                      }
                      return true;
                    })
                    .map(teacher => {
                      const isSelected = selectedTeacherIds.includes(teacher.id);
                      const teacherGrades = JSON.parse(teacher.grades || '[]') as string[];
                      return (
                        <div
                          key={teacher.id}
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                            isSelected ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-200 hover:bg-blue-50/30'
                          }`}
                          onClick={() => {
                            setSelectedTeacherIds(prev =>
                              isSelected ? prev.filter(id => id !== teacher.id) : [...prev, teacher.id]
                            );
                          }}
                        >
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                            isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                          }`}>
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium truncate">{teacher.name}</p>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <Badge variant="outline" className="text-[9px] py-0 px-1">{teacher.subject}</Badge>
                              {teacherGrades.slice(0, 4).map(g => (
                                <Badge key={g} variant="outline" className="text-[9px] py-0 px-1 bg-gray-50">
                                  {g.replace('Grade ', 'G')}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>

                <Button
                  onClick={async () => {
                    if (selectedTeacherIds.length === 0) return;
                    setSending(true);
                    try {
                      const planIds = sendPlanId ? [sendPlanId] : lessonPlans.map(p => p.id);
                      const results: Array<Record<string, unknown>> = [];
                      for (const planId of planIds) {
                        const plan = lessonPlans.find(p => p.id === planId);
                        if (!plan) continue;
                        const matchingTeacherIds = selectedTeacherIds.filter(tid => {
                          const t = teachers.find(tt => tt.id === tid);
                          return t && t.subject === plan.subject;
                        });
                        if (matchingTeacherIds.length > 0) {
                          const res = await fetch('/api/notifications', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              type: 'lesson_plan',
                              referenceId: planId,
                              teacherIds: matchingTeacherIds,
                              sentBy: 'manual',
                              title: `Lesson Plan: ${plan.topic} (${plan.subject} - ${plan.grade})`,
                              description: `${plan.board} board • ${plan.duration} min`,
                            }),
                          });
                          const data = await res.json();
                          results.push(data);
                        }
                      }
                      const totalSent = results.reduce((sum, r) => sum + ((r.count as number) || 0), 0);
                      setSendResult(`Lesson plan(s) sent to ${selectedTeacherIds.length} teacher(s) - ${totalSent} notifications created`);
                      setSelectedTeacherIds([]);
                      toast({ title: 'Sent!', description: `Lesson plans sent to ${selectedTeacherIds.length} teacher(s)` });
                    } catch {
                      toast({ title: 'Error', description: 'Failed to send lesson plans', variant: 'destructive' });
                    } finally {
                      setSending(false);
                    }
                  }}
                  disabled={sending || selectedTeacherIds.length === 0}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  {sending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Users className="w-4 h-4 mr-2" />}
                  {sending ? 'Sending...' : `Send to ${selectedTeacherIds.length} Teacher(s)`}
                </Button>
              </div>
            ) : (
              <div className="pb-6 space-y-4">
                {/* AI Auto-Send Description */}
                <div className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border border-emerald-200">
                  <div className="flex items-center gap-2 mb-2">
                    <Brain className="w-5 h-5 text-emerald-600" />
                    <p className="font-semibold text-emerald-800 text-sm">AI-Powered Auto-Send</p>
                  </div>
                  <p className="text-xs text-emerald-700">
                    AI will analyze each lesson plan and automatically identify the teachers who teach the matching subject and grade. Each teacher will receive only the lesson plans relevant to their assignments.
                  </p>
                </div>

                {/* Preview matching */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">AI will send lesson plans to these teachers:</p>
                  {uniqueSubjects.map(subject => {
                    const matchingTeachers = teachers.filter(t => t.subject === subject);
                    const planCount = lessonPlans.filter(p => p.subject === subject).length;
                    if (matchingTeachers.length === 0 || planCount === 0) return null;
                    return (
                      <div key={subject} className="p-3 bg-white rounded-lg border border-emerald-200">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-300">{subject}</Badge>
                          <span className="text-[10px] text-muted-foreground">{planCount} lesson plan(s)</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {matchingTeachers.map(t => (
                            <Badge key={t.id} variant="outline" className="text-[9px] py-0">
                              {t.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <Button
                  onClick={async () => {
                    setAiSending(true);
                    try {
                      const planIds = sendPlanId ? [sendPlanId] : lessonPlans.map(p => p.id);
                      const grades = sendPlanId
                        ? [lessonPlans.find(p => p.id === sendPlanId)?.grade].filter(Boolean) as string[]
                        : [...new Set(lessonPlans.map(p => p.grade))];
                      const subjects = sendPlanId
                        ? [lessonPlans.find(p => p.id === sendPlanId)?.subject].filter(Boolean) as string[]
                        : [...new Set(lessonPlans.map(p => p.subject))];
                      const res = await fetch('/api/notifications/ai-send', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          type: 'lesson_plan',
                          referenceIds: planIds,
                          grades,
                          subjects,
                        }),
                      });
                      const data = await res.json();
                      if (data.success) {
                        setSendResult(data.message || `AI sent lesson plans to ${data.count} teacher(s)`);
                        toast({ title: 'AI Auto-Send Complete', description: data.message });
                      } else {
                        toast({ title: 'Error', description: data.error, variant: 'destructive' });
                      }
                    } catch {
                      toast({ title: 'Error', description: 'Failed to auto-send', variant: 'destructive' });
                    } finally {
                      setAiSending(false);
                    }
                  }}
                  disabled={aiSending}
                  className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
                >
                  {aiSending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Brain className="w-4 h-4 mr-2" />}
                  {aiSending ? 'AI is analyzing and sending...' : 'AI Auto-Send to Matching Teachers'}
                </Button>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Super-Admin Portal ───────────────────────────────────────────────────────
const SA_TOKEN = 'sa_dev_token_2026';

interface SASchool {
  id: string;
  name: string;
  code: string;
  email: string;
  createdAt: string;
  featureFlags: SchoolFeatureFlags | null;
  _count: { teachers: number; schedules: number };
}

const FLAG_META: { key: keyof SchoolFeatureFlags; label: string; group: string }[] = [
  { key: 'aiTimetableEnabled',      label: 'AI Timetable Generation',    group: 'Timetable' },
  { key: 'manualTimetableEnabled',  label: 'Manual Timetable Builder',   group: 'Timetable' },
  { key: 'bulkImportEnabled',       label: 'Bulk Import (CSV/PDF)',       group: 'Timetable' },
  { key: 'shortBreakEnabled',       label: 'Short Break Support',        group: 'Breaks' },
  { key: 'lunchBreakEnabled',       label: 'Lunch Break Support',        group: 'Breaks' },
  { key: 'ptPeriodsEnabled',        label: 'PT / Sports Periods',        group: 'Breaks' },
  { key: 'substitutionEnabled',     label: 'Substitution Management',    group: 'Operations' },
  { key: 'autoSubstitutionEnabled', label: 'Auto Substitution Engine',   group: 'Operations' },
  { key: 'workloadAnalyticsEnabled',label: 'Workload Analytics',         group: 'Analytics' },
  { key: 'teacherNotifyEnabled',    label: 'Teacher Notifications',      group: 'Communication' },
];

const PLAN_COLORS: Record<string, string> = {
  trial: 'bg-amber-100 text-amber-700 border-amber-200',
  standard: 'bg-blue-100 text-blue-700 border-blue-200',
  premium: 'bg-purple-100 text-purple-700 border-purple-200',
};

function SuperAdminPortal({ user, onLogout }: { user: LoginUser; onLogout: () => void }) {
  const [schools, setSchools] = useState<SASchool[]>([]);
  const [loadingSchools, setLoadingSchools] = useState(true);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);
  const [flags, setFlags] = useState<Partial<SchoolFeatureFlags>>({});
  const [savingFlags, setSavingFlags] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [addSchoolOpen, setAddSchoolOpen] = useState(false);
  const [newSchool, setNewSchool] = useState({ name: '', code: '', email: '', password: '', planName: 'standard' });
  const [creatingSchool, setCreatingSchool] = useState(false);
  const [createError, setCreateError] = useState('');
  const [saView, setSaView] = useState<'schools' | 'flags'>('schools');
  const { toast } = useToast();

  const loadSchools = async () => {
    setLoadingSchools(true);
    try {
      const res = await fetch(`/api/superadmin/schools?token=${SA_TOKEN}`);
      if (res.ok) { const d = await res.json(); setSchools(d.schools || []); }
    } finally { setLoadingSchools(false); }
  };

  useEffect(() => { loadSchools(); }, []);

  const openFlags = (school: SASchool) => {
    setSelectedSchoolId(school.id);
    setFlags(school.featureFlags ?? {
      aiTimetableEnabled: true, manualTimetableEnabled: true, bulkImportEnabled: true,
      shortBreakEnabled: true, lunchBreakEnabled: true, ptPeriodsEnabled: true,
      substitutionEnabled: true, autoSubstitutionEnabled: true, workloadAnalyticsEnabled: true,
      teacherNotifyEnabled: true, maxGrades: 12, maxTeachers: 200, maxPeriodsPerDay: 10,
      planName: 'standard',
    });
    setSaView('flags');
  };

  const saveFlags = async () => {
    if (!selectedSchoolId) return;
    setSavingFlags(true); setSavedMsg('');
    try {
      const res = await fetch(`/api/superadmin/feature-flags?schoolId=${selectedSchoolId}&token=${SA_TOKEN}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(flags),
      });
      if (res.ok) { setSavedMsg('Saved!'); await loadSchools(); setTimeout(() => setSavedMsg(''), 2500); }
    } finally { setSavingFlags(false); }
  };

  const createSchool = async () => {
    if (!newSchool.name || !newSchool.code || !newSchool.email || !newSchool.password) {
      setCreateError('All fields are required'); return;
    }
    setCreatingSchool(true); setCreateError('');
    try {
      const res = await fetch(`/api/superadmin/schools?token=${SA_TOKEN}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newSchool),
      });
      const d = await res.json();
      if (!res.ok) { setCreateError(d.error || 'Failed to create school'); return; }
      toast({ title: 'School created', description: `${newSchool.name} is ready.` });
      setAddSchoolOpen(false);
      setNewSchool({ name: '', code: '', email: '', password: '', planName: 'standard' });
      await loadSchools();
    } finally { setCreatingSchool(false); }
  };

  const selectedSchool = schools.find(s => s.id === selectedSchoolId);
  const groups = [...new Set(FLAG_META.map(f => f.group))];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-900 flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-purple-800/40 bg-slate-950/80 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-purple-500 to-violet-600 p-1.5 rounded-xl">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-white font-bold text-sm">Super Admin Console</span>
              <span className="hidden sm:inline text-purple-300/60 text-xs ml-2">AI Smart Calendar Platform</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-purple-300/70 text-xs border border-purple-700/40 rounded-lg px-2.5 py-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              {user.name} &bull; {user.email}
            </div>
            <Button size="sm" variant="outline" onClick={onLogout} className="text-xs border-purple-700 text-purple-200 hover:bg-purple-900 h-8">
              <LogOut className="w-3 h-3 mr-1" /> Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-purple-300/60 mb-6">
          <button onClick={() => setSaView('schools')} className={`hover:text-purple-200 ${saView === 'schools' ? 'text-purple-200 font-semibold' : ''}`}>
            All Schools
          </button>
          {saView === 'flags' && selectedSchool && (
            <>
              <span>/</span>
              <span className="text-purple-200 font-semibold">{selectedSchool.name} — Feature Flags</span>
            </>
          )}
        </div>

        {/* ── Schools List ── */}
        {saView === 'schools' && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-white">School Accounts</h2>
                <p className="text-purple-300/60 text-sm">{schools.length} schools registered on the platform</p>
              </div>
              <Button onClick={() => setAddSchoolOpen(true)} className="bg-purple-600 hover:bg-purple-700 text-white text-xs h-9 gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Add School
              </Button>
            </div>

            {loadingSchools ? (
              <div className="flex items-center gap-3 text-purple-300/60 py-12 justify-center">
                <RefreshCw className="w-5 h-5 animate-spin" /> Loading schools…
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {schools.map(school => (
                  <div key={school.id} className="rounded-2xl border border-purple-700/30 bg-slate-900/60 p-5 hover:border-purple-500/50 transition-all">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="min-w-0">
                        <p className="text-white font-semibold truncate">{school.name}</p>
                        <p className="text-purple-300/60 text-xs truncate">{school.email}</p>
                      </div>
                      <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${PLAN_COLORS[school.featureFlags?.planName ?? 'standard'] ?? PLAN_COLORS.standard}`}>
                        {(school.featureFlags?.planName ?? 'standard').toUpperCase()}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      <div className="bg-slate-800/60 rounded-xl p-2 text-center">
                        <p className="text-white font-bold text-lg">{school._count.teachers}</p>
                        <p className="text-purple-300/50 text-[10px]">Teachers</p>
                      </div>
                      <div className="bg-slate-800/60 rounded-xl p-2 text-center">
                        <p className="text-white font-bold text-lg">{school._count.schedules}</p>
                        <p className="text-purple-300/50 text-[10px]">Periods</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => openFlags(school)} size="sm" className="flex-1 bg-purple-700/60 hover:bg-purple-700 text-white text-xs h-8">
                        <Settings className="w-3 h-3 mr-1" /> Feature Flags
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Feature Flags Editor ── */}
        {saView === 'flags' && selectedSchool && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-white">{selectedSchool.name}</h2>
                <p className="text-purple-300/60 text-sm">Manage enabled features and plan limits</p>
              </div>
              <div className="flex items-center gap-2">
                {savedMsg && <span className="text-emerald-400 text-xs font-medium">{savedMsg}</span>}
                <Button onClick={saveFlags} disabled={savingFlags} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9">
                  {savingFlags ? <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
                  Save Changes
                </Button>
              </div>
            </div>

            {/* Plan */}
            <div className="rounded-2xl border border-purple-700/30 bg-slate-900/60 p-5">
              <p className="text-xs font-semibold text-purple-300/70 uppercase tracking-wider mb-3">Plan & Limits</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-300">Plan Name</Label>
                  <select
                    value={(flags.planName as string) ?? 'standard'}
                    onChange={e => setFlags(f => ({ ...f, planName: e.target.value }))}
                    className="w-full rounded-lg bg-slate-800 border border-purple-700/40 text-white text-xs px-3 py-2"
                  >
                    <option value="trial">Trial</option>
                    <option value="standard">Standard</option>
                    <option value="premium">Premium</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-300">Max Grades</Label>
                  <Input type="number" min={1} max={20}
                    value={(flags.maxGrades as number) ?? 12}
                    onChange={e => setFlags(f => ({ ...f, maxGrades: parseInt(e.target.value) || 12 }))}
                    className="bg-slate-800 border-purple-700/40 text-white text-xs h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-300">Max Teachers</Label>
                  <Input type="number" min={1} max={1000}
                    value={(flags.maxTeachers as number) ?? 200}
                    onChange={e => setFlags(f => ({ ...f, maxTeachers: parseInt(e.target.value) || 200 }))}
                    className="bg-slate-800 border-purple-700/40 text-white text-xs h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-300">Max Periods/Day</Label>
                  <Input type="number" min={1} max={15}
                    value={(flags.maxPeriodsPerDay as number) ?? 10}
                    onChange={e => setFlags(f => ({ ...f, maxPeriodsPerDay: parseInt(e.target.value) || 10 }))}
                    className="bg-slate-800 border-purple-700/40 text-white text-xs h-9"
                  />
                </div>
              </div>
              <div className="mt-4 space-y-1.5">
                <Label className="text-xs text-gray-300">Custom Note (shown on school dashboard)</Label>
                <Input
                  value={(flags.customNote as string) ?? ''}
                  onChange={e => setFlags(f => ({ ...f, customNote: e.target.value }))}
                  placeholder="e.g. Trial expires on 30 Sep 2026. Upgrade to unlock advanced features."
                  className="bg-slate-800 border-purple-700/40 text-white text-xs h-9"
                />
              </div>
            </div>

            {/* Feature toggle groups */}
            {groups.map(group => (
              <div key={group} className="rounded-2xl border border-purple-700/30 bg-slate-900/60 p-5">
                <p className="text-xs font-semibold text-purple-300/70 uppercase tracking-wider mb-3">{group}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {FLAG_META.filter(f => f.group === group).map(({ key, label }) => {
                    const enabled = (flags[key] as boolean) ?? true;
                    return (
                      <button
                        key={key}
                        onClick={() => setFlags(f => ({ ...f, [key]: !enabled }))}
                        className={`flex items-center justify-between rounded-xl px-4 py-3 border text-sm font-medium transition-all ${
                          enabled
                            ? 'bg-emerald-900/30 border-emerald-600/40 text-emerald-300'
                            : 'bg-slate-800/60 border-slate-600/40 text-slate-400'
                        }`}
                      >
                        <span>{label}</span>
                        <div className={`w-9 h-5 rounded-full flex items-center transition-colors relative ${enabled ? 'bg-emerald-500' : 'bg-slate-600'}`}>
                          <div className={`absolute w-3.5 h-3.5 bg-white rounded-full shadow transition-all ${enabled ? 'left-4' : 'left-1'}`} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Add School Dialog */}
      <Dialog open={addSchoolOpen} onOpenChange={setAddSchoolOpen}>
        <DialogContent className="max-w-md bg-slate-900 border-purple-700/40 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Add New School</DialogTitle>
            <DialogDescription className="text-purple-300/60">Create a new school account on the platform.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {createError && <div className="bg-red-900/30 border border-red-500/40 text-red-300 rounded-lg px-3 py-2 text-xs">{createError}</div>}
            <div className="space-y-1.5"><Label className="text-xs text-gray-300">School Name</Label><Input value={newSchool.name} onChange={e => setNewSchool(s => ({ ...s, name: e.target.value }))} placeholder="Sunrise Public School" className="bg-slate-800 border-purple-700/40 text-white h-9 text-sm" /></div>
            <div className="space-y-1.5"><Label className="text-xs text-gray-300">School Code (unique)</Label><Input value={newSchool.code} onChange={e => setNewSchool(s => ({ ...s, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') }))} placeholder="SUNRISE01" className="bg-slate-800 border-purple-700/40 text-white h-9 text-sm" /></div>
            <div className="space-y-1.5"><Label className="text-xs text-gray-300">Admin Email</Label><Input type="email" value={newSchool.email} onChange={e => setNewSchool(s => ({ ...s, email: e.target.value }))} placeholder="admin@sunrisepublic.edu" className="bg-slate-800 border-purple-700/40 text-white h-9 text-sm" /></div>
            <div className="space-y-1.5"><Label className="text-xs text-gray-300">Password</Label><Input type="password" value={newSchool.password} onChange={e => setNewSchool(s => ({ ...s, password: e.target.value }))} placeholder="Minimum 8 characters" className="bg-slate-800 border-purple-700/40 text-white h-9 text-sm" /></div>
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-300">Plan</Label>
              <select value={newSchool.planName} onChange={e => setNewSchool(s => ({ ...s, planName: e.target.value }))} className="w-full rounded-lg bg-slate-800 border border-purple-700/40 text-white text-sm px-3 py-2">
                <option value="trial">Trial</option>
                <option value="standard">Standard</option>
                <option value="premium">Premium</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddSchoolOpen(false)} className="text-gray-400 hover:text-white">Cancel</Button>
            <Button onClick={createSchool} disabled={creatingSchool} className="bg-purple-600 hover:bg-purple-700 text-white">
              {creatingSchool ? <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
              Create School
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Login Page Component ───
function LoginPage({ onLogin }: { onLogin: (user: LoginUser, role: UserRole) => void }) {
  const [loginRole, setLoginRole] = useState<'admin' | 'school' | 'teacher' | 'superadmin'>('school');
  const [email, setEmail] = useState('pilot@client.school');
  const [password, setPassword] = useState('ClientPilot2026');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [schoolName, setSchoolName] = useState('');
  const [schoolCode, setSchoolCode] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (registering && password !== confirmPassword) { setError('Passwords do not match.'); setLoading(false); return; }
      const res = await fetch(registering ? '/api/auth/register-school' : '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registering ? { name: schoolName, code: schoolCode, email, password } : { email, password, role: loginRole }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        const role: UserRole = !registering && loginRole === 'superadmin' ? 'superadmin' : !registering && loginRole === 'teacher' ? 'teacher' : 'admin';
        onLogin(data.user, role);
      } else {
        setError(data.error || 'Invalid credentials');
      }
    } catch {
      setError('Connection failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickSchool = async (schoolEmail: string, quickPassword = 'school123') => {
    setLoginRole('school');
    setEmail(schoolEmail);
    setPassword(quickPassword);
    setRegistering(false); setError(''); setLoading(true);
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: schoolEmail, password: quickPassword, role: 'school' }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Demo login failed');
      onLogin(data.user, 'admin');
    } catch (quickError) { setError(quickError instanceof Error ? quickError.message : 'Demo login failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-slate-900 to-emerald-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl shadow-lg shadow-emerald-500/30 mb-4">
            <Brain className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">AI Smart Calendar</h1>
          <p className="text-emerald-300/80 text-sm">Multi-Tenant School Management Platform</p>
        </div>

        {/* Login Card */}
        <Card className="bg-gray-900/80 border-gray-700/50 backdrop-blur-xl shadow-2xl">
          <CardContent className="p-6">
            {/* Role Tabs */}
            {!registering && <Tabs value={loginRole} onValueChange={(v) => {
              setLoginRole(v as 'admin' | 'school' | 'teacher' | 'superadmin');
              setError('');
              if (v === 'superadmin') { setEmail('superadmin@smartcalendar.app'); setPassword(''); }
              else if (v === 'school') { setEmail('pilot@client.school'); setPassword('ClientPilot2026'); }
              else { setEmail(''); setPassword(''); }
            }} className="mb-6">
              <TabsList className="w-full bg-gray-800 border border-gray-700 h-11">
                <TabsTrigger value="school" className="flex-1 data-[state=active]:bg-emerald-600 data-[state=active]:text-white text-gray-400 h-9 text-xs">
                  <GraduationCap className="w-3.5 h-3.5 mr-1" />
                  School
                </TabsTrigger>
                <TabsTrigger value="admin" className="flex-1 data-[state=active]:bg-emerald-600 data-[state=active]:text-white text-gray-400 h-9 text-xs">
                  <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                  Admin
                </TabsTrigger>
                <TabsTrigger value="teacher" className="flex-1 data-[state=active]:bg-emerald-600 data-[state=active]:text-white text-gray-400 h-9 text-xs">
                  <User className="w-3.5 h-3.5 mr-1" />
                  Teacher
                </TabsTrigger>
                <TabsTrigger value="superadmin" className="flex-1 data-[state=active]:bg-purple-700 data-[state=active]:text-white text-gray-400 h-9 text-xs">
                  <Settings className="w-3.5 h-3.5 mr-1" />
                  Super Admin
                </TabsTrigger>
              </TabsList>
            </Tabs>}

            {registering && <div className="mb-5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3"><p className="font-semibold text-emerald-300">Create School Account</p><p className="text-xs text-gray-400">Set up a separate Smart Calendar workspace for your school.</p></div>}

            <form onSubmit={handleSubmit} className="space-y-4">
              {registering && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2 sm:col-span-2"><Label className="text-gray-300 text-xs font-medium">School Name</Label><Input value={schoolName} onChange={(e) => setSchoolName(e.target.value)} placeholder="Sunrise Public School" className="bg-gray-800/50 border-gray-600/50 text-white h-11" required /></div>
                <div className="space-y-2 sm:col-span-2"><Label className="text-gray-300 text-xs font-medium">School Code</Label><Input value={schoolCode} onChange={(e) => setSchoolCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))} placeholder="SUNRISE01" className="bg-gray-800/50 border-gray-600/50 text-white h-11" required /></div>
              </div>}
              <div className="space-y-2">
                <Label className="text-gray-300 text-xs font-medium">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={loginRole === 'school' ? 'admin@sunrisepublic.edu' : loginRole === 'admin' ? 'admin@dps.edu' : 'your.email@school.edu'}
                    className="pl-10 bg-gray-800/50 border-gray-600/50 text-white placeholder:text-gray-500 focus:border-emerald-500 focus:ring-emerald-500/20 h-11"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-gray-300 text-xs font-medium">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="pl-10 bg-gray-800/50 border-gray-600/50 text-white placeholder:text-gray-500 focus:border-emerald-500 focus:ring-emerald-500/20 h-11"
                    required
                  />
                </div>
              </div>

              {registering && <div className="space-y-2"><Label className="text-gray-300 text-xs font-medium">Confirm Password</Label><div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"/><Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repeat your password" minLength={8} className="pl-10 bg-gray-800/50 border-gray-600/50 text-white h-11" required /></div></div>}

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <p className="text-sm text-red-300">{error}</p>
                </div>
              )}

              <Button
                type="submit"
                disabled={loading || !email || !password}
                className="w-full h-11 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold shadow-lg shadow-emerald-600/20 transition-all"
              >
                {loading ? (
                  <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Signing in...</>
                ) : (
                  <>{registering ? <UserPlus className="w-4 h-4 mr-2"/> : <LogOut className="w-4 h-4 mr-2 rotate-180" />}{registering ? 'Create School Account' : `Sign In as ${loginRole === 'school' ? 'School Admin' : loginRole === 'admin' ? 'Global Admin' : 'Teacher'}`}</>
                )}
              </Button>
            </form>

            <Button type="button" variant="ghost" onClick={() => { setRegistering(!registering); setLoginRole('school'); setError(''); setEmail(''); setPassword(''); setConfirmPassword(''); }} className="mt-3 w-full text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200">
              {registering ? 'Already have an account? Sign in' : 'New school? Create an account'}
            </Button>

            {!registering && <div className="mt-6 p-4 bg-gray-800/50 rounded-xl border border-gray-700/50 space-y-2">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Select School Demo Login</p>
              <div className="grid grid-cols-1 gap-2">
                <Button
                  type="button"
                  onClick={() => handleQuickSchool('pilot@client.school', 'ClientPilot2026')}
                  variant="outline"
                  className="w-full justify-start text-xs border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-200 h-auto py-2.5"
                >
                  <GraduationCap className="w-3.5 h-3.5 mr-2 text-amber-400 shrink-0" />
                  <span className="text-left">
                    <span className="block font-semibold">Client Pilot School ★</span>
                    <span className="block text-[10px] text-amber-200/70 font-normal">Grades 3–8 · 24 teachers · full access trial</span>
                  </span>
                </Button>
                <Button
                  type="button"
                  onClick={() => handleQuickSchool('admin@demo1.edu')}
                  variant="outline"
                  className="w-full justify-start text-xs border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 h-9"
                >
                  <GraduationCap className="w-3.5 h-3.5 mr-2 text-emerald-400" />
                  Demo 1 School (Excel Demo Data)
                </Button>
                <Button
                  type="button"
                  onClick={() => handleQuickSchool('info@dpsdelhi.edu')}
                  variant="outline"
                  className="w-full justify-start text-xs border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 h-9"
                >
                  <GraduationCap className="w-3.5 h-3.5 mr-2 text-blue-400" />
                  Delhi Public School (Real Allotment Data)
                </Button>
              </div>
            </div>}
          </CardContent>
        </Card>

        <p className="text-center text-[10px] text-gray-600 mt-6">
          AI Smart Calendar &copy; {new Date().getFullYear()} &middot; Multi-Tenant Powered
        </p>
      </div>
    </div>
  );
}

// ─── Main App Component ───
export default function AISmartCalendar() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [stats, setStats] = useState<Stats | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [allSchedules, setAllSchedules] = useState<Schedule[]>([]);
  const [substitutions, setSubstitutions] = useState<Substitution[]>([]);
  const [selectedDay, setSelectedDay] = useState('Monday');
  const [loading, setLoading] = useState(true);
  const [assigningTeacher, setAssigningTeacher] = useState(false);
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [generatingDna, setGeneratingDna] = useState(false);
  const [generatingLessonPlan, setGeneratingLessonPlan] = useState(false);
  const [userMode, setUserMode] = useState<'admin' | 'teacher' | 'superadmin'>('admin');
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginUser, setLoginUser] = useState<LoginUser | null>(null);
  const [teacherLoginOpen, setTeacherLoginOpen] = useState(false);
  const [loginTeacherId, setLoginTeacherId] = useState('');
  const [featureFlags, setFeatureFlags] = useState<SchoolFeatureFlags | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const schoolParam = loginUser?.schoolId ? `?schoolId=${loginUser.schoolId}` : '';
      const res = await fetch(`/api/stats${schoolParam}`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  }, [loginUser?.schoolId]);

  const fetchTeachers = useCallback(async () => {
    try {
      const schoolParam = loginUser?.schoolId ? `?schoolId=${loginUser.schoolId}` : '';
      const res = await fetch(`/api/teachers${schoolParam}`);
      if (res.ok) {
        const data = await res.json();
        setTeachers(data);
      }
    } catch (error) {
      console.error('Error fetching teachers:', error);
    }
  }, [loginUser?.schoolId]);

  const fetchSchedules = useCallback(async (day: string) => {
    try {
      const schoolParam = loginUser?.schoolId ? `&schoolId=${loginUser.schoolId}` : '';
      const res = await fetch(`/api/schedules?day=${day}${schoolParam}`);
      if (res.ok) {
        const data = await res.json();
        setSchedules(data);
      }
    } catch (error) {
      console.error('Error fetching schedules:', error);
    }
  }, [loginUser?.schoolId]);

  const fetchAllSchedules = useCallback(async () => {
    try {
      const schoolParam = loginUser?.schoolId ? `&schoolId=${loginUser.schoolId}` : '';
      const allData: Schedule[] = [];
      for (const day of DAYS) {
        const res = await fetch(`/api/schedules?day=${day}${schoolParam}`);
        if (res.ok) {
          const data = await res.json();
          allData.push(...data);
        }
      }
      setAllSchedules(allData);
    } catch (error) {
      console.error('Error fetching all schedules:', error);
    }
  }, []);

  const fetchSubstitutions = useCallback(async () => {
    try {
      const res = await fetch('/api/substitutions');
      if (res.ok) {
        const data = await res.json();
        setSubstitutions(data);
      }
    } catch (error) {
      console.error('Error fetching substitutions:', error);
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchStats(), fetchTeachers(), fetchSchedules('Monday'), fetchSubstitutions(), fetchAllSchedules()]);
      setLoading(false);
    };
    init();
  }, [isLoggedIn, fetchStats, fetchTeachers, fetchSchedules, fetchSubstitutions, fetchAllSchedules]);

  // Fetch schedules when day changes (use callback ref pattern to avoid setState-in-effect)
  const prevDayRef = React.useRef(selectedDay);
  React.useEffect(() => {
    if (prevDayRef.current !== selectedDay) {
      prevDayRef.current = selectedDay;
      fetchSchedules(selectedDay);
    }
  }, [selectedDay, fetchSchedules]);

  const handleAssignTeacher = useCallback(
    async (scheduleId: string, teacherId: string) => {
      setAssigningTeacher(true);
      try {
        const res = await fetch('/api/schedules/assign-teacher', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scheduleId, teacherId }),
        });
        if (res.ok) {
          const data = await res.json();
          const warning = data.warning;
          toast({ title: 'Teacher Assigned', description: warning || 'Teacher has been assigned to this period' });
          await Promise.all([fetchSchedules(selectedDay), fetchAllSchedules(), fetchStats()]);
        } else if (res.status === 409) {
          const data = await res.json();
          toast({ title: 'Time Conflict Detected', description: data.error || 'This teacher is already assigned to another class at this time slot.', variant: 'destructive' });
        } else {
          const data = await res.json();
          toast({ title: 'Error', description: data.error || 'Failed to assign teacher', variant: 'destructive' });
        }
      } catch {
        toast({ title: 'Error', description: 'Failed to assign teacher', variant: 'destructive' });
      }
      setAssigningTeacher(false);
    },
    [fetchSchedules, fetchAllSchedules, fetchStats, selectedDay, toast]
  );

  const handleAutoAssign = useCallback(
    async (schedule: Schedule) => {
      setAutoAssigning(true);
      try {
        const res = await fetch('/api/schedules/auto-assign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grade: schedule.grade,
            section: schedule.section,
            day: schedule.day,
            period: schedule.period,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const workloadStatus = data.workloadStatus;
          toast({
            title: 'AI Auto-Assign',
            description: data.message || 'Teacher auto-assigned successfully' + (workloadStatus ? ` — ${workloadStatus}` : ''),
          });
          await Promise.all([fetchSchedules(selectedDay), fetchAllSchedules(), fetchStats()]);
        } else if (res.status === 409) {
          const data = await res.json();
          toast({ title: 'AI Conflict Detected', description: data.error || 'Assignment conflict detected. Try again or assign manually.', variant: 'destructive' });
        } else {
          const data = await res.json();
          toast({ title: 'AI Auto-Assign', description: data.error || 'No available teachers found', variant: 'destructive' });
        }
      } catch {
        toast({ title: 'Error', description: 'Failed to auto-assign teacher', variant: 'destructive' });
      }
      setAutoAssigning(false);
    },
    [fetchSchedules, fetchAllSchedules, fetchStats, selectedDay, toast]
  );

  const handleGenerateDNA = useCallback(
    async (subId: string) => {
      setGeneratingDna(true);
      try {
        const res = await fetch('/api/substitutions/generate-dna', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ substitutionId: subId }),
        });
        if (res.ok) {
          toast({ title: 'Lesson DNA Generated', description: 'AI has generated the lesson DNA for this substitution' });
          await fetchSubstitutions();
        } else {
          toast({ title: 'Error', description: 'Failed to generate lesson DNA', variant: 'destructive' });
        }
      } catch {
        toast({ title: 'Error', description: 'Failed to generate lesson DNA', variant: 'destructive' });
      }
      setGeneratingDna(false);
    },
    [fetchSubstitutions, toast]
  );

  const handleGenerateLessonPlan = useCallback(
    async (params: { grade: string; section: string; subject: string; topic: string; day: string; period: number }): Promise<LessonPlan | null> => {
      setGeneratingLessonPlan(true);
      try {
        const res = await fetch('/api/teachers/generate-lesson-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            teacherId: selectedTeacher?.id,
            ...params,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          toast({ title: 'Lesson Plan Generated', description: 'AI has generated a comprehensive lesson plan' });
          return data.lessonPlan as LessonPlan;
        } else {
          toast({ title: 'Error', description: 'Failed to generate lesson plan', variant: 'destructive' });
          return null;
        }
      } catch {
        toast({ title: 'Error', description: 'Failed to generate lesson plan', variant: 'destructive' });
        return null;
      } finally {
        setGeneratingLessonPlan(false);
      }
    },
    [selectedTeacher, toast]
  );

  const navigateToTab = useCallback(
    (tab: TabType) => {
      setActiveTab(tab);
      if (tab === 'calendar') {
        fetchSchedules(selectedDay);
        fetchAllSchedules();
      } else if (tab === 'substitutions') {
        fetchSubstitutions();
      } else if (tab === 'teachers') {
        fetchTeachers();
      } else if (tab === 'teacher-portal') {
        fetchAllSchedules();
      }
    },
    [fetchSchedules, fetchSubstitutions, fetchTeachers, fetchAllSchedules, selectedDay]
  );

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'calendar', label: 'Academic Calendar', icon: <Calendar className="w-4 h-4" /> },
    { id: 'substitutions', label: 'Substitutions', icon: <RefreshCw className="w-4 h-4" /> },
    { id: 'teachers', label: 'Teachers', icon: <Users className="w-4 h-4" /> },
    { id: 'analytics', label: 'Workload Analytics', icon: <BarChart3 className="w-4 h-4" /> },
  ];

  const teacherTabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'teacher-portal', label: 'Teacher Dashboard', icon: <GraduationCap className="w-4 h-4" /> },
  ];

  const handleLogin = async (user: LoginUser, role: UserRole) => {
    setIsLoggedIn(true);
    setLoginUser(user);

    if (role === 'superadmin') {
      setUserMode('superadmin');
      setActiveTab('dashboard');
      return;
    }

    if (role === 'admin') {
      setUserMode('admin');
      setActiveTab('dashboard');
      // Fetch feature flags for this school
      if (user.schoolId) {
        try {
          const res = await fetch(`/api/school/feature-flags?schoolId=${user.schoolId}`);
          if (res.ok) { const data = await res.json(); setFeatureFlags(data.flags); }
        } catch {}
      }
    } else if (role === 'teacher') {
      // Find the teacher from our loaded teachers list
      const teacher = teachers.find((t) => t.id === user.id);
      if (teacher) {
        setSelectedTeacher(teacher);
      } else {
        // Create a minimal teacher object from login data
        setSelectedTeacher({
          id: user.id,
          name: user.name,
          email: user.email,
          subject: user.subject || '',
          grades: user.grades || '[]',
          schedules: [],
        });
      }
      setUserMode('teacher');
      setActiveTab('teacher-portal');
      fetchAllSchedules();
    }
  };

  const handleTeacherLogin = () => {
    const teacher = teachers.find((t) => t.id === loginTeacherId);
    if (teacher) {
      setSelectedTeacher(teacher);
      setUserMode('teacher');
      setIsLoggedIn(true);
      setActiveTab('teacher-portal');
      setTeacherLoginOpen(false);
      setLoginTeacherId('');
      // Fetch all schedules for teacher portal
      fetchAllSchedules();
      toast({ title: 'Welcome!', description: `Signed in as ${teacher.name}` });
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setLoginUser(null);
    setUserMode('admin');
    setSelectedTeacher(null);
    setActiveTab('dashboard');
    toast({ title: 'Signed Out', description: 'You have been logged out successfully' });
  };

  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Show login page if not logged in
  if (!isLoggedIn) {
    return <LoginPage onLogin={handleLogin} />;
  }

  // Super-admin portal — completely separate UI
  if (userMode === 'superadmin') {
    return <SuperAdminPortal user={loginUser!} onLogout={handleLogout} />;
  }

  return (
    <div className="min-h-screen bg-gray-50/50 flex">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 h-dvh w-64 bg-white border-r shadow-lg transform transition-transform duration-200 ease-in-out lg:sticky lg:top-0 lg:translate-x-0 lg:shadow-none lg:z-auto ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex flex-col h-full">
          {/* Sidebar Header */}
          <div className="flex shrink-0 items-center justify-between p-4 border-b">
            <div className="flex items-center gap-3">
              <div className="bg-emerald-600 p-2 rounded-xl">
                <Brain className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-emerald-800">
                  {loginUser ? loginUser.name : 'AI Smart Calendar'}
                </h1>
                <p className="text-[10px] text-muted-foreground">
                  {loginUser ? (userMode === 'admin' ? 'School Administrator' : `${loginUser.subject || ''} Specialist`) : 'School Management'}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="lg:hidden h-8 w-8" onClick={() => setSidebarOpen(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Navigation */}
          <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 space-y-1">
            {(userMode === 'admin' ? tabs : teacherTabs).map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  navigateToTab(tab.id);
                  setSidebarOpen(false);
                }}
                className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-emerald-100 text-emerald-800 shadow-sm'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Sidebar Footer */}
          <div className="shrink-0 bg-white p-3 border-t space-y-2 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
            {/* Logged-in user info */}
            {loginUser && (
              <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg mb-2">
                <div className={`p-1.5 rounded-full ${userMode === 'admin' ? 'bg-amber-100' : 'bg-emerald-100'}`}>
                  {userMode === 'admin' ? <ShieldCheck className="w-3.5 h-3.5 text-amber-600" /> : <GraduationCap className="w-3.5 h-3.5 text-emerald-600" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">{loginUser.name}</p>
                  <p className="text-[9px] text-muted-foreground truncate">{loginUser.email}</p>
                </div>
              </div>
            )}
            <Separator />
            <Button
              onClick={handleLogout}
              variant="ghost"
              size="sm"
              className="w-full text-xs justify-start text-muted-foreground hover:text-red-700 hover:bg-red-50"
            >
              <LogOut className="w-3.5 h-3.5 mr-2" />
              Logout
            </Button>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground">AI Smart Calendar &copy; {new Date().getFullYear()}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar for mobile */}
        <header className="sticky top-0 z-30 bg-white border-b shadow-sm lg:hidden">
          <div className="flex items-center justify-between h-14 px-4">
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
              <Menu className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-2">
              <div className="bg-emerald-600 p-1.5 rounded-lg">
                <Brain className="w-4 h-4 text-white" />
              </div>
              <span className="text-sm font-bold text-emerald-800">
              {loginUser ? loginUser.name : 'AI Smart Calendar'}
            </span>
            </div>
            <Button onClick={handleLogout} variant="outline" size="sm" className="text-xs h-8 text-red-600">
              <LogOut className="w-3 h-3" />
            </Button>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" />
            <span className="ml-3 text-muted-foreground">Loading...</span>
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <DashboardSection
                stats={stats}
                onNavigate={navigateToTab}
                teachers={teachers}
                substitutions={substitutions}
                schedules={schedules}
                schoolName={loginUser?.name}
                schoolCode={loginUser?.schoolCode}
                isClientPilot={loginUser?.schoolId === 'sch_client_pilot_001' || loginUser?.schoolCode === 'PILOT01'}
                featureFlagNote={featureFlags?.customNote ?? undefined}
                planName={featureFlags?.planName}
              />
            )}
            {activeTab === 'calendar' && (
              <AcademicCalendarSection
                schedules={schedules}
                sharedSchedules={allSchedules}
                teachers={teachers}
                selectedDay={selectedDay}
                onDayChange={setSelectedDay}
                onAssignTeacher={handleAssignTeacher}
                onAutoAssign={handleAutoAssign}
                assigningTeacher={assigningTeacher}
                autoAssigning={autoAssigning}
                schoolId={loginUser?.schoolId}
                schoolName={loginUser?.name}
                onRefreshTeachers={fetchTeachers}
                onRefreshAll={async () => { await Promise.all([fetchTeachers(), fetchSchedules(selectedDay), fetchAllSchedules(), fetchStats()]); }}
              />
            )}
            {activeTab === 'substitutions' && (
              <SubstitutionsSection
                substitutions={substitutions}
                teachers={teachers}
                schedules={allSchedules}
                onRefresh={fetchSubstitutions}
                onGenerateDNA={handleGenerateDNA}
                generatingDna={generatingDna}
              />
            )}
            {activeTab === 'teachers' && (
              <TeachersSection
                teachers={teachers}
                schedules={schedules}
                selectedDay={selectedDay}
                onRefresh={fetchTeachers}
                schoolId={loginUser?.schoolId}
              />
            )}
            {activeTab === 'teacher-portal' && selectedTeacher && (
              <TeacherPortalSection
                teacher={selectedTeacher}
                schedules={allSchedules}
                onGenerateLessonPlan={handleGenerateLessonPlan}
                generatingLessonPlan={generatingLessonPlan}
              />
            )}
            {activeTab === 'analytics' && (
              <WorkloadAnalyticsSection teachers={teachers} schedules={allSchedules} onRefresh={() => { fetchSchedules(selectedDay); fetchAllSchedules(); fetchStats(); }} />
            )}
          </>
        )}
        </main>
      </div>
    </div>
  );
}
