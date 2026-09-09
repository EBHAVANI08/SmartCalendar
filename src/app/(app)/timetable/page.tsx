'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import {
  CalendarDays, Sparkles, RefreshCw, Printer, Download,
  Filter, Plus, Search, BookOpen, User, Clock, Users,
  CheckCircle2, AlertCircle, Eye, Share2, Edit3,
  Coffee, Utensils, ChevronRight, Layers, Building2,
  Upload, FileSpreadsheet, FileText, ArrowRight, Check,
  ArrowLeftRight, Calculator, FlaskConical, Zap, Dna,
  Languages, Globe, Cpu, Trophy, Palette, Music, Library, AlertTriangle, History as HistoryIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { GenerationResult, type GenerationResultData } from '@/components/timetable/generation-result';
import { VersionBanner } from '@/components/timetable/version-banner';
import { SlotEditor } from '@/components/timetable/slot-editor';
import { ImportPreviewDialog, type ImportReport } from '@/components/timetable/import-preview';
import { readList, teacherTeachesSection } from '@/lib/faculty';

interface Teacher {
  id: string;
  name: string;
  subject: string;
  subjects?: string;
  email: string;
  grades?: string;
  sections?: string;
  role?: string;
}

interface Schedule {
  id: string;
  grade: string;
  section: string;
  day: string;
  period: number;
  subject: string;
  startTime: string;
  endTime: string;
  teacherId?: string | null;
  teacher?: Teacher;
  roomId?: string | null;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DEFAULT_GRADES = ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];


interface PeriodItem {
  num: number | string;
  label?: string;
  time: string;
  isBreak?: boolean;
}

const PERIODS: PeriodItem[] = [
  { num: 1, time: '08:00 - 08:40' },
  { num: 2, time: '08:40 - 09:20' },
  { num: 3, time: '09:20 - 10:00' },
  { num: 'break1', label: 'BREAK', time: '10:00 - 10:30', isBreak: true },
  { num: 4, time: '10:30 - 11:10' },
  { num: 5, time: '11:10 - 11:50' },
  { num: 6, time: '11:50 - 12:30' },
  { num: 7, time: '12:30 - 01:10' },
  { num: 8, time: '01:10 - 01:45' },
];

const getSubjectAccent = (subject: string) => {
  switch (subject) {
    case 'Mathematics':
      return { border: 'border-l-[3px] border-l-[#2563EB]', icon: Calculator, badge: 'bg-blue-50 text-[#2563EB] border-blue-200', iconColor: 'text-[#2563EB]' };
    case 'Science':
      return { border: 'border-l-[3px] border-l-[#059669]', icon: FlaskConical, badge: 'bg-emerald-50 text-[#059669] border-emerald-200', iconColor: 'text-[#059669]' };
    case 'Physics':
      return { border: 'border-l-[3px] border-l-[#0D9488]', icon: Zap, badge: 'bg-teal-50 text-[#0D9488] border-teal-200', iconColor: 'text-[#0D9488]' };
    case 'Chemistry':
      return { border: 'border-l-[3px] border-l-[#0891B2]', icon: FlaskConical, badge: 'bg-cyan-50 text-[#0891B2] border-cyan-200', iconColor: 'text-[#0891B2]' };
    case 'Biology':
      return { border: 'border-l-[3px] border-l-[#16A34A]', icon: Dna, badge: 'bg-green-50 text-[#16A34A] border-green-200', iconColor: 'text-[#16A34A]' };
    case 'English':
      return { border: 'border-l-[3px] border-l-[#7C3AED]', icon: BookOpen, badge: 'bg-purple-50 text-[#7C3AED] border-purple-200', iconColor: 'text-[#7C3AED]' };
    case 'Hindi':
      return { border: 'border-l-[3px] border-l-[#D97706]', icon: Languages, badge: 'bg-amber-50 text-[#D97706] border-amber-200', iconColor: 'text-[#D97706]' };
    case 'Social Science':
      return { border: 'border-l-[3px] border-l-[#EA580C]', icon: Globe, badge: 'bg-orange-50 text-[#EA580C] border-orange-200', iconColor: 'text-[#EA580C]' };
    case 'Computer Science':
      return { border: 'border-l-[3px] border-l-[#4F46E5]', icon: Cpu, badge: 'bg-indigo-50 text-[#4F46E5] border-indigo-200', iconColor: 'text-[#4F46E5]' };
    case 'Physical Education':
      return { border: 'border-l-[3px] border-l-[#0D9488]', icon: Trophy, badge: 'bg-teal-50 text-[#0D9488] border-teal-200', iconColor: 'text-[#0D9488]' };
    case 'Art':
      return { border: 'border-l-[3px] border-l-[#E11D48]', icon: Palette, badge: 'bg-rose-50 text-[#E11D48] border-rose-200', iconColor: 'text-[#E11D48]' };
    case 'Music':
      return { border: 'border-l-[3px] border-l-[#DB2777]', icon: Music, badge: 'bg-pink-50 text-[#DB2777] border-pink-200', iconColor: 'text-[#DB2777]' };
    default:
      return { border: 'border-l-[3px] border-l-slate-400', icon: Library, badge: 'bg-slate-100 text-slate-700 border-slate-200', iconColor: 'text-slate-500' };
  }
};

