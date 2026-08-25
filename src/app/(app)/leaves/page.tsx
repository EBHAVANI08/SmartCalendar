'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  ClipboardList, Plus, Search, RefreshCw, CheckCircle2,
  Clock, XCircle, AlertTriangle, Calendar as CalendarIcon, User,
  FileText, Filter, Sparkles, Check, ChevronRight, AlertCircle,
  FileCheck, ArrowRight, UserCheck, ShieldCheck, Zap, Upload, Paperclip
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

// ── Types & Interfaces ──
interface Teacher {
  id: string;
  name: string;
  employeeId: string;
  department: string;
  subject: string;
  grades: string[];
  weeklyLoad: number;
  substitutionLoad?: number;
  phone?: string;
  email?: string;
}

interface AffectedPeriod {
  id: string;
  day: string;
  date: string;
  period: number;
  grade: string;
  section: string;
  subject: string;
  status: 'unassigned' | 'selected' | 'awaiting' | 'accepted' | 'declined';
  assignedTeacherId?: string;
  assignedTeacherName?: string;
  declinedTeacherIds?: string[];
}

interface AuditEvent {
  timestamp: string;
  text: string;
}

interface LeaveRequest {
  id: string;
  teacherId: string;
  teacherName: string;
  employeeId: string;
  role: string;
  department: string;
  subject: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  durationDays: number;
  reason: string;
  attachment?: string;
  status: 'Pending' | 'Waiting for Substitute' | 'Approved' | 'Rejected';
  affectedPeriodsCount: number;
  affectedPeriods: AffectedPeriod[];
  auditHistory: AuditEvent[];
}

// ── Seed Dummy Teachers (Specs Requirement #4) ──
const DEMO_TEACHERS: Teacher[] = [
  { id: 'TCH001', employeeId: 'TCH001', name: 'Gauri Rao', department: 'Science', subject: 'Biology', grades: ['9', '10'], weeklyLoad: 18, substitutionLoad: 1, email: 'gauri.rao@dps.edu.in' },
  { id: 'TCH002', employeeId: 'TCH002', name: 'Myra Patel', department: 'Science', subject: 'Chemistry', grades: ['10', '11'], weeklyLoad: 20, substitutionLoad: 0, email: 'myra.patel@dps.edu.in' },
  { id: 'TCH003', employeeId: 'TCH003', name: 'Prisha Rao', department: 'Science', subject: 'Chemistry', grades: ['10', '11'], weeklyLoad: 15, substitutionLoad: 0, email: 'prisha.rao@dps.edu.in' },
  { id: 'TCH004', employeeId: 'TCH004', name: 'Sara Menon', department: 'Science', subject: 'Chemistry', grades: ['9', '10', '11'], weeklyLoad: 15, substitutionLoad: 1, email: 'sara.menon@dps.edu.in' },
  { id: 'TCH005', employeeId: 'TCH005', name: 'Navya Shetty', department: 'Science', subject: 'Physics', grades: ['10', '11'], weeklyLoad: 7, substitutionLoad: 0, email: 'navya.shetty@dps.edu.in' },
  { id: 'TCH006', employeeId: 'TCH006', name: 'Aarav Patel', department: 'Science', subject: 'Physics', grades: ['11', '12'], weeklyLoad: 10, substitutionLoad: 0, email: 'aarav.patel@dps.edu.in' },
  { id: 'TCH007', employeeId: 'TCH007', name: 'Pranav Das', department: 'Mathematics', subject: 'Mathematics', grades: ['10', '11'], weeklyLoad: 12, substitutionLoad: 2, email: 'pranav.das@dps.edu.in' },
  { id: 'TCH008', employeeId: 'TCH008', name: 'Ishaan Menon', department: 'Mathematics', subject: 'Mathematics', grades: ['11', '12'], weeklyLoad: 15, substitutionLoad: 1, email: 'ishaan.menon@dps.edu.in' },
];

// ── Dummy Affected Periods for Myra Patel (12 Periods - Requirement #6 & #10) ──
const MYRA_AFFECTED_PERIODS: AffectedPeriod[] = [
  // Thursday 27 August 2026 (4 periods)
  { id: 'm-1', day: 'Thursday', date: '2026-08-27', period: 1, grade: 'Grade 11', section: 'E', subject: 'Chemistry', status: 'unassigned' },
  { id: 'm-2', day: 'Thursday', date: '2026-08-27', period: 3, grade: 'Grade 10', section: 'A', subject: 'Chemistry', status: 'unassigned' },
  { id: 'm-3', day: 'Thursday', date: '2026-08-27', period: 5, grade: 'Grade 11', section: 'B', subject: 'Chemistry', status: 'unassigned' },
  { id: 'm-4', day: 'Thursday', date: '2026-08-27', period: 7, grade: 'Grade 10', section: 'C', subject: 'Chemistry', status: 'unassigned' },
  // Friday 28 August 2026 (8 periods)
  { id: 'm-5', day: 'Friday', date: '2026-08-28', period: 1, grade: 'Grade 11', section: 'E', subject: 'Chemistry', status: 'unassigned' },
  { id: 'm-6', day: 'Friday', date: '2026-08-28', period: 2, grade: 'Grade 10', section: 'B', subject: 'Chemistry', status: 'unassigned' },
  { id: 'm-7', day: 'Friday', date: '2026-08-28', period: 4, grade: 'Grade 11', section: 'A', subject: 'Chemistry', status: 'unassigned' },
  { id: 'm-8', day: 'Friday', date: '2026-08-28', period: 5, grade: 'Grade 10', section: 'A', subject: 'Chemistry', status: 'unassigned' },
  { id: 'm-9', day: 'Friday', date: '2026-08-28', period: 6, grade: 'Grade 11', section: 'C', subject: 'Chemistry', status: 'unassigned' },
  { id: 'm-10', day: 'Friday', date: '2026-08-28', period: 7, grade: 'Grade 10', section: 'D', subject: 'Chemistry', status: 'unassigned' },
  { id: 'm-11', day: 'Friday', date: '2026-08-28', period: 8, grade: 'Grade 11', section: 'B', subject: 'Chemistry', status: 'unassigned' },
  { id: 'm-12', day: 'Friday', date: '2026-08-28', period: 3, grade: 'Grade 9', section: 'A', subject: 'Chemistry', status: 'unassigned' },
];

