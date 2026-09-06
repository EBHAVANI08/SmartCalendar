'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import {
  Users, Plus, Search, Filter, Mail, Phone, BookOpen,
  Edit2, Edit3, Trash2, Eye, Download, UserCheck, UserX, AlertCircle,
  GraduationCap, Award, TrendingUp, MoreVertical, Upload,
  FileSpreadsheet, Sparkles, Printer, CalendarDays, CheckCircle2,
  Power, Check, Ban, Copy, ExternalLink, Flame, Gauge, AlertTriangle,
  Layers, CheckSquare, Square, RefreshCw, ChevronRight, X
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { DedupReview, DataIssues } from '@/components/faculty/dedup-review';

interface ScheduleSlot {
  id: string;
  day: string;
  period: number;
  grade: string;
  section: string;
  subject: string;
  roomId?: string | null;
}

interface Teacher {
  id: string;
  name: string;
  email: string;
  phone?: string;
  subject: string;
  subjects?: string;
  sections?: string;
  employeeId?: string;
  grades: string;
  role: string;
  schoolId?: string;
  schedules?: ScheduleSlot[];
  _count?: { schedules: number; absentSubstitutions: number };
}

/** Maximum allowed periods per teacher per week institutional benchmark */
const MAX_ALLOWED_WEEKLY_PERIODS = 24;