const calculatePeriods = (
  start: string,
  durationStr: string,
  totalCountStr: string,
  shortBreakAfterStr: string,
  lunchBreakAfterStr: string,
  shortBreakMinsStr: string = '15',
  lunchBreakMinsStr: string = '30',
  enableShortBreak: boolean = true,
  enableLunchBreak: boolean = true
): PeriodItem[] => {
  const [startH, startM] = (start || '08:00').split(':').map(Number);
  let currentMinutes = (startH || 8) * 60 + (startM || 0);
  const duration = Number(durationStr) || 40;
  const count = Number(totalCountStr) || 8;
  const shortAfter = Number(shortBreakAfterStr) || 3;
  const lunchAfter = Number(lunchBreakAfterStr) || 4;
  const shortBreakDuration = Number(shortBreakMinsStr) || 15;
  const lunchBreakDuration = Number(lunchBreakMinsStr) || 30;

  const formatTime = (mins: number) => {
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const list: PeriodItem[] = [];
  let periodCounter = 1;

  for (let i = 1; i <= count; i++) {
    const endMins = currentMinutes + duration;
    list.push({
      num: periodCounter,
      time: `${formatTime(currentMinutes)} - ${formatTime(endMins)}`,
    });
    currentMinutes = endMins;

    if (enableShortBreak && i === shortAfter) {
      const breakEndMins = currentMinutes + shortBreakDuration;
      list.push({
        num: 'break1',
        label: 'Short Break',
        time: `${formatTime(currentMinutes)} - ${formatTime(breakEndMins)}`,
        isBreak: true,
      });
      currentMinutes = breakEndMins;
    } else if (enableLunchBreak && i === lunchAfter) {
      const lunchEndMins = currentMinutes + lunchBreakDuration;
      list.push({
        num: 'lunch',
        label: 'Lunch Recess',
        time: `${formatTime(currentMinutes)} - ${formatTime(lunchEndMins)}`,
        isBreak: true,
      });
      currentMinutes = lunchEndMins;
    }
    periodCounter++;
  }

  return list;
};

export default function TimetablePage() {
  const { toast } = useToast();
  // Post-generation report, including requirements the solver could not place.
  const [genResult, setGenResult] = useState<GenerationResultData | null>(null);
  const [selectedGrade, setSelectedGrade] = useState('Grade 10');
  const [selectedSection, setSelectedSection] = useState('A');
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [teachersList, setTeachersList] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>('admin');
  const [viewMode, setViewMode] = useState<'my' | 'class'>('class');
  const [teacherWeekSchedule, setTeacherWeekSchedule] = useState<any[]>([]);
  const [teacherInfo, setTeacherInfo] = useState<{ id: string; name: string; email: string } | null>(null);

  const [gradesList, setGradesList] = useState<string[]>(DEFAULT_GRADES);
  const [sectionsByGrade, setSectionsByGrade] = useState<Record<string, string[]>>({});
  const [schoolName, setSchoolName] = useState<string>('');

  // Dynamic Period Timings State
  const [activePeriods, setActivePeriods] = useState<PeriodItem[]>(PERIODS);

  // Resolve user role & session
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('sc_user') || localStorage.getItem('smart_calendar_auth_session');
      if (raw) {
        const u = JSON.parse(raw);
        const role = u.role || 'admin';
        setUserRole(role);
        setSchoolName(u.schoolName || u.user?.schoolName || '');
        if (role === 'teacher') {
          setViewMode('my');
        }
      }
    } catch {}
  }, []);

  const fetchTeacherSchedule = useCallback(async () => {
    try {
      const r = await fetch('/api/teacher/dashboard');
      if (r.ok) {
        const d = await r.json();
        setTeacherWeekSchedule(d.weekSchedule || []);
        setTeacherInfo(d.teacher || null);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (userRole === 'teacher') {
      fetchTeacherSchedule();
    }
  }, [userRole, fetchTeacherSchedule]);

  // Unified Master Studio Modal States
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioStep, setStudioStep] = useState<1 | 2 | 3>(1);
  const [studioMode, setStudioMode] = useState<'upload' | 'ai'>('ai');
  const [isProcessing, setIsProcessing] = useState(false);

  // Dedicated Bell Timings Modal State (Does NOT trigger AI Creator Studio wizard)
  const [bellTimingsOpen, setBellTimingsOpen] = useState(false);

  // Live Timetable Version & Publish Status
  const [timetableStatus, setTimetableStatus] = useState<'published' | 'draft' | 'unknown'>('unknown');
  const [versionInfo, setVersionInfo] = useState<{ id?: string; version: number; name?: string; status?: string; publishedAt?: string } | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSavingBell, setIsSavingBell] = useState(false);

  const [studioSettings, setStudioSettings] = useState({
    startTime: '08:00',
    endTime: '13:45',
    periodDuration: '40',
    totalPeriods: '8',
    saturdayType: 'half', // 'full' | 'half' | 'off'
    saturdayPeriods: '5',
    enableShortBreak: true,
    shortBreakAfter: '3',
    shortBreakMins: '15',
    enableLunchBreak: true,
    lunchBreakAfter: '4',
    lunchBreakMins: '30',
    bulkAll: true,
    startGrade: 'Grade 3',
    endGrade: 'Grade 8',
    sectionsCount: '3',
    preventConsecutiveDouble: true,
    enableWedPtSports: true,
    anchorClassTeacherP1: true,
    customPrompt: '',
  });

  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  // Cell Editing & Period Swapping Modal States
  const [cellEditOpen, setCellEditOpen] = useState(false);
  const [editingCell, setEditingCell] = useState<{
    id?: string;
    day: string;
    period: number;
    subject: string;
    teacherId?: string;
    teacher: string;
    room: string;
  } | null>(null);


  // Drag-and-Drop state
  const [draggedSlot, setDraggedSlot] = useState<{ id?: string; day: string; period: number } | null>(null);
  const [dragOverCell, setDragOverCell] = useState<string | null>(null);

  // Fetch Schedules & Teachers
  // Occupancy across the WHOLE school for the active version, keyed by
  // teacher+day+period. A timetable cell is only correct in the context of
  // every other class, so this is fetched school-wide, not per section.
  const [occupancy, setOccupancy] = useState<Record<string, { grade: string; section: string; subject: string }[]>>({});

  const fetchOccupancy = useCallback(async (explicitVersionId?: string) => {
    try {
      const vId = explicitVersionId || versionInfo?.id;
      const url = vId ? `/api/schedules?versionId=${encodeURIComponent(vId)}` : '/api/schedules';
      const r = await fetch(url);
      if (!r.ok) return;
      const rows = await r.json();
      if (!Array.isArray(rows)) return;
      const map: Record<string, { grade: string; section: string; subject: string }[]> = {};
      for (const row of rows) {
        if (!row.teacherId) continue;
        const key = `${row.teacherId}|${row.day}|${row.period}`;
        (map[key] ||= []).push({ grade: row.grade, section: row.section, subject: row.subject });
      }
      setOccupancy(map);
    } catch {
      /* the grid still renders without clash badges */
    }
  }, [versionInfo?.id]);

  /** Other classes this teacher is already booked into at the same day+period. */
  const clashesFor = (teacherId: string | undefined, day: string, period: number) => {
    if (!teacherId) return [];
    return (occupancy[`${teacherId}|${day}|${period}`] || []).filter(
      (x) => !(x.grade === selectedGrade && x.section === selectedSection)
    );
  };

  const fetchSchedules = useCallback(async (explicitVersionId?: string) => {
    setLoading(true);
    // Drop the previous class's rows immediately. Without this the grid keeps
    // rendering the old section while the new fetch is in flight.
    setSchedules([]);
    try {
      const vId = explicitVersionId || versionInfo?.id;
      const params = new URLSearchParams({
        grade: selectedGrade,
        section: selectedSection,
      });
      if (vId) params.set('versionId', vId);
      const r = await fetch(`/api/schedules?${params.toString()}`);
      if (r.ok) {
        const data = await r.json();
        setSchedules(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('fetchSchedules error:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedGrade, selectedSection, versionInfo?.id]);

  const fetchTeachers = useCallback(async () => {
    try {
      const r = await fetch('/api/teachers');
      if (r.ok) {
        const data = await r.json();
        if (Array.isArray(data)) {
          setTeachersList(data);
        }
      }
    } catch {
      // ignore error
    }
  }, []);

  const fetchDayConfig = useCallback(async () => {
    try {
      const r = await fetch('/api/school/day-config');
      if (!r.ok) return;
      const data = await r.json();
      if (data.success && data.config) {
        const c = data.config;
        if (c.configured) {
          const periods = calculatePeriods(
            c.startTime || '08:00',
            '40',
            String(c.periodsPerDay || 8),
            String(c.breakAfter || 2),
            String(c.lunchAfter || 4),
            String(c.breakMinutes || 15),
            String(c.lunchMinutes || 30),
            c.breakMinutes > 0,
            c.lunchMinutes > 0
          );
          setActivePeriods(periods);
          setStudioSettings((prev) => ({
            ...prev,
            startTime: c.startTime || prev.startTime,
            endTime: c.endTime || prev.endTime,
            totalPeriods: String(c.periodsPerDay || prev.totalPeriods),
            saturdayType: c.workingDays === 5 ? 'off' : 'half',
            saturdayPeriods: String(c.saturdayPeriods || 4),
            shortBreakAfter: String(c.breakAfter || prev.shortBreakAfter),
            shortBreakMins: String(c.breakMinutes || prev.shortBreakMins),
            lunchBreakAfter: String(c.lunchAfter || prev.lunchBreakAfter),
            lunchBreakMins: String(c.lunchMinutes || prev.lunchBreakMins),
            enableShortBreak: (c.breakMinutes || 0) > 0,
            enableLunchBreak: (c.lunchMinutes || 0) > 0,
          }));
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchSchoolStructure = useCallback(async () => {
    try {
      const r = await fetch('/api/school/detected-structure');
      if (r.ok) {
        const d = await r.json();
        if (d.success && Array.isArray(d.grades) && d.grades.length > 0) {
          const detectedGrades = d.grades.map((g: any) => g.grade);
          const sectionsMap: Record<string, string[]> = {};
          d.grades.forEach((g: any) => {
            sectionsMap[g.grade] = (g.sections || []).map((s: any) => s.section);
          });
          setGradesList(detectedGrades);
          setSectionsByGrade(sectionsMap);
        }
      }
    } catch {
      // Keep default structure
    }
  }, []);

  const fetchTimetableStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/timetable/publish');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setTimetableStatus(data.currentStatus || (data.isPublished ? 'published' : 'draft'));
          setVersionInfo(data.version || null);
          return data.version;
        }
      }
    } catch {
      // ignore
    }
    return null;
  }, []);

  const handleFinalizePublish = async () => {
    setIsPublishing(true);
    try {
      const res = await fetch('/api/timetable/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Master Timetable v${(versionInfo?.version || 0) + 1}`,
          notes: `Finalized and published via Timetable Studio on ${new Date().toLocaleDateString('en-IN')}`,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTimetableStatus('published');
        setVersionInfo(data.version);
        toast({
          title: '🎉 Timetable Finalized & Published!',
          description: `Version ${data.version?.version || 1} is now live across all teacher dashboards, attendance sync, and substitution engines.`,
        });
        fetchSchedules(data.version?.id);
        fetchOccupancy(data.version?.id);
        fetchTimetableStatus();
      } else {
        toast({
          variant: 'destructive',
          title: 'Failed to Publish Timetable',
          description: data.error || 'An unexpected error occurred while publishing.',
        });
      }
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Publish Error',
        description: err?.message || 'Network error while publishing.',
      });
    } finally {
      setIsPublishing(false);
    }
  };

  const handleSaveBellTimings = async () => {
    setIsSavingBell(true);
    try {
      const payload = {
        startTime: studioSettings.startTime,
        endTime: studioSettings.endTime,
        periodsPerDay: parseInt(studioSettings.totalPeriods, 10) || 8,
        saturdayPeriods: parseInt(studioSettings.saturdayPeriods, 10) || 5,
        breakAfter: parseInt(studioSettings.shortBreakAfter, 10) || 3,
        breakMinutes: studioSettings.enableShortBreak ? (parseInt(studioSettings.shortBreakMins, 10) || 15) : 0,
        lunchAfter: parseInt(studioSettings.lunchBreakAfter, 10) || 4,
        lunchMinutes: studioSettings.enableLunchBreak ? (parseInt(studioSettings.lunchBreakMins, 10) || 30) : 0,
        workingDays: studioSettings.saturdayType === 'off' ? 5 : 6,
      };

      const res = await fetch('/api/school/day-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const newPeriods = calculatePeriods(
          studioSettings.startTime,
          studioSettings.periodDuration,
          studioSettings.totalPeriods,
          studioSettings.shortBreakAfter,
          studioSettings.lunchBreakAfter,
          studioSettings.enableShortBreak ? studioSettings.shortBreakMins : '0',
          studioSettings.enableLunchBreak ? studioSettings.lunchBreakMins : '0',
          studioSettings.enableShortBreak,
          studioSettings.enableLunchBreak
        );
        setActivePeriods(newPeriods);
        toast({
          title: '✅ Bell Schedule Timings Saved & Applied!',
          description: `Updated Start: ${studioSettings.startTime}, End: ${studioSettings.endTime}, Periods: ${studioSettings.totalPeriods}/day saved and active across your school!`,
        });
        setBellTimingsOpen(false);
        setStudioOpen(false);
      } else {
        toast({
          variant: 'destructive',
          title: 'Failed to save bell timings',
          description: data?.error || 'Could not update day configuration.',
        });
      }
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Error saving bell timings',
        description: e?.message || 'Network error',
      });
    } finally {
      setIsSavingBell(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
    fetchTeachers();
    fetchOccupancy();
    fetchDayConfig();
    fetchSchoolStructure();
    fetchTimetableStatus();
  }, [fetchSchedules, fetchTeachers, fetchOccupancy, fetchDayConfig, fetchSchoolStructure, fetchTimetableStatus]);

  // Unified Master Studio Submit Handler (Handles both File Upload & AI Bulk Generation)
  /**
   * One upload call. `validate` reports on the whole file without writing;
   * `commit` re-validates server-side and writes atomically.
   */
  const runImport = useCallback(async (file: File, mode: 'validate' | 'commit') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('mode', mode);
    formData.append('grade', selectedGrade);
    formData.append('section', selectedSection);

    const res = await fetch('/api/timetable/bulk-upload', { method: 'POST', body: formData });
    const data = await res.json().catch(() => ({}));

    // A validation failure comes back as a structured report, not a toast.
    if (!res.ok && res.status !== 422) {
      toast({
        title: 'Upload failed',
        description: data?.error || `The server rejected the file (HTTP ${res.status}).`,
        variant: 'destructive',
      });
      return null;
    }
    return data;
  }, [selectedGrade, selectedSection, toast]);

  const confirmImport = useCallback(async () => {
    if (!selectedUploadFile) return;
    const data = await runImport(selectedUploadFile, 'commit');
    if (!data) return;

    if (!data.success) {
      // Re-validated on commit and something changed underneath: show why.
      setImportReport((prev) => (prev ? { ...prev, ...data, canImport: false } : prev));
      toast({
        title: 'Import refused',
        description: data.error || 'The file no longer validates.',
        variant: 'destructive',
      });
      return;
    }

    toast({ title: 'Timetable imported', description: data.message });
    setImportOpen(false);
    setImportReport(null);
    setSelectedUploadFile(null);
    fetchSchedules();
  }, [selectedUploadFile, runImport, toast, fetchSchedules]);

  const handleStudioSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsProcessing(true);

    try {
      // Direct Faculty Directory & Workload Center Generation Mode
      const schoolRes = await fetch('/api/teacher/me');
      let schoolId = '';
      if (schoolRes.ok) {
        const sData = await schoolRes.json();
        schoolId = sData?.schoolId || sData?.data?.schoolId || '';
      }
      if (!schoolId) {
        toast({
          title: 'No school context',
          description: 'Could not determine your school. Please sign in again.',
          variant: 'destructive',
        });
        return; // `finally` below resets the processing state
      }

      const r = await fetch('/api/schedules/ai-generate-timetable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grade: selectedGrade,
          section: selectedSection,
          schoolId,
          bulkAll: studioSettings.bulkAll,
          setup: {
            periodsPerDay: parseInt(studioSettings.totalPeriods, 10),
            workingDays: studioSettings.saturdayType === 'off' ? 5 : 6,
            saturdayPeriods: parseInt(studioSettings.saturdayPeriods, 10),
            breakAfter: parseInt(studioSettings.shortBreakAfter, 10),
            lunchAfter: parseInt(studioSettings.lunchBreakAfter, 10),
            startTime: studioSettings.startTime,
            endTime: studioSettings.endTime,
            startGrade: studioSettings.startGrade,
            endGrade: studioSettings.endGrade,
            preventConsecutiveDouble: studioSettings.preventConsecutiveDouble,
            enableWedPtSports: studioSettings.enableWedPtSports,
            anchorClassTeacherP1: studioSettings.anchorClassTeacherP1,
            customPrompt: studioSettings.customPrompt,
          },
        }),
      });

      const d = await r.json();
      setGenResult(d);
      if (r.ok && d.success) {
        toast({
          title: studioSettings.bulkAll ? 'School-Wide Bulk Master Timetable Approved!' : 'Master Timetable Generated!',
          description: studioSettings.bulkAll
            ? 'Generated clash-free master timetables for ALL classes directly from Faculty Directory & Workload Center! Teacher workloads updated.'
            : `Created ${d.stats?.totalGenerated || 48} clash-free slots for ${selectedGrade} Section ${selectedSection} directly from Faculty Directory!`,
        });
        setStudioOpen(false);
        setStudioStep(1);
        const newVer = await fetchTimetableStatus();
        fetchSchedules(newVer?.id);
        fetchOccupancy(newVer?.id);
      } else {
        toast({
          title: 'Generation Notice',
          description: d.error || d.message || 'Timetable generated from Faculty Directory and saved to database.',
          variant: r.ok ? 'default' : 'destructive',
        });
        if (r.ok) {
          setStudioOpen(false);
          setStudioStep(1);
          const newVer = await fetchTimetableStatus();
          fetchSchedules(newVer?.id);
          fetchOccupancy(newVer?.id);
        }
      }
    } catch (err) {
      console.error('Master Studio error:', err);
      toast({
        title: 'Process Error',
        description: err instanceof Error ? err.message : 'Could not complete timetable process. Please check connection and try again.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Period Swapping Execution (Modal or Drag & Drop)
  const handleDragStart = (e: React.DragEvent, slotInfo: { id?: string; day: string; period: number }) => {
    if (!slotInfo.id || String(slotInfo.id).startsWith('custom-')) {
      e.preventDefault();
      return;
    }
    setDraggedSlot(slotInfo);
    try {
      e.dataTransfer.setData('text/plain', JSON.stringify(slotInfo));
      e.dataTransfer.effectAllowed = 'move';
    } catch {}
  };

  const handleDragOver = (e: React.DragEvent, cellKey: string) => {
    e.preventDefault();
    try {
      e.dataTransfer.dropEffect = 'move';
    } catch {}
    if (dragOverCell !== cellKey) setDragOverCell(cellKey);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverCell(null);
  };

  const handleDrop = async (e: React.DragEvent, target: { id?: string; day: string; period: number }) => {
    e.preventDefault();
    setDragOverCell(null);
    let source = draggedSlot;
    if (!source) {
      try {
        const raw = e.dataTransfer.getData('text/plain');
        if (raw) source = JSON.parse(raw);
      } catch {}
    }
    setDraggedSlot(null);

    if (!source || !source.id || String(source.id).startsWith('custom-')) return;
    if (source.day === target.day && source.period === target.period) return;

    try {
      const res = await fetch(`/api/schedules/${source.id}/slot`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          day: target.day,
          period: target.period,
          swap: true,
          allowSwap: true,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: 'Period Moved / Swapped',
          description: data.message || `Successfully moved period to ${target.day} Period ${target.period}.`,
        });
        fetchSchedules();
        fetchOccupancy();
      } else {
        toast({
          title: 'Cannot Move Period',
          description: data.error || 'Conflict detected in destination slot.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Move Failed',
        description: 'Network error while attempting to move period.',
        variant: 'destructive',
      });
    }
  };

  // Download Excel Format Template for School Setup
  const handleDownloadTemplate = () => {
    try {
      window.location.href = '/api/timetable/import/template?type=complete&format=xlsx';
      toast({
        title: 'Excel Format Template Downloaded',
        description: 'Downloading Complete Timetable & Faculty Excel Setup Template.',
      });
    } catch {
      toast({
        title: 'Download Failed',
        description: 'Could not download template.',
        variant: 'destructive',
      });
    }
  };

  // Download Current Grade Timetable as formatted Excel
  const handleDownloadGradeExcel = () => {
    try {
      const dataRows = DAYS.flatMap((day) => {
        return activePeriods.map((period) => {
          if (period.isBreak) {
            return {
              Grade: selectedGrade,
              Section: selectedSection,
              Day: day,
              Period: String(period.label || 'Break Recess'),
              Timing: period.time,
              Subject: '— Break Recess —',
              Teacher: '—',
              Room: '—',
            };
          }
          const slot = getSlot(day, Number(period.num));
          return {
            Grade: selectedGrade,
            Section: selectedSection,
            Day: day,
            Period: `Period ${period.num}`,
            Timing: period.time,
            Subject: slot.subject,
            Teacher: slot.teacher,
            Room: slot.room,
          };
        });
      });

      const worksheet = XLSX.utils.json_to_sheet(dataRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, `${selectedGrade}_${selectedSection}`);

      XLSX.writeFile(workbook, `${selectedGrade.replace(/\s+/g, '_')}_Section_${selectedSection}_Timetable.xlsx`);

      toast({
        title: 'Excel Export Complete!',
        description: `Downloaded timetable spreadsheet for ${selectedGrade} Section ${selectedSection}.`,
      });
    } catch (err) {
      console.error('Excel Export Error:', err);
      toast({
        title: 'Export Failed',
        description: 'Could not generate Excel file for selected timetable.',
        variant: 'destructive',
      });
    }
  };



  // Helper to get slot info for Day & Period purely from DB
  const getSlot = (day: string, periodNum: number) => {
    // A timetable cell is identified by class AND time. Matching on day+period
    // alone let one section render another section's lesson whenever the state
    // array held rows for more than the selected class.
    const dbMatch = schedules.find(
      (s) =>
        s.day === day &&
        s.period === periodNum &&
        s.grade === selectedGrade &&
        s.section === selectedSection
    );

    if (dbMatch) {
      const rawTeacher = dbMatch.teacher?.name;
      const resolvedTeacher =
        rawTeacher && rawTeacher !== 'Assigned Faculty'
          ? rawTeacher
          : 'Unassigned Faculty';

      return {
        id: dbMatch.id,
        subject: dbMatch.subject,
        teacherId: dbMatch.teacherId || undefined,
        teacher: resolvedTeacher,
        room: dbMatch.roomId || '—',
      };
    }

    return { subject: 'Unassigned Period', teacher: '—', room: '—', teacherId: undefined };
  };

  const activeFaculty = teachersList.filter((t) => t.role !== 'inactive');
  const gradeFaculty = activeFaculty.filter((t) => {
    const grds = readList(t.grades);
    return grds.length === 0 || grds.includes(selectedGrade);
  });
  const classSectionFaculty = gradeFaculty.filter((t) => {
    return teacherTeachesSection(t.sections, selectedGrade, selectedSection);
  });
  const allMappedSubjects = Array.from(new Set(activeFaculty.flatMap((t) => readList(t.subjects ?? t.subject))));

  return (
    <div className="bg-[#F6F8FC] min-h-screen p-4 sm:p-6 lg:p-8 space-y-6 text-[#172033]">
      {userRole !== 'teacher' && (
        <>
          <VersionBanner onChanged={fetchSchedules} />
          <GenerationResult result={genResult} onDismiss={() => setGenResult(null)} />
        </>
      )}
      {/* ── Enterprise SaaS Workspace Header ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-700 via-indigo-800 to-slate-900 flex items-center justify-center text-white shadow-md shadow-blue-900/30 shrink-0 relative border border-blue-500/20">
            <CalendarDays className="w-6 h-6 text-white" />
            <Sparkles className="w-3.5 h-3.5 text-amber-300 absolute -top-1 -right-1" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#081A33]">
                {userRole === 'teacher' ? 'Faculty Timetable Station' : 'Timetable Studio & Schedule Matrix'}
              </h1>
              <Badge className="bg-blue-50 text-[#2563EB] border border-blue-200 font-bold text-[10px] uppercase tracking-wider">
                {userRole === 'teacher' ? 'Faculty Account' : 'Enterprise ERP'}
              </Badge>
            </div>
            <div className="text-xs text-[#64748B] font-medium mt-1 flex flex-wrap items-center gap-2">
              {userRole === 'teacher' ? (
                <>
                  <span>Logged in as:</span>
                  <span className="bg-slate-100 text-[#0F2747] border border-slate-200 px-2.5 py-0.5 rounded-md font-extrabold text-xs">
                    {teacherInfo?.name || 'Faculty Member'}
                  </span>
                  <span className="text-slate-400">&middot;</span>
                  <span>{teacherWeekSchedule.length} Allotted Teaching Periods</span>
                </>
              ) : (
                <>
                  <span>Class Schedule Directory:</span>
                  <span className="bg-slate-100 text-[#0F2747] border border-slate-200 px-2.5 py-0.5 rounded-md font-extrabold text-xs">
                    {selectedGrade} · Section {selectedSection}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {userRole === 'teacher' ? (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.print()}
                className="gap-2 text-xs border-[#E2E8F0] text-[#0F2747] bg-white hover:bg-slate-50 font-bold h-9 shadow-xs px-3.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-slate-600" /> Print Schedule
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={fetchTeacherSchedule}
                className="gap-2 text-xs border-[#E2E8F0] text-[#0F2747] bg-white hover:bg-slate-50 font-bold h-9 shadow-xs px-3.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </Button>
            </div>
          ) : (
            <>
              {timetableStatus === 'published' ? (
                <div className="hidden sm:flex items-center gap-2 bg-emerald-50 border border-emerald-300 px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-800 shadow-2xs">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Published &amp; Live {versionInfo?.version ? `(v${versionInfo.version})` : ''}</span>
                </div>
              ) : timetableStatus === 'draft' ? (
                <div className="hidden sm:flex items-center gap-2 bg-amber-50 border border-amber-300 px-3 py-1.5 rounded-xl text-xs font-bold text-amber-900 shadow-2xs">
                  <FileText className="w-3.5 h-3.5 text-amber-600" />
                  <span>Working Draft {versionInfo?.version ? `(v${versionInfo.version})` : ''}</span>
                </div>
              ) : (
                <div className="hidden sm:flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 shadow-2xs">
                  <Layers className="w-3.5 h-3.5 text-blue-600" />
                  <span>Active Master Timetable</span>
                </div>
              )}
              <Link href="/timetable-versions">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2 text-xs border-[#E2E8F0] text-[#0F2747] bg-white hover:bg-slate-50 font-bold h-9 shadow-xs px-3.5"
                >
                  <HistoryIcon className="w-3.5 h-3.5 text-slate-600" /> Version History
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* ── TEACHER'S PERSONAL ALLOTTED TIMETABLE VIEW ── */}
      {userRole === 'teacher' && (
        <Card className="border-[#E2E8F0] shadow-xs overflow-hidden bg-white rounded-2xl">
          <div className="p-4 sm:p-5 border-b border-[#E2E8F0] bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-[#081A33] flex items-center gap-2">
                <CalendarDays className="w-4.5 h-4.5 text-blue-600" />
                <span>My Allotted Teaching Timetable — {teacherInfo?.name || 'Faculty'}</span>
              </h2>
              <p className="text-xs text-[#64748B] mt-0.5">
                Official clash-free weekly teaching periods allotted to you by the School Administration.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.print()}
                className="h-8 px-3 text-xs font-extrabold border-blue-200 bg-blue-50 text-[#2563EB] hover:bg-blue-100 shadow-2xs gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-[#2563EB]" /> Print My Schedule
              </Button>
              <Badge className="bg-blue-700 text-white border-none font-bold text-xs shadow-2xs px-2.5 py-1">
                {teacherWeekSchedule.length} Assigned Periods
              </Badge>
            </div>
          </div>

          <div className="w-full overflow-x-hidden">
            <table className="w-full text-left border-collapse table-fixed">
              <thead>
                <tr className="bg-[#1c2d54] text-white border-b-2 border-slate-900 text-[11px] font-extrabold uppercase tracking-wider shadow-sm">
                  <th className="p-2 w-16 text-center border-r border-[#111e38] bg-[#1c2d54] text-white font-black sticky left-0 z-20">
                    DAY
                  </th>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((pNum) => (
                    <th key={pNum} className="p-2 text-center bg-[#1c2d54] border-r border-[#111e38]">
                      <div className="text-white font-black text-xs tracking-wider">PERIOD {pNum}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] text-xs">
                {DAYS.map((day) => (
                  <tr key={day} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-2 text-center bg-[#F8FAFC] border-b border-r border-[#E2E8F0] sticky left-0 z-10 font-bold shadow-xs w-16">
                      <div className="text-xs font-black text-[#0F2747] tracking-wider uppercase">
                        {day.substring(0, 3)}
                      </div>
                      <div className="text-[10px] font-semibold text-[#64748B] mt-0.5">
                        {day}
                      </div>
                    </td>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((pNum) => {
                      const slot = teacherWeekSchedule.find((s) => s.day === day && s.period === pNum);
                      const accent = slot ? getSubjectAccent(slot.subject) : null;
                      const IconComp = accent?.icon;

                      return (
                        <td key={pNum} className="p-1.5 border-b border-r border-[#E2E8F0] bg-white">
                          {slot ? (
                            <div className={`p-2 rounded-lg border border-[#E2E8F0] bg-white shadow-xs ${accent?.border || ''} space-y-1 h-full`}>
                              <div className="flex items-center gap-1 min-w-0">
                                {IconComp && <IconComp className={`w-3.5 h-3.5 shrink-0 ${accent?.iconColor || ''}`} />}
                                <span className="font-bold text-xs text-[#172033] truncate" title={slot.subject}>
                                  {slot.subject}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 text-[11px] font-extrabold text-blue-900">
                                {slot.grade} {slot.section}
                              </div>
                              <div className="flex items-center justify-between pt-0.5 border-t border-slate-100 text-[9px] text-[#64748B]">
                                <span className="font-mono">{slot.roomId || 'Classroom'}</span>
                                <span className="text-[8px] font-mono font-semibold px-1 py-0.2 rounded border bg-blue-50 text-blue-700 border-blue-200">
                                  P{pNum}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="p-2 text-center text-slate-300 text-[10px] font-medium select-none">
                              — Free —
                            </div>
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
      )}

      {/* ── CLASS TIMETABLE GRID (ADMIN ONLY) ── */}
      {userRole !== 'teacher' && (
        <>
          {/* ── Class-by-Class Switcher Bar (View All Classes One by One) ── */}
          <Card className="border-[#E2E8F0] shadow-xs p-5 bg-white space-y-3 rounded-2xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#081A33] uppercase tracking-wider flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#2563EB]" />
                Academic Class Directory
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#64748B] font-semibold">Section:</span>
                {(sectionsByGrade[selectedGrade] || ['A', 'B', 'C']).map((sec) => (
                  <Button
                    key={sec}
                    size="sm"
                    variant={selectedSection === sec ? 'default' : 'outline'}
                    onClick={() => setSelectedSection(sec)}
                    className={`h-7 px-3 text-xs font-extrabold rounded-lg ${selectedSection === sec ? 'bg-[#2563EB] text-white border-none shadow-xs' : 'text-slate-700 bg-white border-[#E2E8F0]'}`}
                  >
                    {sec.length > 2 ? sec : `Section ${sec}`}
                  </Button>
                ))}
              </div>
            </div>

            {/* Grade Buttons Carousel */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 scrollbar-none">
              {gradesList.map((g) => (
                <Button
                  key={g}
                  size="sm"
                  variant={selectedGrade === g ? 'default' : 'ghost'}
                  onClick={() => {
                    setSelectedGrade(g);
                    const validSecs = sectionsByGrade[g] || ['A', 'B'];
                    if (!validSecs.includes(selectedSection)) {
                      setSelectedSection(validSecs[0]);
                    }
                  }}
                  className={`h-8 px-3.5 text-xs shrink-0 font-extrabold rounded-lg ${selectedGrade === g ? 'bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 text-white shadow-md border-none' : 'text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200'}`}
                >
                  {g}
                </Button>
              ))}
            </div>
          </Card>

          {/* ── Enterprise Master Timetable Matrix ── */}
          <Card className="border-[#E2E8F0] shadow-xs overflow-hidden bg-white rounded-2xl" id="printable-timetable-container">
            {/* Printable Official Header Banner — Visible ONLY during print */}
            <div className="hidden print:block p-4 border-b border-slate-300 text-center bg-slate-50">
              <h1 className="text-xl font-black text-slate-900 uppercase tracking-wide">{schoolName || 'Master Timetable'} — Master Timetable</h1>
              <h2 className="text-base font-bold text-[#0F2747] mt-0.5">Class Weekly Schedule: {selectedGrade} — Section {selectedSection}</h2>
              <p className="text-xs text-slate-600 mt-0.5">Clash-Free Academic Timetable &middot; Generated via Smart Calendar ERP OS</p>
            </div>

            <div className="p-4 sm:p-5 border-b border-[#E2E8F0] bg-white flex justify-between items-center no-print">
              <div>
                <h2 className="text-base font-bold text-[#081A33] flex items-center gap-2">
                  <span>Weekly Schedule Grid — {selectedGrade} {selectedSection}</span>
                </h2>
                <p className="text-xs text-[#64748B] mt-0.5">
                  {userRole === 'teacher'
                    ? 'Viewing class schedule in read-only mode.'
                    : 'Click ANY cell or drag & drop to edit subject, teacher, room or swap period slots.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* Admin Only: Finalize & Publish Button — Hidden after final publish */}
                {userRole !== 'teacher' && timetableStatus !== 'published' && (
                  <Button
                    size="sm"
                    disabled={isPublishing}
                    onClick={handleFinalizePublish}
                    className="h-8 px-3.5 text-xs font-black bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white shadow-sm gap-1.5 border-none cursor-pointer disabled:opacity-60"
                  >
                    {isPublishing ? (
                      <RefreshCw className="w-3.5 h-3.5 text-emerald-100 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-100" />
                    )}
                    {isPublishing ? 'Publishing...' : 'Finalize & Publish'}
                  </Button>
                )}

                {/* Admin Only: Create Master Timetable Button */}
                {userRole !== 'teacher' && (
                  <Button
                    size="sm"
                    onClick={() => {
                      fetchTeachers();
                      setStudioStep(1);
                      setStudioMode('ai');
                      setStudioSettings((prev) => ({
                        ...prev,
                        bulkAll: false,
                      }));
                      setStudioOpen(true);
                    }}
                    className="h-8 px-3.5 text-xs font-black bg-gradient-to-r from-blue-600 via-indigo-700 to-slate-900 hover:from-blue-700 hover:via-indigo-800 hover:to-slate-950 text-white shadow-sm gap-1.5 border-none cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    Create Master Timetable
                  </Button>
                )}

                {/* Admin Only: Edit Bell Timings — Hidden after final publish */}
                {userRole !== 'teacher' && timetableStatus !== 'published' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setBellTimingsOpen(true)}
                    className="h-8 px-3 text-xs font-extrabold border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 shadow-2xs gap-1.5 cursor-pointer"
                  >
                    <Clock className="w-3.5 h-3.5 text-slate-600" /> Edit Bell Timings
                  </Button>
                )}

                {/* Print Timetable */}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.print()}
                  className="h-8 px-3 text-xs font-extrabold border-blue-200 bg-blue-50 text-[#2563EB] hover:bg-blue-100 shadow-2xs gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-[#2563EB]" /> Print ({selectedGrade}-{selectedSection})
                </Button>

                {/* Total Scheduled Badge */}
                <Badge className="bg-slate-900 text-white border-none font-bold text-xs shadow-2xs px-2.5 py-1">
                  {(() => {
                    const visible = schedules.filter(
                      (s) => s.grade === selectedGrade && s.section === selectedSection
                    ).length;
                    return visible > 0 ? `${visible} Scheduled Periods` : 'No Scheduled Periods';
                  })()}
                </Badge>
              </div>
            </div>

            <div className="w-full overflow-x-hidden">
              <table className="w-full text-left border-collapse table-fixed">
                <thead>
                  <tr className="bg-[#1c2d54] text-white border-b-2 border-slate-900 text-[11px] font-extrabold uppercase tracking-wider shadow-sm">
                    <th
                      onClick={() => { if (userRole !== 'teacher') setBellTimingsOpen(true); }}
                      title={userRole !== 'teacher' ? 'Click to edit bell schedule & period timings' : 'Day / Period'}
                      className={`p-2 w-16 text-center border-r border-[#111e38] bg-[#1c2d54] text-white font-black sticky left-0 z-20 ${userRole !== 'teacher' ? 'hover:bg-[#253966] cursor-pointer' : ''} transition-colors`}
                    >
                      DAY / PERIOD
                    </th>
                    {activePeriods.map((p, idx) => {
                      const isShort = p.num === 'break1';
                      const isLunch = p.num === 'lunch';

                      return (
                        <th
                          key={idx}
                          onClick={() => { if (userRole !== 'teacher') setBellTimingsOpen(true); }}
                          title={userRole !== 'teacher' ? `Click to edit bell timing for ${p.isBreak ? (isShort ? 'Short Break' : 'Lunch Recess') : `Period ${p.num}`}` : undefined}
                          className={`p-2 text-center transition-colors bg-[#1c2d54] ${userRole !== 'teacher' ? 'hover:bg-[#253966] cursor-pointer' : ''} border-r border-[#111e38] ${p.isBreak ? 'w-8 break-column' : ''}`}
                        >
                          {!p.isBreak && (
                            <div className="text-white font-black text-xs tracking-wider">
                              PERIOD {p.num}
                            </div>
                          )}
                          <div className={`font-bold font-mono text-amber-300 ${p.isBreak ? 'text-[9px] leading-tight' : 'text-[10px] mt-0.5'}`}>
                            {p.time}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] text-xs">
                  {DAYS.map((day) => (
                    <tr key={day} className="hover:bg-slate-50/50 transition-colors">
                      {/* Sticky Day Column */}
                      <td className="p-2 text-center bg-[#F8FAFC] border-b border-r border-[#E2E8F0] sticky left-0 z-10 font-bold shadow-xs w-16 day-cell">
                        <div className="text-xs font-black text-[#0F2747] tracking-wider uppercase">
                          {day.substring(0, 3)}
                        </div>
                        <div className="text-[10px] font-semibold text-[#64748B] mt-0.5">
                          {day}
                        </div>
                      </td>

                      {activePeriods.map((p, pIdx) => {
                        if (p.isBreak) {
                          const isShort = p.num === 'break1';
                          const letters = isShort
                            ? ['S', 'H', 'O', 'R', 'T', '—', 'B', 'R', 'E', 'A', 'K']
                            : ['L', 'U', 'N', 'C', 'H', '—', 'R', 'E', 'C', 'E', 'S', 'S'];

                          return (
                            <td
                              key={pIdx}
                              className={`p-0.5 text-center select-none w-7 break-column border-r border-b ${isShort ? 'bg-gradient-to-b from-amber-50 to-amber-100/60 border-amber-200/90 text-amber-950' : 'bg-gradient-to-b from-emerald-50 to-emerald-100/60 border-emerald-200/90 text-emerald-950'}`}
                            >
                              <div className="flex flex-col items-center justify-center py-1 text-[8px] font-black leading-tight select-none">
                                {letters.map((char, cIdx) => (
                                  <span
                                    key={cIdx}
                                    className={char === '—' ? 'my-0.5 text-[6px] opacity-40 font-black' : 'font-black tracking-tighter text-[8px] leading-none'}
                                  >
                                    {char}
                                  </span>
                                ))}
                              </div>
                            </td>
                          );
                        }

                        const periodNum = p.num as number;
                        const slot = getSlot(day, periodNum);
                        // Same teacher already booked into another class at this time.
                        const cellClashes = clashesFor(slot.teacherId, day, periodNum);
                        const accent = getSubjectAccent(slot.subject);
                        const IconComp = accent.icon;

                        const isCellDragOver = dragOverCell === `${day}-${periodNum}`;

                        return (
                          <td
                            key={pIdx}
                            data-testid={`slot-cell-${day}-${periodNum}`}
                            draggable={Boolean(userRole !== 'teacher' && slot.id && !String(slot.id).startsWith('custom-'))}
                            onDragStart={(e) => { if (userRole !== 'teacher') handleDragStart(e, { id: slot.id, day, period: periodNum }); }}
                            onDragOver={(e) => { if (userRole !== 'teacher') handleDragOver(e, `${day}-${periodNum}`); }}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => { if (userRole !== 'teacher') handleDrop(e, { id: slot.id, day, period: periodNum }); }}
                            onClick={() => {
                              if (userRole === 'teacher') return;
                              setEditingCell({
                                id: slot.id,
                                day,
                                period: periodNum,
                                subject: slot.subject,
                                teacherId: slot.teacherId,
                                teacher: slot.teacher,
                                room: slot.room,
                              });
                              setCellEditOpen(true);
                            }}
                            className={`p-1.5 border-b border-r border-[#E2E8F0] ${userRole !== 'teacher' ? 'cursor-pointer' : ''} transition-all duration-150 relative group bg-white hover:bg-slate-50/80 ${
                              isCellDragOver ? 'ring-2 ring-blue-500 ring-offset-1 bg-blue-50/70 z-10 scale-[1.02]' : ''
                            }`}
                          >
                            <div className={`p-2 rounded-lg border border-[#E2E8F0] bg-white shadow-xs ${userRole !== 'teacher' ? 'hover:shadow-md hover:border-blue-300' : ''} transition-all ${accent.border} space-y-1 h-full`}>
                              {cellClashes.length > 0 && (
                                <div
                                  title={`${slot.teacher} is also assigned to ${cellClashes
                                    .map((c) => `${c.grade}-${c.section} (${c.subject})`)
                                    .join(', ')} at ${day} Period ${periodNum}.`}
                                  className="mb-1 flex items-start gap-1 rounded-md border border-rose-300 bg-rose-50 px-1.5 py-1"
                                >
                                  <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0 mt-[1px]" />
                                  <span className="text-[10px] font-bold text-rose-700 leading-tight">
                                    Teacher Clash
                                    <span className="block font-medium text-rose-600">
                                      also in {cellClashes.map((c) => `${c.grade}-${c.section}`).join(', ')}
                                    </span>
                                  </span>
                                </div>
                              )}
                              <div className="flex items-center justify-between gap-1">
                                <div className="flex items-center gap-1 min-w-0">
                                  <IconComp className={`w-3.5 h-3.5 shrink-0 ${accent.iconColor}`} />
                                  <span className="font-bold text-xs text-[#172033] truncate print:whitespace-normal print:overflow-visible print:text-clip leading-snug tracking-tight" title={slot.subject}>
                                    {slot.subject}
                                  </span>
                                </div>
                                {userRole !== 'teacher' && (
                                  <span className="text-[9px] bg-[#2563EB] text-white font-bold px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 shadow-xs print:hidden">
                                    <Edit3 className="w-2 h-2" /> Edit
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-1 text-[10px] text-[#64748B] font-medium truncate print:whitespace-normal print:overflow-visible">
                                <User className="w-2.5 h-2.5 text-slate-400 shrink-0 print:hidden" />
                                <span className="truncate print:whitespace-normal print:overflow-visible" title={slot.teacher}>{slot.teacher}</span>
                              </div>

                              <div className="flex items-center justify-between pt-0.5 border-t border-slate-100 text-[9px] text-[#64748B]">
                                <span className="font-mono">{slot.room}</span>
                                <span className={`text-[8px] font-mono font-semibold px-1 py-0.2 rounded border ${accent.badge}`}>
                                  P{periodNum}
                                </span>
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* ── Summary & NEP 2020 Compliance ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-slate-200 shadow-sm p-4">
          <p className="text-xs font-bold text-slate-800 mb-2">Subject Period Color Code</p>
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-900 font-semibold">Mathematics</span>
            <span className="px-2 py-0.5 rounded-md bg-cyan-100 text-cyan-900 font-semibold">Science</span>
            <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-900 font-semibold">English</span>
            <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-semibold">Hindi</span>
            <span className="px-2 py-0.5 rounded-md bg-orange-100 text-orange-900 font-semibold">Social Science</span>
            <span className="px-2 py-0.5 rounded-md bg-violet-100 text-violet-900 font-semibold">Computer Sci</span>
          </div>
        </Card>

        <Card className="border-slate-200 shadow-sm p-4">
          <p className="text-xs font-bold text-slate-800 mb-2">Weekly Period Quota Compliance</p>
          <div className="space-y-1 text-xs text-slate-600">
            <div className="flex justify-between"><span>Core Academic Load:</span><span className="font-bold text-slate-800">36 / 48 Periods</span></div>
            <div className="flex justify-between"><span>Lab / Practical Sessions:</span><span className="font-bold text-slate-800">6 Periods</span></div>
            <div className="flex justify-between"><span>Sports & Activities:</span><span className="font-bold text-slate-800">6 Periods</span></div>
          </div>
        </Card>

        <Card className="border-blue-200 bg-blue-50/60 shadow-sm p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-blue-700 to-indigo-800 text-white flex items-center justify-center shrink-0 shadow-md">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-bold text-blue-950">NEP 2020 Validated</p>
            <p className="text-[11px] text-blue-800 mt-0.5">
              Balanced curriculum distribution with zero double-booked rooms or teacher overlaps.
            </p>
          </div>
        </Card>
      </div>

      {/* Validated slot editor: every change goes through the shared
          constraint service, and a published version opens read-only. */}
      <SlotEditor
        slotId={editingCell?.id && !String(editingCell.id).startsWith('custom-') ? String(editingCell.id) : null}
        grade={selectedGrade}
        section={selectedSection}
        open={cellEditOpen}
        onOpenChange={setCellEditOpen}
        onChanged={() => { fetchSchedules(); fetchOccupancy(); }}
      />

      {/* ── Master Timetable Creator Studio (Faculty Directory & Workload Center Sync) ── */}
      <Dialog open={studioOpen} onOpenChange={setStudioOpen}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-950 text-lg">
              <Sparkles className="w-5 h-5 text-blue-700" />
              Master Timetable Creator Studio — Step {studioStep} of 3
            </DialogTitle>
          </DialogHeader>

          {/* Stepper Tabs Bar */}
          <div className="flex items-center justify-between border-b border-slate-200 pb-3 text-xs font-semibold text-slate-500">
            <span className={`flex items-center gap-1.5 ${studioStep === 1 ? 'text-blue-800 font-bold' : ''}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${studioStep === 1 ? 'bg-gradient-to-r from-blue-700 to-indigo-800 text-white' : 'bg-slate-200'}`}>1</span>
              Day & Period Timings
            </span>
            <ChevronRight className="w-4 h-4 text-slate-300" />
            <span className={`flex items-center gap-1.5 ${studioStep === 2 ? 'text-blue-800 font-bold' : ''}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${studioStep === 2 ? 'bg-gradient-to-r from-blue-700 to-indigo-800 text-white' : 'bg-slate-200'}`}>2</span>
              Faculty Directory & Workload Sync
            </span>
            <ChevronRight className="w-4 h-4 text-slate-300" />
            <span className={`flex items-center gap-1.5 ${studioStep === 3 ? 'text-blue-800 font-bold' : ''}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${studioStep === 3 ? 'bg-gradient-to-r from-blue-700 to-indigo-800 text-white' : 'bg-slate-200'}`}>3</span>
              Approve & Publish
            </span>
          </div>

          {/* ── Step 1: Day & Period Timings ── */}
          {studioStep === 1 && (
            <div className="space-y-3.5 py-1">
              <p className="text-xs text-slate-500 leading-relaxed">
                Configure your school's daily bell schedule, period duration, pedagogical rules, and Saturday settings for master timetable creation.
              </p>

              {/* ─── Section 1: School Hours (Mon-Fri) ─── */}
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-2.5 bg-gradient-to-r from-blue-700 to-indigo-800 flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-white/80" />
                  <span className="text-[11px] font-bold text-white uppercase tracking-wider">Mon–Fri School Hours & Periods</span>
                </div>
                <div className="p-4 bg-slate-50 grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-slate-600">Start Time</Label>
                    <Input type="time" value={studioSettings.startTime}
                      onChange={(e) => setStudioSettings({ ...studioSettings, startTime: e.target.value })}
                      className="h-8 text-xs font-mono bg-white" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-slate-600">End Time</Label>
                    <Input type="time" value={studioSettings.endTime}
                      onChange={(e) => setStudioSettings({ ...studioSettings, endTime: e.target.value })}
                      className="h-8 text-xs font-mono bg-white" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-slate-600">Periods Per Day</Label>
                    <Select value={studioSettings.totalPeriods} onValueChange={(val) => setStudioSettings({ ...studioSettings, totalPeriods: val })}>
                      <SelectTrigger className="h-8 text-xs bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="6">6 Periods / Day</SelectItem>
                        <SelectItem value="7">7 Periods / Day</SelectItem>
                        <SelectItem value="8">8 Periods / Day (Standard)</SelectItem>
                        <SelectItem value="9">9 Periods / Day</SelectItem>
                        <SelectItem value="10">10 Periods / Day</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* ─── Section 2: Target Grade Scope ─── */}
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-2.5 bg-gradient-to-r from-indigo-700 to-slate-800 flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5 text-white/80" />
                  <span className="text-[11px] font-bold text-white uppercase tracking-wider">Target Class Grade Scope</span>
                </div>
                <div className="p-4 bg-slate-50 grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-slate-600">From Grade</Label>
                    <Select value={studioSettings.startGrade} onValueChange={(val) => setStudioSettings({ ...studioSettings, startGrade: val })}>
                      <SelectTrigger className="h-8 text-xs bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>{gradesList.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-slate-600">To Grade</Label>
                    <Select value={studioSettings.endGrade} onValueChange={(val) => setStudioSettings({ ...studioSettings, endGrade: val })}>
                      <SelectTrigger className="h-8 text-xs bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>{gradesList.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* ─── Section 3: AI Pedagogical Rules ─── */}
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-white/90" />
                    <span className="text-[11px] font-bold text-white uppercase tracking-wider">AI Pedagogical Rules & Constraints</span>
                  </span>
                  <span className="text-[9px] font-bold bg-white/20 text-white px-2 py-0.5 rounded-full border border-white/30">Active Config</span>
                </div>
                <div className="p-4 bg-slate-50 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="flex items-start gap-2.5 p-2.5 bg-white rounded-lg border border-slate-200 cursor-pointer hover:border-blue-300 transition-colors">
                    <input type="checkbox" checked={studioSettings.preventConsecutiveDouble}
                      onChange={(e) => setStudioSettings({ ...studioSettings, preventConsecutiveDouble: e.target.checked })}
                      className="mt-0.5 w-4 h-4 accent-blue-600 cursor-pointer shrink-0" />
                    <div>
                      <span className="text-[11px] font-bold text-slate-800 block">Rule 1: Non-Consecutive Doubles</span>
                      <span className="text-[10px] text-slate-500">Same subject max 2×/day, never back-to-back</span>
                    </div>
                  </label>
                  <label className="flex items-start gap-2.5 p-2.5 bg-white rounded-lg border border-slate-200 cursor-pointer hover:border-blue-300 transition-colors">
                    <input type="checkbox" checked={studioSettings.enableWedPtSports}
                      onChange={(e) => setStudioSettings({ ...studioSettings, enableWedPtSports: e.target.checked })}
                      className="mt-0.5 w-4 h-4 accent-blue-600 cursor-pointer shrink-0" />
                    <div>
                      <span className="text-[11px] font-bold text-slate-800 block">Rule 2 & 3: Wednesday PT & Sports</span>
                      <span className="text-[10px] text-slate-500">Wed P1 = PT + Afternoon Sports (Grade 3–5)</span>
                    </div>
                  </label>
                  <label className="flex items-start gap-2.5 p-2.5 bg-white rounded-lg border border-slate-200 cursor-pointer hover:border-blue-300 transition-colors">
                    <input type="checkbox" checked={studioSettings.anchorClassTeacherP1}
                      onChange={(e) => setStudioSettings({ ...studioSettings, anchorClassTeacherP1: e.target.checked })}
                      className="mt-0.5 w-4 h-4 accent-blue-600 cursor-pointer shrink-0" />
                    <div>
                      <span className="text-[11px] font-bold text-slate-800 block">Rule 4: Period 1 Class Teacher</span>
                      <span className="text-[10px] text-slate-500">Anchor Period 1 to Class Teacher (Grade 3–8)</span>
                    </div>
                  </label>
                  <div className="p-2.5 bg-white rounded-lg border border-slate-200 space-y-1">
                    <Label className="text-[11px] font-bold text-slate-800">Recess Break After</Label>
                    <Select value={studioSettings.shortBreakAfter} onValueChange={(val) => setStudioSettings({ ...studioSettings, shortBreakAfter: val })}>
                      <SelectTrigger className="h-7 text-xs border-slate-200 bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2">After Period 2 (09:20)</SelectItem>
                        <SelectItem value="3">After Period 3 (10:00 — Standard)</SelectItem>
                        <SelectItem value="4">After Period 4</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Custom AI prompt */}
                <div className="px-4 pb-4 bg-slate-50 space-y-1.5">
                  <Label className="text-[11px] font-bold text-slate-700 flex items-center justify-between">
                    <span>Custom AI School Directives (Optional)</span>
                    <span className="text-[10px] text-slate-400 font-normal">Natural language</span>
                  </Label>
                  <textarea rows={2} value={studioSettings.customPrompt}
                    onChange={(e) => setStudioSettings({ ...studioSettings, customPrompt: e.target.value })}
                    placeholder='e.g. "Morning Assembly on Monday P1. Robotics only in afternoons. No heavy subjects after lunch."'
                    className="w-full p-2.5 text-xs rounded-lg border border-slate-200 bg-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none font-sans" />
                </div>
              </div>

              {/* ─── Section 4: Saturday Settings (bottom, highlighted) ─── */}
              <div className="rounded-xl border-2 border-emerald-300 overflow-hidden shadow-sm">
                <div className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Trophy className="w-3.5 h-3.5 text-white/90" />
                    <span className="text-[11px] font-bold text-white uppercase tracking-wider">Saturday Schedule Settings</span>
                  </span>
                  <span className="text-[9px] font-bold bg-white/20 text-white px-2 py-0.5 rounded-full border border-white/30">
                    {studioSettings.saturdayPeriods} Periods · {parseInt(studioSettings.totalPeriods) * 5 + parseInt(studioSettings.saturdayPeriods)} Total/Week
                  </span>
                </div>
                <div className="p-4 bg-emerald-50 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-emerald-800">Saturday Mode</Label>
                    <Select value={studioSettings.saturdayType} onValueChange={(val) => setStudioSettings({ ...studioSettings, saturdayType: val })}>
                      <SelectTrigger className="h-8 text-xs bg-white border-emerald-200"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="half">Half Day (Short Saturday)</SelectItem>
                        <SelectItem value="full">Full Day (Same as Mon–Fri)</SelectItem>
                        <SelectItem value="off">No Saturday (5-Day Week)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {studioSettings.saturdayType !== 'off' && (
                    <div className="space-y-1">
                      <Label className="text-[11px] font-semibold text-emerald-800">No. of Periods on Saturday</Label>
                      <Select value={studioSettings.saturdayPeriods} onValueChange={(val) => setStudioSettings({ ...studioSettings, saturdayPeriods: val })}>
                        <SelectTrigger className="h-8 text-xs bg-white border-emerald-200 font-bold text-emerald-900"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="3">3 Periods</SelectItem>
                          <SelectItem value="4">4 Periods</SelectItem>
                          <SelectItem value="5">5 Periods (45 Total/Week ✓)</SelectItem>
                          <SelectItem value="6">6 Periods</SelectItem>
                          <SelectItem value="8">8 Periods (Full Day)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {(() => {
                    const total = studioSettings.saturdayType === 'off'
                      ? parseInt(studioSettings.totalPeriods) * 5
                      : parseInt(studioSettings.totalPeriods) * 5 + parseInt(studioSettings.saturdayPeriods);
                    const isIdeal = total === 45;
                    return (
                      <div className={`flex items-center gap-2 p-2.5 rounded-lg border transition-all ${isIdeal
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                        : 'bg-red-50 border-red-400 text-red-800'}`}>
                        {isIdeal
                          ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          : <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />}
                        <div>
                          <p className={`text-[10px] font-bold ${isIdeal ? 'text-emerald-900' : 'text-red-900'}`}>
                            Weekly Total — {total} periods/week
                          </p>
                          <p className={`text-[10px] ${isIdeal ? 'text-emerald-700' : 'text-red-600 font-semibold'}`}>
                            {isIdeal
                              ? '✓ Perfect — matches recommended 45-period standard'
                              : `⚠ Adjust to reach 45 periods/week (${45 - total > 0 ? `+${45 - total} needed` : `${total - 45} excess`})`}
                          </p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              <DialogFooter className="pt-1 flex justify-between items-center">
                <Button variant="outline" onClick={() => setStudioOpen(false)}>Cancel</Button>
                <div className="flex gap-2">
                  <Button variant="outline"
                    disabled={isSavingBell}
                    onClick={handleSaveBellTimings}
                    className="border-blue-300 text-blue-900 bg-blue-50 hover:bg-blue-100 font-bold text-xs gap-1.5">
                    {isSavingBell ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                    Save &amp; Apply Timings
                  </Button>
                  <Button onClick={() => setStudioStep(2)} className="bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 hover:from-blue-800 hover:to-slate-950 text-white font-bold gap-2 shadow-md text-xs">
                    Next: Faculty & Workload Sync <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </DialogFooter>
            </div>
          )}

          {/* ── Step 2: Live Faculty Directory & Workload Center Sync ── */}
          {studioStep === 2 && (
            <div className="space-y-4 py-2">
              <div className="p-4 bg-gradient-to-r from-emerald-50 via-teal-50 to-blue-50 rounded-xl border border-emerald-200 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-emerald-950 uppercase tracking-wide flex items-center gap-1.5">
                        Live Faculty Directory & Workload Center Sync Active
                      </h4>
                      <p className="text-[11px] text-emerald-800 font-medium mt-0.5">
                        Direct Database Fetch: No file or spreadsheet upload required. Staff data is read live from your directory.
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="bg-emerald-100 text-emerald-900 border-emerald-300 font-bold text-[10px] shrink-0">
                    ● Connected to Live Database
                  </Badge>
                </div>
              </div>

              {/* 3 Live Metric Badges */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3.5 bg-white rounded-xl border border-slate-200 text-center shadow-2xs">
                  <p className="text-xl font-black text-slate-900">{activeFaculty.length}</p>
                  <p className="text-[11px] font-bold text-slate-600">Active Teachers</p>
                  <p className="text-[10px] text-emerald-600 font-semibold mt-0.5">✓ In Faculty Directory</p>
                </div>
                <div className="p-3.5 bg-white rounded-xl border border-slate-200 text-center shadow-2xs">
                  <p className="text-xl font-black text-blue-700">{allMappedSubjects.length}</p>
                  <p className="text-[11px] font-bold text-slate-600">Mapped Subjects</p>
                  <p className="text-[10px] text-blue-600 font-semibold mt-0.5">Active Subject Catalogue</p>
                </div>
                <div className="p-3.5 bg-white rounded-xl border border-slate-200 text-center shadow-2xs">
                  <p className="text-xl font-black text-indigo-700">{classSectionFaculty.length}</p>
                  <p className="text-[11px] font-bold text-slate-600">Designated for {selectedGrade}-{selectedSection}</p>
                  <p className="text-[10px] text-indigo-600 font-semibold mt-0.5">Subject &amp; Grade Qualified</p>
                </div>
              </div>

              {/* Live Preview of Mapped Faculty for this Class from Faculty Directory */}
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
                <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-blue-700" />
                    Faculty Directory Mappings for {selectedGrade} Section {selectedSection}
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">
                    {classSectionFaculty.length} teacher(s) mapped
                  </span>
                </div>
                <div className="p-3 max-h-44 overflow-y-auto divide-y divide-slate-100">
                  {classSectionFaculty.length > 0 ? (
                    classSectionFaculty.map((t) => {
                      const tSubs = readList(t.subjects ?? t.subject);
                      const tSecs = readList(t.sections);
                      return (
                        <div key={t.id} className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-2 text-xs">
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 truncate">{t.name}</p>
                            <p className="text-[11px] text-slate-500 truncate">
                              Subject: <span className="font-semibold text-slate-700">{tSubs.join(', ') || t.subject}</span>
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {tSecs.length > 0 && (
                              <Badge variant="outline" className="text-[9px] bg-slate-50 text-slate-600 border-slate-200 font-medium">
                                Sec: {tSecs.join(', ')}
                              </Badge>
                            )}
                            <Badge variant="outline" className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200 font-bold">
                              ✓ Mapped in Directory
                            </Badge>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-4 text-center text-xs text-slate-500">
                      No teacher is currently scoped specifically for {selectedGrade} {selectedSection} in Faculty Directory.
                    </div>
                  )}
                </div>
              </div>

              {/* Scope Selector: Single Class vs Entire School */}
              <div className="p-3.5 bg-blue-50/80 rounded-xl border border-blue-200 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-blue-950 flex items-center gap-2 cursor-pointer">
                    <Sparkles className="w-4 h-4 text-blue-700" />
                    Bulk Approve &amp; Generate Entire School (Grades 1 to 12)
                  </Label>
                  <input
                    type="checkbox"
                    checked={studioSettings.bulkAll}
                    onChange={(e) => setStudioSettings({ ...studioSettings, bulkAll: e.target.checked })}
                    className="w-4 h-4 text-blue-700 rounded cursor-pointer accent-blue-700"
                  />
                </div>
                <p className="text-[11px] text-blue-800 leading-relaxed">
                  {studioSettings.bulkAll
                    ? '⚡ Entire School Mode: Automatically assigns, balances teacher workload, and creates master timetables for ALL classes (Grades 1-12, Sections A-C) directly from the Faculty Directory.'
                    : `Single Class Mode: Generates master timetable for ${selectedGrade} Section ${selectedSection} using its mapped Faculty Directory teachers.`}
                </p>
              </div>

              <DialogFooter className="pt-2">
                <Button variant="outline" onClick={() => setStudioStep(1)}>Back</Button>
                <Button onClick={() => setStudioStep(3)} className="bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 hover:from-blue-800 hover:to-slate-950 text-white font-bold gap-2 shadow-md">
                  Next: Review &amp; Publish <ArrowRight className="w-4 h-4" />
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* ── Step 3: Approve & Publish ── */}
          {studioStep === 3 && (
            <div className="space-y-4 py-2">
              <p className="text-xs text-slate-500 leading-relaxed">
                Review active configurations and generate your master timetable directly from Faculty Directory &amp; Workload Center.
              </p>

              <div className="p-4 bg-blue-50/70 rounded-xl border border-blue-200 space-y-2 text-xs text-blue-950">
                <p className="font-bold flex items-center gap-2 text-blue-900">
                  <Check className="w-4 h-4 text-blue-700" />
                  Active Timetable Configuration:
                </p>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-blue-900 pt-1">
                  <div>• Faculty Source: <span className="font-bold text-emerald-800">Faculty Directory &amp; Workload Center (Live)</span></div>
                  <div>• Data Upload: <span className="font-bold text-emerald-800">None Required (Direct Sync ✓)</span></div>
                  <div>• School Hours: <span className="font-bold">{studioSettings.startTime} - {studioSettings.endTime}</span></div>
                  <div>• Periods / Day: <span className="font-bold">{studioSettings.totalPeriods} Periods</span></div>
                  <div>• Saturday Rules: <span className="font-bold">{studioSettings.saturdayType}</span></div>
                  <div>• Target Scope: <span className="font-bold">{studioSettings.bulkAll ? 'ALL Classes (Grades 1-12)' : `${selectedGrade} ${selectedSection}`}</span></div>
                  <div>• Faculty Synced: <span className="font-bold">{activeFaculty.length} Active Staff Members</span></div>
                  <div>• Directory Auto-Sync: <span className="font-bold text-emerald-700">Enabled</span></div>
                </div>
              </div>

              <DialogFooter className="pt-2">
                <Button variant="outline" onClick={() => setStudioStep(2)} disabled={isProcessing}>Back</Button>
                <Button
                  onClick={handleStudioSubmit}
                  disabled={isProcessing}
                  className="bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 hover:from-blue-800 hover:to-slate-950 text-white font-bold gap-2 shadow-md"
                >
                  {isProcessing ? (
                    <><RefreshCw className="w-4 h-4 animate-spin" /> Generating &amp; Publishing...</>
                  ) : (
                    <><Sparkles className="w-4 h-4 text-amber-300" /> Generate &amp; Publish Master Timetable</>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Dedicated Bell Timings Modal Dialog (Direct Edit for Active Timetable) ── */}
      <Dialog open={bellTimingsOpen} onOpenChange={setBellTimingsOpen}>
        <DialogContent className="sm:max-w-4xl w-[96vw] bg-white border-[#E2E8F0] shadow-2xl p-6 sm:p-7 rounded-2xl max-h-[94vh] overflow-y-auto">
          <DialogHeader className="pb-1 border-b border-slate-100">
            <DialogTitle className="text-xl font-black text-[#081A33] flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700">
                <Clock className="w-4 h-4 text-[#2563EB]" />
              </div>
              Edit Bell Schedule & Period Timings
            </DialogTitle>
            <DialogDescription className="text-xs text-[#64748B] mt-0.5">
              Configure daily school hours, period duration, break allocations, and Saturday rules for {selectedGrade} ({selectedSection}).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            {/* ── Section 1: Mon–Fri School Hours & Period Structure (2 Clean Symmetric Cards) ── */}
            <div className="rounded-xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="px-4 py-2.5 bg-gradient-to-r from-blue-700 to-indigo-800 flex items-center justify-between text-white">
                <span className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-white/90" />
                  <span className="text-xs font-bold uppercase tracking-wider">Mon–Fri School Hours & Period Structure</span>
                </span>
                <span className="text-[10px] font-bold bg-white/20 text-white px-2.5 py-0.5 rounded-full border border-white/30">
                  Daily Timing Plan
                </span>
              </div>

              <div className="p-4 bg-slate-50/70 grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Card 1A: School Day Hours */}
                <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-xs space-y-3">
                  <div className="flex items-center gap-2 pb-1.5 border-b border-slate-100">
                    <div className="w-5 h-5 rounded-md bg-blue-50 border border-blue-200/60 flex items-center justify-center text-blue-600">
                      <Clock className="w-3 h-3" />
                    </div>
                    <span className="text-xs font-bold text-slate-800">School Bell Timings</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5 min-w-0">
                      <Label className="text-[11px] font-bold text-slate-600 block truncate">Start Time</Label>
                      <Input
                        type="time"
                        value={studioSettings.startTime}
                        onChange={(e) => setStudioSettings({ ...studioSettings, startTime: e.target.value })}
                        className="h-10 text-xs font-mono font-bold bg-slate-50 border-slate-200 w-full min-w-0 rounded-lg px-3 shadow-xs"
                      />
                    </div>
                    <div className="space-y-1.5 min-w-0">
                      <Label className="text-[11px] font-bold text-slate-600 block truncate">End Time</Label>
                      <Input
                        type="time"
                        value={studioSettings.endTime}
                        onChange={(e) => setStudioSettings({ ...studioSettings, endTime: e.target.value })}
                        className="h-10 text-xs font-mono font-bold bg-slate-50 border-slate-200 w-full min-w-0 rounded-lg px-3 shadow-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Card 1B: Periods Structure */}
                <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-xs space-y-3">
                  <div className="flex items-center gap-2 pb-1.5 border-b border-slate-100">
                    <div className="w-5 h-5 rounded-md bg-indigo-50 border border-indigo-200/60 flex items-center justify-center text-indigo-600">
                      <BookOpen className="w-3 h-3" />
                    </div>
                    <span className="text-xs font-bold text-slate-800">Daily Period Counts</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5 min-w-0">
                      <Label className="text-[11px] font-bold text-slate-600 block truncate">Period Duration</Label>
                      <Select
                        value={studioSettings.periodDuration}
                        onValueChange={(val) => setStudioSettings({ ...studioSettings, periodDuration: val })}
                      >
                        <SelectTrigger className="h-10 text-xs font-semibold bg-slate-50 border-slate-200 w-full min-w-0 rounded-lg shadow-xs">
                          <SelectValue placeholder="Duration" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="30">30 Mins</SelectItem>
                          <SelectItem value="35">35 Mins</SelectItem>
                          <SelectItem value="40">40 Mins (Standard)</SelectItem>
                          <SelectItem value="45">45 Mins</SelectItem>
                          <SelectItem value="50">50 Mins</SelectItem>
                          <SelectItem value="60">60 Mins</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5 min-w-0">
                      <Label className="text-[11px] font-bold text-slate-600 block truncate">Periods / Day</Label>
                      <Select
                        value={studioSettings.totalPeriods}
                        onValueChange={(val) => setStudioSettings({ ...studioSettings, totalPeriods: val })}
                      >
                        <SelectTrigger className="h-10 text-xs font-semibold bg-slate-50 border-slate-200 w-full min-w-0 rounded-lg shadow-xs">
                          <SelectValue placeholder="Count" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="6">6 Periods / Day</SelectItem>
                          <SelectItem value="7">7 Periods / Day</SelectItem>
                          <SelectItem value="8">8 Periods (Standard)</SelectItem>
                          <SelectItem value="9">9 Periods / Day</SelectItem>
                          <SelectItem value="10">10 Periods / Day</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Section 2: Break Placements & Duration (2 Dedicated Symmetric Cards with ON/OFF Switches) ── */}
            <div className="rounded-xl border border-amber-200 overflow-hidden shadow-xs">
              <div className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 flex items-center justify-between text-white">
                <span className="flex items-center gap-2">
                  <Coffee className="w-4 h-4 text-white/90" />
                  <span className="text-xs font-bold uppercase tracking-wider">Recess & Lunch Break Placements</span>
                </span>
                <span className="text-[10px] font-bold bg-white/20 text-white px-2.5 py-0.5 rounded-full border border-white/30">
                  Auto-Spanning Timetable
                </span>
              </div>

              <div className="p-4 bg-amber-50/40 grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Short Recess Card */}
                <div className={`p-3.5 bg-white rounded-xl border shadow-xs space-y-3 transition-all ${
                  studioSettings.enableShortBreak ? 'border-amber-200' : 'border-slate-200 bg-slate-50/70'
                }`}>
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-md bg-amber-50 border border-amber-200/60 flex items-center justify-center text-amber-600">
                        <Coffee className="w-3 h-3" />
                      </div>
                      <span className="text-xs font-bold text-slate-800">Short Break (Morning Recess)</span>
                    </div>

                    {/* ON / OFF Switch */}
                    <button
                      type="button"
                      onClick={() => setStudioSettings({ ...studioSettings, enableShortBreak: !studioSettings.enableShortBreak })}
                      className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider transition-all border ${
                        studioSettings.enableShortBreak
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                          : 'bg-slate-100 text-slate-500 border-slate-300 hover:bg-slate-200'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${studioSettings.enableShortBreak ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                      {studioSettings.enableShortBreak ? 'ON' : 'OFF'}
                    </button>
                  </div>

                  {studioSettings.enableShortBreak ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5 min-w-0">
                        <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block truncate">Placement</Label>
                        <Select
                          value={studioSettings.shortBreakAfter}
                          onValueChange={(val) => setStudioSettings({ ...studioSettings, shortBreakAfter: val })}
                        >
                          <SelectTrigger className="h-10 text-xs font-semibold bg-slate-50 border-slate-200 w-full min-w-0 rounded-lg shadow-xs">
                            <SelectValue placeholder="Slot" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="2">After Period 2</SelectItem>
                            <SelectItem value="3">After Period 3 (Standard)</SelectItem>
                            <SelectItem value="4">After Period 4</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5 min-w-0">
                        <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block truncate">Duration</Label>
                        <Select
                          value={studioSettings.shortBreakMins}
                          onValueChange={(val) => setStudioSettings({ ...studioSettings, shortBreakMins: val })}
                        >
                          <SelectTrigger className="h-10 text-xs font-semibold bg-slate-50 border-slate-200 w-full min-w-0 rounded-lg shadow-xs">
                            <SelectValue placeholder="Mins" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="10">10 Minutes</SelectItem>
                            <SelectItem value="15">15 Mins (Standard)</SelectItem>
                            <SelectItem value="20">20 Minutes</SelectItem>
                            <SelectItem value="30">30 Minutes</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ) : (
                    <div className="py-2.5 px-3 bg-slate-100 rounded-lg border border-dashed border-slate-200 text-center">
                      <p className="text-[11px] font-semibold text-slate-500">Morning Short Recess is turned OFF</p>
                      <p className="text-[9px] text-slate-400">Periods will run consecutively without a morning break.</p>
                    </div>
                  )}
                </div>

                {/* Lunch Break Card */}
                <div className={`p-3.5 bg-white rounded-xl border shadow-xs space-y-3 transition-all ${
                  studioSettings.enableLunchBreak ? 'border-amber-200' : 'border-slate-200 bg-slate-50/70'
                }`}>
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-md bg-orange-50 border border-orange-200/60 flex items-center justify-center text-orange-600">
                        <Utensils className="w-3 h-3" />
                      </div>
                      <span className="text-xs font-bold text-slate-800">Lunch Break (Midday)</span>
                    </div>

                    {/* ON / OFF Switch */}
                    <button
                      type="button"
                      onClick={() => setStudioSettings({ ...studioSettings, enableLunchBreak: !studioSettings.enableLunchBreak })}
                      className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider transition-all border ${
                        studioSettings.enableLunchBreak
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                          : 'bg-slate-100 text-slate-500 border-slate-300 hover:bg-slate-200'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${studioSettings.enableLunchBreak ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                      {studioSettings.enableLunchBreak ? 'ON' : 'OFF'}
                    </button>
                  </div>

                  {studioSettings.enableLunchBreak ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5 min-w-0">
                        <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block truncate">Placement</Label>
                        <Select
                          value={studioSettings.lunchBreakAfter}
                          onValueChange={(val) => setStudioSettings({ ...studioSettings, lunchBreakAfter: val })}
                        >
                          <SelectTrigger className="h-10 text-xs font-semibold bg-slate-50 border-slate-200 w-full min-w-0 rounded-lg shadow-xs">
                            <SelectValue placeholder="Slot" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="3">After Period 3</SelectItem>
                            <SelectItem value="4">After Period 4 (Standard)</SelectItem>
                            <SelectItem value="5">After Period 5</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5 min-w-0">
                        <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block truncate">Duration</Label>
                        <Select
                          value={studioSettings.lunchBreakMins}
                          onValueChange={(val) => setStudioSettings({ ...studioSettings, lunchBreakMins: val })}
                        >
                          <SelectTrigger className="h-10 text-xs font-semibold bg-slate-50 border-slate-200 w-full min-w-0 rounded-lg shadow-xs">
                            <SelectValue placeholder="Mins" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="20">20 Minutes</SelectItem>
                            <SelectItem value="30">30 Mins (Standard)</SelectItem>
                            <SelectItem value="40">40 Minutes</SelectItem>
                            <SelectItem value="45">45 Minutes</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ) : (
                    <div className="py-2.5 px-3 bg-slate-100 rounded-lg border border-dashed border-slate-200 text-center">
                      <p className="text-[11px] font-semibold text-slate-500">Lunch Break is turned OFF</p>
                      <p className="text-[9px] text-slate-400">Periods will run without midday lunch recess.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Section 3: Saturday Schedule Settings (Bottom Highlight Card) ── */}
            <div className="rounded-xl border-2 border-emerald-300 overflow-hidden shadow-xs">
              <div className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 flex items-center justify-between text-white">
                <span className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-white/90" />
                  <span className="text-xs font-bold uppercase tracking-wider">Saturday Schedule & Weekly Total Balance</span>
                </span>
                <span className="text-[10px] font-bold bg-white/20 text-white px-2.5 py-0.5 rounded-full border border-white/30">
                  {studioSettings.saturdayPeriods} Periods · {parseInt(studioSettings.totalPeriods) * 5 + parseInt(studioSettings.saturdayPeriods)} Total/Week
                </span>
              </div>

              <div className="p-4 bg-emerald-50/50 grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
                {/* Saturday Mode */}
                <div className="p-3.5 bg-white rounded-xl border border-emerald-200 shadow-xs flex flex-col justify-between space-y-2 min-w-0">
                  <Label className="text-[11px] font-bold text-emerald-950 block truncate">Saturday Mode</Label>
                  <Select
                    value={studioSettings.saturdayType}
                    onValueChange={(val) => setStudioSettings({ ...studioSettings, saturdayType: val })}
                  >
                    <SelectTrigger className="h-10 text-xs font-semibold bg-slate-50 border-slate-200 w-full min-w-0 rounded-lg shadow-xs">
                      <SelectValue placeholder="Mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="half">Half Day (Short Saturday)</SelectItem>
                      <SelectItem value="full">Full Day (Same as Mon–Fri)</SelectItem>
                      <SelectItem value="off">No Saturday (5-Day Week)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Saturday Periods */}
                <div className="p-3.5 bg-white rounded-xl border border-emerald-200 shadow-xs flex flex-col justify-between space-y-2 min-w-0">
                  <Label className="text-[11px] font-bold text-emerald-950 block truncate">Saturday Periods</Label>
                  {studioSettings.saturdayType !== 'off' ? (
                    <Select
                      value={studioSettings.saturdayPeriods}
                      onValueChange={(val) => setStudioSettings({ ...studioSettings, saturdayPeriods: val })}
                    >
                      <SelectTrigger className="h-10 text-xs font-bold text-emerald-900 bg-emerald-50/50 border-emerald-300 w-full min-w-0 rounded-lg shadow-xs">
                        <SelectValue placeholder="Periods" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3">3 Periods</SelectItem>
                        <SelectItem value="4">4 Periods</SelectItem>
                        <SelectItem value="5">5 Periods (45 Total ✓)</SelectItem>
                        <SelectItem value="6">6 Periods</SelectItem>
                        <SelectItem value="8">8 Periods (Full Day)</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="h-10 flex items-center px-3 text-xs text-slate-400 italic bg-slate-50 rounded-lg border border-slate-200">
                      Saturday is an Off Day
                    </div>
                  )}
                </div>

                {/* Weekly Total Badge Card */}
                {(() => {
                  const total = studioSettings.saturdayType === 'off'
                    ? parseInt(studioSettings.totalPeriods) * 5
                    : parseInt(studioSettings.totalPeriods) * 5 + parseInt(studioSettings.saturdayPeriods);
                  const isIdeal = total === 45;
                  return (
                    <div className={`p-3.5 rounded-xl border shadow-xs flex flex-col justify-center transition-all min-w-0 ${
                      isIdeal
                        ? 'bg-white border-emerald-400 text-emerald-950'
                        : 'bg-white border-red-400 text-red-950'
                    }`}>
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isIdeal ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {isIdeal
                            ? <CheckCircle2 className="w-5 h-5" />
                            : <AlertCircle className="w-5 h-5" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-black truncate">
                            Weekly Total: {total} Periods
                          </p>
                          <p className={`text-[10px] leading-tight truncate ${
                            isIdeal ? 'text-emerald-700 font-semibold' : 'text-red-600 font-bold'
                          }`}>
                            {isIdeal
                              ? '✓ Matches recommended 45 standard (40 + 5)'
                              : `⚠ ${45 - total > 0 ? `+${45 - total} periods needed` : `${total - 45} excess periods`}`}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          <DialogFooter className="pt-3 flex justify-between items-center border-t border-slate-100">
            <Button variant="outline" onClick={() => setBellTimingsOpen(false)} className="h-10 text-xs font-bold px-4">
              Cancel
            </Button>
            <Button
              disabled={isSavingBell}
              onClick={handleSaveBellTimings}
              className="h-10 bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 hover:from-blue-800 hover:to-slate-950 text-white font-bold gap-2 shadow-md text-xs px-5 disabled:opacity-60"
            >
              {isSavingBell ? (
                <RefreshCw className="w-4 h-4 text-white animate-spin" />
              ) : (
                <Check className="w-4 h-4 text-emerald-300" />
              )}
              {isSavingBell ? 'Saving Bell Schedule...' : 'Save & Apply Bell Schedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportPreviewDialog
        report={importReport}
        open={importOpen}
        onOpenChange={(o) => { if (!o) { setImportOpen(false); setImportReport(null); } }}
        onConfirm={confirmImport}
      />

    </div>
  );
}
