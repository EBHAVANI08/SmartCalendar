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
import {
  readList,
  parseGradeSectionsMap,
  serializeGradeSectionsMap,
  parseSubjectGradeSectionsMap,
  serializeSubjectGradeSectionsMap,
  type SubjectGradeMapping,
} from '@/lib/faculty';

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
  if (teacher?.schedules && Array.isArray(teacher.schedules) && teacher.schedules.length > 0) {
    const found = teacher.schedules.find((s) => s.day === day && s.period === period);
    if (found) return found;
  }
  return null;
};

export default function TeachersPage() {
  const { toast } = useToast();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [filtered, setFiltered] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [schoolName, setSchoolName] = useState('');
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

  // Form State using Chips/Multi-Select with Per-Subject Mapping
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    employeeId: '',
    selectedSubjects: [] as string[],
    subjectMapping: {} as SubjectGradeMapping,
  });
  const [addActiveSubject, setAddActiveSubject] = useState<string>('');

  const [editForm, setEditForm] = useState({
    id: '',
    name: '',
    email: '',
    phone: '',
    employeeId: '',
    selectedSubjects: [] as string[],
    subjectMapping: {} as SubjectGradeMapping,
    role: 'teacher',
  });
  const [editActiveSubject, setEditActiveSubject] = useState<string>('');

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
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null);

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

  // --- ADD FORM PER-SUBJECT MAPPING HANDLERS ---
  const handleToggleFormSubject = (subj: string) => {
    setForm((prev) => {
      const isSelected = prev.selectedSubjects.includes(subj);
      const nextSubjects = isSelected
        ? prev.selectedSubjects.filter((s) => s !== subj)
        : [...prev.selectedSubjects, subj];
      const nextMapping = { ...prev.subjectMapping };
      if (isSelected) {
        delete nextMapping[subj];
      } else {
        if (!nextMapping[subj]) {
          nextMapping[subj] = { grades: [], sections: {} };
        }
      }
      return {
        ...prev,
        selectedSubjects: nextSubjects,
        subjectMapping: nextMapping,
      };
    });

    if (!form.selectedSubjects.includes(subj)) {
      setAddActiveSubject(subj);
    } else if (addActiveSubject === subj) {
      const remaining = form.selectedSubjects.filter((s) => s !== subj);
      setAddActiveSubject(remaining[0] || '');
    }
  };

  const handleCopyFormMappingToOtherSubjects = (sourceSubj: string) => {
    const sourceData = form.subjectMapping[sourceSubj];
    if (!sourceData) return;
    setForm((prev) => {
      const nextMapping = { ...prev.subjectMapping };
      for (const subj of prev.selectedSubjects) {
        if (subj !== sourceSubj) {
          nextMapping[subj] = {
            grades: [...sourceData.grades],
            sections: JSON.parse(JSON.stringify(sourceData.sections || {})),
          };
        }
      }
      return { ...prev, subjectMapping: nextMapping };
    });
    toast({
      title: 'Mapping Copied',
      description: `Copied ${sourceSubj} grade & section mappings to all other selected subjects.`,
    });
  };

  const handleToggleFormGradeForSubject = (subj: string, grade: string) => {
    setForm((prev) => {
      const curData = prev.subjectMapping[subj] || { grades: [], sections: {} };
      const isSelected = curData.grades.includes(grade);
      const nextGrades = isSelected
        ? curData.grades.filter((g) => g !== grade)
        : [...curData.grades, grade];
      const nextSections = { ...curData.sections };
      if (!isSelected && (!nextSections[grade] || nextSections[grade].length === 0)) {
        nextSections[grade] = gradeSectionsMap[grade] ? [...gradeSectionsMap[grade]] : [...DEFAULT_SECTIONS];
      }
      return {
        ...prev,
        subjectMapping: {
          ...prev.subjectMapping,
          [subj]: {
            grades: nextGrades,
            sections: nextSections,
          },
        },
      };
    });
  };

  const handleToggleFormSectionForSubject = (subj: string, grade: string, section: string) => {
    setForm((prev) => {
      const curData = prev.subjectMapping[subj] || { grades: [], sections: {} };
      const curSecs = curData.sections[grade] || [];
      const isChecked = curSecs.includes(section);
      const nextSecs = isChecked ? curSecs.filter((s) => s !== section) : [...curSecs, section];
      return {
        ...prev,
        subjectMapping: {
          ...prev.subjectMapping,
          [subj]: {
            ...curData,
            sections: {
              ...curData.sections,
              [grade]: nextSecs,
            },
          },
        },
      };
    });
  };

  const handleSelectAllFormSectionsForGrade = (subj: string, grade: string) => {
    const avail = gradeSectionsMap[grade] || DEFAULT_SECTIONS;
    setForm((prev) => {
      const curData = prev.subjectMapping[subj] || { grades: [], sections: {} };
      return {
        ...prev,
        subjectMapping: {
          ...prev.subjectMapping,
          [subj]: {
            ...curData,
            sections: {
              ...curData.sections,
              [grade]: [...avail],
            },
          },
        },
      };
    });
  };

  const handleClearFormSectionsForGrade = (subj: string, grade: string) => {
    setForm((prev) => {
      const curData = prev.subjectMapping[subj] || { grades: [], sections: {} };
      return {
        ...prev,
        subjectMapping: {
          ...prev.subjectMapping,
          [subj]: {
            ...curData,
            sections: {
              ...curData.sections,
              [grade]: [],
            },
          },
        },
      };
    });
  };

  const handleSelectAllFormSectionsEverywhere = (subj: string) => {
    setForm((prev) => {
      const curData = prev.subjectMapping[subj] || { grades: [], sections: {} };
      const nextSections = { ...curData.sections };
      curData.grades.forEach((g) => {
        nextSections[g] = gradeSectionsMap[g] ? [...gradeSectionsMap[g]] : [...DEFAULT_SECTIONS];
      });
      return {
        ...prev,
        subjectMapping: {
          ...prev.subjectMapping,
          [subj]: {
            ...curData,
            sections: nextSections,
          },
        },
      };
    });
  };

  const handleClearAllFormSectionsEverywhere = (subj: string) => {
    setForm((prev) => {
      const curData = prev.subjectMapping[subj] || { grades: [], sections: {} };
      const nextSections = { ...curData.sections };
      curData.grades.forEach((g) => {
        nextSections[g] = [];
      });
      return {
        ...prev,
        subjectMapping: {
          ...prev.subjectMapping,
          [subj]: {
            ...curData,
            sections: nextSections,
          },
        },
      };
    });
  };

  // --- EDIT FORM PER-SUBJECT MAPPING HANDLERS ---
  const handleToggleEditSubject = (subj: string) => {
    setEditForm((prev) => {
      const isSelected = prev.selectedSubjects.includes(subj);
      const nextSubjects = isSelected
        ? prev.selectedSubjects.filter((s) => s !== subj)
        : [...prev.selectedSubjects, subj];
      const nextMapping = { ...prev.subjectMapping };
      if (isSelected) {
        delete nextMapping[subj];
      } else {
        if (!nextMapping[subj]) {
          nextMapping[subj] = { grades: [], sections: {} };
        }
      }
      return {
        ...prev,
        selectedSubjects: nextSubjects,
        subjectMapping: nextMapping,
      };
    });

    if (!editForm.selectedSubjects.includes(subj)) {
      setEditActiveSubject(subj);
    } else if (editActiveSubject === subj) {
      const remaining = editForm.selectedSubjects.filter((s) => s !== subj);
      setEditActiveSubject(remaining[0] || '');
    }
  };

  const handleCopyEditMappingToOtherSubjects = (sourceSubj: string) => {
    const sourceData = editForm.subjectMapping[sourceSubj];
    if (!sourceData) return;
    setEditForm((prev) => {
      const nextMapping = { ...prev.subjectMapping };
      for (const subj of prev.selectedSubjects) {
        if (subj !== sourceSubj) {
          nextMapping[subj] = {
            grades: [...sourceData.grades],
            sections: JSON.parse(JSON.stringify(sourceData.sections || {})),
          };
        }
      }
      return { ...prev, subjectMapping: nextMapping };
    });
    toast({
      title: 'Mapping Copied',
      description: `Copied ${sourceSubj} grade & section mappings to all other selected subjects.`,
    });
  };

  const handleToggleEditGradeForSubject = (subj: string, grade: string) => {
    setEditForm((prev) => {
      const curData = prev.subjectMapping[subj] || { grades: [], sections: {} };
      const isSelected = curData.grades.includes(grade);
      const nextGrades = isSelected
        ? curData.grades.filter((g) => g !== grade)
        : [...curData.grades, grade];
      const nextSections = { ...curData.sections };
      if (!isSelected && (!nextSections[grade] || nextSections[grade].length === 0)) {
        nextSections[grade] = gradeSectionsMap[grade] ? [...gradeSectionsMap[grade]] : [...DEFAULT_SECTIONS];
      }
      return {
        ...prev,
        subjectMapping: {
          ...prev.subjectMapping,
          [subj]: {
            grades: nextGrades,
            sections: nextSections,
          },
        },
      };
    });
  };

  const handleToggleEditSectionForSubject = (subj: string, grade: string, section: string) => {
    setEditForm((prev) => {
      const curData = prev.subjectMapping[subj] || { grades: [], sections: {} };
      const curSecs = curData.sections[grade] || [];
      const isChecked = curSecs.includes(section);
      const nextSecs = isChecked ? curSecs.filter((s) => s !== section) : [...curSecs, section];
      return {
        ...prev,
        subjectMapping: {
          ...prev.subjectMapping,
          [subj]: {
            ...curData,
            sections: {
              ...curData.sections,
              [grade]: nextSecs,
            },
          },
        },
      };
    });
  };

  const handleSelectAllEditSectionsForGrade = (subj: string, grade: string) => {
    const avail = gradeSectionsMap[grade] || DEFAULT_SECTIONS;
    setEditForm((prev) => {
      const curData = prev.subjectMapping[subj] || { grades: [], sections: {} };
      return {
        ...prev,
        subjectMapping: {
          ...prev.subjectMapping,
          [subj]: {
            ...curData,
            sections: {
              ...curData.sections,
              [grade]: [...avail],
            },
          },
        },
      };
    });
  };

  const handleClearEditSectionsForGrade = (subj: string, grade: string) => {
    setEditForm((prev) => {
      const curData = prev.subjectMapping[subj] || { grades: [], sections: {} };
      return {
        ...prev,
        subjectMapping: {
          ...prev.subjectMapping,
          [subj]: {
            ...curData,
            sections: {
              ...curData.sections,
              [grade]: [],
            },
          },
        },
      };
    });
  };

  const handleSelectAllEditSectionsEverywhere = (subj: string) => {
    setEditForm((prev) => {
      const curData = prev.subjectMapping[subj] || { grades: [], sections: {} };
      const nextSections = { ...curData.sections };
      curData.grades.forEach((g) => {
        nextSections[g] = gradeSectionsMap[g] ? [...gradeSectionsMap[g]] : [...DEFAULT_SECTIONS];
      });
      return {
        ...prev,
        subjectMapping: {
          ...prev.subjectMapping,
          [subj]: {
            ...curData,
            sections: nextSections,
          },
        },
      };
    });
  };

  const handleClearAllEditSectionsEverywhere = (subj: string) => {
    setEditForm((prev) => {
      const curData = prev.subjectMapping[subj] || { grades: [], sections: {} };
      const nextSections = { ...curData.sections };
      curData.grades.forEach((g) => {
        nextSections[g] = [];
      });
      return {
        ...prev,
        subjectMapping: {
          ...prev.subjectMapping,
          [subj]: {
            ...curData,
            sections: nextSections,
          },
        },
      };
    });
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
      } else {
        setTeachers([]);
      }
    } catch {
      setTeachers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeachers();
    refreshCounts();
    try {
      const raw = sessionStorage.getItem('sc_user') || localStorage.getItem('smart_calendar_auth_session');
      if (raw) {
        const parsed = JSON.parse(raw);
        setSchoolName(parsed.schoolName || parsed.user?.schoolName || '');
      }
    } catch {}
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
      const allGradesSet = new Set<string>();
      Object.values(form.subjectMapping).forEach((data) => {
        data.grades?.forEach((g) => allGradesSet.add(g));
      });
      const consolidatedGrades = Array.from(allGradesSet).sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
        if (numA !== numB) return numA - numB;
        return a.localeCompare(b);
      });

      const serializedSections = serializeSubjectGradeSectionsMap(form.subjectMapping);
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
          grades: consolidatedGrades,
          sections: serializedSections,
        }),
      });
      if (r.ok) {
        toast({
          title: 'Faculty Added',
          description: `${form.name} added. A password setup email has been dispatched to ${form.email}.`,
        });
        setAddOpen(false);
        setForm({
          name: '',
          email: '',
          phone: '',
          employeeId: '',
          selectedSubjects: [],
          subjectMapping: {},
        });
        setAddActiveSubject('');
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
    const selectedSubs = subs.length > 0 ? subs : (teacher.subject ? [teacher.subject] : []);
    const parsedMapping = parseSubjectGradeSectionsMap(teacher.sections, selectedSubs, grs, gradeSectionsMap);

    setEditForm({
      id: teacher.id,
      name: teacher.name,
      email: teacher.email,
      phone: teacher.phone || '',
      employeeId: teacher.employeeId || '',
      selectedSubjects: selectedSubs,
      subjectMapping: parsedMapping,
      role: teacher.role || 'teacher',
    });
    setEditActiveSubject(selectedSubs[0] || '');
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
      const allGradesSet = new Set<string>();
      Object.values(editForm.subjectMapping).forEach((data) => {
        data.grades?.forEach((g) => allGradesSet.add(g));
      });
      const consolidatedGrades = Array.from(allGradesSet).sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
        if (numA !== numB) return numA - numB;
        return a.localeCompare(b);
      });

      const serializedSections = serializeSubjectGradeSectionsMap(editForm.subjectMapping);
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
          grades: consolidatedGrades,
          sections: serializedSections,
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
            grades: JSON.stringify(consolidatedGrades),
            sections: JSON.stringify(serializedSections),
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
        toast({ title: 'Faculty Bulk Upload Complete', description: d.message || 'Faculty list created & password setup emails dispatched.' });
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

  const handleSendSetupEmail = async (teacher: Teacher, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSendingEmailId(teacher.id);
    try {
      const res = await fetch('/api/teachers/send-setup-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherId: teacher.id }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: 'Password Setup Email Sent',
          description: data.message || `Invitation email sent to ${teacher.email}.`,
        });
      } else {
        toast({
          title: 'Delivery Notice',
          description: data.error || 'Could not send setup email.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to send setup email.',
        variant: 'destructive',
      });
    } finally {
      setSendingEmailId(null);
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

  const gradesDisplay = (gradesJson: string, sectionsJson?: string, subjectsJson?: string, defaultSubj?: string) => {
    const subs = parseList(subjectsJson || defaultSubj);
    const grs = parseList(gradesJson);
    if (grs.length === 0) return 'All Grades';
    if (!sectionsJson) return grs.join(', ');

    const map = parseSubjectGradeSectionsMap(sectionsJson, subs.length > 0 ? subs : ['General'], grs, gradeSectionsMap);
    const parts: string[] = [];

    for (const [subj, data] of Object.entries(map)) {
      if (!data.grades || data.grades.length === 0) continue;
      const gradeParts = data.grades.map((g) => {
        const secs = data.sections[g];
        return secs && secs.length > 0 ? `${g} (${secs.join(', ')})` : g;
      });
      if (subs.length > 1) {
        parts.push(`${subj}: ${gradeParts.join(', ')}`);
      } else {
        parts.push(gradeParts.join(', '));
      }
    }

    if (parts.length > 0) return parts.join(' • ');

    return grs.join(', ');
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
    isEdit = false,
    subject?: string
  ) => {
    let targetGrades: string[] = [];
    if (type === 'all') targetGrades = [...schoolGrades];
    else if (type === 'primary') targetGrades = ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5'];
    else if (type === 'middle') targetGrades = ['Grade 6', 'Grade 7', 'Grade 8'];
    else if (type === 'secondary') targetGrades = ['Grade 9', 'Grade 10'];
    else if (type === 'senior') targetGrades = ['Grade 11', 'Grade 12'];
    else if (type === 'clear') targetGrades = [];

    const targetSubj = subject || (isEdit ? editActiveSubject : addActiveSubject);
    if (!targetSubj) return;

    if (isEdit) {
      setEditForm((prev) => {
        const curData = prev.subjectMapping[targetSubj] || { grades: [], sections: {} };
        const nextSections = { ...curData.sections };
        targetGrades.forEach((g) => {
          if (!nextSections[g] || nextSections[g].length === 0) {
            nextSections[g] = gradeSectionsMap[g] ? [...gradeSectionsMap[g]] : [...DEFAULT_SECTIONS];
          }
        });
        return {
          ...prev,
          subjectMapping: {
            ...prev.subjectMapping,
            [targetSubj]: {
              grades: targetGrades,
              sections: nextSections,
            },
          },
        };
      });
    } else {
      setForm((prev) => {
        const curData = prev.subjectMapping[targetSubj] || { grades: [], sections: {} };
        const nextSections = { ...curData.sections };
        targetGrades.forEach((g) => {
          if (!nextSections[g] || nextSections[g].length === 0) {
            nextSections[g] = gradeSectionsMap[g] ? [...gradeSectionsMap[g]] : [...DEFAULT_SECTIONS];
          }
        });
        return {
          ...prev,
          subjectMapping: {
            ...prev.subjectMapping,
            [targetSubj]: {
              grades: targetGrades,
              sections: nextSections,
            },
          },
        };
      });
    }
  };

  // Reusable Teaching Matrix Mapping Preview
  const renderMappingPreview = (
    teacherName: string,
    subjects: string[],
    subjectMapping: SubjectGradeMapping
  ) => {
    const hasSubjects = subjects.length > 0;
    const totalConfiguredSecs = Object.values(subjectMapping).reduce((acc, data) => {
      return acc + Object.values(data.sections || {}).reduce((sAcc, secs) => sAcc + (secs?.length || 0), 0);
    }, 0);
    const totalGrades = new Set<string>();
    Object.values(subjectMapping).forEach((d) => d.grades?.forEach((g) => totalGrades.add(g)));

    if (!hasSubjects || totalGrades.size === 0) {
      return (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-3 text-center">
          <p className="text-xs font-semibold text-slate-500 flex items-center justify-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-blue-500" />
            Select subjects and assign grades &amp; sections below to preview teaching qualifications
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
            {subjects.length} Subj &bull; {totalGrades.size} Gr &bull; {totalConfiguredSecs} Sec
          </Badge>
        </div>

        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
          {subjects.map((subj) => {
            const data = subjectMapping[subj];
            const subjGrades = data?.grades || [];
            return (
              <div key={subj} className="bg-white/90 border border-blue-100 rounded-lg p-2 text-xs shadow-2xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 flex items-center gap-1">
                    <BookOpen className="w-3 h-3 text-blue-600" /> {subj}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">{teacherName || 'Faculty Member'}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  {subjGrades.length === 0 ? (
                    <span className="text-[10px] text-slate-400 italic">No grades assigned for this subject yet</span>
                  ) : (
                    subjGrades.map((gr) => {
                      const secs = data?.sections[gr] || [];
                      return (
                        <span key={gr} className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 text-[10px] font-semibold px-2 py-0.5 rounded border border-slate-200">
                          <GraduationCap className="w-2.5 h-2.5 text-indigo-500" />
                          {gr} {secs.length > 0 ? (
                            <span className="text-blue-700 font-bold">({secs.join(', ')})</span>
                          ) : (
                            <span className="text-slate-400 italic">(none)</span>
                          )}
                        </span>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
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
                {schoolName || 'Faculty Portal'}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {filtered.map((teacher) => {
                const initials = teacher.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
                const gradesStr = gradesDisplay(teacher.grades, teacher.sections, teacher.subjects, teacher.subject);
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
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => handleOpenEdit(teacher, e)}
                          className="h-7 px-2 text-[11px] font-bold border-slate-200 text-slate-700 hover:text-blue-700 hover:border-blue-300 hover:bg-blue-50 flex-1"
                        >
                          <Edit3 className="w-3 h-3 mr-1 text-blue-600" /> Edit
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          title={`Send password setup email to ${teacher.email}`}
                          disabled={sendingEmailId === teacher.id}
                          onClick={(e) => handleSendSetupEmail(teacher, e)}
                          className="h-7 px-2 text-[11px] font-bold border-indigo-200 bg-indigo-50/60 text-indigo-800 hover:bg-indigo-100 hover:border-indigo-300 shrink-0"
                        >
                          <Mail className="w-3 h-3 mr-1 text-indigo-600" />
                          {sendingEmailId === teacher.id ? 'Sending…' : 'Invite'}
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => handleToggleStatus(teacher, e)}
                          className={`h-7 px-2 text-[11px] font-bold border flex-1 ${
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
                        onClick={() => handleToggleFormSubject(subj)}
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

            {/* Subject-wise Grade & Section Allocation */}
            {form.selectedSubjects.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-4 text-center">
                <p className="text-xs text-slate-500 font-medium">
                  Please select at least one subject above to configure grade and section mappings.
                </p>
              </div>
            ) : (() => {
              const curSubj = form.selectedSubjects.includes(addActiveSubject)
                ? addActiveSubject
                : form.selectedSubjects[0];
              const curData = form.subjectMapping[curSubj] || { grades: [], sections: {} };
              const curGrades = curData.grades || [];

              return (
                <div className="space-y-3 border-t border-slate-100 pt-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <Label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                        Subject-wise Grade &amp; Section Allocation
                      </Label>
                      <p className="text-[11px] text-slate-500">
                        Configure grades &amp; sections specifically for each subject taught.
                      </p>
                    </div>
                    {form.selectedSubjects.length > 1 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleCopyFormMappingToOtherSubjects(curSubj)}
                        className="h-7 px-2.5 text-[11px] font-bold border-blue-200 text-blue-700 bg-blue-50/60 hover:bg-blue-100 shrink-0"
                        title="Copy this subject's grade & section settings to all other selected subjects"
                      >
                        <Copy className="w-3 h-3 mr-1" />
                        Copy to Other Subjects
                      </Button>
                    )}
                  </div>

                  {/* Subject Tabs */}
                  <div className="flex flex-wrap gap-1.5 p-1.5 bg-slate-100/90 rounded-xl border border-slate-200">
                    {form.selectedSubjects.map((s) => {
                      const isActive = curSubj === s;
                      const sData = form.subjectMapping[s] || { grades: [], sections: {} };
                      const grCount = sData.grades?.length || 0;
                      const secCount = Object.values(sData.sections || {}).reduce((acc, secs) => acc + (secs?.length || 0), 0);
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setAddActiveSubject(s)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            isActive
                              ? 'bg-white text-blue-900 shadow-sm border border-blue-200'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                          }`}
                        >
                          <span>{s}</span>
                          <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                            isActive ? 'bg-blue-100 text-blue-700' : 'bg-slate-200/80 text-slate-600'
                          }`}>
                            {grCount} Gr &bull; {secCount} Sec
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Active Subject Configuration Container */}
                  <div className="rounded-xl border border-blue-200/70 bg-gradient-to-b from-blue-50/25 to-slate-50/25 p-3 space-y-3">
                    {/* Grades for Active Subject */}
                    <div className="space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <div>
                          <Label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                            <GraduationCap className="w-3.5 h-3.5 text-indigo-600" />
                            Grades for <span className="text-blue-700 underline underline-offset-2">{curSubj}</span>
                          </Label>
                          <p className="text-[11px] text-slate-500">Pick which grades this teacher instructs for {curSubj}.</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                          <Button type="button" size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-blue-700 font-bold" onClick={() => setGradePreset('all', false, curSubj)}>All 1-12</Button>
                          <Button type="button" size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-slate-600" onClick={() => setGradePreset('primary', false, curSubj)}>Gr 1-5</Button>
                          <Button type="button" size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-slate-600" onClick={() => setGradePreset('middle', false, curSubj)}>Gr 6-8</Button>
                          <Button type="button" size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-slate-600" onClick={() => setGradePreset('secondary', false, curSubj)}>Gr 9-10</Button>
                          <Button type="button" size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-slate-600" onClick={() => setGradePreset('senior', false, curSubj)}>Gr 11-12</Button>
                          <Button type="button" size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-rose-600 font-bold" onClick={() => setGradePreset('clear', false, curSubj)}>Clear</Button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5 p-2 bg-white rounded-xl border border-slate-200">
                        {schoolGrades.map((grade) => {
                          const isSelected = curGrades.includes(grade);
                          return (
                            <button
                              key={grade}
                              type="button"
                              onClick={() => handleToggleFormGradeForSubject(curSubj, grade)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                                isSelected
                                  ? 'bg-indigo-600 text-white shadow-xs'
                                  : 'bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {isSelected && <Check className="w-3 h-3" />}
                              {grade}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Sections for Active Subject */}
                    <div className="space-y-2 border-t border-slate-200/80 pt-2.5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <div>
                          <Label className="text-xs font-bold text-slate-900">
                            Sections for <span className="text-blue-700">{curSubj}</span> (Grade-wise)
                          </Label>
                          <p className="text-[11px] text-slate-500">
                            Assign exact sections for each grade in {curSubj}.
                          </p>
                        </div>
                        {curGrades.length > 0 && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleSelectAllFormSectionsEverywhere(curSubj)}
                              className="text-[10px] text-blue-600 font-bold hover:underline"
                            >
                              Select All
                            </button>
                            <button
                              type="button"
                              onClick={() => handleClearAllFormSectionsEverywhere(curSubj)}
                              className="text-[10px] text-slate-500 font-bold hover:underline"
                            >
                              Clear
                            </button>
                          </div>
                        )}
                      </div>

                      {curGrades.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-white/60 p-3 text-center">
                          <p className="text-xs text-slate-500">
                            Please select one or more <strong>Grades</strong> above for {curSubj} to configure sections.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                          {curGrades.map((grade) => {
                            const availableSecs = gradeSectionsMap[grade] || DEFAULT_SECTIONS;
                            const assignedSecs = curData.sections?.[grade] || [];
                            return (
                              <div
                                key={grade}
                                className="rounded-xl border border-slate-200 bg-white p-2.5 space-y-2 shadow-2xs"
                              >
                                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                    <GraduationCap className="w-3.5 h-3.5 text-indigo-600" />
                                    {grade} Sections
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleSelectAllFormSectionsForGrade(curSubj, grade)}
                                      className="text-[10px] text-blue-600 font-bold hover:underline"
                                    >
                                      Select All
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleClearFormSectionsForGrade(curSubj, grade)}
                                      className="text-[10px] text-slate-500 font-bold hover:underline"
                                    >
                                      Clear
                                    </button>
                                  </div>
                                </div>

                                <div className="flex flex-wrap gap-1.5">
                                  {availableSecs.map((sec) => {
                                    const isChecked = assignedSecs.includes(sec);
                                    return (
                                      <label
                                        key={sec}
                                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold cursor-pointer transition-all ${
                                          isChecked
                                            ? 'bg-blue-50 border-blue-300 text-blue-900 shadow-2xs'
                                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={() => handleToggleFormSectionForSubject(curSubj, grade, sec)}
                                          className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                                        />
                                        Section {sec}
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Real-Time Mapping Preview */}
            <div className="pt-2">
              {renderMappingPreview(
                form.name,
                form.selectedSubjects,
                form.subjectMapping
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
                        onClick={() => handleToggleEditSubject(subj)}
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

            {/* Subject-wise Grade & Section Allocation */}
            {editForm.selectedSubjects.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-4 text-center">
                <p className="text-xs text-slate-500 font-medium">
                  Please select at least one subject above to configure grade and section mappings.
                </p>
              </div>
            ) : (() => {
              const curSubj = editForm.selectedSubjects.includes(editActiveSubject)
                ? editActiveSubject
                : editForm.selectedSubjects[0];
              const curData = editForm.subjectMapping[curSubj] || { grades: [], sections: {} };
              const curGrades = curData.grades || [];

              return (
                <div className="space-y-3 border-t border-slate-100 pt-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <Label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                        Subject-wise Grade &amp; Section Allocation
                      </Label>
                      <p className="text-[11px] text-slate-500">
                        Configure grades &amp; sections specifically for each subject taught.
                      </p>
                    </div>
                    {editForm.selectedSubjects.length > 1 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleCopyEditMappingToOtherSubjects(curSubj)}
                        className="h-7 px-2.5 text-[11px] font-bold border-blue-200 text-blue-700 bg-blue-50/60 hover:bg-blue-100 shrink-0"
                        title="Copy this subject's grade & section settings to all other selected subjects"
                      >
                        <Copy className="w-3 h-3 mr-1" />
                        Copy to Other Subjects
                      </Button>
                    )}
                  </div>

                  {/* Subject Tabs */}
                  <div className="flex flex-wrap gap-1.5 p-1.5 bg-slate-100/90 rounded-xl border border-slate-200">
                    {editForm.selectedSubjects.map((s) => {
                      const isActive = curSubj === s;
                      const sData = editForm.subjectMapping[s] || { grades: [], sections: {} };
                      const grCount = sData.grades?.length || 0;
                      const secCount = Object.values(sData.sections || {}).reduce((acc, secs) => acc + (secs?.length || 0), 0);
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setEditActiveSubject(s)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            isActive
                              ? 'bg-white text-blue-900 shadow-sm border border-blue-200'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                          }`}
                        >
                          <span>{s}</span>
                          <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                            isActive ? 'bg-blue-100 text-blue-700' : 'bg-slate-200/80 text-slate-600'
                          }`}>
                            {grCount} Gr &bull; {secCount} Sec
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Active Subject Configuration Container */}
                  <div className="rounded-xl border border-blue-200/70 bg-gradient-to-b from-blue-50/25 to-slate-50/25 p-3 space-y-3">
                    {/* Grades for Active Subject */}
                    <div className="space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <div>
                          <Label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                            <GraduationCap className="w-3.5 h-3.5 text-indigo-600" />
                            Grades for <span className="text-blue-700 underline underline-offset-2">{curSubj}</span>
                          </Label>
                          <p className="text-[11px] text-slate-500">Pick which grades this teacher instructs for {curSubj}.</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                          <Button type="button" size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-blue-700 font-bold" onClick={() => setGradePreset('all', true, curSubj)}>All 1-12</Button>
                          <Button type="button" size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-slate-600" onClick={() => setGradePreset('primary', true, curSubj)}>Gr 1-5</Button>
                          <Button type="button" size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-slate-600" onClick={() => setGradePreset('middle', true, curSubj)}>Gr 6-8</Button>
                          <Button type="button" size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-slate-600" onClick={() => setGradePreset('secondary', true, curSubj)}>Gr 9-10</Button>
                          <Button type="button" size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-slate-600" onClick={() => setGradePreset('senior', true, curSubj)}>Gr 11-12</Button>
                          <Button type="button" size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-rose-600 font-bold" onClick={() => setGradePreset('clear', true, curSubj)}>Clear</Button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5 p-2 bg-white rounded-xl border border-slate-200">
                        {schoolGrades.map((grade) => {
                          const isSelected = curGrades.includes(grade);
                          return (
                            <button
                              key={grade}
                              type="button"
                              onClick={() => handleToggleEditGradeForSubject(curSubj, grade)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                                isSelected
                                  ? 'bg-indigo-600 text-white shadow-xs'
                                  : 'bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {isSelected && <Check className="w-3 h-3" />}
                              {grade}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Sections for Active Subject */}
                    <div className="space-y-2 border-t border-slate-200/80 pt-2.5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <div>
                          <Label className="text-xs font-bold text-slate-900">
                            Sections for <span className="text-blue-700">{curSubj}</span> (Grade-wise)
                          </Label>
                          <p className="text-[11px] text-slate-500">
                            Assign exact sections for each grade in {curSubj}.
                          </p>
                        </div>
                        {curGrades.length > 0 && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleSelectAllEditSectionsEverywhere(curSubj)}
                              className="text-[10px] text-blue-600 font-bold hover:underline"
                            >
                              Select All
                            </button>
                            <button
                              type="button"
                              onClick={() => handleClearAllEditSectionsEverywhere(curSubj)}
                              className="text-[10px] text-slate-500 font-bold hover:underline"
                            >
                              Clear
                            </button>
                          </div>
                        )}
                      </div>

                      {curGrades.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-white/60 p-3 text-center">
                          <p className="text-xs text-slate-500">
                            Please select one or more <strong>Grades</strong> above for {curSubj} to configure sections.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                          {curGrades.map((grade) => {
                            const availableSecs = gradeSectionsMap[grade] || DEFAULT_SECTIONS;
                            const assignedSecs = curData.sections?.[grade] || [];
                            return (
                              <div
                                key={grade}
                                className="rounded-xl border border-slate-200 bg-white p-2.5 space-y-2 shadow-2xs"
                              >
                                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                    <GraduationCap className="w-3.5 h-3.5 text-indigo-600" />
                                    {grade} Sections
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleSelectAllEditSectionsForGrade(curSubj, grade)}
                                      className="text-[10px] text-blue-600 font-bold hover:underline"
                                    >
                                      Select All
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleClearEditSectionsForGrade(curSubj, grade)}
                                      className="text-[10px] text-slate-500 font-bold hover:underline"
                                    >
                                      Clear
                                    </button>
                                  </div>
                                </div>

                                <div className="flex flex-wrap gap-1.5">
                                  {availableSecs.map((sec) => {
                                    const isChecked = assignedSecs.includes(sec);
                                    return (
                                      <label
                                        key={sec}
                                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold cursor-pointer transition-all ${
                                          isChecked
                                            ? 'bg-blue-50 border-blue-300 text-blue-900 shadow-2xs'
                                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={() => handleToggleEditSectionForSubject(curSubj, grade, sec)}
                                          className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                                        />
                                        Section {sec}
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

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
                editForm.subjectMapping
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between items-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={sendingEmailId === editForm.id}
              onClick={() => {
                const cur = teachers.find((t) => t.id === editForm.id);
                if (cur) handleSendSetupEmail(cur);
              }}
              className="text-xs font-bold border-indigo-200 bg-indigo-50/50 text-indigo-700 hover:bg-indigo-100"
            >
              <Mail className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
              {sendingEmailId === editForm.id ? 'Sending Link...' : 'Resend Password Setup Email'}
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button
                onClick={handleSaveEdit}
                disabled={saving}
                className="bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 text-white font-bold"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
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
              Upload an Excel (`.xlsx`, `.csv`) file with Teacher Name, Email, Subjects, Grades, and Sections to populate the Faculty Directory with subject-wise mappings.
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
                      <p className="text-[11px] text-slate-500 mt-0.5">Supports CSV/Excel with Name, Email, Subjects, Grades & Sections</p>
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

              {/* Subject & Section Qualifications */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs">
                <span className="font-bold text-slate-700">Teaching Qualifications: </span>
                <span className="text-slate-600 font-medium">
                  {gradesDisplay(viewTeacher.grades, viewTeacher.sections, viewTeacher.subjects, viewTeacher.subject)}
                </span>
              </div>

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