const GAURI_AFFECTED_PERIODS: AffectedPeriod[] = [
  { id: 'g-1', day: 'Thursday', date: '2026-08-27', period: 3, grade: 'Grade 10', section: 'A', subject: 'Biology', status: 'unassigned' },
  { id: 'g-2', day: 'Thursday', date: '2026-08-27', period: 5, grade: 'Grade 9', section: 'B', subject: 'Biology', status: 'unassigned' },
  { id: 'g-3', day: 'Thursday', date: '2026-08-27', period: 7, grade: 'Grade 10', section: 'B', subject: 'Biology', status: 'unassigned' },
];

// ── Initial Seed Leave Requests ──
const INITIAL_LEAVE_REQUESTS: LeaveRequest[] = [
  {
    id: 'LV-2026-001',
    teacherId: 'TCH001',
    teacherName: 'Gauri Rao',
    employeeId: 'TCH001',
    role: 'Staff',
    department: 'Science',
    subject: 'Biology',
    leaveType: 'Casual Leave',
    fromDate: '2026-08-27',
    toDate: '2026-08-27',
    durationDays: 1,
    reason: 'Personal work — needs to visit the bank for documentation.',
    status: 'Pending',
    affectedPeriodsCount: 3,
    affectedPeriods: GAURI_AFFECTED_PERIODS,
    auditHistory: [
      { timestamp: '09:15 AM', text: 'Gauri Rao submitted Casual Leave for 27 Aug 2026.' },
      { timestamp: '09:16 AM', text: 'AI Pre-Check performed: Low Risk detected.' },
    ],
  },
  {
    id: 'LV-2026-002',
    teacherId: 'TCH002',
    teacherName: 'Myra Patel',
    employeeId: 'TCH002',
    role: 'Staff',
    department: 'Science',
    subject: 'Chemistry',
    leaveType: 'Sick Leave',
    fromDate: '2026-08-27',
    toDate: '2026-08-28',
    durationDays: 2,
    reason: 'Viral fever, advised two days rest by the doctor.',
    attachment: 'medical-certificate.pdf',
    status: 'Waiting for Substitute',
    affectedPeriodsCount: 12,
    affectedPeriods: MYRA_AFFECTED_PERIODS,
    auditHistory: [
      { timestamp: '10:05 AM', text: 'Myra Patel submitted Sick Leave with medical certificate.' },
      { timestamp: '10:08 AM', text: 'Administrator reviewed request.' },
      { timestamp: '10:10 AM', text: 'Timetable Impact Engine: 12 affected periods detected across 2 days.' },
    ],
  },
  {
    id: 'LV-2026-003',
    teacherId: 'TCH007',
    teacherName: 'Pranav Das',
    employeeId: 'TCH007',
    role: 'Staff',
    department: 'Mathematics',
    subject: 'Mathematics',
    leaveType: 'Official Duty',
    fromDate: '2026-08-25',
    toDate: '2026-08-25',
    durationDays: 1,
    reason: 'Attending Inter-School CBSE Science Fair evaluation.',
    status: 'Approved',
    affectedPeriodsCount: 2,
    affectedPeriods: [],
    auditHistory: [
      { timestamp: '08:00 AM', text: 'Pranav Das submitted Official Duty leave.' },
      { timestamp: '08:30 AM', text: 'All 2 periods confirmed covered by Ishaan Menon.' },
      { timestamp: '08:35 AM', text: 'Leave approved by Administrator.' },
    ],
  },
  {
    id: 'LV-2026-004',
    teacherId: 'TCH005',
    teacherName: 'Navya Shetty',
    employeeId: 'TCH005',
    role: 'Staff',
    department: 'Science',
    subject: 'Physics',
    leaveType: 'Personal Leave',
    fromDate: '2026-08-24',
    toDate: '2026-08-24',
    durationDays: 1,
    reason: 'Attending family wedding in hometown.',
    status: 'Approved',
    affectedPeriodsCount: 2,
    affectedPeriods: [],
    auditHistory: [
      { timestamp: '24 Aug 09:00 AM', text: 'Navya Shetty submitted Personal Leave.' },
      { timestamp: '24 Aug 09:45 AM', text: 'All cover confirmed. Leave approved.' },
    ],
  },
  {
    id: 'LV-2026-005',
    teacherId: 'TCH006',
    teacherName: 'Aarav Patel',
    employeeId: 'TCH006',
    role: 'Staff',
    department: 'Science',
    subject: 'Physics',
    leaveType: 'Casual Leave',
    fromDate: '2026-08-20',
    toDate: '2026-08-20',
    durationDays: 1,
    reason: 'Vehicle breakdown en route to school.',
    status: 'Rejected',
    affectedPeriodsCount: 3,
    affectedPeriods: [],
    auditHistory: [
      { timestamp: '20 Aug 11:00 AM', text: 'Late leave notice submitted.' },
      { timestamp: '20 Aug 11:15 AM', text: 'Rejected due to late notice during exams.' },
    ],
  },
];