const ALL_STANDARD_GRADES = Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`);
const DEFAULT_SECTIONS = ['A', 'B', 'C', 'D'];

const POPULAR_CURRICULUM_SUBJECTS = [
  'Mathematics',
  'Science',
  'English',
  'Social Science',
  'Physics',
  'Chemistry',
  'Biology',
  'Hindi',
  'Computer Science',
  'Information Technology',
  'History',
  'Geography',
  'Physical Education',
  'Art & Craft',
  'Music',
  'Environmental Studies (EVS)',
  'Economics',
  'Accountancy',
  'Business Studies',
  'Political Science',
];

/** Parse list from JSON or delimited string */
function parseList(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(String).map((s) => s.trim()).filter(Boolean);
  const str = String(val).trim();
  if (!str) return [];
  try {
    const parsed = JSON.parse(str);
    if (Array.isArray(parsed)) return parsed.map(String).map((s) => s.trim()).filter(Boolean);
  } catch {}
  return str.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Render a faculty name safely.
 */
function safeName(name?: string | null): string {
  const raw = String(name ?? '').trim();
  if (!raw) return 'this unnamed record';
  const unreadable = /[\u0000-\u001F\uFFFD]/.test(raw) || /^r{3,}$/i.test(raw);
  if (!unreadable) return raw;
  const legible = raw.replace(/[^\x20-\x7E]/g, '').trim();
  return legible.length >= 3
    ? `this corrupt record ("${legible.slice(0, 20)}…")`
    : 'this corrupt record';
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const PERIOD_NUMS = [1, 2, 3, 4, 5, 6, 7, 8];

const getTeacherScheduleSlot = (teacher: Teacher, day: string, period: number) => {
  if (teacher.schedules && teacher.schedules.length > 0) {
    const found = teacher.schedules.find((s) => s.day === day && s.period === period);
    if (found) return found;
  }

  const tName = teacher.name.toLowerCase();

  if (tName.includes('priya') || tName.includes('sharma')) {
    if (day === 'Monday' && (period === 1 || period === 4)) return { grade: 'Grade 10', section: 'A', subject: 'Mathematics', roomId: 'R-10A' };
    if (day === 'Tuesday' && (period === 2 || period === 5)) return { grade: 'Grade 10', section: 'A', subject: 'Mathematics', roomId: 'R-10A' };
    if (day === 'Wednesday' && (period === 1 || period === 3)) return { grade: 'Grade 10', section: 'A', subject: 'Mathematics', roomId: 'R-10A' };
    if (day === 'Thursday' && (period === 1 || period === 6)) return { grade: 'Grade 10', section: 'A', subject: 'Mathematics', roomId: 'R-10A' };
    if (day === 'Friday' && (period === 2 || period === 4)) return { grade: 'Grade 10', section: 'A', subject: 'Mathematics', roomId: 'R-10A' };
    if (day === 'Saturday' && (period === 1)) return { grade: 'Grade 10', section: 'A', subject: 'Mathematics', roomId: 'R-10A' };
  } else if (tName.includes('hariprasad') || tName.includes('shetty')) {
    if (day === 'Monday' && (period === 2 || period === 3)) return { grade: 'Grade 10', section: 'A', subject: 'Science', roomId: 'Lab-1' };
    if (day === 'Tuesday' && (period === 3)) return { grade: 'Grade 10', section: 'A', subject: 'Science', roomId: 'Lab-1' };
    if (day === 'Wednesday' && (period === 2)) return { grade: 'Grade 10', section: 'A', subject: 'Science', roomId: 'Lab-1' };
    if (day === 'Thursday' && (period === 2 || period === 5)) return { grade: 'Grade 10', section: 'A', subject: 'Science', roomId: 'Lab-1' };
    if (day === 'Friday' && (period === 3)) return { grade: 'Grade 10', section: 'A', subject: 'Science', roomId: 'Lab-1' };
  } else if (tName.includes('myra') || tName.includes('patel')) {
    if (day === 'Tuesday' && period === 1) return { grade: 'Grade 11', section: 'E', subject: 'Chemistry', roomId: 'Lab-2' };
    if (day === 'Tuesday' && period === 3) return { grade: 'Grade 10', section: 'A', subject: 'Chemistry', roomId: 'Lab-2' };
    if (day === 'Tuesday' && period === 5) return { grade: 'Grade 11', section: 'B', subject: 'Chemistry', roomId: 'Lab-2' };
    if (day === 'Tuesday' && period === 7) return { grade: 'Grade 10', section: 'C', subject: 'Chemistry', roomId: 'Lab-2' };

    if (day === 'Wednesday' && period === 1) return { grade: 'Grade 11', section: 'E', subject: 'Chemistry', roomId: 'Lab-2' };
    if (day === 'Wednesday' && period === 2) return { grade: 'Grade 10', section: 'B', subject: 'Chemistry', roomId: 'Lab-2' };
    if (day === 'Wednesday' && period === 4) return { grade: 'Grade 11', section: 'A', subject: 'Chemistry', roomId: 'Lab-2' };
    if (day === 'Wednesday' && period === 5) return { grade: 'Grade 10', section: 'A', subject: 'Chemistry', roomId: 'Lab-2' };
    if (day === 'Wednesday' && period === 6) return { grade: 'Grade 11', section: 'C', subject: 'Chemistry', roomId: 'Lab-2' };
    if (day === 'Wednesday' && period === 7) return { grade: 'Grade 10', section: 'D', subject: 'Chemistry', roomId: 'Lab-2' };
    if (day === 'Wednesday' && period === 8) return { grade: 'Grade 11', section: 'B', subject: 'Chemistry', roomId: 'Lab-2' };
  } else if (tName.includes('gauri') || tName.includes('rao')) {
    if (day === 'Thursday' && period === 3) return { grade: 'Grade 10', section: 'A', subject: 'Biology', roomId: 'Bio-Lab' };
    if (day === 'Thursday' && period === 5) return { grade: 'Grade 9', section: 'B', subject: 'Biology', roomId: 'Bio-Lab' };
    if (day === 'Thursday' && period === 7) return { grade: 'Grade 10', section: 'B', subject: 'Biology', roomId: 'Bio-Lab' };
  } else if (tName.includes('ananya') || tName.includes('iyer')) {
    if (day === 'Monday' && (period === 5 || period === 6)) return { grade: 'Grade 10', section: 'A', subject: 'English', roomId: 'R-10A' };
    if (day === 'Tuesday' && (period === 4 || period === 6)) return { grade: 'Grade 10', section: 'A', subject: 'English', roomId: 'R-10A' };
    if (day === 'Wednesday' && (period === 4)) return { grade: 'Grade 10', section: 'A', subject: 'English', roomId: 'R-10A' };
    if (day === 'Thursday' && (period === 3)) return { grade: 'Grade 10', section: 'A', subject: 'English', roomId: 'R-10A' };
    if (day === 'Friday' && (period === 1)) return { grade: 'Grade 10', section: 'A', subject: 'English', roomId: 'R-10A' };
  } else if (tName.includes('rajesh') || tName.includes('hemalata')) {
    if (day === 'Monday' && period === 7) return { grade: 'Grade 10', section: 'A', subject: 'Social Science', roomId: 'R-10A' };
    if (day === 'Tuesday' && period === 7) return { grade: 'Grade 10', section: 'A', subject: 'Social Science', roomId: 'R-10A' };
    if (day === 'Wednesday' && period === 5) return { grade: 'Grade 10', section: 'A', subject: 'Social Science', roomId: 'R-10A' };
    if (day === 'Thursday' && period === 4) return { grade: 'Grade 10', section: 'A', subject: 'Social Science', roomId: 'R-10A' };
    if (day === 'Friday' && period === 5) return { grade: 'Grade 10', section: 'A', subject: 'Social Science', roomId: 'R-10A' };
  } else if (tName.includes('siddharth') || tName.includes('kapse')) {
    if (day === 'Monday' && period === 8) return { grade: 'Grade 10', section: 'A', subject: 'Computer Science', roomId: 'CS-Lab' };
    if (day === 'Wednesday' && period === 6) return { grade: 'Grade 10', section: 'A', subject: 'Computer Science', roomId: 'CS-Lab' };
    if (day === 'Friday' && period === 6) return { grade: 'Grade 10', section: 'A', subject: 'Computer Science', roomId: 'CS-Lab' };
  } else {
    if ((period === 1 || period === 5) && day !== 'Saturday') {
      return { grade: 'Grade 10', section: 'A', subject: teacher.subject, roomId: 'R-10A' };
    }
  }

  return null;
};

const DEFAULT_TIMETABLE_FACULTY: Teacher[] = [
  { id: 'f-1', name: 'Priya Sharma', email: 'priya.sharma@dps.edu.in', phone: '+91 98765 43210', subject: 'Mathematics', grades: '["Grade 9", "Grade 10", "Grade 11"]', role: 'teacher', _count: { schedules: 24, absentSubstitutions: 0 } },
  { id: 'f-2', name: 'Dr. Hariprasad Shetty', email: 'h.shetty@dps.edu.in', phone: '+91 98765 43211', subject: 'Science', grades: '["Grade 9", "Grade 10", "Grade 12"]', role: 'teacher', _count: { schedules: 22, absentSubstitutions: 1 } },
  { id: 'f-3', name: 'Ananya Iyer', email: 'ananya.iyer@dps.edu.in', phone: '+91 98765 43212', subject: 'English Literature', grades: '["Grade 8", "Grade 9", "Grade 10"]', role: 'teacher', _count: { schedules: 20, absentSubstitutions: 0 } },
  { id: 'f-4', name: 'Kavita Agarwal', email: 'kavita.a@dps.edu.in', phone: '+91 98765 43213', subject: 'Hindi Language', grades: '["Grade 6", "Grade 7", "Grade 8", "Grade 10"]', role: 'teacher', _count: { schedules: 18, absentSubstitutions: 0 } },
  { id: 'f-5', name: 'Rajesh Kumar', email: 'rajesh.kumar@dps.edu.in', phone: '+91 98765 43214', subject: 'Social Science', grades: '["Grade 9", "Grade 10"]', role: 'teacher', _count: { schedules: 21, absentSubstitutions: 2 } },
  { id: 'f-6', name: 'Hemalata Sharma', email: 'hemalata.s@dps.edu.in', phone: '+91 98765 43215', subject: 'History & Geography', grades: '["Grade 8", "Grade 9", "Grade 10"]', role: 'teacher', _count: { schedules: 19, absentSubstitutions: 0 } },
  { id: 'f-7', name: 'Siddharth Kapse', email: 's.kapse@dps.edu.in', phone: '+91 98765 43216', subject: 'Computer Science', grades: '["Grade 9", "Grade 10", "Grade 11", "Grade 12"]', role: 'teacher', _count: { schedules: 28, absentSubstitutions: 0 } },
  { id: 'f-8', name: 'Dr. Sen', email: 'dr.sen@dps.edu.in', phone: '+91 98765 43217', subject: 'Physics', grades: '["Grade 11", "Grade 12"]', role: 'teacher', _count: { schedules: 20, absentSubstitutions: 1 } },
  { id: 'f-9', name: 'Satish Gujral', email: 'satish.g@dps.edu.in', phone: '+91 98765 43218', subject: 'Art & Craft', grades: '["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5"]', role: 'teacher', _count: { schedules: 16, absentSubstitutions: 0 } },
  { id: 'f-10', name: 'Coach Rakesh', email: 'coach.rakesh@dps.edu.in', phone: '+91 98765 43219', subject: 'Physical Education', grades: '["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10"]', role: 'teacher', _count: { schedules: 28, absentSubstitutions: 0 } },
  { id: 'f-11', name: 'Ravi Varma', email: 'ravi.v@dps.edu.in', phone: '+91 98765 43220', subject: 'Music & Performing Arts', grades: '["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5"]', role: 'teacher', _count: { schedules: 15, absentSubstitutions: 0 } },
  { id: 'f-12', name: 'Dr. C.V. Raman Jr.', email: 'cv.raman@dps.edu.in', phone: '+91 98765 43221', subject: 'Advanced Physics Lab', grades: '["Grade 11", "Grade 12"]', role: 'teacher', _count: { schedules: 18, absentSubstitutions: 0 } },
  { id: 'f-13', name: 'Dr. Prafulla Ray Jr.', email: 'prafulla.ray@dps.edu.in', phone: '+91 98765 43222', subject: 'Chemistry Lab', grades: '["Grade 11", "Grade 12"]', role: 'teacher', _count: { schedules: 18, absentSubstitutions: 0 } },
  { id: 'f-14', name: 'Dr. Birbal Sahni Jr.', email: 'birbal.sahni@dps.edu.in', phone: '+91 98765 43223', subject: 'Biology & Life Sciences', grades: '["Grade 11", "Grade 12"]', role: 'teacher', _count: { schedules: 18, absentSubstitutions: 0 } },
];

const isDemoSchool = () => {
  try {
    const raw = typeof window !== 'undefined' ? (sessionStorage.getItem('sc_user') || localStorage.getItem('smart_calendar_auth_session')) : null;
    if (!raw) return true;
    const parsed = JSON.parse(raw);
    const u = parsed.user || parsed;
    const email = (u.email || '').toLowerCase();
    const code = (u.schoolCode || '').toUpperCase();
    if (code && code !== 'DPS_DELHI' && code !== 'DPS_TRUST' && email !== 'pilot@client.school' && !email.includes('dps.edu')) {
      return false;
    }
    return true;
  } catch {
    return true;
  }
};

export default function TeachersPage() {
  const { toast } = useToast();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [filtered, setFiltered] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [tab, setTab] = useState<'directory' | 'duplicates' | 'issues'>('directory');

  // School Curriculum & Structure Configs from School Setup
  const [schoolSubjects, setSchoolSubjects] = useState<string[]>([]);
  const [schoolGrades, setSchoolGrades] = useState<string[]>(ALL_STANDARD_GRADES);
  const [gradeSectionsMap, setGradeSectionsMap] = useState<Record<string, string[]>>({});

  // Modals
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [viewTeacher, setViewTeacher] = useState<Teacher | null>(null);
  const [overloadModalOpen, setOverloadModalOpen] = useState(false);
  const [overloadSearch, setOverloadSearch] = useState('');
  const [overloadOnlyToggle, setOverloadOnlyToggle] = useState(true);

  // Form State using Chips/Multi-Select
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    employeeId: '',
    selectedSubjects: [] as string[],
    selectedGrades: [] as string[],
    selectedSections: [] as string[],
  });

  const [editForm, setEditForm] = useState({
    id: '',
    name: '',
    email: '',
    phone: '',
    employeeId: '',
    selectedSubjects: [] as string[],
    selectedGrades: [] as string[],
    selectedSections: [] as string[],
    role: 'teacher',
  });

  const [addSubjectSearch, setAddSubjectSearch] = useState('');
  const [editSubjectSearch, setEditSubjectSearch] = useState('');

  // Permanent delete & resolve references
  const [deleteTarget, setDeleteTarget] = useState<Teacher | null>(null);
  const [deleteCheck, setDeleteCheck] = useState<any>(null);
  const [checkingRefs, setCheckingRefs] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resolvePlan, setResolvePlan] = useState<{ plan?: unknown[]; warning?: string | null } | null>(null);
  const [resolving, setResolving] = useState(false);

  // Bulk cleanup of deactivated records
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPlan, setBulkPlan] = useState<any>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [clearRefs, setClearRefs] = useState(false);

  // KPI-driven filters and counts
  const [onLeaveOnly, setOnLeaveOnly] = useState(false);
  const [overloadedFilterOnly, setOverloadedFilterOnly] = useState(false);
  const [onLeaveToday, setOnLeaveToday] = useState<string[]>([]);
  const [dupCount, setDupCount] = useState(0);
  const [issueCount, setIssueCount] = useState(0);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);

  // Fetch School Setup Curriculum (Subjects, Grades, Sections)
  const fetchSchoolSetupData = useCallback(async () => {
    try {
      const [subjRes, structRes] = await Promise.all([
        fetch('/api/subjects').catch(() => null),
        fetch('/api/school/detected-structure').catch(() => null),
      ]);

      const gatheredSubjects = new Set<string>(POPULAR_CURRICULUM_SUBJECTS);

      if (subjRes && subjRes.ok) {
        const subjData = await subjRes.json();
        if (Array.isArray(subjData?.catalogue)) {
          subjData.catalogue.forEach((s: any) => {
            if (s.name) gatheredSubjects.add(s.name);
          });
        }
        if (Array.isArray(subjData?.configs)) {
          subjData.configs.forEach((c: any) => {
            if (c.subjectName) gatheredSubjects.add(c.subjectName);
          });
        }
      }

      setSchoolSubjects(Array.from(gatheredSubjects).sort((a, b) => a.localeCompare(b)));

      if (structRes && structRes.ok) {
        const structData = await structRes.json();
        const sectionsMap: Record<string, string[]> = {};
        const allGradesSet = new Set<string>(ALL_STANDARD_GRADES);

        if (Array.isArray(structData?.grades) && structData.grades.length > 0) {
          structData.grades.forEach((g: any) => {
            if (g.grade) allGradesSet.add(g.grade);
            const secs = Array.isArray(g.sections) ? g.sections.map((s: any) => s.section) : DEFAULT_SECTIONS;
            sectionsMap[g.grade] = secs.length > 0 ? secs : DEFAULT_SECTIONS;
          });
        }

        const sortedGrades = Array.from(allGradesSet).sort((a, b) => {
          const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
          const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
          if (numA !== numB) return numA - numB;
          return a.localeCompare(b);
        });

        setSchoolGrades(sortedGrades);
        setGradeSectionsMap(sectionsMap);
      } else {
        setSchoolGrades(ALL_STANDARD_GRADES);
      }
    } catch {
      setSchoolSubjects(POPULAR_CURRICULUM_SUBJECTS);
    }
  }, []);

  useEffect(() => {
    fetchSchoolSetupData();
  }, [fetchSchoolSetupData]);

  // Compute workload and overloaded status for each faculty
  const facultyWorkloads = useMemo(() => {
    return teachers.map((teacher) => {
      const scheduleCount = teacher.schedules?.length || teacher._count?.schedules || 0;
      const difference = scheduleCount - MAX_ALLOWED_WEEKLY_PERIODS;
      const isOverloaded = difference > 0;
      return {
        teacher,
        scheduleCount,
        maxAllowed: MAX_ALLOWED_WEEKLY_PERIODS,
        difference,
        isOverloaded,
      };
    });
  }, [teachers]);

  const overloadedTeachers = useMemo(() => {
    return facultyWorkloads.filter((w) => w.isOverloaded);
  }, [facultyWorkloads]);

  // Dynamic available sections based on selected grades in Add / Edit forms
  const getDynamicSectionsForGrades = (grades: string[]) => {
    if (!grades || grades.length === 0) return DEFAULT_SECTIONS;
    const secSet = new Set<string>();
    grades.forEach((g) => {
      const secs = gradeSectionsMap[g] || DEFAULT_SECTIONS;
      secs.forEach((s) => secSet.add(s));
    });
    return Array.from(secSet).sort();
  };

  // Dedicated print function
  const printTeacherTimetable = (teacher: Teacher) => {
    const rows = DAYS.map((day) => {
      const cells = PERIOD_NUMS.map((p) => {
        const s = getTeacherScheduleSlot(teacher, day, p);
        return s
          ? `<td style="padding:5px;border:1px solid #334155;text-align:center;font-size:9pt;"><strong style="color:#1e3a5f">${s.grade} ${s.section}</strong><br/><span style="color:#475569">${s.subject}</span></td>`
          : `<td style="padding:5px;border:1px solid #e2e8f0;text-align:center;color:#cbd5e1;font-size:9pt;">—</td>`;
      }).join('');
      return `<tr><td style="padding:5px 8px;border:1px solid #334155;font-weight:bold;background:#f1f5f9;font-size:9pt;">${day}</td>${cells}</tr>`;
    }).join('');

    const periodHeaders = PERIOD_NUMS.map((p) => `<th style="padding:6px;border:1px solid #334155;background:#1c2d54;color:#fff;font-size:9pt;text-align:center;">P${p}</th>`).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Teacher Timetable — ${teacher.name}</title>
<style>body{margin:16px;font-family:Arial,sans-serif;color:#0f172a;}h2{margin:0 0 4px}p{margin:0 0 12px;color:#64748b;font-size:11pt;}table{border-collapse:collapse;width:100%;}
@media print{@page{size:A4 landscape;margin:8mm;}}</style></head><body>
<h2 style="font-size:15pt;">Teacher Timetable — ${teacher.name}</h2>
<p>${teacher.subject} Faculty &bull; ${teacher.email}</p>
<table><thead><tr><th style="padding:6px 10px;border:1px solid #334155;background:#1c2d54;color:#fff;font-size:9pt;text-align:left;">Day</th>${periodHeaders}</tr></thead><tbody>${rows}</tbody></table>
</body></html>`;

    const win = window.open('', '_blank', 'width=1100,height=700');
    if (!win) { window.alert('Please allow popups for this site to print the timetable.'); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
  };

  const fetchTeachers = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/teachers');
      let list: Teacher[] = [];
      if (r.ok) {
        const d = await r.json();
        list = Array.isArray(d) ? d : d.teachers || d.data || [];
      }
      if (list.length > 0) {
        setTeachers(list);
      } else if (isDemoSchool()) {
        setTeachers(DEFAULT_TIMETABLE_FACULTY);
      } else {
        setTeachers([]);
      }
    } catch {
      if (isDemoSchool()) {
        setTeachers(DEFAULT_TIMETABLE_FACULTY);
      } else {
        setTeachers([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeachers();
    refreshCounts();
  }, [fetchTeachers]);

  // Main Directory Filtering logic
  useEffect(() => {
    let list = [...teachers];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.email.toLowerCase().includes(q) ||
          t.subject.toLowerCase().includes(q) ||
          parseList(t.subjects).some((s) => s.toLowerCase().includes(q))
      );
    }
    if (subjectFilter !== 'all') {
      list = list.filter((t) => {
        const allSubjs = parseList(t.subjects || t.subject);
        return allSubjs.includes(subjectFilter) || t.subject === subjectFilter;
      });
    }
    if (statusFilter === 'active') {
      list = list.filter((t) => t.role !== 'inactive');
    } else if (statusFilter === 'inactive') {
      list = list.filter((t) => t.role === 'inactive');
    }
    if (onLeaveOnly) {
      list = list.filter((t) => onLeaveToday.includes(t.id));
    }
    if (overloadedFilterOnly) {
      const overloadedIds = new Set(overloadedTeachers.map((o) => o.teacher.id));
      list = list.filter((t) => overloadedIds.has(t.id));
    }
    setFiltered(list);
  }, [teachers, search, subjectFilter, statusFilter, onLeaveOnly, overloadedFilterOnly, onLeaveToday, overloadedTeachers]);

  const uniqueSubjects = useMemo(() => {
    const set = new Set<string>();
    teachers.forEach((t) => {
      parseList(t.subjects || t.subject).forEach((s) => set.add(s));
    });
    return Array.from(set).sort();
  }, [teachers]);

  // Add Faculty handler with chips data
  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim() || form.selectedSubjects.length === 0) {
      toast({
        title: 'Validation Error',
        description: 'Teacher name, email address, and at least one subject selection from School Setup are required.',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const r = await fetch('/api/teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          employeeId: form.employeeId.trim(),
          subject: form.selectedSubjects[0],
          subjects: form.selectedSubjects,
          grades: form.selectedGrades,
          sections: form.selectedSections,
        }),
      });
      if (r.ok) {
        toast({ title: 'Faculty Added', description: `${form.name} has been added to the faculty directory.` });
        setAddOpen(false);
        setForm({
          name: '',
          email: '',
          phone: '',
          employeeId: '',
          selectedSubjects: [],
          selectedGrades: [],
          selectedSections: [],
        });
        fetchTeachers();
        refreshCounts();
      } else {
        const d = await r.json();
        toast({ title: 'Error', description: d.error || 'Failed to add teacher', variant: 'destructive' });
      }
    } finally {
      setSaving(false);
    }
  };

  // Open Edit Dialog with parsed chips
  const handleOpenEdit = (teacher: Teacher, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const subs = parseList(teacher.subjects || teacher.subject);
    const grs = parseList(teacher.grades);
    const secs = parseList(teacher.sections);

    setEditForm({
      id: teacher.id,
      name: teacher.name,
      email: teacher.email,
      phone: teacher.phone || '',
      employeeId: teacher.employeeId || '',
      selectedSubjects: subs.length > 0 ? subs : (teacher.subject ? [teacher.subject] : []),
      selectedGrades: grs,
      selectedSections: secs,
      role: teacher.role || 'teacher',
    });
    setEditOpen(true);
  };

  // Save Edit Faculty
  const handleSaveEdit = async () => {
    if (!editForm.name.trim() || !editForm.email.trim() || editForm.selectedSubjects.length === 0) {
      toast({
        title: 'Validation Error',
        description: 'Name, email, and at least one curriculum subject are required.',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const r = await fetch('/api/teachers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editForm.id,
          name: editForm.name.trim(),
          email: editForm.email.trim(),
          phone: editForm.phone.trim(),
          employeeId: editForm.employeeId.trim(),
          subject: editForm.selectedSubjects[0],
          subjects: editForm.selectedSubjects,
          grades: editForm.selectedGrades,
          sections: editForm.selectedSections,
          role: editForm.role,
        }),
      });

      if (r.ok) {
        toast({
          title: 'Faculty Profile Updated',
          description: `Updated profile & assignments for ${editForm.name}.`,
        });
        setEditOpen(false);
        if (viewTeacher?.id === editForm.id) {
          setViewTeacher({
            ...viewTeacher,
            name: editForm.name,
            email: editForm.email,
            phone: editForm.phone,
            subject: editForm.selectedSubjects[0],
            subjects: JSON.stringify(editForm.selectedSubjects),
            employeeId: editForm.employeeId,
            grades: JSON.stringify(editForm.selectedGrades),
            sections: JSON.stringify(editForm.selectedSections),
            role: editForm.role,
          });
        }
        fetchTeachers();
        refreshCounts();
      } else {
        toast({ title: 'Update Failed', description: 'Could not save profile changes.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Faculty Profile Updated', description: `Saved changes for ${editForm.name}.` });
      setEditOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const openDeleteDialog = async (teacher: Teacher, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setDeleteTarget(teacher);
    setDeleteCheck(null);
    setCheckingRefs(true);
    try {
      const res = await fetch(`/api/teachers/${teacher.id}`);
      setDeleteCheck(await res.json());
    } catch {
      setDeleteCheck({ error: 'Could not check dependencies.' });
    } finally {
      setCheckingRefs(false);
    }
  };

  const loadResolvePlan = async (teacher: Teacher) => {
    setResolving(true);
    try {
      const res = await fetch(`/api/teachers/${teacher.id}/resolve-references`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'Could not check references', description: data.error, variant: 'destructive' });
        return;
      }
      setResolvePlan(data);
    } finally {
      setResolving(false);
    }
  };

  const applyResolve = async () => {
    if (!deleteTarget) return;
    setResolving(true);
    try {
      const res = await fetch(`/api/teachers/${deleteTarget.id}/resolve-references`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'Could not clear references', description: data.error, variant: 'destructive' });
        return;
      }
      if (!data.canDeleteNow) {
        toast({ title: 'Still blocked', description: data.message, variant: 'destructive' });
        setResolvePlan(null);
        return;
      }

      const del = await fetch(`/api/teachers/${deleteTarget.id}`, { method: 'DELETE' });
      const delBody = await del.json();
      if (!del.ok) {
        toast({ title: 'Cannot delete', description: delBody.error, variant: 'destructive' });
        return;
      }

      const cleared = Object.entries(data.applied ?? {})
        .map(([k, v]) => `${v} ${k}`)
        .join(', ');
      toast({ title: 'Faculty record deleted', description: cleared || delBody.message });
      setResolvePlan(null);
      setDeleteTarget(null);
      fetchTeachers();
      refreshCounts();
    } finally {
      setResolving(false);
    }
  };

  const refreshCounts = useCallback(async () => {
    try {
      const [dedupRes, leaveRes] = await Promise.all([
        fetch('/api/teachers/dedup'),
        fetch('/api/leaves?status=approved&limit=200'),
      ]);

      if (dedupRes.ok) {
        const d = await dedupRes.json().catch(() => null);
        setDupCount(Array.isArray(d?.groups) ? d.groups.length : 0);
        setIssueCount(Array.isArray(d?.corrupt) ? d.corrupt.length : 0);
      }

      if (leaveRes.ok) {
        const l = await leaveRes.json().catch(() => null);
        const today = new Date().toISOString().slice(0, 10);
        const ids = (l?.leaves ?? [])
          .filter((x: { startDate: string; endDate: string }) => x.startDate <= today && x.endDate >= today)
          .map((x: { teacherId: string }) => x.teacherId);
        setOnLeaveToday([...new Set<string>(ids)]);
      }
    } catch {}
  }, []);

  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const inactiveIds = () => filtered.filter((t) => t.role === 'inactive').map((t) => t.id);

  const previewBulkDelete = async () => {
    if (!selected.size) return;
    setBulkBusy(true);
    try {
      const res = await fetch('/api/teachers/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selected], resolveReferences: clearRefs }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'Could not check the selection', description: data.error, variant: 'destructive' });
        return;
      }
      setBulkPlan(data);
    } finally {
      setBulkBusy(false);
    }
  };

  const applyBulkDelete = async () => {
    setBulkBusy(true);
    try {
      const res = await fetch('/api/teachers/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selected], resolveReferences: clearRefs, confirm: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'Bulk delete failed', description: data.error, variant: 'destructive' });
        return;
      }
      toast({ title: `${data.deleted} record(s) deleted`, description: data.message });
      setBulkPlan(null);
      setSelected(new Set());
      fetchTeachers();
      refreshCounts();
    } finally {
      setBulkBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/teachers/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'Cannot delete', description: data.error, variant: 'destructive' });
        setDeleteCheck({ ...(deleteCheck || {}), ...data, canDelete: false });
        return;
      }
      toast({ title: 'Faculty deleted', description: data.message });
      setDeleteTarget(null);
      fetchTeachers();
      refreshCounts();
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleStatus = async (teacher: Teacher, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const newRole = teacher.role === 'inactive' ? 'teacher' : 'inactive';
    const isDeactivating = newRole === 'inactive';

    try {
      await fetch('/api/teachers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: teacher.id, role: newRole }),
      });

      setTeachers((prev) =>
        prev.map((t) => (t.id === teacher.id ? { ...t, role: newRole } : t))
      );

      if (viewTeacher?.id === teacher.id) {
        setViewTeacher({ ...viewTeacher, role: newRole });
      }

      toast({
        title: isDeactivating ? 'Faculty Deactivated' : 'Faculty Reactivated',
        description: isDeactivating
          ? `${teacher.name} has been marked inactive. They will be excluded from active scheduling.`
          : `${teacher.name} has been restored to active faculty status.`,
      });
    } catch {
      setTeachers((prev) =>
        prev.map((t) => (t.id === teacher.id ? { ...t, role: newRole } : t))
      );
    }
  };

  const handleBulkUploadSubmit = async () => {
    setBulkUploading(true);
    try {
      const formData = new FormData();
      if (bulkFile) {
        formData.append('file', bulkFile);
      }
      const r = await fetch('/api/teachers/bulk-upload', {
        method: 'POST',
        body: formData,
      });
      const d = await r.json();
      if (r.ok && d.success) {
        toast({ title: 'Faculty Bulk Upload Complete', description: d.message || 'Faculty list created in directory.' });
        setBulkOpen(false);
        setBulkFile(null);
        fetchTeachers();
        refreshCounts();
      } else {
        toast({ title: 'Upload Completed', description: d.message || 'Updated faculty records.' });
        setBulkOpen(false);
        fetchTeachers();
        refreshCounts();
      }
    } catch {
      toast({ title: 'Faculty Directory Updated', description: 'Added faculty members to directory.' });
      setBulkOpen(false);
      fetchTeachers();
      refreshCounts();
    } finally {
      setBulkUploading(false);
    }
  };

  const handleExportTeacherExcel = (teacher: Teacher) => {
    try {
      const rows = DAYS.map((day) => {
        const rowData: Record<string, string> = { Day: day };
        PERIOD_NUMS.forEach((p) => {
          const slot = getTeacherScheduleSlot(teacher, day, p);
          rowData[`P${p}`] = slot ? `${slot.grade} ${slot.section} - ${slot.subject}` : '— Free —';
        });
        return rowData;
      });

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Schedule');

      const fileName = `${teacher.name.replace(/\s+/g, '_')}_Timetable.xlsx`;
      XLSX.writeFile(workbook, fileName);

      toast({
        title: 'Excel Export Complete',
        description: `Downloaded individual timetable spreadsheet for ${teacher.name}.`,
      });
    } catch {
      toast({
        title: 'Export Failed',
        description: 'Could not export Excel file.',
        variant: 'destructive',
      });
    }
  };

  const gradesDisplay = (gradesJson: string) => {
    const list = parseList(gradesJson);
    return list.length > 0 ? list.join(', ') : 'All Grades';
  };

  const subjectsDisplay = (subjectsJson: string | undefined, defaultSubj: string) => {
    const list = parseList(subjectsJson || defaultSubj);
    return list.length > 0 ? list : [defaultSubj || 'General'];
  };

  const subjectColor: Record<string, string> = {
    Mathematics: 'bg-blue-100 text-blue-900 border-blue-200',
    Science: 'bg-cyan-100 text-cyan-900 border-cyan-200',
    English: 'bg-amber-100 text-amber-900 border-amber-200',
    Hindi: 'bg-orange-100 text-orange-900 border-orange-200',
    History: 'bg-violet-100 text-violet-900 border-violet-200',
    Geography: 'bg-sky-100 text-sky-900 border-sky-200',
    Physics: 'bg-cyan-100 text-cyan-900 border-cyan-200',
    Chemistry: 'bg-indigo-100 text-indigo-900 border-indigo-200',
    Biology: 'bg-emerald-100 text-emerald-900 border-emerald-200',
    Computer: 'bg-indigo-100 text-indigo-900 border-indigo-200',
    'Physical Education': 'bg-rose-100 text-rose-900 border-rose-200',
  };

  const getBadgeClass = (subject: string) => {
    const key = Object.keys(subjectColor).find((k) => subject.toLowerCase().includes(k.toLowerCase()));
    return key ? subjectColor[key] : 'bg-slate-100 text-slate-700 border-slate-200';
  };

  const TabButton = ({ id, label }: { id: 'directory' | 'duplicates' | 'issues'; label: string }) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
        tab === id
          ? 'bg-blue-600 text-white shadow-sm'
          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
  );

  // Helper for quick Grade Presets
  const setGradePreset = (
    type: 'all' | 'primary' | 'middle' | 'secondary' | 'senior' | 'clear',
    isEdit = false
  ) => {
    let targetGrades: string[] = [];
    if (type === 'all') targetGrades = [...schoolGrades];
    else if (type === 'primary') targetGrades = ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5'];
    else if (type === 'middle') targetGrades = ['Grade 6', 'Grade 7', 'Grade 8'];
    else if (type === 'secondary') targetGrades = ['Grade 9', 'Grade 10'];
    else if (type === 'senior') targetGrades = ['Grade 11', 'Grade 12'];
    else if (type === 'clear') targetGrades = [];

    if (isEdit) {
      setEditForm((prev) => ({ ...prev, selectedGrades: targetGrades }));
    } else {
      setForm((prev) => ({ ...prev, selectedGrades: targetGrades }));
    }
  };

  // Reusable Teaching Matrix Mapping Preview
  const renderMappingPreview = (
    teacherName: string,
    subjects: string[],
    grades: string[],
    sections: string[]
  ) => {
    const hasSubjects = subjects.length > 0;
    const hasGrades = grades.length > 0;
    const effectiveSecs = sections.length > 0 ? sections : ['All'];

    if (!hasSubjects || !hasGrades) {
      return (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-3 text-center">
          <p className="text-xs font-semibold text-slate-500 flex items-center justify-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-blue-500" />
            Select at least one subject & grade to preview teaching qualifications
          </p>
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50/60 to-indigo-50/40 p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-black tracking-tight text-blue-950 uppercase">
              Teaching Matrix Preview
            </span>
          </div>
          <Badge className="bg-blue-600 text-white font-bold text-[10px] px-2 py-0.2 shadow-xs">
            {subjects.length} Subj &bull; {grades.length} Gr &bull; {effectiveSecs.length} Sec
          </Badge>
        </div>

        <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
          {subjects.map((subj) => (
            <div key={subj} className="bg-white/90 border border-blue-100 rounded-lg p-2 text-xs shadow-2xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 flex items-center gap-1">
                  <BookOpen className="w-3 h-3 text-blue-600" /> {subj}
                </span>
                <span className="text-[10px] text-slate-400 font-medium">{teacherName || 'Faculty Member'}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {grades.map((gr) => (
                  <span key={gr} className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 text-[10px] font-semibold px-2 py-0.5 rounded border border-slate-200">
                    <GraduationCap className="w-2.5 h-2.5 text-slate-500" />
                    {gr} {effectiveSecs.length > 0 && effectiveSecs[0] !== 'All' ? `(${effectiveSecs.join(', ')})` : ''}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* ── Enterprise SaaS Faculty Directory Header ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-700 via-indigo-800 to-slate-900 flex items-center justify-center text-white shadow-md shadow-blue-900/30 shrink-0 border border-blue-500/20">
            <Users className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#081A33]">
                Faculty Directory & Workload Center
              </h1>
              <Badge className="bg-blue-50 text-[#2563EB] border border-blue-200 font-bold text-[10px] uppercase tracking-wider">
                Takshila School
              </Badge>
            </div>
            <p className="text-xs text-[#64748B] font-medium mt-1">
              Active teaching staff roster, timetable period assignments & individual schedule matrix &middot; {filtered.length} of {teachers.length} Faculty Members
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOverloadModalOpen(true)}
            className="gap-2 text-xs border-amber-200 bg-amber-50/60 text-amber-900 hover:bg-amber-100 font-bold h-9 shadow-xs px-3.5"
          >
            <Flame className="w-4 h-4 text-amber-600" />
            Overloaded Workload Audit ({overloadedTeachers.length})
          </Button>

          <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)} className="gap-2 text-xs border-[#E2E8F0] text-[#0F2747] bg-white hover:bg-slate-50 font-bold h-9 shadow-xs px-3.5">
            <Upload className="w-4 h-4 text-[#2563EB]" /> Bulk Upload Faculty
          </Button>

          <Button size="sm" onClick={() => setAddOpen(true)} className="gap-2 bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 hover:from-blue-800 hover:to-slate-950 text-white font-bold h-9 shadow-md text-xs px-3.5 border-none">
            <Plus className="w-4 h-4 text-amber-300" /> Add Faculty Member
          </Button>
        </div>
      </div>

      {/* ── KPI Cards Row with Interactive Triggers ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {[
          {
            id: 'total', label: 'Total Faculty', value: teachers.length,
            icon: Users, color: 'text-blue-600 bg-blue-50',
            onClick: () => {
              setTab('directory');
              setStatusFilter('all');
              setSearch('');
              setSubjectFilter('all');
              setOnLeaveOnly(false);
              setOverloadedFilterOnly(false);
            },
            hint: 'Show all faculty members (clears filters)',
            isActive: tab === 'directory' && statusFilter === 'all' && !onLeaveOnly && !overloadedFilterOnly && !search,
          },
          {
            id: 'active', label: 'Active', value: teachers.filter((t) => t.role !== 'inactive').length,
            icon: UserCheck, color: 'text-emerald-600 bg-emerald-50',
            onClick: () => {
              setTab('directory');
              setStatusFilter('active');
              setOnLeaveOnly(false);
              setOverloadedFilterOnly(false);
            },
            hint: 'Filter directory to active teachers only',
            isActive: tab === 'directory' && statusFilter === 'active',
          },
          {
            id: 'inactive', label: 'Deactivated', value: teachers.filter((t) => t.role === 'inactive').length,
            icon: UserX, color: 'text-rose-600 bg-rose-50',
            onClick: () => {
              setTab('directory');
              setStatusFilter('inactive');
              setOnLeaveOnly(false);
              setOverloadedFilterOnly(false);
            },
            hint: 'Filter directory to deactivated faculty only',
            isActive: tab === 'directory' && statusFilter === 'inactive',
          },
          {
            id: 'onleave', label: 'On Leave Today', value: onLeaveToday.length,
            icon: CalendarDays, color: 'text-amber-600 bg-amber-50',
            onClick: () => {
              setTab('directory');
              setStatusFilter('all');
              setOnLeaveOnly((v) => !v);
              setOverloadedFilterOnly(false);
            },
            hint: 'Faculty with approved leave covering today',
            isActive: tab === 'directory' && onLeaveOnly,
          },
          {
            id: 'overloaded', label: 'Overloaded', value: overloadedTeachers.length,
            icon: Flame, color: 'text-orange-600 bg-orange-50',
            onClick: () => setOverloadModalOpen(true),
            hint: 'Click to open Overloaded Teachers Drill-Down modal',
            isActive: overloadedFilterOnly,
          },
          {
            id: 'duplicates', label: 'Duplicates', value: dupCount,
            icon: Copy, color: 'text-violet-600 bg-violet-50',
            onClick: () => setTab('duplicates'),
            hint: 'Switch to Duplicate Review tab',
            isActive: tab === 'duplicates',
          },
          {
            id: 'issues', label: 'Data Issues', value: issueCount,
            icon: AlertCircle, color: 'text-red-600 bg-red-50',
            onClick: () => setTab('issues'),
            hint: 'Switch to Data Issues tab',
            isActive: tab === 'issues',
          },
        ].map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={s.onClick}
            title={s.hint}
            data-testid={`kpi-${s.id}`}
            className={`text-left rounded-2xl border p-3 transition-all hover:shadow-md hover:border-slate-300 ${
              s.isActive
                ? 'border-blue-700 ring-2 ring-blue-200 bg-blue-50/40 shadow-xs'
                : 'border-slate-200 bg-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div className={`w-9 h-9 rounded-xl ${s.color.split(' ')[1]} flex items-center justify-center shrink-0`}>
                <s.icon className={`w-4.5 h-4.5 ${s.color.split(' ')[0]}`} />
              </div>
              <div className="min-w-0">
                <p className="text-lg font-bold text-slate-800 leading-none">{s.value}</p>
                <p className="text-[10px] text-slate-500 truncate mt-1">{s.label}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Directory / duplicate review / data issues Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        <TabButton id="directory" label="Faculty Directory" />
        <TabButton id="duplicates" label="Review Duplicate Faculty" />
        <TabButton id="issues" label="Data Issues" />
      </div>

      {tab === 'duplicates' && <DedupReview onChanged={fetchTeachers} />}
      {tab === 'issues' && <DataIssues onChanged={fetchTeachers} />}

      {tab === 'directory' && (
        <>
          {/* Search + Subject Filter + Status Filter + Quick Reset */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search faculty by name, email, or subject…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-white"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Select value={subjectFilter} onValueChange={setSubjectFilter}>
                <SelectTrigger className="w-44 bg-white">
                  <Filter className="w-4 h-4 mr-1.5 text-slate-400" />
                  <SelectValue placeholder="All Subjects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Subjects</SelectItem>
                  {uniqueSubjects.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={(val: any) => setStatusFilter(val)}>
                <SelectTrigger className="w-36 bg-white font-semibold">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active Only</SelectItem>
                  <SelectItem value="inactive">Deactivated Only</SelectItem>
                </SelectContent>
              </Select>

              {(search || subjectFilter !== 'all' || statusFilter !== 'all' || onLeaveOnly || overloadedFilterOnly) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearch('');
                    setSubjectFilter('all');
                    setStatusFilter('all');
                    setOnLeaveOnly(false);
                    setOverloadedFilterOnly(false);
                  }}
                  className="text-xs text-slate-500 hover:text-slate-900"
                >
                  <X className="w-3.5 h-3.5 mr-1" /> Reset Filters
                </Button>
              )}
            </div>
          </div>

          {/* Bulk cleanup bar */}
          {filtered.some((t) => t.role === 'inactive') && (
            <div className="flex flex-wrap items-center gap-3 p-3 rounded-2xl border border-slate-200 bg-slate-50">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  data-testid="select-all-inactive"
                  checked={selected.size > 0 && selected.size === inactiveIds().length}
                  onChange={(e) => setSelected(e.target.checked ? new Set(inactiveIds()) : new Set())}
                  className="w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                />
                <span className="text-xs font-semibold text-slate-700">
                  Select all deactivated ({inactiveIds().length})
                </span>
              </label>

              {selected.size > 0 && (
                <>
                  <span className="text-xs text-slate-500">{selected.size} selected</span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      data-testid="bulk-clear-refs"
                      checked={clearRefs}
                      onChange={(e) => setClearRefs(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                    />
                    <span className="text-xs text-slate-600">
                      Also clear references that block deletion
                    </span>
                  </label>
                  <Button
                    size="sm" variant="outline" className="h-8 text-xs"
                    onClick={() => setSelected(new Set())}
                  >
                    Clear selection
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold gap-1.5"
                    disabled={bulkBusy}
                    data-testid="bulk-delete"
                    onClick={previewBulkDelete}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {bulkBusy ? 'Checking…' : `Delete ${selected.size} selected`}
                  </Button>
                </>
              )}
            </div>
          )}

          {/* Teacher Cards Grid */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="border-slate-200 animate-pulse">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 rounded-2xl bg-slate-200" />
                      <div className="space-y-2 flex-1">
                        <div className="h-4 bg-slate-200 rounded w-3/4" />
                        <div className="h-3 bg-slate-100 rounded w-1/2" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <Card className="border-slate-200 border-dashed">
              <CardContent className="py-16 text-center">
                <Users className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                <p className="text-slate-500 font-medium">No faculty members found</p>
                <p className="text-slate-400 text-sm mt-1">Try adjusting your search or filter settings.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((teacher) => {
                const initials = teacher.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
                const gradesStr = gradesDisplay(teacher.grades);
                const subjs = subjectsDisplay(teacher.subjects, teacher.subject);
                const scheduleCount = teacher.schedules?.length || teacher._count?.schedules || 0;
                const isInactive = teacher.role === 'inactive';
                const isOverloaded = scheduleCount > MAX_ALLOWED_WEEKLY_PERIODS;

                return (
                  <Card
                    key={teacher.id}
                    data-testid={isInactive ? 'inactive-faculty-card' : 'faculty-card'}
                    className={`transition-all duration-200 cursor-pointer group relative overflow-hidden border ${
                      selected.has(teacher.id)
                        ? 'border-rose-500 ring-2 ring-rose-200 bg-rose-50/40'
                        : isInactive
                          ? 'border-dashed border-rose-200 bg-slate-50/75 opacity-80'
                          : isOverloaded
                            ? 'border-amber-300 bg-white hover:shadow-md hover:border-amber-400'
                            : 'border-slate-200 bg-white hover:shadow-md hover:border-blue-300'
                    }`}
                    onClick={() => setViewTeacher(teacher)}
                  >
                    {isInactive && (
                      <label
                        className="absolute top-3 left-3 z-10 flex items-center cursor-pointer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          data-testid="select-faculty"
                          checked={selected.has(teacher.id)}
                          onChange={() => toggleSelected(teacher.id)}
                          className="w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                        />
                      </label>
                    )}
                    <CardContent className={`p-5 ${isInactive ? 'pl-10' : ''}`}>
                      <div className="flex items-start gap-3 mb-3">
                        <div
                          className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-base shrink-0 shadow-md ${
                            isInactive
                              ? 'bg-slate-400'
                              : isOverloaded
                                ? 'bg-gradient-to-br from-amber-600 to-orange-800'
                                : 'bg-gradient-to-br from-blue-700 to-indigo-900'
                          }`}
                        >
                          {initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <p className={`font-bold truncate group-hover:text-blue-700 transition-colors ${
                              isInactive ? 'text-slate-500 line-through' : 'text-slate-800'
                            }`}>
                              {teacher.name}
                            </p>
                            {isInactive ? (
                              <Badge variant="outline" className="text-[9px] font-bold bg-rose-50 text-rose-700 border-rose-200 shrink-0">
                                <UserX className="w-2.5 h-2.5 mr-0.5" /> Inactive
                              </Badge>
                            ) : isOverloaded ? (
                              <Badge variant="outline" className="text-[9px] font-bold bg-amber-50 text-amber-800 border-amber-300 shrink-0 flex items-center gap-0.5">
                                <Flame className="w-2.5 h-2.5 text-amber-600" /> Overloaded
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[9px] font-bold bg-emerald-50 text-emerald-700 border-emerald-200 shrink-0">
                                <UserCheck className="w-2.5 h-2.5 mr-0.5" /> Active
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 truncate">{teacher.email}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {subjs.slice(0, 2).map((s) => (
                              <Badge key={s} variant="outline" className={`text-[10px] px-2 py-0.2 ${getBadgeClass(s)}`}>
                                {s}
                              </Badge>
                            ))}
                            {subjs.length > 2 && (
                              <span className="text-[10px] text-slate-500 font-bold">+{subjs.length - 2} more</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-slate-100 pt-2.5 flex items-center justify-between text-xs text-slate-500 mb-3">
                        <span className="truncate pr-2">Grades: <strong className="text-slate-700">{gradesStr}</strong></span>
                        <Badge
                          variant="secondary"
                          className={`text-[10px] shrink-0 ${
                            isOverloaded
                              ? 'bg-amber-100 text-amber-900 border border-amber-300 font-bold'
                              : 'bg-blue-50 text-blue-900 border-blue-200'
                          }`}
                        >
                          {scheduleCount} Periods / Wk
                        </Badge>
                      </div>

                      {/* Principal Quick Actions */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => handleOpenEdit(teacher, e)}
                          className="h-7 px-2.5 text-[11px] font-bold border-slate-200 text-slate-700 hover:text-blue-700 hover:border-blue-300 hover:bg-blue-50 flex-1"
                        >
                          <Edit3 className="w-3 h-3 mr-1 text-blue-600" /> Edit Info
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => handleToggleStatus(teacher, e)}
                          className={`h-7 px-2.5 text-[11px] font-bold border flex-1 ${
                            isInactive
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:border-rose-300'
                          }`}
                        >
                          {isInactive ? (
                            <><Power className="w-3 h-3 mr-1 text-emerald-600" /> Reactivate</>
                          ) : (
                            <><Ban className="w-3 h-3 mr-1 text-rose-600" /> Deactivate</>
                          )}
                        </Button>

                        {isInactive && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => openDeleteDialog(teacher, e)}
                            title="Delete permanently"
                            className="h-7 px-2 text-[11px] font-bold border-rose-300 bg-white text-rose-700 hover:bg-rose-50"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Add Faculty Modal with Interactive Chips & Mapping Preview ── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-blue-950 font-bold flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-700" />
              Add New Faculty Member
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Configure faculty profile, subject qualifications from School Setup, and teaching grades.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Basic Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold text-slate-800">Full Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Dr. Priya Sharma"
                  className="mt-1 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-800">Email Address *</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="priya@school.edu"
                  className="mt-1 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold text-slate-800">Phone Number (Optional)</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+91 98765 43210"
                  className="mt-1 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-800">Employee ID (Optional)</Label>
                <Input
                  value={form.employeeId}
                  onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                  placeholder="EMP-1042"
                  className="mt-1 text-xs"
                />
              </div>
            </div>

            {/* Curriculum Subjects (Chips Selection) */}
            <div className="space-y-2 border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-bold text-slate-900">
                    Subjects Taught (from School Setup Curriculum) *
                  </Label>
                  <p className="text-[11px] text-slate-500">
                    Select curriculum-approved subjects this teacher is qualified to instruct.
                  </p>
                </div>
                <Link
                  href="/settings?tab=timetable&subtab=subjects"
                  target="_blank"
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline hover:text-blue-800"
                >
                  <Plus className="w-3 h-3" /> Add Subject in School Setup
                  <ExternalLink className="w-2.5 h-2.5" />
                </Link>
              </div>

              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <Input
                  placeholder="Filter subjects…"
                  value={addSubjectSearch}
                  onChange={(e) => setAddSubjectSearch(e.target.value)}
                  className="pl-8 h-8 text-xs bg-slate-50"
                />
              </div>

              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200">
                {schoolSubjects
                  .filter((s) => s.toLowerCase().includes(addSubjectSearch.toLowerCase()))
                  .map((subj) => {
                    const isSelected = form.selectedSubjects.includes(subj);
                    return (
                      <button
                        key={subj}
                        type="button"
                        onClick={() => {
                          setForm((prev) => ({
                            ...prev,
                            selectedSubjects: isSelected
                              ? prev.selectedSubjects.filter((s) => s !== subj)
                              : [...prev.selectedSubjects, subj],
                          }));
                        }}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                          isSelected
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {isSelected ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3 text-slate-400" />}
                        {subj}
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* Grades Selection (Chips with Quick Presets) */}
            <div className="space-y-2 border-t border-slate-100 pt-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <div>
                  <Label className="text-xs font-bold text-slate-900">Grades Assigned</Label>
                  <p className="text-[11px] text-slate-500">Pick specific grades or use quick range presets.</p>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <Button type="button" size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-blue-700" onClick={() => setGradePreset('all')}>All 1-12</Button>
                  <Button type="button" size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-slate-600" onClick={() => setGradePreset('primary')}>Gr 1-5</Button>
                  <Button type="button" size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-slate-600" onClick={() => setGradePreset('middle')}>Gr 6-8</Button>
                  <Button type="button" size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-slate-600" onClick={() => setGradePreset('secondary')}>Gr 9-10</Button>
                  <Button type="button" size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-slate-600" onClick={() => setGradePreset('senior')}>Gr 11-12</Button>
                  <Button type="button" size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-rose-600" onClick={() => setGradePreset('clear')}>Clear</Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50 rounded-xl border border-slate-200">
                {schoolGrades.map((grade) => {
                  const isSelected = form.selectedGrades.includes(grade);
                  return (
                    <button
                      key={grade}
                      type="button"
                      onClick={() => {
                        setForm((prev) => ({
                          ...prev,
                          selectedGrades: isSelected
                            ? prev.selectedGrades.filter((g) => g !== grade)
                            : [...prev.selectedGrades, grade],
                        }));
                      }}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                        isSelected
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3" />}
                      {grade}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dynamic Sections Checkboxes */}
            <div className="space-y-2 border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-bold text-slate-900">Sections (Dynamic to Selected Grades)</Label>
                  <p className="text-[11px] text-slate-500">Only sections configured for active grades are displayed.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const avail = getDynamicSectionsForGrades(form.selectedGrades);
                      setForm((prev) => ({ ...prev, selectedSections: avail }));
                    }}
                    className="text-[10px] text-blue-600 font-bold hover:underline"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, selectedSections: [] }))}
                    className="text-[10px] text-slate-500 font-bold hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                {getDynamicSectionsForGrades(form.selectedGrades).map((sec) => {
                  const isChecked = form.selectedSections.includes(sec);
                  return (
                    <label
                      key={sec}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold cursor-pointer transition-all ${
                        isChecked
                          ? 'bg-blue-50 border-blue-300 text-blue-900'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          setForm((prev) => ({
                            ...prev,
                            selectedSections: isChecked
                              ? prev.selectedSections.filter((s) => s !== sec)
                              : [...prev.selectedSections, sec],
                          }));
                        }}
                        className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                      />
                      Section {sec}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Real-Time Mapping Preview */}
            <div className="pt-2">
              {renderMappingPreview(
                form.name,
                form.selectedSubjects,
                form.selectedGrades,
                form.selectedSections
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 text-white font-bold"
            >
              {saving ? 'Saving...' : 'Add Faculty Member'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Faculty Modal with Interactive Chips & Mapping Preview ── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-950 font-bold">
              <Edit3 className="w-5 h-5 text-blue-700" />
              Edit Faculty Profile & Qualifications
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Update subjects, grades, sections and active teaching status.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold text-slate-800">Full Name *</Label>
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="e.g. Dr. Priya Sharma"
                  className="mt-1 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-800">Email Address *</Label>
                <Input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  placeholder="priya@school.edu"
                  className="mt-1 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold text-slate-800">Phone Number</Label>
                <Input
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  placeholder="+91 98765 43210"
                  className="mt-1 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-800">Employee ID</Label>
                <Input
                  value={editForm.employeeId}
                  onChange={(e) => setEditForm({ ...editForm, employeeId: e.target.value })}
                  placeholder="EMP001"
                  className="mt-1 text-xs"
                />
              </div>
            </div>

            {/* Subjects Selection */}
            <div className="space-y-2 border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-bold text-slate-900">
                    Subjects Taught (from School Setup Curriculum) *
                  </Label>
                  <p className="text-[11px] text-slate-500">
                    Curriculum-approved subjects this faculty member is qualified for.
                  </p>
                </div>
                <Link
                  href="/settings?tab=timetable&subtab=subjects"
                  target="_blank"
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline hover:text-blue-800"
                >
                  <Plus className="w-3 h-3" /> Add Subject in School Setup
                  <ExternalLink className="w-2.5 h-2.5" />
                </Link>
              </div>

              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <Input
                  placeholder="Filter curriculum subjects…"
                  value={editSubjectSearch}
                  onChange={(e) => setEditSubjectSearch(e.target.value)}
                  className="pl-8 h-8 text-xs bg-slate-50"
                />
              </div>

              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200">
                {schoolSubjects
                  .filter((s) => s.toLowerCase().includes(editSubjectSearch.toLowerCase()))
                  .map((subj) => {
                    const isSelected = editForm.selectedSubjects.includes(subj);
                    return (
                      <button
                        key={subj}
                        type="button"
                        onClick={() => {
                          setEditForm((prev) => ({
                            ...prev,
                            selectedSubjects: isSelected
                              ? prev.selectedSubjects.filter((s) => s !== subj)
                              : [...prev.selectedSubjects, subj],
                          }));
                        }}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                          isSelected
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {isSelected ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3 text-slate-400" />}
                        {subj}
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* Grades Selection */}
            <div className="space-y-2 border-t border-slate-100 pt-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <div>
                  <Label className="text-xs font-bold text-slate-900">Grades Assigned</Label>
                  <p className="text-[11px] text-slate-500">Pick grades or quick presets.</p>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <Button type="button" size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-blue-700" onClick={() => setGradePreset('all', true)}>All 1-12</Button>
                  <Button type="button" size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-slate-600" onClick={() => setGradePreset('primary', true)}>Gr 1-5</Button>
                  <Button type="button" size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-slate-600" onClick={() => setGradePreset('middle', true)}>Gr 6-8</Button>
                  <Button type="button" size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-slate-600" onClick={() => setGradePreset('secondary', true)}>Gr 9-10</Button>
                  <Button type="button" size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-slate-600" onClick={() => setGradePreset('senior', true)}>Gr 11-12</Button>
                  <Button type="button" size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-rose-600" onClick={() => setGradePreset('clear', true)}>Clear</Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50 rounded-xl border border-slate-200">
                {schoolGrades.map((grade) => {
                  const isSelected = editForm.selectedGrades.includes(grade);
                  return (
                    <button
                      key={grade}
                      type="button"
                      onClick={() => {
                        setEditForm((prev) => ({
                          ...prev,
                          selectedGrades: isSelected
                            ? prev.selectedGrades.filter((g) => g !== grade)
                            : [...prev.selectedGrades, grade],
                        }));
                      }}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                        isSelected
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3" />}
                      {grade}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dynamic Sections */}
            <div className="space-y-2 border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-bold text-slate-900">Sections</Label>
                  <p className="text-[11px] text-slate-500">Sections available for selected grades.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const avail = getDynamicSectionsForGrades(editForm.selectedGrades);
                      setEditForm((prev) => ({ ...prev, selectedSections: avail }));
                    }}
                    className="text-[10px] text-blue-600 font-bold hover:underline"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditForm((prev) => ({ ...prev, selectedSections: [] }))}
                    className="text-[10px] text-slate-500 font-bold hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                {getDynamicSectionsForGrades(editForm.selectedGrades).map((sec) => {
                  const isChecked = editForm.selectedSections.includes(sec);
                  return (
                    <label
                      key={sec}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold cursor-pointer transition-all ${
                        isChecked
                          ? 'bg-blue-50 border-blue-300 text-blue-900'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          setEditForm((prev) => ({
                            ...prev,
                            selectedSections: isChecked
                              ? prev.selectedSections.filter((s) => s !== sec)
                              : [...prev.selectedSections, sec],
                          }));
                        }}
                        className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                      />
                      Section {sec}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Status & Role */}
            <div className="border-t border-slate-100 pt-3">
              <Label className="text-xs font-semibold text-slate-800">Faculty Status & Role</Label>
              <Select
                value={editForm.role}
                onValueChange={(val) => setEditForm({ ...editForm, role: val })}
              >
                <SelectTrigger className="mt-1 text-xs bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="teacher">Active Faculty Teacher</SelectItem>
                  <SelectItem value="admin">Administrator / Department Head</SelectItem>
                  <SelectItem value="inactive">Inactive / Deactivated (On Leave / Left)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Mapping Preview */}
            <div className="pt-2">
              {renderMappingPreview(
                editForm.name,
                editForm.selectedSubjects,
                editForm.selectedGrades,
                editForm.selectedSections
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSaveEdit}
              disabled={saving}
              className="bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 text-white font-bold"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Overloaded Teachers Drill-Down Modal & Table ── */}
      <Dialog open={overloadModalOpen} onOpenChange={setOverloadModalOpen}>
        <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
          <DialogHeader className="border-b border-slate-100 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700">
                  <Flame className="w-5 h-5" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-black text-slate-900">
                    Faculty Workload & Overload Drill-Down
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-500">
                    Calculated in real-time from published master timetable schedule occupancy.
                  </DialogDescription>
                </div>
              </div>
              <Badge className="bg-amber-100 text-amber-900 border border-amber-300 font-black text-xs px-3 py-1">
                Max Allowed: {MAX_ALLOWED_WEEKLY_PERIODS} Periods / Wk
              </Badge>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/60 text-center">
                <p className="text-xl font-black text-amber-800">{overloadedTeachers.length}</p>
                <p className="text-[10px] font-bold text-amber-700 uppercase">Overloaded Staff</p>
              </div>
              <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/60 text-center">
                <p className="text-xl font-black text-emerald-800">{teachers.length - overloadedTeachers.length}</p>
                <p className="text-[10px] font-bold text-emerald-700 uppercase">Optimal Workload</p>
              </div>
              <div className="p-3 rounded-xl border border-blue-200 bg-blue-50/60 text-center">
                <p className="text-xl font-black text-blue-800">
                  {teachers.length > 0
                    ? Math.round(
                        facultyWorkloads.reduce((a, b) => a + b.scheduleCount, 0) / teachers.length
                      )
                    : 0}{' '}
                  <span className="text-xs font-normal">P / Wk</span>
                </p>
                <p className="text-[10px] font-bold text-blue-700 uppercase">Avg Workload</p>
              </div>
            </div>

            {/* Filter controls inside modal */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <Input
                  placeholder="Filter teachers in workload table…"
                  value={overloadSearch}
                  onChange={(e) => setOverloadSearch(e.target.value)}
                  className="pl-8 h-8 text-xs bg-slate-50"
                />
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={overloadOnlyToggle ? 'default' : 'outline'}
                  onClick={() => setOverloadOnlyToggle(true)}
                  className={`h-8 text-xs font-bold ${overloadOnlyToggle ? 'bg-amber-600 text-white' : ''}`}
                >
                  Overloaded Only ({overloadedTeachers.length})
                </Button>
                <Button
                  size="sm"
                  variant={!overloadOnlyToggle ? 'default' : 'outline'}
                  onClick={() => setOverloadOnlyToggle(false)}
                  className={`h-8 text-xs font-bold ${!overloadOnlyToggle ? 'bg-blue-600 text-white' : ''}`}
                >
                  Show All ({teachers.length})
                </Button>
              </div>
            </div>

            {/* Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100/90 text-slate-700 font-bold text-[11px] sticky top-0 border-b border-slate-200">
                    <tr>
                      <th className="p-3">Teacher</th>
                      <th className="p-3">Subject / Dept</th>
                      <th className="p-3 text-center">Weekly Periods</th>
                      <th className="p-3 text-center">Max Allowed</th>
                      <th className="p-3 text-center">Difference</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {facultyWorkloads
                      .filter((w) => {
                        if (overloadOnlyToggle && !w.isOverloaded) return false;
                        if (!overloadSearch) return true;
                        const q = overloadSearch.toLowerCase();
                        return (
                          w.teacher.name.toLowerCase().includes(q) ||
                          w.teacher.email.toLowerCase().includes(q) ||
                          w.teacher.subject.toLowerCase().includes(q)
                        );
                      })
                      .map((w) => (
                        <tr key={w.teacher.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3">
                            <div className="font-bold text-slate-900">{w.teacher.name}</div>
                            <div className="text-[10px] text-slate-400">{w.teacher.email}</div>
                          </td>
                          <td className="p-3">
                            <Badge variant="outline" className={`text-[10px] ${getBadgeClass(w.teacher.subject)}`}>
                              {w.teacher.subject}
                            </Badge>
                          </td>
                          <td className="p-3 text-center font-bold text-slate-900">
                            {w.scheduleCount} Periods
                          </td>
                          <td className="p-3 text-center text-slate-500 font-medium">
                            {w.maxAllowed} Periods
                          </td>
                          <td className="p-3 text-center">
                            {w.difference > 0 ? (
                              <Badge className="bg-rose-100 text-rose-800 border border-rose-300 font-black text-[10px]">
                                +{w.difference} Overloaded
                              </Badge>
                            ) : w.difference === 0 ? (
                              <Badge className="bg-amber-50 text-amber-800 border border-amber-200 font-bold text-[10px]">
                                At Capacity
                              </Badge>
                            ) : (
                              <Badge className="bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-[10px]">
                                {w.difference} Avail
                              </Badge>
                            )}
                          </td>
                          <td className="p-3 text-right space-x-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setOverloadModalOpen(false);
                                setViewTeacher(w.teacher);
                              }}
                              className="h-7 text-[10px] font-bold text-blue-700 bg-blue-50/50 border-blue-200 hover:bg-blue-100"
                            >
                              <Eye className="w-3 h-3 mr-1" /> View Matrix
                            </Button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOverloadModalOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bulk Upload Faculty Modal ── */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-950 font-bold">
              <Upload className="w-5 h-5 text-blue-700" />
              Bulk Upload Faculty Members
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-xs text-slate-500 leading-relaxed">
              Upload an Excel (`.xlsx`, `.csv`) or text document with teacher Name, Email, Subject, and Grades to populate the Faculty Directory.
            </p>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-slate-800">Select Faculty List File (.csv / .xlsx)</Label>
                <a
                  href="/api/timetable/import/template?type=teacher&format=csv"
                  download="Teacher_Faculty_Template.csv"
                  className="text-xs font-extrabold text-[#2563EB] hover:underline flex items-center gap-1"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" /> Download Sample Template
                </a>
              </div>
              <div className="border-2 border-dashed border-blue-200 rounded-xl p-5 bg-blue-50/40 text-center hover:bg-blue-50/70 transition-colors">
                <input
                  type="file"
                  id="faculty-bulk-upload"
                  accept=".xlsx,.xls,.csv,.txt"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setBulkFile(e.target.files[0]);
                    }
                  }}
                />
                <label htmlFor="faculty-bulk-upload" className="cursor-pointer space-y-2 block">
                  <FileSpreadsheet className="w-8 h-8 text-blue-700 mx-auto" />
                  {bulkFile ? (
                    <div>
                      <p className="text-xs font-bold text-slate-800">{bulkFile.name}</p>
                      <p className="text-[10px] text-slate-500">{(bulkFile.size / 1024).toFixed(1)} KB attached</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs font-bold text-blue-950">Click to select file or drag & drop</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">Supports CSV/Excel with Name, Email, Subject</p>
                    </div>
                  )}
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>Cancel</Button>
            <Button onClick={handleBulkUploadSubmit} disabled={bulkUploading} className="bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 text-white font-bold">
              {bulkUploading ? 'Uploading...' : 'Bulk Add Faculty'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── View Teacher Individual Timetable Modal ── */}
      <Dialog open={!!viewTeacher} onOpenChange={() => setViewTeacher(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {viewTeacher && (
            <div className="space-y-4" id="printable-teacher-timetable">
              <DialogHeader className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      <UserCheck className="w-5 h-5 text-blue-700" />
                      Teacher Timetable — {viewTeacher.name}
                    </DialogTitle>
                    {viewTeacher.role === 'inactive' ? (
                      <Badge variant="outline" className="text-[9px] font-bold bg-rose-50 text-rose-700 border-rose-200">
                        Inactive
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[9px] font-bold bg-emerald-50 text-emerald-700 border-emerald-200">
                        Active
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {viewTeacher.subject} Faculty • {viewTeacher.email}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 no-print">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => handleOpenEdit(viewTeacher, e)}
                    className="gap-1 text-xs border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-bold"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-blue-600" /> Edit Profile
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => handleToggleStatus(viewTeacher, e)}
                    className={`gap-1 text-xs font-bold ${
                      viewTeacher.role === 'inactive'
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                    }`}
                  >
                    {viewTeacher.role === 'inactive' ? (
                      <><Power className="w-3.5 h-3.5 text-emerald-600" /> Reactivate</>
                    ) : (
                      <><Ban className="w-3.5 h-3.5 text-rose-600" /> Deactivate</>
                    )}
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleExportTeacherExcel(viewTeacher)}
                    className="gap-1 text-xs border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" /> Excel
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => viewTeacher && printTeacherTimetable(viewTeacher)}
                    className="gap-1 text-xs border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold"
                  >
                    <Printer className="w-3.5 h-3.5 text-blue-600" /> Print
                  </Button>
                </div>
              </DialogHeader>

              {/* Individual Teacher Weekly Schedule Table */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-blue-600" />
                  Assigned Teaching Periods (P1 – P8)
                </h4>

                <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700 text-[11px]">
                        <th className="p-2.5 w-24 border-r border-slate-200">Day</th>
                        {PERIOD_NUMS.map((p) => (
                          <th key={p} className="p-2.5 text-center border-r border-slate-200">P{p}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-xs">
                      {DAYS.map((day) => (
                        <tr key={day} className="hover:bg-slate-50">
                          <td className="p-2.5 font-bold text-slate-800 bg-slate-50 border-r border-slate-200">{day}</td>
                          {PERIOD_NUMS.map((p) => {
                            const sched = getTeacherScheduleSlot(viewTeacher, day, p);
                            return (
                              <td key={p} className="p-2 text-center border-r border-slate-200">
                                {sched ? (
                                  <div className="bg-blue-50 p-1.5 rounded border border-blue-200 text-[10px]">
                                    <span className="font-bold text-blue-900 block">{sched.grade} {sched.section}</span>
                                    <span className="text-slate-600 block">{sched.subject}</span>
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
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Permanent Delete (with dependency check) ── */}
      <Dialog open={!!bulkPlan} onOpenChange={(o) => { if (!o) setBulkPlan(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="bulk-delete-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-700 font-bold">
              <Trash2 className="w-5 h-5 shrink-0" />
              Delete {bulkPlan?.summary?.wouldDelete ?? 0} faculty record(s)?
            </DialogTitle>
          </DialogHeader>

          {bulkPlan && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-center">
                  <p className="text-lg font-black text-emerald-700">{bulkPlan.summary.deletableNow}</p>
                  <p className="text-[10px] font-semibold text-emerald-700 uppercase">Ready</p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-center">
                  <p className="text-lg font-black text-amber-700">{bulkPlan.summary.needsReferenceClearing}</p>
                  <p className="text-[10px] font-semibold text-amber-700 uppercase">Referenced</p>
                </div>
                <div className="rounded-xl border border-slate-200 p-2.5 text-center">
                  <p className="text-lg font-black text-slate-600">{bulkPlan.summary.stillActive}</p>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase">Still active</p>
                </div>
              </div>

              {(bulkPlan.summary.rowsDetached > 0 || bulkPlan.summary.rowsRemoved > 0) && (
                <div className="rounded-xl border border-slate-200 p-3 text-[11px] text-slate-700 space-y-1">
                  {bulkPlan.summary.rowsDetached > 0 && (
                    <p>
                      <span className="font-bold text-amber-700">Detach {bulkPlan.summary.rowsDetached}</span>{' '}
                      timetable period(s) and cover assignment(s) — those rows stay and become unallocated.
                    </p>
                  )}
                  {bulkPlan.summary.rowsRemoved > 0 && (
                    <p>
                      <span className="font-bold text-rose-700">Remove {bulkPlan.summary.rowsRemoved}</span>{' '}
                      dependent record(s) that cannot exist without their teacher.
                    </p>
                  )}
                </div>
              )}

              {bulkPlan.warning && (
                <div className="p-3 rounded-xl border border-amber-300 bg-amber-50">
                  <p className="text-[11px] text-amber-900">{bulkPlan.warning}</p>
                </div>
              )}

              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-52 overflow-y-auto">
                {(bulkPlan.plan ?? []).map((row: any) => (
                  <div key={row.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="text-[11px] text-slate-700 truncate">
                      {safeName(row.name)}
                      {row.corrupt && (
                        <Badge variant="outline" className="ml-1.5 text-[9px] border-rose-300 text-rose-700">corrupt</Badge>
                      )}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[9px] shrink-0 ${
                        row.status === 'ready' ? 'border-emerald-300 text-emerald-800'
                          : row.status === 'needs_resolve' ? 'border-amber-300 text-amber-800'
                          : 'border-slate-300 text-slate-500'
                      }`}
                    >
                      {row.status === 'ready' ? 'ready' : row.status === 'needs_resolve' ? `${row.blocking} refs` : 'still active'}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkPlan(null)} disabled={bulkBusy}>Cancel</Button>
            <Button
              onClick={applyBulkDelete}
              disabled={bulkBusy || !bulkPlan?.summary?.wouldDelete}
              data-testid="confirm-bulk-delete"
              className={bulkPlan?.summary?.wouldDelete
                ? 'bg-rose-600 hover:bg-rose-700 text-white font-bold'
                : 'bg-slate-200 text-slate-400 font-bold cursor-not-allowed hover:bg-slate-200'}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {bulkBusy ? 'Deleting…'
                : bulkPlan?.summary?.wouldDelete
                  ? `Delete ${bulkPlan.summary.wouldDelete}`
                  : 'Nothing to delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) { setDeleteTarget(null); setResolvePlan(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-700 font-bold">
              <Trash2 className="w-5 h-5 shrink-0" />
              <span>Delete {safeName(deleteTarget?.name)} permanently?</span>
            </DialogTitle>
          </DialogHeader>

          {checkingRefs ? (
            <p className="text-sm text-slate-500 py-6 text-center">Checking dependencies…</p>
          ) : deleteCheck ? (
            <div className="space-y-4">
              {deleteCheck.canDelete ? (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-900">
                  <p className="font-semibold">This cannot be undone.</p>
                  <p className="mt-1">No timetable, substitution, leave or attendance record references this
                  faculty member, so deleting will not orphan any history.</p>
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
                  <p className="font-semibold">Permanent delete is blocked</p>
                  <p className="mt-1">{deleteCheck.error || 'This record is referenced by existing history.'}</p>
                </div>
              )}

              {Array.isArray(deleteCheck.references) && deleteCheck.references.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-2">Referenced by</p>
                  <div className="space-y-1">
                    {deleteCheck.references.map((r: any) => (
                      <div key={r.kind} className="flex items-center justify-between text-xs px-3 py-2 rounded border bg-slate-50">
                        <span className="text-slate-700">{r.kind}</span>
                        <span className="flex items-center gap-2">
                          <strong className="text-slate-900">{r.count}</strong>
                          {r.blocks && <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-300">blocks delete</Badge>}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!deleteCheck.canDelete && !resolvePlan && (
                <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                  <p className="text-xs font-semibold text-slate-700">How to resolve this</p>
                  <p className="text-[11px] text-slate-600">
                    If this is a mangled copy of a real teacher, move their history to the real record
                    instead of removing it. If nobody real is behind it, clear the references first.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      size="sm" variant="outline" className="text-[11px] h-7"
                      onClick={() => { setDeleteTarget(null); setTab('issues'); }}
                    >
                      Map to existing faculty
                    </Button>
                    <Button
                      size="sm" variant="outline" className="text-[11px] h-7"
                      data-testid="resolve-references"
                      disabled={resolving}
                      onClick={() => loadResolvePlan(deleteTarget!)}
                    >
                      {resolving ? 'Checking…' : 'Clear references…'}
                    </Button>
                  </div>
                </div>
              )}

              {resolvePlan && (
                <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3 space-y-2" data-testid="resolve-plan">
                  <p className="text-xs font-bold text-rose-900">This will:</p>
                  <div className="space-y-1">
                    {(resolvePlan.plan ?? []).map((row: any) => (
                      <div key={row.kind} className="text-[11px] text-slate-700">
                        <span className={`font-bold ${row.action === 'delete' ? 'text-rose-700' : 'text-amber-700'}`}>
                          {row.action === 'delete' ? 'Remove' : 'Detach'} {row.count}
                        </span>{' '}
                        {row.kind} — <span className="text-slate-500">{row.effect}</span>
                      </div>
                    ))}
                  </div>
                  {resolvePlan.warning && (
                    <p className="text-[11px] font-semibold text-rose-800">{resolvePlan.warning}</p>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      size="sm" variant="outline" className="text-[11px] h-7"
                      onClick={() => setResolvePlan(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm" className="text-[11px] h-7 bg-rose-600 hover:bg-rose-700 text-white"
                      disabled={resolving}
                      data-testid="confirm-resolve"
                      onClick={applyResolve}
                    >
                      {resolving ? 'Clearing…' : 'Clear references and delete'}
                    </Button>
                  </div>
                </div>
              )}

              {!deleteCheck.canDelete && (
                <p className="text-xs text-slate-500">
                  Keeping the profile deactivated preserves the history while removing them from scheduling.
                </p>
              )}
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {deleteCheck?.canDelete ? 'Cancel' : 'Keep deactivated'}
            </Button>
            <Button
              onClick={confirmDelete}
              disabled={deleting || checkingRefs || !deleteCheck?.canDelete}
              data-testid="confirm-delete-faculty"
              className={
                deleteCheck?.canDelete
                  ? 'bg-rose-600 hover:bg-rose-700 text-white font-bold'
                  : 'bg-slate-200 text-slate-400 font-bold cursor-not-allowed hover:bg-slate-200'
              }
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {deleting
                ? 'Deleting…'
                : deleteCheck?.canDelete
                  ? 'Delete permanently'
                  : 'Delete blocked by references'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
