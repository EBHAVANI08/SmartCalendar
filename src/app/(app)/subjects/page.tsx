'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  BookOpen, Plus, Users, AlertCircle, Layers, Save, Loader2, CheckCircle2, Ban,
  UserPlus, X, Trash2, Copy, Sparkles, Search, Check, Filter, DoorOpen, Clock,
  ArrowRight, ShieldCheck, Zap
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ROOM_TYPES } from '@/lib/room-types';
import { BOARD_GRADE_SUBJECTS } from '@/lib/curriculum-data';

const GRADES = Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`);
const PRIORITIES = ['Core', 'High', 'Normal', 'Low'] as const;

const PRIORITY_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  Core:   { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  High:   { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  Normal: { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' },
  Low:    { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
};

interface SubjectPreset {
  name: string;
  category: 'core' | 'science' | 'tech' | 'language' | 'arts' | 'activity';
  defaultWeekly: number;
  maxPerDay: number;
  priority: 'Core' | 'High' | 'Normal' | 'Low';
  roomType?: string;
  icon?: string;
}

const POPULAR_SUBJECT_PRESETS: SubjectPreset[] = [
  { name: 'Mathematics', category: 'core', defaultWeekly: 6, maxPerDay: 2, priority: 'Core' },
  { name: 'English', category: 'language', defaultWeekly: 5, maxPerDay: 2, priority: 'Core' },
  { name: 'Science', category: 'science', defaultWeekly: 5, maxPerDay: 2, priority: 'Core' },
  { name: 'Social Science', category: 'core', defaultWeekly: 4, maxPerDay: 1, priority: 'High' },
  { name: 'Physics', category: 'science', defaultWeekly: 4, maxPerDay: 2, priority: 'High', roomType: 'physics_lab' },
  { name: 'Chemistry', category: 'science', defaultWeekly: 4, maxPerDay: 2, priority: 'High', roomType: 'chemistry_lab' },
  { name: 'Biology', category: 'science', defaultWeekly: 4, maxPerDay: 2, priority: 'High', roomType: 'biology_lab' },
  { name: 'Hindi', category: 'language', defaultWeekly: 4, maxPerDay: 1, priority: 'Normal' },
  { name: 'Computer Science', category: 'tech', defaultWeekly: 3, maxPerDay: 1, priority: 'High', roomType: 'computer_lab' },
  { name: 'Artificial Intelligence', category: 'tech', defaultWeekly: 3, maxPerDay: 1, priority: 'High', roomType: 'computer_lab' },
  { name: 'Physical Education', category: 'activity', defaultWeekly: 2, maxPerDay: 1, priority: 'Normal', roomType: 'sports_ground' },
  { name: 'Art & Craft', category: 'arts', defaultWeekly: 2, maxPerDay: 1, priority: 'Normal', roomType: 'art_room' },
  { name: 'Music', category: 'arts', defaultWeekly: 2, maxPerDay: 1, priority: 'Normal', roomType: 'music_room' },
  { name: 'Library', category: 'activity', defaultWeekly: 1, maxPerDay: 1, priority: 'Low', roomType: 'library' },
  { name: 'Environmental Studies (EVS)', category: 'science', defaultWeekly: 4, maxPerDay: 1, priority: 'High' },
  { name: 'History & Civics', category: 'core', defaultWeekly: 3, maxPerDay: 1, priority: 'Normal' },
  { name: 'Geography', category: 'core', defaultWeekly: 3, maxPerDay: 1, priority: 'Normal' },
];

interface SubjectConfig {
  id: string;
  grade: string;
  subjectName: string;
  weeklyPeriods: number;
  maxPeriodsPerDay: number;
  allowConsecutive: boolean;
  priority: string;
  requiredRoomType?: string | null;
  active: boolean;
  teachers: { id: string; name: string }[];
}

export default function SubjectManagementPage() {
  const { toast } = useToast();
  const [grade, setGrade] = useState('Grade 10');
  const [subjects, setSubjects] = useState<SubjectConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Dialog states
  const [addOpen, setAddOpen] = useState(false);
  const [importPresetOpen, setImportPresetOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedBoard, setSelectedBoard] = useState('CBSE');

  // Teacher mapping state
  const [mapFor, setMapFor] = useState<SubjectConfig | null>(null);
  const [allTeachers, setAllTeachers] = useState<{ id: string; name: string; subjects: string[] }[]>([]);
  const [mapBusy, setMapBusy] = useState(false);

  // New Subject Draft with Multi-Grade selection
  const [selectedGrades, setSelectedGrades] = useState<string[]>(['Grade 10']);
  const [draft, setDraft] = useState({
    subjectName: '',
    weeklyPeriods: '4',
    maxPeriodsPerDay: '2',
    allowConsecutive: false,
    priority: 'Normal',
    requiredRoomType: '',
  });

  // Target grades for copy dialog
  const [targetCopyGrades, setTargetCopyGrades] = useState<string[]>([]);
  const [copying, setCopying] = useState(false);

  // Load subjects for active grade
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/subjects?grade=${encodeURIComponent(grade)}`);
      const data = await res.json();
      setSubjects(res.ok && data.success ? data.subjects : []);
    } catch {
      setSubjects([]);
    } finally {
      setLoading(false);
    }
  }, [grade]);

  useEffect(() => { load(); }, [load]);

  // Keep selectedGrades synced with active grade initially
  useEffect(() => {
    setSelectedGrades([grade]);
  }, [grade]);

  // Load faculty list
  useEffect(() => {
    fetch('/api/teachers')
      .then((r) => r.json())
      .then((d) =>
        setAllTeachers(
          Array.isArray(d)
            ? d.map((t: any) => ({
                id: t.id,
                name: t.name,
                subjects: (() => { try { return JSON.parse(t.subjects ?? '[]'); } catch { return [t.subject]; } })(),
              }))
            : []
        )
      )
      .catch(() => setAllTeachers([]));
  }, [subjects]);

  const mapTeacher = async (teacherId: string, subjectName: string, remove: boolean) => {
    setMapBusy(true);
    try {
      const res = await fetch('/api/subjects/map-teacher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherId, subjectName, grade, remove }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'Could not update mapping', description: data.error, variant: 'destructive' });
        return;
      }
      toast({ title: 'Mapping updated', description: data.message });
      await load();
    } finally {
      setMapBusy(false);
    }
  };

  const patch = async (row: SubjectConfig, changes: Partial<SubjectConfig>) => {
    setSavingId(row.id);
    try {
      const res = await fetch('/api/subjects', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, ...changes }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'Not saved', description: data.error, variant: 'destructive' });
        await load();
        return;
      }
      setSubjects((prev) => prev.map((s) => (s.id === row.id ? { ...s, ...changes } : s)));
    } catch {
      toast({ title: 'Not saved', description: 'Request failed.', variant: 'destructive' });
    } finally {
      setSavingId(null);
    }
  };

  const deleteSubject = async (row: SubjectConfig) => {
    if (!confirm(`Are you sure you want to remove ${row.subjectName} from ${row.grade}?`)) return;
    setSavingId(row.id);
    try {
      const res = await fetch(`/api/subjects?id=${encodeURIComponent(row.id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'Could not remove subject', description: data.error, variant: 'destructive' });
        return;
      }
      toast({ title: 'Subject removed', description: `${row.subjectName} was removed from ${row.grade}.` });
      await load();
    } catch {
      toast({ title: 'Request failed', variant: 'destructive' });
    } finally {
      setSavingId(null);
    }
  };

  // Grade selection shortcuts
  const toggleGrade = (g: string) => {
    setSelectedGrades((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]
    );
  };

  const selectGradeRange = (type: 'all' | 'current' | 'primary' | 'middle' | 'secondary' | 'senior') => {
    switch (type) {
      case 'all':
        setSelectedGrades([...GRADES]);
        break;
      case 'current':
        setSelectedGrades([grade]);
        break;
      case 'primary':
        setSelectedGrades(['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5']);
        break;
      case 'middle':
        setSelectedGrades(['Grade 6', 'Grade 7', 'Grade 8']);
        break;
      case 'secondary':
        setSelectedGrades(['Grade 9', 'Grade 10']);
        break;
      case 'senior':
        setSelectedGrades(['Grade 11', 'Grade 12']);
        break;
    }
  };

  // Apply a quick subject preset
  const applyPreset = (preset: SubjectPreset) => {
    setDraft({
      subjectName: preset.name,
      weeklyPeriods: String(preset.defaultWeekly),
      maxPeriodsPerDay: String(preset.maxPerDay),
      allowConsecutive: preset.defaultWeekly >= 4,
      priority: preset.priority,
      requiredRoomType: preset.roomType || '',
    });
  };

  const addSubjectMultiGrade = async () => {
    if (selectedGrades.length === 0) {
      toast({ title: 'Select at least one grade', variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grades: selectedGrades,
          subjectName: draft.subjectName,
          weeklyPeriods: Number(draft.weeklyPeriods),
          maxPeriodsPerDay: Number(draft.maxPeriodsPerDay),
          allowConsecutive: draft.allowConsecutive,
          priority: draft.priority,
          requiredRoomType: draft.requiredRoomType || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'Could not add subject', description: data.error, variant: 'destructive' });
        return;
      }
      toast({
        title: 'Subject added',
        description: `${draft.subjectName} added to ${data.createdCount ?? selectedGrades.length} grade(s).`,
      });
      setAddOpen(false);
      setDraft({
        subjectName: '',
        weeklyPeriods: '4',
        maxPeriodsPerDay: '2',
        allowConsecutive: false,
        priority: 'Normal',
        requiredRoomType: '',
      });
      await load();
    } finally {
      setCreating(false);
    }
  };

  // Import board presets
  const handleImportBoardPresets = async () => {
    const boardData = BOARD_GRADE_SUBJECTS[selectedBoard];
    if (!boardData) {
      toast({ title: 'No preset data found for this board', variant: 'destructive' });
      return;
    }

    setCreating(true);
    try {
      let totalCreated = 0;
      for (const g of GRADES) {
        const standardSubjects = boardData[g] || [];
        for (const subName of standardSubjects) {
          const matchedPreset = POPULAR_SUBJECT_PRESETS.find(
            (p) => p.name.toLowerCase() === subName.toLowerCase()
          );
          await fetch('/api/subjects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              grade: g,
              subjectName: subName,
              weeklyPeriods: matchedPreset ? matchedPreset.defaultWeekly : 4,
              maxPeriodsPerDay: matchedPreset ? matchedPreset.maxPerDay : 2,
              allowConsecutive: false,
              priority: matchedPreset ? matchedPreset.priority : 'Normal',
              requiredRoomType: matchedPreset?.roomType || null,
            }),
          }).catch(() => null);
          totalCreated++;
        }
      }
      toast({
        title: 'Curriculum presets imported',
        description: `Imported standard ${selectedBoard} subjects across Grade 1 to 12.`,
      });
      setImportPresetOpen(false);
      await load();
    } finally {
      setCreating(false);
    }
  };

  // Copy subjects from current grade to other grades
  const handleCopySubjects = async () => {
    if (targetCopyGrades.length === 0 || subjects.length === 0) return;
    setCopying(true);
    try {
      for (const targetG of targetCopyGrades) {
        for (const s of subjects) {
          await fetch('/api/subjects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              grade: targetG,
              subjectName: s.subjectName,
              weeklyPeriods: s.weeklyPeriods,
              maxPeriodsPerDay: s.maxPeriodsPerDay,
              allowConsecutive: s.allowConsecutive,
              priority: s.priority,
              requiredRoomType: s.requiredRoomType || null,
            }),
          }).catch(() => null);
        }
      }
      toast({
        title: 'Subjects copied',
        description: `Copied ${subjects.length} subjects from ${grade} to ${targetCopyGrades.join(', ')}.`,
      });
      setCopyOpen(false);
      setTargetCopyGrades([]);
    } finally {
      setCopying(false);
    }
  };

  const filteredSubjects = subjects.filter((s) =>
    s.subjectName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const weeklyTotal = subjects.filter((s) => s.active).reduce((sum, s) => sum + s.weeklyPeriods, 0);
  const unstaffed = subjects.filter((s) => s.active && s.teachers.length === 0);
  const specializedRoomsCount = subjects.filter((s) => s.active && s.requiredRoomType).length;

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-xs">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-900">Subject Management</h1>
              <p className="text-xs text-slate-500 font-medium">
                Configure grade-wise subject quotas, priority weighting, specialized room requirements, and teacher assignments.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportPresetOpen(true)}
            className="text-xs gap-1.5 h-9 font-semibold text-slate-700 hover:bg-slate-50 border-slate-300"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Board Presets</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setCopyOpen(true)}
            disabled={subjects.length === 0}
            className="text-xs gap-1.5 h-9 font-semibold text-slate-700 hover:bg-slate-50 border-slate-300"
          >
            <Copy className="w-3.5 h-3.5 text-indigo-500" />
            <span>Copy to Other Grades</span>
          </Button>

          <Button
            onClick={() => {
              setSelectedGrades([grade]);
              setAddOpen(true);
            }}
            className="text-xs gap-1.5 h-9 font-bold bg-slate-900 hover:bg-slate-800 text-white shadow-xs"
          >
            <Plus className="w-4 h-4 text-emerald-400" />
            <span>Add Subject</span>
          </Button>
        </div>
      </div>

      {/* ── Grade Switcher Pill Bar ── */}
      <div className="bg-slate-100/80 p-1.5 rounded-2xl border border-slate-200/80">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2.5 shrink-0">
            Select Grade:
          </span>
          {GRADES.map((g) => {
            const isActive = grade === g;
            return (
              <button
                key={g}
                type="button"
                onClick={() => setGrade(g)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-200/60 border border-slate-200/60'
                }`}
              >
                {g}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Summary Stats Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-slate-200 shadow-xs bg-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Active Subjects</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-black text-slate-900">
                  {subjects.filter((s) => s.active).length}
                </span>
                <span className="text-xs text-slate-400 font-medium">in {grade}</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 border border-blue-100">
              <Layers className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-xs bg-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Weekly Period Demand</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-black text-slate-900">{weeklyTotal}</span>
                <span className="text-xs text-slate-400 font-medium">periods / week</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 border border-indigo-100">
              <Clock className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-xs bg-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Teacher Staffing Status</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className={`text-2xl font-black ${unstaffed.length > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {unstaffed.length === 0 ? 'Fully Staffed' : `${unstaffed.length} Unstaffed`}
                </span>
              </div>
            </div>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
              unstaffed.length > 0 ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200'
            }`}>
              {unstaffed.length > 0 ? <AlertCircle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Unstaffed Warning Alert ── */}
      {unstaffed.length > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50/90 border border-amber-200 shadow-xs">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-bold text-amber-950">
              {unstaffed.length} subject(s) have no mapped faculty for {grade}
            </p>
            <p className="text-amber-800 leading-relaxed">
              <span className="font-semibold">{unstaffed.map((s) => s.subjectName).join(', ')}</span> — The timetable generator needs at least one teacher assigned to each active subject to generate class schedules.
            </p>
          </div>
        </div>
      )}

      {/* ── Subjects Table & Search Card ── */}
      <Card className="border-slate-200 shadow-xs overflow-hidden">
        <CardHeader className="p-5 pb-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span>{grade} Subject Curriculum</span>
              <Badge variant="outline" className="text-xs bg-slate-50 text-slate-600 border-slate-200 font-semibold">
                {subjects.length} Total
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 mt-0.5">
              Edit weekly teaching periods, priorities, double period allowances, and assigned faculty.
            </CardDescription>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              placeholder="Search subjects…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-xs bg-slate-50 border-slate-200 rounded-xl"
            />
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="py-16 text-center text-slate-400 text-xs">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
              Loading subjects for {grade}…
            </div>
          ) : filteredSubjects.length === 0 ? (
            <div className="py-16 text-center px-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3 border border-blue-100 shadow-xs">
                <BookOpen className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-800">
                {searchQuery ? 'No matching subjects found' : `No subjects configured for ${grade}`}
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto mb-4">
                {searchQuery
                  ? 'Try clearing your search query to see all subjects.'
                  : `Add custom subjects or import standard ${selectedBoard} curriculum presets to get started.`}
              </p>
              <div className="flex items-center justify-center gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setSelectedGrades([grade]);
                    setAddOpen(true);
                  }}
                  className="gap-1.5 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white"
                >
                  <Plus className="w-4 h-4" /> Add Subject to {grade}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setImportPresetOpen(true)}
                  className="gap-1.5 text-xs font-semibold"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Import Board Presets
                </Button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left font-bold text-slate-500 bg-slate-50/80 border-b border-slate-200">
                    <th className="py-3 px-4">Subject Name</th>
                    <th className="py-3 px-3">Weekly Periods</th>
                    <th className="py-3 px-3">Max / Day</th>
                    <th className="py-3 px-3">Double Period</th>
                    <th className="py-3 px-3">Priority</th>
                    <th className="py-3 px-3">Required Room</th>
                    <th className="py-3 px-3">Assigned Faculty</th>
                    <th className="py-3 px-3">Active</th>
                    <th className="py-3 px-3 text-right pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSubjects.map((s) => {
                    const pStyle = PRIORITY_STYLE[s.priority] || PRIORITY_STYLE.Normal;
                    const isSaving = savingId === s.id;
                    return (
                      <tr
                        key={s.id}
                        className={`transition-colors hover:bg-slate-50/60 ${s.active ? '' : 'opacity-40 bg-slate-50/30'}`}
                      >
                        {/* Subject Name */}
                        <td className="py-3.5 px-4 font-bold text-slate-900">
                          <div className="flex items-center gap-2">
                            <span>{s.subjectName}</span>
                            {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />}
                          </div>
                        </td>

                        {/* Weekly Periods */}
                        <td className="py-3.5 px-3">
                          <Input
                            type="number"
                            min={0}
                            max={20}
                            className="w-18 h-8 text-xs font-bold text-center bg-white"
                            defaultValue={s.weeklyPeriods}
                            onBlur={(e) => {
                              const v = Number(e.target.value);
                              if (v !== s.weeklyPeriods) patch(s, { weeklyPeriods: v });
                            }}
                          />
                        </td>

                        {/* Max per day */}
                        <td className="py-3.5 px-3">
                          <Input
                            type="number"
                            min={1}
                            max={8}
                            className="w-18 h-8 text-xs font-bold text-center bg-white"
                            defaultValue={s.maxPeriodsPerDay}
                            onBlur={(e) => {
                              const v = Number(e.target.value);
                              if (v !== s.maxPeriodsPerDay) patch(s, { maxPeriodsPerDay: v });
                            }}
                          />
                        </td>

                        {/* Double Period Toggle */}
                        <td className="py-3.5 px-3">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={s.allowConsecutive}
                              onCheckedChange={(v) => patch(s, { allowConsecutive: v })}
                            />
                            <span className="text-[10px] text-slate-400 font-medium">
                              {s.allowConsecutive ? 'Yes' : 'No'}
                            </span>
                          </div>
                        </td>

                        {/* Priority Dropdown */}
                        <td className="py-3.5 px-3">
                          <Select
                            value={s.priority}
                            onValueChange={(v) => patch(s, { priority: v })}
                          >
                            <SelectTrigger className={`w-24 h-8 text-xs font-bold border ${pStyle.bg} ${pStyle.text} ${pStyle.border}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PRIORITIES.map((p) => (
                                <SelectItem key={p} value={p} className="text-xs font-semibold">
                                  {p}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>

                        {/* Required Room */}
                        <td className="py-3.5 px-3">
                          <Select
                            value={s.requiredRoomType ?? 'any'}
                            onValueChange={(v) => patch(s, { requiredRoomType: v === 'any' ? '' : v })}
                          >
                            <SelectTrigger className="w-36 h-8 text-xs font-semibold bg-white" data-testid="required-room-type">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="any">Standard Classroom</SelectItem>
                              {ROOM_TYPES.map((t) => (
                                <SelectItem key={t.id} value={t.id} className="text-xs">
                                  {t.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>

                        {/* Mapped Teachers */}
                        <td className="py-3.5 px-3">
                          <div className="flex items-center gap-2">
                            {s.teachers.length === 0 ? (
                              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-bold">
                                <Ban className="w-3 h-3 mr-1" /> No Faculty
                              </Badge>
                            ) : (
                              <div className="flex flex-wrap gap-1 max-w-[200px]">
                                {s.teachers.map((t) => (
                                  <span
                                    key={t.id}
                                    className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold"
                                  >
                                    {t.name}
                                  </span>
                                ))}
                              </div>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-[11px] font-bold text-blue-700 hover:bg-blue-50"
                              onClick={() => setMapFor(s)}
                            >
                              <UserPlus className="w-3 h-3 mr-1" /> Map
                            </Button>
                          </div>
                        </td>

                        {/* Active Toggle */}
                        <td className="py-3.5 px-3">
                          <Switch checked={s.active} onCheckedChange={(v) => patch(s, { active: v })} />
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-3 text-right pr-4">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                            onClick={() => deleteSubject(s)}
                            title="Delete subject"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Dialog: Add Subject with Multi-Grade Selection & Presets ── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                <Plus className="w-4 h-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-slate-900">
                  Add Subject to Curriculum
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  Configure subject rules, period allocations, and choose which grades should have this subject.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-5 pt-2">
            {/* 1. Quick Presets Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Quick Popular Subjects (Click to Autofill)
                </Label>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1 bg-slate-50 rounded-xl border border-slate-200">
                {POPULAR_SUBJECT_PRESETS.map((preset) => {
                  const isSelected = draft.subjectName.toLowerCase() === preset.name.toLowerCase();
                  return (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-white text-slate-700 hover:bg-slate-200/80 border border-slate-200'
                      }`}
                    >
                      {preset.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Target Grades Multi-Select */}
            <div className="space-y-2.5 p-3.5 bg-slate-50/80 rounded-2xl border border-slate-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <Label className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-600" />
                  Which Grade(s) should have this subject?
                </Label>
                <Badge className="bg-blue-600 text-white font-bold text-[10px] w-fit">
                  {selectedGrades.length} Grade(s) Selected
                </Badge>
              </div>

              {/* Quick Grade Range Filters */}
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: 'Current Only', type: 'current' as const },
                  { label: 'All (1–12)', type: 'all' as const },
                  { label: 'Primary (1–5)', type: 'primary' as const },
                  { label: 'Middle (6–8)', type: 'middle' as const },
                  { label: 'Secondary (9–10)', type: 'secondary' as const },
                  { label: 'Senior (11–12)', type: 'senior' as const },
                ].map((btn) => (
                  <button
                    key={btn.label}
                    type="button"
                    onClick={() => selectGradeRange(btn.type)}
                    className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-white text-slate-600 hover:bg-slate-200 border border-slate-200 transition-colors"
                  >
                    {btn.label}
                  </button>
                ))}
              </div>

              {/* Grade Checkbox Pills */}
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1.5 pt-1">
                {GRADES.map((g) => {
                  const isChecked = selectedGrades.includes(g);
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => toggleGrade(g)}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                        isChecked
                          ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-2xs font-extrabold'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <span>{g.replace('Grade ', 'Gr ')}</span>
                      {isChecked && <Check className="w-3 h-3 text-blue-600 ml-1" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Subject Name */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-800">Subject Official Name</Label>
              <Input
                placeholder="e.g. Artificial Intelligence, Mathematics, English Literature"
                value={draft.subjectName}
                onChange={(e) => setDraft({ ...draft, subjectName: e.target.value })}
                className="h-9 text-xs"
              />
            </div>

            {/* 4. Weekly Periods & Max per day */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-800">Weekly Periods (Total per week)</Label>
                <Input
                  type="number"
                  min={0}
                  max={20}
                  value={draft.weeklyPeriods}
                  onChange={(e) => setDraft({ ...draft, weeklyPeriods: e.target.value })}
                  className="h-9 text-xs"
                />
                <p className="text-[10px] text-slate-400">Total sessions to schedule each week.</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-800">Max Periods per Day</Label>
                <Input
                  type="number"
                  min={1}
                  max={8}
                  value={draft.maxPeriodsPerDay}
                  onChange={(e) => setDraft({ ...draft, maxPeriodsPerDay: e.target.value })}
                  className="h-9 text-xs"
                />
                <p className="text-[10px] text-slate-400">Cap on periods in a single teaching day.</p>
              </div>
            </div>

            {/* 5. Priority & Double Periods */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-800">Scheduling Priority</Label>
                <Select
                  value={draft.priority}
                  onValueChange={(v) => setDraft({ ...draft, priority: v })}
                >
                  <SelectTrigger className="h-9 text-xs font-semibold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p} className="text-xs font-semibold">
                        {p} (Priority Weight)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-200 bg-slate-50 h-9">
                <Switch
                  checked={draft.allowConsecutive}
                  onCheckedChange={(v) => setDraft({ ...draft, allowConsecutive: v })}
                />
                <Label className="text-xs font-bold text-slate-700 cursor-pointer">
                  Allow Consecutive / Double Periods
                </Label>
              </div>
            </div>

            {/* 6. Required Room Type */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <DoorOpen className="w-3.5 h-3.5 text-indigo-500" /> Required Room Type (Optional)
              </Label>
              <Select
                value={draft.requiredRoomType || 'any'}
                onValueChange={(v) => setDraft({ ...draft, requiredRoomType: v === 'any' ? '' : v })}
              >
                <SelectTrigger className="h-9 text-xs font-semibold">
                  <SelectValue placeholder="Standard Classroom (No special room needed)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Standard Classroom (General)</SelectItem>
                  {ROOM_TYPES.map((t) => (
                    <SelectItem key={t.id} value={t.id} className="text-xs">
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-slate-400">
                If specified, the AI generator will assign matching specialized facilities (e.g. Physics Lab, Computer Lab).
              </p>
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-slate-100 flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={addSubjectMultiGrade}
              disabled={creating || draft.subjectName.trim().length < 2 || selectedGrades.length === 0}
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>
                Add Subject to {selectedGrades.length} Grade{selectedGrades.length > 1 ? 's' : ''}
              </span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Import Board Standard Curriculum Presets ── */}
      <Dialog open={importPresetOpen} onOpenChange={setImportPresetOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-slate-900">
                  Import Board Curriculum Presets
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  Populate standard subjects, period quotas, and lab room requirements automatically.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Select Educational Board</Label>
              <Select value={selectedBoard} onValueChange={setSelectedBoard}>
                <SelectTrigger className="h-9 text-xs font-bold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['CBSE', 'ICSE', 'IB', 'Cambridge'].map((b) => (
                    <SelectItem key={b} value={b} className="text-xs font-semibold">
                      {b} (Standard Curriculum)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900 space-y-1.5">
              <p className="font-bold flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-blue-600" /> What this does:
              </p>
              <ul className="list-disc pl-4 space-y-1 text-[11px] text-blue-800">
                <li>Pre-configures core subjects (Maths, Science, English, Languages) for Grades 1–12.</li>
                <li>Assigns lab requirements for Physics, Chemistry, Biology, and Computer Science.</li>
                <li>Preserves any custom subjects you have already created.</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setImportPresetOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleImportBoardPresets}
              disabled={creating}
              className="gap-2 bg-amber-600 hover:bg-amber-700 text-white font-bold"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>Import {selectedBoard} Presets</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Copy Subjects to other Grades ── */}
      <Dialog open={copyOpen} onOpenChange={setCopyOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
                <Copy className="w-4 h-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-slate-900">
                  Copy {grade} Subjects to Other Grades
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  Duplicate all {subjects.length} subjects from {grade} into target grades.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Label className="text-xs font-bold text-slate-800">Select Target Grades to receive copy:</Label>
            <div className="grid grid-cols-3 gap-2">
              {GRADES.filter((g) => g !== grade).map((g) => {
                const isSelected = targetCopyGrades.includes(g);
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() =>
                      setTargetCopyGrades((prev) =>
                        prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]
                      )
                    }
                    className={`px-2.5 py-2 rounded-xl text-xs font-bold transition-all border ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {g}
                  </button>
                );
              })}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCopyOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCopySubjects}
              disabled={copying || targetCopyGrades.length === 0}
              className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
            >
              {copying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
              <span>Copy to {targetCopyGrades.length} Grade(s)</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Subject → Teacher Mapping ── */}
      <Dialog open={!!mapFor} onOpenChange={(o) => { if (!o) setMapFor(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-slate-900">
                  Assign Teachers for {mapFor?.subjectName}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  Mapping a teacher here updates their faculty record and enables the AI scheduler to allocate them for {grade}.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {mapFor && (
            <div className="space-y-2 pt-2">
              {allTeachers.map((t) => {
                const mapped = t.subjects.some(
                  (x) => x.toLowerCase() === mapFor.subjectName.toLowerCase()
                );
                return (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50/80 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900">{t.name}</p>
                      <p className="text-[11px] text-slate-500 truncate">
                        Specializations: {t.subjects.join(', ') || 'None listed'}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant={mapped ? 'outline' : 'default'}
                      disabled={mapBusy}
                      className={
                        mapped
                          ? 'border-rose-300 text-rose-700 hover:bg-rose-50 text-xs font-bold h-8'
                          : 'bg-slate-900 text-white text-xs font-bold h-8'
                      }
                      onClick={() => mapTeacher(t.id, mapFor.subjectName, mapped)}
                    >
                      {mapBusy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : mapped ? (
                        <><X className="w-3.5 h-3.5 mr-1" /> Unmap</>
                      ) : (
                        <><UserPlus className="w-3.5 h-3.5 mr-1 text-emerald-400" /> Map Faculty</>
                      )}
                    </Button>
                  </div>
                );
              })}
              {allTeachers.length === 0 && (
                <p className="text-xs text-slate-500 py-8 text-center">
                  No faculty records found. Add teachers in the Faculty Directory.
                </p>
              )}
            </div>
          )}

          <DialogFooter className="pt-3 border-t border-slate-100">
            <Button onClick={() => setMapFor(null)} className="font-bold">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
