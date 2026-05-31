'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar, Users, BookOpen, RefreshCw, ChevronRight, Clock, User,
  GraduationCap, AlertCircle, CheckCircle2, Sparkles, Brain,
  Search, Phone, Mail, MapPin, Timer, Zap, Activity,
  LayoutDashboard, ArrowRight, UserCheck, AlertTriangle, Menu, X,
  LogOut, FileText, Eye, Target, ListChecks, Lightbulb, BookMarked, CalendarDays,
  Lock, ShieldCheck, Coffee, BarChart3, BookTemplate, Library,
  Download, Copy, Check, Filter, Grid3X3, TrendingUp, TrendingDown,
  ChevronDown, ChevronUp, Layers, Hash, Trash2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
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

type TabType = 'dashboard' | 'calendar' | 'substitutions' | 'teachers' | 'teacher-portal' | 'curriculum' | 'analytics' | 'lesson-plans';
type UserRole = 'admin' | 'teacher' | null;

interface LoginUser {
  id: string;
  name: string;
  email: string;
  role: string;
  subject?: string;
  grades?: string;
  phone?: string;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const PERIOD_TIMES: Record<number, { start: string; end: string }> = {
  1: { start: '08:00', end: '08:40' },
  2: { start: '08:40', end: '09:20' },
  3: { start: '09:20', end: '10:00' },
  4: { start: '10:20', end: '11:00' },
  5: { start: '11:00', end: '11:40' },
  6: { start: '11:40', end: '12:20' },
  7: { start: '13:00', end: '13:40' },
  8: { start: '13:40', end: '14:20' },
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
}

function BiometricAgentCards({
  teachers,
  schedules,
  onNavigate,
}: {
  teachers: Teacher[];
  schedules: Schedule[];
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
      }
    } catch {
      console.error('Error fetching biometric data');
    }
  }, [biometricDate]);

  // Fetch existing biometric data on mount
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
        toast({
          title: 'AI Auto-Assign Complete',
          description: data.message || `${assigned} of ${data.totalPending} substitutions assigned${failed > 0 ? `. ${failed} need manual assignment.` : ''}`,
        });
      } else {
        toast({ title: 'AI Assign Failed', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to auto-assign', variant: 'destructive' });
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
        <CardContent className="p-5 space-y-4">
          {/* Header */}
          <div className="flex items-center gap-2.5">
            <div className="bg-emerald-600 p-2 rounded-xl">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-gray-900 text-sm">AI Biometric Substitution Agent</h3>
              <p className="text-[10px] text-emerald-600 font-medium">Powered by CurriculumArchitect AI</p>
            </div>
            {absentTeachers.length > 0 && (
              <Badge className="bg-red-100 text-red-700 border-red-300 text-[10px]">
                {absentTeachers.length} Absent
              </Badge>
            )}
          </div>

          {/* Date + Sync/Detect Buttons */}
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
              disabled={detecting || !biometricSummary?.absent}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shrink-0"
              size="sm"
            >
              {detecting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              {detecting ? 'Detecting...' : 'Detect'}
            </Button>
          </div>

          <p className="text-[11px] text-gray-500">
            Sync biometric data, detect absent teachers with intelligent reason analysis (leave portal, biometric patterns, AI analysis), auto-assign best substitutes
          </p>

          {/* Absent Teachers List — contained within card with scroll */}
          {absentTeachers.length > 0 && (
            <div className="mt-2 border border-emerald-200 rounded-lg bg-white/60 overflow-hidden">
              {/* Section Header: count + AI Auto-Assign button */}
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
                    {autoAssigningAll ? 'Assigning...' : 'AI Auto-Assign All'}
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

              {/* AI Assignment Results (shown after AI assigns) */}
              {aiAssignments.length > 0 && (
                <div className="px-3 py-2 bg-teal-50/50 border-b border-teal-100">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                    <span className="text-[11px] font-semibold text-teal-800">AI Assignment Results</span>
                    <Badge className="text-[8px] bg-teal-100 text-teal-700 border-teal-300 py-0">
                      {assignedCount} assigned
                    </Badge>
                    {pendingCount > 0 && (
                      <Badge className="text-[8px] bg-amber-100 text-amber-700 border-amber-300 py-0">
                        {pendingCount} pending
                      </Badge>
                    )}
                  </div>
                  <ScrollArea className="max-h-[80px]">
                    <div className="space-y-1">
                      {aiAssignments.slice(0, 8).map(a => (
                        <div key={a.substitutionId} className="flex items-center gap-2 text-[10px] p-1 bg-white/80 rounded">
                          <Badge variant="outline" className="text-[8px] font-bold py-0">P{a.period}</Badge>
                          <span className="text-gray-600">{a.grade} {a.section}</span>
                          {a.assignedTeacher ? (
                            <>
                              <span className="text-emerald-700 font-medium">{a.assignedTeacher}</span>
                              <Badge className="text-[7px] bg-emerald-50 text-emerald-600 py-0">{a.reason}</Badge>
                            </>
                          ) : (
                            <Badge className="text-[8px] bg-amber-50 text-amber-700 py-0">Manual</Badge>
                          )}
                        </div>
                      ))}
                      {aiAssignments.length > 8 && (
                        <p className="text-[9px] text-muted-foreground text-center">+{aiAssignments.length - 8} more</p>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {/* Scrollable Absent Teacher List — fits within card */}
              <ScrollArea className="max-h-[240px]">
                <div className="px-2 py-1.5 space-y-1">
                  {absentTeachers.map(at => (
                    <div
                      key={at.teacherId}
                      className="p-2 bg-white rounded-lg border border-emerald-100 hover:border-emerald-300 cursor-pointer transition-all"
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
                        <Badge className={`text-[8px] py-0 ${getStatusBadgeStyle(at.biometricStatus)}`}>
                          {at.biometricStatus === 'half-day' ? 'Half-day' : at.biometricStatus === 'absent' ? 'Absent' : 'Late'}
                        </Badge>
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
                      {at.scheduleDetails.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {at.scheduleDetails.slice(0, 4).map(sd => (
                            <span key={sd.period} className="text-[8px] px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded border border-emerald-100">
                              P{sd.period} {sd.grade} {sd.section}
                            </span>
                          ))}
                          {at.scheduleDetails.length > 4 && (
                            <span className="text-[8px] px-1.5 py-0.5 bg-gray-50 text-gray-500 rounded">
                              +{at.scheduleDetails.length - 4} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Card 2: Biometric Attendance */}
      <Card className="border-gray-200">
        <CardContent className="p-5 space-y-4">
          {/* Header */}
          <div className="flex items-center gap-2.5">
            <div className="bg-emerald-100 p-2 rounded-xl">
              <Activity className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-gray-900 text-sm">Biometric Attendance</h3>
              {lastSyncTime && (
                <p className="text-[10px] text-muted-foreground">
                  Last synced: {new Date(lastSyncTime).toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>

          {/* Sync Button or Summary */}
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

              {/* Absent Teachers Quick List with Reasons */}
              {(biometricSummary.absent > 0 || biometricSummary.late > 0) && (
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold text-red-700 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Affected Teachers:
                  </p>
                  {biometricRecords
                    .filter((r: BiometricRecord) => r.status === 'absent' || r.status === 'late' || r.status === 'half-day')
                    .slice(0, 6)
                    .map((r: BiometricRecord) => {
                      const matchingAbsent = absentTeachers.find(at => at.teacherId === r.teacherId);
                      return (
                        <div key={r.id} className="flex items-center gap-2 text-[10px] p-1.5 bg-white rounded border border-gray-100">
                          <div className={`w-1.5 h-1.5 rounded-full ${
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

      {/* Absent Teacher Detail Dialog — matching screenshot design */}
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
                        {selectedAbsentTeacher.scheduleDetails.map(sd => (
                          <div key={sd.period} className="p-2.5 bg-white rounded-lg border border-gray-100">
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
}: {
  stats: Stats | null;
  onNavigate: (tab: TabType) => void;
  teachers: Teacher[];
  substitutions: Substitution[];
  schedules: Schedule[];
}) {
  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-6 md:p-8 text-white">
        <div className="flex items-center gap-3 mb-3">
          <div className="bg-white/20 p-2 rounded-xl">
            <Brain className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">AI Smart Calendar</h1>
            <p className="text-emerald-100 text-sm md:text-base">Delhi Public School — Intelligent School Management System</p>
          </div>
        </div>
        <p className="text-emerald-50 text-sm md:text-base max-w-2xl">
          Manage academic schedules, teacher assignments, substitutions, and lesson planning with AI-powered intelligence.
          Automate teacher assignments and generate comprehensive lesson DNA for substitute teachers.
        </p>

      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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

      {/* Behavioral Pattern Awareness + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="w-5 h-5 text-emerald-600" />
              Behavioral Pattern Awareness
            </CardTitle>
            <CardDescription>AI-detected patterns across the school schedule</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-48">
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-emerald-50 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">High Substitution Rate on Mondays</p>
                    <p className="text-xs text-muted-foreground">Monday has 40% more teacher absences compared to other days. Consider scheduling lighter workloads.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Period 6 Engagement Drop</p>
                    <p className="text-xs text-muted-foreground">After-lunch periods (12:45-13:30) show 25% lower student engagement. Recommend interactive activities.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-teal-50 rounded-lg">
                  <CheckCircle2 className="w-5 h-5 text-teal-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Math Teachers Optimally Distributed</p>
                    <p className="text-xs text-muted-foreground">Math periods are well-distributed across the week with no conflicts detected.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Empty Periods in Grade 7-8</p>
                    <p className="text-xs text-muted-foreground">Several periods in Grades 7 and 8 have no teachers assigned. Use AI auto-assign to fill them.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-emerald-50 rounded-lg">
                  <Brain className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">PE Scheduling Conflict Resolved</p>
                    <p className="text-xs text-muted-foreground">AI detected and resolved 3 double-booking conflicts in PE scheduling for Grades 5-6.</p>
                  </div>
                </div>
              </div>
            </ScrollArea>
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

            <Button variant="outline" className="w-full justify-between h-14 text-left" onClick={() => onNavigate('curriculum')}>
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 p-2 rounded-lg">
                  <BookTemplate className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium text-sm">Curriculum Builder</p>
                  <p className="text-xs text-muted-foreground">AI-powered annual curriculum generation</p>
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

            <Button variant="outline" className="w-full justify-between h-14 text-left" onClick={() => onNavigate('lesson-plans')}>
              <div className="flex items-center gap-3">
                <div className="bg-rose-100 p-2 rounded-lg">
                  <Library className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <p className="font-medium text-sm">Lesson Plan Library</p>
                  <p className="text-xs text-muted-foreground">AI-generated teaching resources</p>
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
function AcademicCalendarSection({
  schedules,
  teachers,
  selectedDay,
  onDayChange,
  onAssignTeacher,
  onAutoAssign,
  assigningTeacher,
  autoAssigning,
}: {
  schedules: Schedule[];
  teachers: Teacher[];
  selectedDay: string;
  onDayChange: (day: string) => void;
  onAssignTeacher: (scheduleId: string, teacherId: string) => Promise<void>;
  onAutoAssign: (schedule: Schedule) => Promise<void>;
  assigningTeacher: boolean;
  autoAssigning: boolean;
}) {
  const [gradePopupOpen, setGradePopupOpen] = useState(false);
  const [selectedGrade, setSelectedGrade] = useState<{ grade: string; section: string } | null>(null);
  const [periodDetailOpen, setPeriodDetailOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<Schedule | null>(null);
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Day name from date
  const getDayFromDate = (date: Date): string => {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return dayNames[date.getDay()];
  };

  const isWeekend = (date: Date) => date.getDay() === 0 || date.getDay() === 6;

  // Calendar helpers
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const calendarDaysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const calendarFirstDayOfWeek = new Date(calendarYear, calendarMonth, 1).getDay(); // 0=Sun
  const today = new Date();

  const getGradeGroups = () => {
    const groups: Record<string, string[]> = {};
    for (const s of schedules) {
      if (!groups[s.grade]) groups[s.grade] = [];
      if (!groups[s.grade].includes(s.section)) groups[s.grade].push(s.section);
    }
    return groups;
  };

  const getSchedulesForGrade = (grade: string, section: string) => {
    return schedules.filter((s) => s.grade === grade && s.section === section).sort((a, b) => a.period - b.period);
  };

  const getAvailableTeachers = (subject: string, day: string, period: number) => {
    const busyTeacherIds = schedules.filter((s) => s.day === day && s.period === period && s.teacherId).map((s) => s.teacherId);
    return teachers.filter((t) => t.subject === subject && !busyTeacherIds.includes(t.id));
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

  return (
    <div className="space-y-6">
      {/* Header with calendar picker and day selector */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-emerald-800">Academic Calendar</h2>
            <p className="text-sm text-muted-foreground">View and manage class schedules by grade and day</p>
          </div>
          <Button
            variant="outline"
            onClick={() => setCalendarOpen(!calendarOpen)}
            className="gap-2 border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
          >
            <CalendarDays className="w-4 h-4" />
            {selectedDate
              ? selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
              : `${selectedDay} — Pick a date`}
            <ChevronRight className={`w-3 h-3 transition-transform ${calendarOpen ? 'rotate-90' : ''}`} />
          </Button>
        </div>

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
              <span className="text-[10px] text-gray-500">Weekends are disabled</span>
            </div>
          </div>
        )}

        {/* Week day quick selector */}
        <div className="flex items-center bg-white border rounded-xl p-1 shadow-sm">
          {DAYS.map((day) => (
            <Button
              key={day}
              variant="ghost"
              size="sm"
              className={`rounded-lg text-xs font-medium transition-all flex-1 ${
                selectedDay === day
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => {
                onDayChange(day);
                setSelectedDate(null);
              }}
            >
              {day.slice(0, 3)}
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
        <div className="space-y-5">
          {Object.entries(gradeGroups)
            .sort(([a], [b]) => {
              const numA = parseInt(a.replace('Grade ', ''));
              const numB = parseInt(b.replace('Grade ', ''));
              return numA - numB;
            })
            .map(([grade, sections]) => {
              const gradeNum = grade.replace('Grade ', '');
              return (
                <div key={grade} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                  {/* Grade header bar */}
                  <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 text-white/90" />
                    <h3 className="text-sm font-semibold text-white">{grade}</h3>
                    <span className="text-emerald-100 text-xs ml-1">
                      {sections.length} section{sections.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  {/* Section cards */}
                  <div className="p-3 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                    {sections.sort().map((section) => {
                      const gradeSchedules = getSchedulesForGrade(grade, section);
                      const emptyCount = gradeSchedules.filter((s) => !s.teacherId).length;
                      const colors = getSectionColor(section);

                      return (
                        <button
                          key={`${grade}-${section}`}
                          className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 cursor-pointer transition-all duration-200 ${colors.bg} ${colors.border} ${colors.hoverBg} hover:shadow-md hover:scale-105 active:scale-95`}
                          onClick={() => {
                            setSelectedGrade({ grade, section });
                            setGradePopupOpen(true);
                          }}
                        >
                          <span className={`text-xl font-bold ${colors.text}`}>{section}</span>
                          <span className="text-[10px] text-muted-foreground mt-0.5">
                            {gradeSchedules.length}P
                          </span>
                          {emptyCount > 0 && (
                            <span className="text-[9px] text-red-500 font-medium mt-0.5">
                              {emptyCount} empty
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* Grade Popup - Scrollable with all periods */}
      <Dialog open={gradePopupOpen} onOpenChange={setGradePopupOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="flex items-center gap-2 text-emerald-800">
              <GraduationCap className="w-5 h-5" />
              {selectedGrade ? `${selectedGrade.grade} ${selectedGrade.section} - ${selectedDay}` : ''}
            </DialogTitle>
            <DialogDescription>Click on a period to view details or assign a teacher</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[65vh] px-6">
            <div className="space-y-2 pb-6">
              {selectedGrade &&
                getSchedulesForGrade(selectedGrade.grade, selectedGrade.section).map((schedule) => (
                  <div
                    key={schedule.id}
                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md ${
                      schedule.teacherId ? 'border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50' : 'border-red-200 bg-red-50/50 hover:bg-red-50'
                    }`}
                    onClick={() => {
                      setSelectedPeriod(schedule);
                      setSelectedTeacherId('');
                      setPeriodDetailOpen(true);
                    }}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`flex items-center justify-center w-10 h-10 rounded-lg font-bold text-sm ${
                          schedule.teacherId ? 'bg-emerald-200 text-emerald-800' : 'bg-red-200 text-red-800'
                        }`}
                      >
                        P{schedule.period}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{schedule.subject}</p>
                        <p className="text-xs text-muted-foreground">
                          {schedule.startTime} - {schedule.endTime}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {schedule.teacherId ? (
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-xs font-medium text-emerald-700">{schedule.teacher?.name || 'Assigned'}</span>
                        </div>
                      ) : (
                        <Badge variant="destructive" className="text-[10px] gap-1">
                          <AlertCircle className="w-3 h-3" />
                          Assign Teacher
                        </Badge>
                      )}
                      {schedule.topic && (
                        <Badge variant="outline" className="text-[10px] max-w-[120px] truncate">
                          {schedule.topic}
                        </Badge>
                      )}
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                ))}
            </div>
          </ScrollArea>
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
                      <label className="text-xs text-muted-foreground mb-1 block">Select Teacher</label>
                      <Select value={selectedTeacherId} onValueChange={setSelectedTeacherId}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Choose a teacher..." />
                        </SelectTrigger>
                        <SelectContent>
                          {getAvailableTeachers(selectedPeriod.subject, selectedPeriod.day, selectedPeriod.period).map((teacher) => (
                            <SelectItem key={teacher.id} value={teacher.id}>
                              {teacher.name} ({teacher.subject})
                            </SelectItem>
                          ))}
                          {getAvailableTeachers(selectedPeriod.subject, selectedPeriod.day, selectedPeriod.period).length === 0 && (
                            <SelectItem value="none" disabled>
                              No available teachers for this subject
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
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
  const { toast } = useToast();

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
                    {/* AI Substitute Context (for biometric-sourced substitutions) */}
                    {selectedSub.source === 'biometric' && !selectedSub.subContext && (
                      <Button
                        onClick={async () => {
                          try {
                            const res = await fetch('/api/biometric/generate-sub-context', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ substitutionId: selectedSub.id }),
                            });
                            if (res.ok) {
                              toast({ title: 'Context Generated', description: 'AI has prepared substitute teacher guidance with yesterday/today topic context' });
                              onRefresh();
                            }
                          } catch {
                            toast({ title: 'Error', description: 'Failed to generate context', variant: 'destructive' });
                          }
                        }}
                        className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                        size="sm"
                      >
                        <Brain className="w-4 h-4 mr-2" />
                        Generate AI Substitute Context
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

          <ScrollArea className="max-h-[58vh] px-6">
            {selectedSub && (
              <div className="space-y-3 pb-6">
                {getAvailableTeachersForSub(selectedSub).length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
                    <p className="text-sm font-medium text-muted-foreground">No available teachers found</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      All teachers are either busy at Period {selectedSub.period} or have reached their max workload for the day.
                    </p>
                  </div>
                ) : (
                  getAvailableTeachersForSub(selectedSub).map((t, index) => (
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
                  ))
                )}
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
}: {
  teachers: Teacher[];
  schedules: Schedule[];
  selectedDay: string;
  onRefresh: () => void;
}) {
  const [teacherPopupOpen, setTeacherPopupOpen] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const getTeacherWeeklySchedule = (teacher: Teacher) => {
    // Use the schedules embedded in the teacher object from the API (includes ALL days)
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
        <Button onClick={onRefresh} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
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
        <DialogContent className="max-w-2xl max-h-[85vh] p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="flex items-center gap-2 text-emerald-800">
              <User className="w-5 h-5" />
              {selectedTeacher?.name}
            </DialogTitle>
            <DialogDescription>
              {selectedTeacher?.subject} Specialist • {selectedTeacher?.email}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[65vh] px-6">
            {selectedTeacher && (
              <div className="space-y-4 pb-6">
                {DAYS.map((day) => {
                  const daySchedules = getTeacherWeeklySchedule(selectedTeacher)
                    .filter((s) => s.day === day)
                    .sort((a, b) => a.period - b.period);
                  const totalPeriods = daySchedules.length;

                  return (
                    <div key={day}>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold text-emerald-800">{day}</h4>
                        <Badge variant="outline" className="text-[10px]">
                          {totalPeriods} period{totalPeriods !== 1 ? 's' : ''}
                        </Badge>
                      </div>
                      {daySchedules.length > 0 ? (
                        <div className="space-y-1.5">
                          {daySchedules.map((sched) => (
                            <div key={sched.id} className="flex items-center justify-between p-2.5 bg-emerald-50 rounded-lg border border-emerald-200">
                              <div className="flex items-center gap-3">
                                <div className="bg-emerald-200 text-emerald-800 w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold">
                                  P{sched.period}
                                </div>
                                <div>
                                  <p className="text-sm font-medium">
                                    {sched.grade} {sched.section}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground">
                                    {sched.startTime} - {sched.endTime}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-xs font-medium text-emerald-700">{sched.subject}</p>
                                {sched.topic && <p className="text-[10px] text-muted-foreground max-w-[120px] truncate">{sched.topic}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-2.5 bg-gray-50 rounded-lg border border-gray-200 text-center">
                          <p className="text-xs text-muted-foreground">No classes scheduled</p>
                        </div>
                      )}
                    </div>
                  );
                })}

                <Separator />
                <div className="p-4 bg-emerald-50 rounded-xl">
                  <h4 className="text-sm font-semibold text-emerald-800 mb-2">Weekly Summary</h4>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Total Periods per Week</span>
                    <span className="font-bold text-emerald-700">{getTeacherWeeklySchedule(selectedTeacher).length}</span>
                  </div>
                </div>
              </div>
            )}
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

function WorkloadAnalyticsSection({ teachers, schedules }: { teachers: Teacher[]; schedules: Schedule[] }) {
  const [workloadData, setWorkloadData] = useState<WorkloadTeacher[]>([]);
  const [distribution, setDistribution] = useState<Record<number, number>>({});
  const [weeklySummary, setWeeklySummary] = useState({ overallAvg: 0, maxAvg: 0, minAvg: 0, stdDev: 0, totalTeachers: 0 });
  const [overloadedTeachers, setOverloadedTeachers] = useState<WorkloadTeacher[]>([]);
  const [loading, setLoading] = useState(false);
  const [drillDownTeacher, setDrillDownTeacher] = useState<WorkloadTeacher | null>(null);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-6 text-white">
        <div className="flex items-center gap-3 mb-3">
          <div className="bg-white/20 p-2 rounded-xl">
            <BarChart3 className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Workload Analytics</h1>
            <p className="text-emerald-100 text-sm">Teacher Performance & Distribution</p>
          </div>
        </div>
        <p className="text-emerald-50 text-sm max-w-2xl">
          Monitor teacher workload distribution, identify overloaded teachers, and optimize schedule balance across the week.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={fetchWorkload} variant="outline" size="sm">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

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

          {/* Overloaded Teachers Alert */}
          {overloadedTeachers.length > 0 && (
            <Card className="border-red-200 bg-red-50/50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg text-red-800">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                  Overloaded Teachers ({overloadedTeachers.length})
                </CardTitle>
                <CardDescription className="text-red-600">These teachers have more than 6 periods on at least one day</CardDescription>
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

// ─── Login Page ───
function LoginPage({ onLogin }: { onLogin: (user: LoginUser, role: UserRole) => void }) {
  const [loginRole, setLoginRole] = useState<'admin' | 'teacher'>('admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role: loginRole }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        toast({ title: 'Welcome!', description: `Signed in as ${data.user.name}` });
        onLogin(data.user, loginRole);
      } else {
        setError(data.error || 'Invalid credentials');
      }
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-emerald-950 to-gray-900 flex items-center justify-center p-4">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-600/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl shadow-lg shadow-emerald-500/30 mb-4">
            <Brain className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">AI Smart Calendar</h1>
          <p className="text-emerald-300/80 text-sm">Delhi Public School — Intelligent School Management System</p>
        </div>

        {/* Login Card */}
        <Card className="bg-gray-900/80 border-gray-700/50 backdrop-blur-xl shadow-2xl">
          <CardContent className="p-6">
            {/* Role Tabs */}
            <Tabs value={loginRole} onValueChange={(v) => { setLoginRole(v as 'admin' | 'teacher'); setError(''); }} className="mb-6">
              <TabsList className="w-full bg-gray-800 border border-gray-700 h-11">
                <TabsTrigger value="admin" className="flex-1 data-[state=active]:bg-emerald-600 data-[state=active]:text-white text-gray-400 h-9">
                  <ShieldCheck className="w-4 h-4 mr-2" />
                  Admin
                </TabsTrigger>
                <TabsTrigger value="teacher" className="flex-1 data-[state=active]:bg-emerald-600 data-[state=active]:text-white text-gray-400 h-9">
                  <GraduationCap className="w-4 h-4 mr-2" />
                  Teacher
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email */}
              <div className="space-y-2">
                <Label className="text-gray-300 text-xs font-medium">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={loginRole === 'admin' ? 'admin@dps.edu' : 'your.email@school.edu'}
                    className="pl-10 bg-gray-800/50 border-gray-600/50 text-white placeholder:text-gray-500 focus:border-emerald-500 focus:ring-emerald-500/20 h-11"
                    required
                  />
                </div>
              </div>

              {/* Password */}
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

              {/* Error Message */}
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <p className="text-sm text-red-300">{error}</p>
                </div>
              )}

              {/* Submit */}
              <Button
                type="submit"
                disabled={loading || !email || !password}
                className="w-full h-11 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold shadow-lg shadow-emerald-600/20 transition-all"
              >
                {loading ? (
                  <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Signing in...</>
                ) : (
                  <><LogOut className="w-4 h-4 mr-2 rotate-180" />Sign In as {loginRole === 'admin' ? 'Admin' : 'Teacher'}</>
                )}
              </Button>
            </form>

            {/* Demo Credentials */}
            <div className="mt-6 p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">Demo Credentials</p>
              {loginRole === 'admin' ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">Admin</Badge>
                    <span className="text-gray-400">admin@dps.edu</span>
                    <span className="text-gray-600">/</span>
                    <span className="text-gray-400">admin123</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-[10px] text-gray-500 mb-1">Any teacher email with password: <span className="text-emerald-400">teacher123</span></p>
                  <div className="flex flex-wrap gap-1">
                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[9px]">priya.sharma@dps.edu</Badge>
                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[9px]">ananya.iyer@dps.edu</Badge>
                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[9px]">coach.kumar@dps.edu</Badge>
                  </div>
                </div>
              )}
            </div>

            {/* Register Note */}
            <p className="text-center text-xs text-gray-600 mt-4">
              Need an account? Contact your school administrator to register.
            </p>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-[10px] text-gray-600 mt-6">
          AI Smart Calendar &copy; {new Date().getFullYear()} &middot; Powered by Intelligence
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
  const [userMode, setUserMode] = useState<'admin' | 'teacher'>('admin');
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginUser, setLoginUser] = useState<LoginUser | null>(null);
  const [teacherLoginOpen, setTeacherLoginOpen] = useState(false);
  const [loginTeacherId, setLoginTeacherId] = useState('');

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  }, []);

  const fetchTeachers = useCallback(async () => {
    try {
      const res = await fetch('/api/teachers');
      if (res.ok) {
        const data = await res.json();
        setTeachers(data);
      }
    } catch (error) {
      console.error('Error fetching teachers:', error);
    }
  }, []);

  const fetchSchedules = useCallback(async (day: string) => {
    try {
      const res = await fetch(`/api/schedules?day=${day}`);
      if (res.ok) {
        const data = await res.json();
        setSchedules(data);
      }
    } catch (error) {
      console.error('Error fetching schedules:', error);
    }
  }, []);

  const fetchAllSchedules = useCallback(async () => {
    try {
      const allData: Schedule[] = [];
      for (const day of DAYS) {
        const res = await fetch(`/api/schedules?day=${day}`);
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
          toast({ title: 'Teacher Assigned', description: 'Teacher has been assigned to this period' });
          await fetchSchedules(selectedDay);
          await fetchStats();
        } else {
          const data = await res.json();
          toast({ title: 'Error', description: data.error || 'Failed to assign teacher', variant: 'destructive' });
        }
      } catch {
        toast({ title: 'Error', description: 'Failed to assign teacher', variant: 'destructive' });
      }
      setAssigningTeacher(false);
    },
    [fetchSchedules, fetchStats, selectedDay, toast]
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
          toast({ title: 'AI Auto-Assign', description: data.message || 'Teacher auto-assigned successfully' });
          await fetchSchedules(selectedDay);
          await fetchStats();
        } else {
          const data = await res.json();
          toast({ title: 'Error', description: data.error || 'No available teachers found', variant: 'destructive' });
        }
      } catch {
        toast({ title: 'Error', description: 'Failed to auto-assign teacher', variant: 'destructive' });
      }
      setAutoAssigning(false);
    },
    [fetchSchedules, fetchStats, selectedDay, toast]
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
    { id: 'curriculum', label: 'Curriculum Builder', icon: <BookTemplate className="w-4 h-4" /> },
    { id: 'analytics', label: 'Workload Analytics', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'lesson-plans', label: 'Lesson Plans', icon: <Library className="w-4 h-4" /> },
  ];

  const teacherTabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'teacher-portal', label: 'Teacher Dashboard', icon: <GraduationCap className="w-4 h-4" /> },
    { id: 'lesson-plans', label: 'Lesson Plans', icon: <Library className="w-4 h-4" /> },
    { id: 'curriculum', label: 'Curriculum', icon: <BookTemplate className="w-4 h-4" /> },
  ];

  const handleLogin = async (user: LoginUser, role: UserRole) => {
    setIsLoggedIn(true);
    setLoginUser(user);

    if (role === 'admin') {
      setUserMode('admin');
      setActiveTab('dashboard');
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

  return (
    <div className="min-h-screen bg-gray-50/50 flex">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r shadow-lg transform transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0 lg:shadow-none lg:z-auto ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex flex-col h-full">
          {/* Sidebar Header */}
          <div className="flex items-center justify-between p-4 border-b">
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
          <nav className="flex-1 p-3 space-y-1">
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
          <div className="p-3 border-t space-y-2">
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
              <DashboardSection stats={stats} onNavigate={navigateToTab} teachers={teachers} substitutions={substitutions} schedules={schedules} />
            )}
            {activeTab === 'calendar' && (
              <AcademicCalendarSection
                schedules={schedules}
                teachers={teachers}
                selectedDay={selectedDay}
                onDayChange={setSelectedDay}
                onAssignTeacher={handleAssignTeacher}
                onAutoAssign={handleAutoAssign}
                assigningTeacher={assigningTeacher}
                autoAssigning={autoAssigning}
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
            {activeTab === 'curriculum' && (
              <CurriculumBuilderSection teachers={teachers} />
            )}
            {activeTab === 'analytics' && (
              <WorkloadAnalyticsSection teachers={teachers} schedules={allSchedules} />
            )}
            {activeTab === 'lesson-plans' && (
              <LessonPlanLibrarySection teachers={teachers} />
            )}
          </>
        )}
        </main>
      </div>
    </div>
  );
}