export default function LeavesPage() {
  const { toast } = useToast();
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>(INITIAL_LEAVE_REQUESTS);
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected' | 'today' | 'calendar'>('pending');
  const [selectedDate, setSelectedDate] = useState<string>('2026-08-27');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [coverModalOpen, setCoverModalOpen] = useState(false);
  const [activeRequest, setActiveRequest] = useState<LeaveRequest | null>(null);

  // Apply Form State
  const [applyForm, setApplyForm] = useState({
    teacherId: 'TCH002',
    leaveType: 'Sick Leave',
    fromDate: '2026-08-27',
    toDate: '2026-08-28',
    reason: '',
    emergencyContact: '+91 98765 00000',
    attachmentName: '',
  });

  // Calculate Summary Stats from Leave Records (Requirement #2)
  const stats = useMemo(() => {
    const pending = leaveRequests.filter(r => r.status === 'Pending' || r.status === 'Waiting for Substitute').length;
    const approved = leaveRequests.filter(r => r.status === 'Approved').length;
    const rejected = leaveRequests.filter(r => r.status === 'Rejected').length;
    const todayStr = '2026-08-27'; // Demo Today
    const onLeaveToday = leaveRequests.filter(r => r.status === 'Approved' && r.fromDate <= todayStr && r.toDate >= todayStr).length || 2;
    return { pending, approved, rejected, onLeaveToday };
  }, [leaveRequests]);

  // Sync Active Request when state updates
  useEffect(() => {
    if (activeRequest) {
      const found = leaveRequests.find(r => r.id === activeRequest.id);
      if (found) setActiveRequest(found);
    }
  }, [leaveRequests]);

  // Calculate Days count automatically
  const calculatedDays = useMemo(() => {
    if (!applyForm.fromDate || !applyForm.toDate) return 1;
    const start = new Date(applyForm.fromDate).getTime();
    const end = new Date(applyForm.toDate).getTime();
    const diff = Math.max(0, (end - start) / (1000 * 60 * 60 * 24));
    return Math.round(diff) + 1;
  }, [applyForm.fromDate, applyForm.toDate]);

  // Calculate Affected Periods automatically (Requirement #7)
  const calculatedPeriodsCount = useMemo(() => {
    const selectedTch = DEMO_TEACHERS.find(t => t.id === applyForm.teacherId);
    if (!selectedTch) return 4;
    return Math.round(calculatedDays * (selectedTch.weeklyLoad / 5));
  }, [applyForm.teacherId, calculatedDays]);

  // ── AI Pre-Check Deterministic Rule Engine (Requirement #9) ──
  const getAiPreCheck = (req: LeaveRequest) => {
    const isOverlapping = leaveRequests.some(r => r.id !== req.id && r.fromDate <= req.toDate && r.toDate >= req.fromDate && r.status === 'Approved');
    const availablePool = DEMO_TEACHERS.filter(t => t.subject === req.subject && t.id !== req.teacherId).length;

    if (req.affectedPeriodsCount >= 10 && availablePool < 2) {
      return { level: 'Coverage Risk', color: 'bg-rose-100 text-rose-800 border-rose-300', text: 'High class impact (10+ periods) & limited subject substitute pool.' };
    }
    if (isOverlapping || req.affectedPeriodsCount >= 8) {
      return { level: 'Needs Review', color: 'bg-amber-100 text-amber-900 border-amber-300', text: 'Multiple staff away on selected dates. Review cover availability.' };
    }
    return { level: 'Low Risk', color: 'bg-emerald-100 text-emerald-900 border-emerald-300', text: 'No major conflict detected. Sufficient substitute pool available.' };
  };

  // ── Substitute Teacher Ranking Engine (Requirement #14 & #16) ──
  const getRankedCandidates = (period: AffectedPeriod, req: LeaveRequest) => {
    const pool = DEMO_TEACHERS.filter(t => {
      // 1. Mandatory: Exclude absent teacher
      if (t.id === req.teacherId) return false;
      // 2. Mandatory: Exclude teachers who declined this exact period
      if (period.declinedTeacherIds?.includes(t.id)) return false;
      // 3. Mandatory: Exclude busy teachers during this period (Requirement #13)
      if (t.name === 'Gauri Rao' && period.period === 3 && period.day === 'Thursday') return false; // Gauri busy
      if (t.name === 'Pranav Das' && period.period === 1) return false; // Pranav busy
      return true;
    });

    return pool.map(t => {
      let score = 0;
      const isSubjectMatch = t.subject.toLowerCase().includes(req.subject.toLowerCase()) || req.subject.toLowerCase().includes(t.subject.toLowerCase());
      const isGradeMatch = t.grades.some(g => period.grade.includes(g));

      if (isSubjectMatch) score += 50;
      if (isGradeMatch) score += 20;

      // Workload score (lower weekly load = higher score)
      score += Math.max(0, 20 - t.weeklyLoad);

      // Penalize heavy substitution load
      score -= (t.substitutionLoad || 0) * 5;

      let recommendation: 'Best Match' | 'Strong Match' | 'Workable' = 'Workable';
      if (score >= 70) recommendation = 'Best Match';
      else if (score >= 50) recommendation = 'Strong Match';

      return {
        teacher: t,
        score,
        isSubjectMatch,
        isGradeMatch,
        recommendation,
      };
    }).sort((a, b) => b.score - a.score);
  };

  // ── Handlers ──
  const handleApplyLeaveSubmit = () => {
    const selectedTch = DEMO_TEACHERS.find(t => t.id === applyForm.teacherId) || DEMO_TEACHERS[1];
    const newReq: LeaveRequest = {
      id: `LV-2026-0${leaveRequests.length + 1}`,
      teacherId: selectedTch.id,
      teacherName: selectedTch.name,
      employeeId: selectedTch.employeeId,
      role: 'Staff',
      department: selectedTch.department,
      subject: selectedTch.subject,
      leaveType: applyForm.leaveType,
      fromDate: applyForm.fromDate,
      toDate: applyForm.toDate,
      durationDays: calculatedDays,
      reason: applyForm.reason || 'Leave requested via portal.',
      attachment: applyForm.attachmentName || undefined,
      status: 'Pending',
      affectedPeriodsCount: calculatedPeriodsCount,
      affectedPeriods: MYRA_AFFECTED_PERIODS.map(p => ({ ...p, status: 'unassigned' })),
      auditHistory: [
        { timestamp: 'Just now', text: `${selectedTch.name} submitted ${applyForm.leaveType} for ${calculatedDays} day(s).` },
        { timestamp: 'Just now', text: `Impact Engine: Calculated ${calculatedPeriodsCount} teaching periods requiring cover.` },
      ],
    };

    setLeaveRequests([newReq, ...leaveRequests]);
    setApplyModalOpen(false);
    toast({
      title: 'Leave Application Submitted!',
      description: `Applied ${applyForm.leaveType} for ${selectedTch.name}. ${calculatedPeriodsCount} periods queued for cover.`,
    });
  };

  // Manual Candidate Assignment (Requirement #17)
  const handleAssignCandidate = (periodId: string, candidateName: string, candidateId: string) => {
    if (!activeRequest) return;

    const updatedPeriods = activeRequest.affectedPeriods.map(p => {
      if (p.id === periodId) {
        return {
          ...p,
          status: 'selected' as const,
          assignedTeacherId: candidateId,
          assignedTeacherName: candidateName,
        };
      }
      return p;
    });

    const updatedReq: LeaveRequest = {
      ...activeRequest,
      affectedPeriods: updatedPeriods,
    };

    setLeaveRequests(prev => prev.map(r => r.id === updatedReq.id ? updatedReq : r));
    toast({ title: 'Substitute Assigned', description: `Assigned ${candidateName} to Period.` });
  };

  // AI Auto-Allot (Requirement #18)
  const handleAiAutoAllot = () => {
    if (!activeRequest) return;

    let updatedPeriods = [...activeRequest.affectedPeriods];
    const tempLoad: Record<string, number> = {};

    updatedPeriods = updatedPeriods.map(p => {
      const candidates = getRankedCandidates(p, activeRequest);
      if (candidates.length > 0) {
        // Choose best candidate, avoiding overloading single teacher
        const valid = candidates.find(c => (tempLoad[c.teacher.id] || 0) < 3) || candidates[0];
        tempLoad[valid.teacher.id] = (tempLoad[valid.teacher.id] || 0) + 1;
        return {
          ...p,
          status: 'selected' as const,
          assignedTeacherId: valid.teacher.id,
          assignedTeacherName: valid.teacher.name,
        };
      }
      return p;
    });

    const updatedReq: LeaveRequest = {
      ...activeRequest,
      status: 'Waiting for Substitute',
      affectedPeriods: updatedPeriods,
      auditHistory: [
        ...activeRequest.auditHistory,
        { timestamp: 'Just now', text: 'AI Auto-Allot generated optimal substitute assignments across all periods.' },
      ],
    };

    setLeaveRequests(prev => prev.map(r => r.id === updatedReq.id ? updatedReq : r));
    toast({ title: 'AI Auto-Allot Complete', description: `Assigned substitutes for all ${updatedPeriods.length} periods.` });
  };

  // Request Cover from Teachers (Requirement #19)
  const handleRequestCover = () => {
    if (!activeRequest) return;

    const selectedCount = activeRequest.affectedPeriods.filter(p => p.status === 'selected' || p.status === 'awaiting').length;
    if (selectedCount === 0) {
      toast({ title: 'No Teachers Assigned', description: 'Please assign or Auto-Allot teachers to periods first.', variant: 'destructive' });
      return;
    }

    const updatedPeriods = activeRequest.affectedPeriods.map(p => {
      if (p.status === 'selected') {
        return { ...p, status: 'awaiting' as const };
      }
      return p;
    });

    const uniqueTeachers = [...new Set(updatedPeriods.map(p => p.assignedTeacherName).filter(Boolean))];

    const updatedReq: LeaveRequest = {
      ...activeRequest,
      status: 'Waiting for Substitute',
      affectedPeriods: updatedPeriods,
      auditHistory: [
        ...activeRequest.auditHistory,
        { timestamp: 'Just now', text: `Cover requests sent to ${uniqueTeachers.length} teacher(s): ${uniqueTeachers.join(', ')}.` },
      ],
    };

    setLeaveRequests(prev => prev.map(r => r.id === updatedReq.id ? updatedReq : r));
    toast({ title: 'Cover Requests Sent!', description: `Notification sent to ${uniqueTeachers.length} faculty member(s).` });
  };

  // Simulate Accept / Decline (Requirement #20 & #22)
  const handleSimulateResponse = (periodId: string, action: 'accept' | 'decline') => {
    if (!activeRequest) return;

    const updatedPeriods = activeRequest.affectedPeriods.map(p => {
      if (p.id === periodId) {
        if (action === 'accept') {
          return { ...p, status: 'accepted' as const };
        } else {
          return {
            ...p,
            status: 'declined' as const,
            declinedTeacherIds: [...(p.declinedTeacherIds || []), p.assignedTeacherId || ''],
            assignedTeacherId: undefined,
            assignedTeacherName: undefined,
          };
        }
      }
      return p;
    });

    const acceptedCount = updatedPeriods.filter(p => p.status === 'accepted').length;
    const isAllAccepted = acceptedCount === updatedPeriods.length && updatedPeriods.length > 0;

    const updatedReq: LeaveRequest = {
      ...activeRequest,
      affectedPeriods: updatedPeriods,
      auditHistory: [
        ...activeRequest.auditHistory,
        {
          timestamp: 'Just now',
          text: action === 'accept'
            ? `Substitute accepted cover for ${periodId}. (${acceptedCount}/${updatedPeriods.length} confirmed)`
            : `Substitute declined cover. Period reopened for candidate re-ranking.`,
        },
      ],
    };

    setLeaveRequests(prev => prev.map(r => r.id === updatedReq.id ? updatedReq : r));
    toast({
      title: action === 'accept' ? 'Cover Accepted' : 'Cover Declined & Reopened',
      description: action === 'accept' ? `Period marked as Covered.` : `Period reopened for candidate ranking.`,
      variant: action === 'decline' ? 'destructive' : 'default',
    });
  };

  // Final Leave Approval (Requirement #24 & #25)
  const handleApproveLeave = (req: LeaveRequest) => {
    const acceptedCount = req.affectedPeriods.filter(p => p.status === 'accepted').length;
    const totalRequired = req.affectedPeriods.length;

    if (totalRequired > 0 && acceptedCount < totalRequired) {
      toast({
        title: 'Approval Blocked',
        description: `Leave cannot be finalized until all ${totalRequired} periods have confirmed cover (${acceptedCount}/${totalRequired} accepted).`,
        variant: 'destructive',
      });
      return;
    }

    const updatedReq: LeaveRequest = {
      ...req,
      status: 'Approved',
      auditHistory: [
        ...req.auditHistory,
        { timestamp: 'Just now', text: `Leave finalized & approved by Administrator.` },
      ],
    };

    setLeaveRequests(prev => prev.map(r => r.id === req.id ? updatedReq : r));
    setReviewModalOpen(false);
    setCoverModalOpen(false);
    toast({ title: 'Leave Approved Successfully!', description: `${req.teacherName}'s leave is now active.` });
  };

  // Filtered List
  const filteredRequests = useMemo(() => {
    let list = [...leaveRequests];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(r => r.teacherName.toLowerCase().includes(q) || r.subject.toLowerCase().includes(q) || r.leaveType.toLowerCase().includes(q));
    }
    if (activeTab === 'pending') list = list.filter(r => r.status === 'Pending' || r.status === 'Waiting for Substitute');
    if (activeTab === 'approved') list = list.filter(r => r.status === 'Approved');
    if (activeTab === 'rejected') list = list.filter(r => r.status === 'Rejected');
    if (activeTab === 'today') list = list.filter(r => r.status === 'Approved' && r.fromDate <= '2026-08-27' && r.toDate >= '2026-08-27');
    return list;
  }, [leaveRequests, activeTab, searchQuery]);

  return (
    <div className="bg-[#F6F8FC] min-h-screen p-4 sm:p-6 lg:p-8 space-y-6 text-[#172033]">
      {/* ── Enterprise SaaS Module Header (Requirement #1) ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-700 via-indigo-800 to-slate-900 flex items-center justify-center text-white shadow-md shadow-blue-900/30 shrink-0 border border-blue-500/20">
            <ClipboardList className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#081A33]">
                AI Leave Management
              </h1>
              <Badge className="bg-blue-50 text-[#2563EB] border border-blue-200 font-bold text-[10px] uppercase tracking-wider">
                Automated Cover Engine
              </Badge>
            </div>
            <p className="text-xs text-[#64748B] font-medium mt-1">
              Staff leave applications with intelligent timetable impact detection and substitute teacher matching.
            </p>
          </div>
        </div>

        <Button
          onClick={() => setApplyModalOpen(true)}
          className="bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 hover:from-blue-800 hover:to-slate-950 text-white font-bold gap-2 text-xs h-10 shadow-md border-none px-4"
        >
          <Plus className="w-4 h-4 text-amber-300" /> Apply for Leave
        </Button>
      </div>

      {/* ── Dashboard Summary Cards (Requirement #2) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-[#E2E8F0] shadow-xs bg-white rounded-2xl">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-extrabold text-[#64748B] uppercase tracking-wider">Pending</p>
              <p className="text-3xl font-black text-amber-600 mt-1">{stats.pending}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
              <Clock className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E2E8F0] shadow-xs bg-white rounded-2xl">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-extrabold text-[#64748B] uppercase tracking-wider">Approved</p>
              <p className="text-3xl font-black text-emerald-600 mt-1">{stats.approved}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E2E8F0] shadow-xs bg-white rounded-2xl">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-extrabold text-[#64748B] uppercase tracking-wider">Rejected</p>
              <p className="text-3xl font-black text-rose-600 mt-1">{stats.rejected}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
              <XCircle className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E2E8F0] shadow-xs bg-white rounded-2xl">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-extrabold text-[#64748B] uppercase tracking-wider">On Leave Today</p>
              <p className="text-3xl font-black text-blue-600 mt-1">{stats.onLeaveToday}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <UserCheck className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Main Workspace Grid (Left Table & Right Calendar) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Tabs, Search & Leave List */}
        <div className="lg:col-span-2 space-y-4">
          {/* Navigation Tabs */}
          <div className="flex flex-wrap items-center gap-2 border-b border-[#E2E8F0] pb-2">
            {[
              { id: 'pending', label: 'Pending', count: stats.pending },
              { id: 'approved', label: 'Approved', count: stats.approved },
              { id: 'rejected', label: 'Rejected', count: stats.rejected },
              { id: 'today', label: 'On Leave Today', count: stats.onLeaveToday },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                  activeTab === tab.id
                    ? 'bg-[#081A33] text-white shadow-xs'
                    : 'bg-white text-[#64748B] hover:text-[#081A33] border border-[#E2E8F0]'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                  activeTab === tab.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search by teacher name, subject, or leave type…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 bg-white border-[#E2E8F0] h-10 text-xs"
            />
          </div>

          {/* Leave Requests Table */}
          <Card className="border-[#E2E8F0] shadow-xs bg-white rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#1c2d54] text-white text-[11px] font-extrabold uppercase tracking-wider">
                    <th className="p-3">Staff Teacher</th>
                    <th className="p-3">Leave Type</th>
                    <th className="p-3">Dates & Duration</th>
                    <th className="p-3 text-center">Affected Periods</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] text-xs">
                  {filteredRequests.map(req => {
                    const isPending = req.status === 'Pending' || req.status === 'Waiting for Substitute';
                    return (
                      <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3">
                          <div className="font-bold text-[#0F2747] text-sm">{req.teacherName}</div>
                          <div className="text-[10px] font-semibold text-[#64748B]">
                            {req.subject} &middot; {req.employeeId}
                          </div>
                        </td>

                        <td className="p-3">
                          <Badge className="bg-slate-100 text-[#0F2747] border-slate-200 font-bold text-[10px]">
                            {req.leaveType}
                          </Badge>
                          {req.attachment && (
                            <div className="text-[10px] text-blue-600 font-bold flex items-center gap-1 mt-1">
                              <Paperclip className="w-3 h-3" /> {req.attachment}
                            </div>
                          )}
                        </td>

                        <td className="p-3">
                          <div className="font-bold text-slate-800">{req.fromDate} → {req.toDate}</div>
                          <div className="text-[10px] text-slate-500 font-medium">{req.durationDays} Day(s)</div>
                        </td>

                        <td className="p-3 text-center">
                          <Badge className="bg-blue-50 text-[#2563EB] border-blue-200 font-bold text-xs">
                            {req.affectedPeriodsCount} Periods
                          </Badge>
                        </td>

                        <td className="p-3">
                          <Badge className={`font-bold text-[10px] border ${
                            req.status === 'Approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            req.status === 'Rejected' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                            req.status === 'Waiting for Substitute' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                            'bg-amber-50 text-amber-700 border-amber-200'
                          }`}>
                            {req.status}
                          </Badge>
                        </td>

                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => { setActiveRequest(req); setReviewModalOpen(true); }}
                              className="h-7 px-2.5 text-[11px] font-bold border-slate-200 text-slate-700 hover:bg-slate-100"
                            >
                              Review
                            </Button>

                            {isPending && (
                              <Button
                                size="sm"
                                onClick={() => { setActiveRequest(req); setCoverModalOpen(true); }}
                                className="h-7 px-2.5 text-[11px] font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
                              >
                                {req.status === 'Waiting for Substitute' ? 'Cover Status' : 'Arrange Cover'}
                              </Button>
                            )}

                            {isPending && (
                              <Button
                                size="sm"
                                onClick={() => handleApproveLeave(req)}
                                className="h-7 px-2.5 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                              >
                                Approve
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Right 1 Column: Leave Calendar Widget (Requirement #3) */}
        <div className="space-y-4">
          <Card className="border-[#E2E8F0] shadow-xs bg-white rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div>
                <h3 className="text-sm font-black text-[#081A33] flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-[#2563EB]" /> Leave Calendar
                </h3>
                <p className="text-[11px] text-slate-500 font-medium">August 2026 Monthly View</p>
              </div>
              <Badge className="bg-slate-100 text-slate-700 text-[10px] font-mono">Aug 2026</Badge>
            </div>

            {/* Calendar Legend */}
            <div className="grid grid-cols-2 gap-2 text-[10px] font-bold">
              <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Approved</div>
              <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Pending Cover</div>
              <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-purple-600" /> Multiple Away</div>
              <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-600" /> Today (27th)</div>
            </div>

            {/* Calendar Grid (August 2026) */}
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-slate-600 pt-2">
              <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
              {Array.from({ length: 31 }).map((_, i) => {
                const dayNum = i + 1;
                const dateStr = `2026-08-${String(dayNum).padStart(2, '0')}`;
                const isSelected = dateStr === selectedDate;
                const is27th = dayNum === 27; // Demo Myra & Gauri
                const is28th = dayNum === 28; // Demo Myra
                const is25th = dayNum === 25; // Pranav Approved
                const is24th = dayNum === 24; // Navya Approved

                let bgClass = 'bg-slate-50 hover:bg-slate-100 text-slate-700';
                if (is27th) bgClass = 'bg-purple-600 text-white font-black shadow-xs ring-2 ring-purple-300';
                else if (is28th) bgClass = 'bg-amber-500 text-white font-bold';
                else if (is25th || is24th) bgClass = 'bg-emerald-500 text-white font-bold';

                return (
                  <button
                    key={dayNum}
                    onClick={() => { setSelectedDate(dateStr); setSearchQuery(dayNum === 27 ? 'Myra' : ''); }}
                    className={`h-8 rounded-lg flex items-center justify-center transition-all ${bgClass} ${isSelected ? 'ring-2 ring-blue-600 font-black' : ''}`}
                  >
                    {dayNum}
                  </button>
                );
              })}
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
              <div className="font-bold text-[#0F2747]">Active Staff Away on {selectedDate}:</div>
              <p className="text-[11px] text-slate-600 font-medium">
                {selectedDate === '2026-08-27' ? 'Myra Patel (Sick Leave) & Gauri Rao (Casual Leave)' : 'No multiple staff absences recorded.'}
              </p>
            </div>
          </Card>
        </div>
      </div>

      {/* ── 1. APPLY FOR LEAVE MODAL (Requirement #7) ── */}
      <Dialog open={applyModalOpen} onOpenChange={setApplyModalOpen}>
        <DialogContent className="sm:max-w-lg bg-white border-[#E2E8F0] shadow-2xl p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-[#081A33] flex items-center gap-2">
              <Plus className="w-5 h-5 text-[#2563EB]" /> Apply for Leave Application
            </DialogTitle>
            <DialogDescription className="text-xs text-[#64748B]">
              Submit staff leave request with automatic timetable impact & period calculation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-700">Staff Teacher</Label>
              <Select value={applyForm.teacherId} onValueChange={v => setApplyForm({ ...applyForm, teacherId: v })}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEMO_TEACHERS.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name} ({t.subject} &middot; {t.employeeId})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">Leave Type</Label>
                <Select value={applyForm.leaveType} onValueChange={v => setApplyForm({ ...applyForm, leaveType: v })}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['Casual Leave', 'Sick Leave', 'Personal Leave', 'Emergency Leave', 'Official Duty', 'Other'].map(lt => (
                      <SelectItem key={lt} value={lt}>{lt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">Emergency Contact</Label>
                <Input
                  value={applyForm.emergencyContact}
                  onChange={e => setApplyForm({ ...applyForm, emergencyContact: e.target.value })}
                  className="h-9 text-xs font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">From Date</Label>
                <Input
                  type="date"
                  value={applyForm.fromDate}
                  onChange={e => setApplyForm({ ...applyForm, fromDate: e.target.value })}
                  className="h-9 text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700">To Date</Label>
                <Input
                  type="date"
                  value={applyForm.toDate}
                  onChange={e => setApplyForm({ ...applyForm, toDate: e.target.value })}
                  className="h-9 text-xs font-mono"
                />
              </div>
            </div>

            {/* Timetable Impact Real-time Calculation Badge */}
            <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl space-y-1">
              <div className="flex items-center justify-between text-xs font-bold text-blue-900">
                <span>Calculated Duration: {calculatedDays} Day(s)</span>
                <Badge className="bg-blue-600 text-white font-black text-[10px]">
                  {calculatedPeriodsCount} Affected Teaching Periods
                </Badge>
              </div>
              <p className="text-[11px] text-blue-700 font-medium">
                {calculatedPeriodsCount} teaching periods will require substitute cover across the selected date range.
              </p>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-700">Reason for Leave</Label>
              <Textarea
                placeholder="Specify detailed reason for leave application…"
                value={applyForm.reason}
                onChange={e => setApplyForm({ ...applyForm, reason: e.target.value })}
                rows={3}
                className="text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-700">Supporting Document (PDF/Doc)</Label>
              <Input
                placeholder="e.g. medical-certificate.pdf"
                value={applyForm.attachmentName}
                onChange={e => setApplyForm({ ...applyForm, attachmentName: e.target.value })}
                className="h-9 text-xs"
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setApplyModalOpen(false)}>Cancel</Button>
            <Button
              onClick={handleApplyLeaveSubmit}
              className="bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 text-white font-bold gap-2"
            >
              <Check className="w-4 h-4 text-emerald-300" /> Submit Application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 2. LEAVE REVIEW MODAL + AI PRE-CHECK (Requirement #8 & #9) ── */}
      <Dialog open={reviewModalOpen} onOpenChange={setReviewModalOpen}>
        <DialogContent className="sm:max-w-2xl bg-white border-[#E2E8F0] shadow-2xl p-6 rounded-2xl max-h-[90vh] overflow-y-auto">
          {activeRequest && (() => {
            const aiPreCheck = getAiPreCheck(activeRequest);

            return (
              <div className="space-y-5">
                <DialogHeader className="border-b border-[#E2E8F0] pb-3">
                  <DialogTitle className="text-lg font-black text-[#081A33] flex items-center justify-between">
                    <span>Leave Review — {activeRequest.teacherName}</span>
                    <Badge className="bg-slate-100 text-[#0F2747] font-mono text-xs">{activeRequest.id}</Badge>
                  </DialogTitle>
                  <DialogDescription className="text-xs text-[#64748B]">
                    Detailed staff application, AI pre-check risk analysis & timetable impact audit.
                  </DialogDescription>
                </DialogHeader>

                {/* AI Pre-Check Card (Requirement #9) */}
                <div className={`p-4 rounded-xl border space-y-1.5 ${aiPreCheck.color}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-xs uppercase tracking-wider flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-500" /> AI Pre-Check Audit Result
                    </span>
                    <Badge className="font-black text-xs px-2.5 py-0.5 shadow-xs">{aiPreCheck.level}</Badge>
                  </div>
                  <p className="text-xs font-semibold">{aiPreCheck.text}</p>
                </div>

                {/* Teacher & Leave Application Metadata */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 bg-slate-50 border border-[#E2E8F0] rounded-xl text-xs">
                  <div>
                    <span className="text-slate-400 font-semibold block text-[10px] uppercase">Employee ID</span>
                    <span className="font-bold text-[#0F2747]">{activeRequest.employeeId}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold block text-[10px] uppercase">Department / Subject</span>
                    <span className="font-bold text-[#0F2747]">{activeRequest.department} ({activeRequest.subject})</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold block text-[10px] uppercase">Leave Type</span>
                    <span className="font-bold text-[#0F2747]">{activeRequest.leaveType}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold block text-[10px] uppercase">Date Range</span>
                    <span className="font-bold text-[#0F2747]">{activeRequest.fromDate} → {activeRequest.toDate}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold block text-[10px] uppercase">Duration</span>
                    <span className="font-bold text-[#0F2747]">{activeRequest.durationDays} Day(s)</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold block text-[10px] uppercase">Affected Periods</span>
                    <span className="font-bold text-blue-600">{activeRequest.affectedPeriodsCount} Teaching Periods</span>
                  </div>
                </div>

                {/* Reason & Attachment */}
                <div className="space-y-1 text-xs">
                  <span className="font-bold text-slate-700 block">Reason for Application:</span>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-medium">
                    {activeRequest.reason}
                  </div>
                  {activeRequest.attachment && (
                    <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 font-bold flex items-center gap-2 mt-2">
                      <Paperclip className="w-4 h-4 text-blue-600" />
                      <span>Supporting Document Attached: {activeRequest.attachment}</span>
                    </div>
                  )}
                </div>

                {/* Audit History Log (Requirement #26) */}
                <div className="space-y-2">
                  <span className="font-bold text-xs text-[#081A33] uppercase tracking-wider flex items-center gap-2">
                    <FileCheck className="w-4 h-4 text-[#2563EB]" /> Activity & Audit History Trail
                  </span>
                  <div className="space-y-1.5 p-3 bg-slate-50 border border-slate-200 rounded-xl max-h-40 overflow-y-auto">
                    {activeRequest.auditHistory.map((ev, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-[11px]">
                        <span className="font-mono text-slate-400 shrink-0">{ev.timestamp}</span>
                        <span className="text-slate-700 font-medium">{ev.text}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <DialogFooter className="pt-2 flex justify-between items-center">
                  <Button variant="outline" onClick={() => setReviewModalOpen(false)}>Close</Button>
                  <Button
                    onClick={() => { setReviewModalOpen(false); setCoverModalOpen(true); }}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-2"
                  >
                    Arrange Cover & Substitutes <ArrowRight className="w-4 h-4" />
                  </Button>
                </DialogFooter>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── 3. ARRANGE COVER & SUBSTITUTE RANKING MODAL (Requirement #11 to #25) ── */}
      <Dialog open={coverModalOpen} onOpenChange={setCoverModalOpen}>
        <DialogContent className="sm:max-w-4xl bg-white border-[#E2E8F0] shadow-2xl p-6 rounded-2xl max-h-[92vh] overflow-y-auto">
          {activeRequest && (() => {
            const acceptedCount = activeRequest.affectedPeriods.filter(p => p.status === 'accepted').length;
            const awaitingCount = activeRequest.affectedPeriods.filter(p => p.status === 'awaiting').length;
            const selectedCount = activeRequest.affectedPeriods.filter(p => p.status === 'selected').length;
            const totalRequired = activeRequest.affectedPeriods.length;
            const isAllAccepted = totalRequired > 0 && acceptedCount === totalRequired;

            return (
              <div className="space-y-5">
                <DialogHeader className="border-b border-[#E2E8F0] pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <DialogTitle className="text-lg font-black text-[#081A33]">
                        Arrange Cover — {activeRequest.teacherName} away ({activeRequest.fromDate} → {activeRequest.toDate})
                      </DialogTitle>
                      <DialogDescription className="text-xs text-[#64748B] mt-0.5">
                        {totalRequired} affected teaching periods require substitute assignment & confirmation.
                      </DialogDescription>
                    </div>
                    <Badge className="bg-blue-50 text-[#2563EB] border border-blue-200 font-extrabold text-xs">
                      {acceptedCount} / {totalRequired} Confirmed Covered
                    </Badge>
                  </div>
                </DialogHeader>

                {/* AI Auto-Allot Header Action (Requirement #11 & #18) */}
                <div className="p-4 bg-gradient-to-r from-blue-900 via-indigo-950 to-slate-900 text-white rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
                  <div>
                    <h4 className="font-extrabold text-sm flex items-center gap-2">
                      <Sparkles className="w-4.5 h-4.5 text-amber-300" /> AI Auto-Allot Cover Engine
                    </h4>
                    <p className="text-xs text-blue-200 mt-0.5">
                      Ranks available free teachers using subject match, grade experience, timetable availability & workload.
                    </p>
                  </div>
                  <Button
                    onClick={handleAiAutoAllot}
                    className="bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-xs shrink-0 shadow-md gap-1.5"
                  >
                    <Zap className="w-4 h-4 fill-slate-950" /> Auto-Allot All {totalRequired} Periods
                  </Button>
                </div>

                {/* Approval Dependency Warning Banner (Requirement #24) */}
                {!isAllAccepted && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs font-semibold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Leave cannot be finalized until every required teaching period has confirmed cover ({acceptedCount}/{totalRequired} Accepted).</span>
                  </div>
                )}

                {/* Period-by-Period Cover Matrix */}
                <div className="space-y-4">
                  <h4 className="text-xs font-black text-[#081A33] uppercase tracking-wider">
                    Affected Timetable Periods ({totalRequired})
                  </h4>

                  {activeRequest.affectedPeriods.map((period) => {
                    const candidates = getRankedCandidates(period, activeRequest);

                    return (
                      <Card key={period.id} className="border-[#E2E8F0] shadow-xs bg-white rounded-xl overflow-hidden">
                        <div className="p-4 bg-slate-50/70 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <Badge className="bg-[#081A33] text-white font-mono text-xs px-2.5">
                              {period.day.substring(0, 3)} &middot; Period {period.period}
                            </Badge>
                            <span className="font-bold text-sm text-[#0F2747]">
                              {period.grade} Section {period.section} — <span className="text-blue-600">{period.subject}</span>
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <Badge className={`font-bold text-xs ${
                              period.status === 'accepted' ? 'bg-emerald-100 text-emerald-900 border-emerald-300' :
                              period.status === 'awaiting' ? 'bg-amber-100 text-amber-900 border-amber-300' :
                              period.status === 'declined' ? 'bg-rose-100 text-rose-900 border-rose-300' :
                              period.status === 'selected' ? 'bg-blue-100 text-blue-900 border-blue-300' :
                              'bg-slate-100 text-slate-700'
                            }`}>
                              {period.status === 'accepted' ? 'Cover Accepted' :
                               period.status === 'awaiting' ? 'Awaiting Response' :
                               period.status === 'declined' ? 'Cover Declined (Reopened)' :
                               period.status === 'selected' ? `Selected: ${period.assignedTeacherName}` :
                               'Choose a Substitute'}
                            </Badge>

                            {/* Demo Response Controls (Requirement #20) */}
                            {period.status === 'awaiting' && (
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  onClick={() => handleSimulateResponse(period.id, 'accept')}
                                  className="h-6 px-2 text-[10px] font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white"
                                >
                                  Simulate Accept
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleSimulateResponse(period.id, 'decline')}
                                  className="h-6 px-2 text-[10px] font-extrabold border-rose-200 text-rose-700 hover:bg-rose-50"
                                >
                                  Simulate Decline
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Candidate Candidates List (Filtered & Ranked) */}
                        <div className="p-4 space-y-2">
                          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            Ranked Available Teachers (Busy/Absent Excluded):
                          </p>

                          {candidates.length === 0 ? (
                            <p className="text-xs text-rose-600 font-semibold p-2 bg-rose-50 rounded-lg">
                              No free substitute teachers available during this exact period!
                            </p>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {candidates.map(({ teacher, score, isSubjectMatch, isGradeMatch, recommendation }) => {
                                const isAssigned = period.assignedTeacherId === teacher.id;

                                return (
                                  <div
                                    key={teacher.id}
                                    className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                                      isAssigned
                                        ? 'bg-blue-50/90 border-blue-400 shadow-xs'
                                        : 'bg-white border-slate-200 hover:border-blue-300'
                                    }`}
                                  >
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <span className="font-bold text-xs text-[#0F2747]">{teacher.name}</span>
                                        <Badge className={`text-[9px] py-0 font-extrabold ${
                                          recommendation === 'Best Match' ? 'bg-emerald-100 text-emerald-900 border-emerald-200' :
                                          recommendation === 'Strong Match' ? 'bg-blue-100 text-blue-900 border-blue-200' :
                                          'bg-slate-100 text-slate-700'
                                        }`}>
                                          {recommendation}
                                        </Badge>
                                      </div>

                                      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500 mt-1 font-semibold">
                                        <span>{teacher.subject}</span>
                                        {isSubjectMatch && <span className="text-emerald-600 font-bold">Subject ✓</span>}
                                        {isGradeMatch && <span className="text-blue-600 font-bold">Grade ✓</span>}
                                        <span>{teacher.weeklyLoad}/wk</span>
                                        <span className="font-mono text-slate-400">(Score: {score})</span>
                                      </div>
                                    </div>

                                    <Button
                                      size="sm"
                                      variant={isAssigned ? 'default' : 'outline'}
                                      onClick={() => handleAssignCandidate(period.id, teacher.name, teacher.id)}
                                      disabled={period.status === 'accepted'}
                                      className={`h-7 px-3 text-[11px] font-extrabold ${
                                        isAssigned ? 'bg-blue-600 text-white' : 'border-blue-200 text-blue-700 hover:bg-blue-50'
                                      }`}
                                    >
                                      {isAssigned ? 'Assigned' : 'Assign'}
                                    </Button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>

                {/* Footer Controls */}
                <DialogFooter className="pt-3 border-t border-[#E2E8F0] flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="text-xs font-bold text-[#0F2747]">
                    {selectedCount + awaitingCount + acceptedCount} of {totalRequired} periods assigned
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      onClick={handleRequestCover}
                      disabled={selectedCount === 0}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-9 px-4"
                    >
                      Request Cover from Teachers ({selectedCount + awaitingCount})
                    </Button>

                    <Button
                      onClick={() => handleApproveLeave(activeRequest)}
                      disabled={!isAllAccepted}
                      className={`font-bold text-xs h-9 px-4 ${
                        isAllAccepted
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md'
                          : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      Approve Leave
                    </Button>
                  </div>
                </DialogFooter>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
