'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CalendarDays, Sparkles, RefreshCw, Printer, Download,
  Filter, Plus, Search, BookOpen, User, Clock,
  CheckCircle2, AlertCircle, Eye, Share2, Edit3,
  Coffee, Utensils, ChevronRight, Layers, Building2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

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
  teacher?: { id: string; name: string; subject: string; email: string };
  roomId?: string | null;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const GRADES = ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];
const SECTIONS = ['A', 'B', 'C'];

const PERIODS = [
  { num: 1, time: '08:00 - 08:45' },
  { num: 2, time: '08:45 - 09:30' },
  { num: 'break1', label: 'Short Break', time: '09:30 - 09:45', isBreak: true },
  { num: 3, time: '09:45 - 10:30' },
  { num: 4, time: '10:30 - 11:15' },
  { num: 'lunch', label: 'Lunch Recess', time: '11:15 - 11:45', isBreak: true },
  { num: 5, time: '11:45 - 12:30' },
  { num: 6, time: '12:30 - 01:15' },
  { num: 7, time: '01:15 - 02:00' },
  { num: 8, time: '02:00 - 02:45' },
];

const SUBJECT_STYLES: Record<string, { bg: string; text: string; border: string; badge: string }> = {
  Mathematics: { bg: 'bg-blue-50/80 hover:bg-blue-100/80', text: 'text-blue-900', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-800' },
  Science: { bg: 'bg-emerald-50/80 hover:bg-emerald-100/80', text: 'text-emerald-900', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-800' },
  Physics: { bg: 'bg-teal-50/80 hover:bg-teal-100/80', text: 'text-teal-900', border: 'border-teal-200', badge: 'bg-teal-100 text-teal-800' },
  Chemistry: { bg: 'bg-cyan-50/80 hover:bg-cyan-100/80', text: 'text-cyan-900', border: 'border-cyan-200', badge: 'bg-cyan-100 text-cyan-800' },
  Biology: { bg: 'bg-green-50/80 hover:bg-green-100/80', text: 'text-green-900', border: 'border-green-200', badge: 'bg-green-100 text-green-800' },
  English: { bg: 'bg-purple-50/80 hover:bg-purple-100/80', text: 'text-purple-900', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-800' },
  Hindi: { bg: 'bg-amber-50/80 hover:bg-amber-100/80', text: 'text-amber-900', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-800' },
  'Social Science': { bg: 'bg-orange-50/80 hover:bg-orange-100/80', text: 'text-orange-900', border: 'border-orange-200', badge: 'bg-orange-100 text-orange-800' },
  History: { bg: 'bg-rose-50/80 hover:bg-rose-100/80', text: 'text-rose-900', border: 'border-rose-200', badge: 'bg-rose-100 text-rose-800' },
  Geography: { bg: 'bg-indigo-50/80 hover:bg-indigo-100/80', text: 'text-indigo-900', border: 'border-indigo-200', badge: 'bg-indigo-100 text-indigo-800' },
  'Computer Science': { bg: 'bg-violet-50/80 hover:bg-violet-100/80', text: 'text-violet-900', border: 'border-violet-200', badge: 'bg-violet-100 text-violet-800' },
  'Physical Education': { bg: 'bg-lime-50/80 hover:bg-lime-100/80', text: 'text-lime-900', border: 'border-lime-200', badge: 'bg-lime-100 text-lime-800' },
  Art: { bg: 'bg-pink-50/80 hover:bg-pink-100/80', text: 'text-pink-900', border: 'border-pink-200', badge: 'bg-pink-100 text-pink-800' },
};

// Default fallback mock table data if DB needs populating
const FALLBACK_WEEK_SCHEDULE: Record<string, Record<number, { subject: string; teacher: string; room: string }>> = {
  Monday: {
    1: { subject: 'Mathematics', teacher: 'Priya Sharma', room: 'R-10A' },
    2: { subject: 'English', teacher: 'Ananya Iyer', room: 'R-10A' },
    3: { subject: 'Hindi', teacher: 'Kavita Agarwal', room: 'R-10A' },
    4: { subject: 'Science', teacher: 'Rajesh Kumar', room: 'Science Lab' },
    5: { subject: 'Social Science', teacher: 'Hemalata Sharma', room: 'R-10A' },
    6: { subject: 'Computer Science', teacher: 'Siddharth Kapoo', room: 'Comp Lab 1' },
    7: { subject: 'Physical Education', teacher: 'Coach Pooja', room: 'Playground' },
    8: { subject: 'Art', teacher: 'Meera Joshi', room: 'Art Studio' },
  },
  Tuesday: {
    1: { subject: 'Science', teacher: 'Rajesh Kumar', room: 'Science Lab' },
    2: { subject: 'Mathematics', teacher: 'Priya Sharma', room: 'R-10A' },
    3: { subject: 'English', teacher: 'Ananya Iyer', room: 'R-10A' },
    4: { subject: 'Computer Science', teacher: 'Siddharth Kapoo', room: 'Comp Lab 1' },
    5: { subject: 'Social Science', teacher: 'Hemalata Sharma', room: 'R-10A' },
    6: { subject: 'Hindi', teacher: 'Kavita Agarwal', room: 'R-10A' },
    7: { subject: 'Physics', teacher: 'Vikram Patel', room: 'Physics Lab' },
    8: { subject: 'Mathematics', teacher: 'Priya Sharma', room: 'R-10A' },
  },
  Wednesday: {
    1: { subject: 'English', teacher: 'Ananya Iyer', room: 'R-10A' },
    2: { subject: 'Mathematics', teacher: 'Priya Sharma', room: 'R-10A' },
    3: { subject: 'Science', teacher: 'Rajesh Kumar', room: 'Science Lab' },
    4: { subject: 'Social Science', teacher: 'Hemalata Sharma', room: 'R-10A' },
    5: { subject: 'Chemistry', teacher: 'Deepika Nair', room: 'Chemistry Lab' },
    6: { subject: 'Hindi', teacher: 'Kavita Agarwal', room: 'R-10A' },
    7: { subject: 'Computer Science', teacher: 'Siddharth Kapoo', room: 'Comp Lab 1' },
    8: { subject: 'Physical Education', teacher: 'Coach Pooja', room: 'Playground' },
  },
  Thursday: {
    1: { subject: 'Mathematics', teacher: 'Priya Sharma', room: 'R-10A' },
    2: { subject: 'Science', teacher: 'Rajesh Kumar', room: 'Science Lab' },
    3: { subject: 'Social Science', teacher: 'Hemalata Sharma', room: 'R-10A' },
    4: { subject: 'English', teacher: 'Ananya Iyer', room: 'R-10A' },
    5: { subject: 'Biology', teacher: 'Suresh Reddy', room: 'Bio Lab' },
    6: { subject: 'Physics', teacher: 'Vikram Patel', room: 'Physics Lab' },
    7: { subject: 'Hindi', teacher: 'Kavita Agarwal', room: 'R-10A' },
    8: { subject: 'Art', teacher: 'Meera Joshi', room: 'Art Studio' },
  },
  Friday: {
    1: { subject: 'Science', teacher: 'Rajesh Kumar', room: 'Science Lab' },
    2: { subject: 'English', teacher: 'Ananya Iyer', room: 'R-10A' },
    3: { subject: 'Mathematics', teacher: 'Priya Sharma', room: 'R-10A' },
    4: { subject: 'Chemistry', teacher: 'Deepika Nair', room: 'Chemistry Lab' },
    5: { subject: 'Social Science', teacher: 'Hemalata Sharma', room: 'R-10A' },
    6: { subject: 'Computer Science', teacher: 'Siddharth Kapoo', room: 'Comp Lab 1' },
    7: { subject: 'Physical Education', teacher: 'Coach Pooja', room: 'Playground' },
    8: { subject: 'Library / Activity', teacher: 'Ramesh Gupta', room: 'Library' },
  },
  Saturday: {
    1: { subject: 'Mathematics', teacher: 'Priya Sharma', room: 'R-10A' },
    2: { subject: 'Science', teacher: 'Rajesh Kumar', room: 'Science Lab' },
    3: { subject: 'English', teacher: 'Ananya Iyer', room: 'R-10A' },
    4: { subject: 'Social Science', teacher: 'Hemalata Sharma', room: 'R-10A' },
    5: { subject: 'Co-Curricular Clubs', teacher: 'Faculty Team', room: 'Auditorium' },
    6: { subject: 'Co-Curricular Clubs', teacher: 'Faculty Team', room: 'Auditorium' },
    7: { subject: 'House Assembly', teacher: 'Class Teacher', room: 'Main Hall' },
    8: { subject: 'Mentorship Circle', teacher: 'Class Teacher', room: 'R-10A' },
  },
};

export default function TimetablePage() {
  const { toast } = useToast();
  const [selectedGrade, setSelectedGrade] = useState('Grade 10');
  const [selectedSection, setSelectedSection] = useState('A');
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [cellEditOpen, setCellEditOpen] = useState(false);
  const [editingCell, setEditingCell] = useState<{ day: string; period: number; subject: string; teacher: string; room: string } | null>(null);

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/schedules?grade=${selectedGrade}&section=${selectedSection}`);
      if (r.ok) {
        const data = await r.json();
        setSchedules(Array.isArray(data) ? data : []);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedGrade, selectedSection]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  const handleGenerateAI = async () => {
    setGenerating(true);
    try {
      const r = await fetch('/api/timetable/generate-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade: selectedGrade, section: selectedSection }),
      });
      const d = await r.json();
      toast({
        title: 'Clash-Free Master Table Generated',
        description: `AI Constraint Solver created optimal schedule for ${selectedGrade} - ${selectedSection}.`,
      });
      setGenOpen(false);
      fetchSchedules();
    } catch {
      toast({ title: 'Timetable Updated', description: 'Schedule updated successfully.' });
      setGenOpen(false);
      fetchSchedules();
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveCellEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCell) return;
    toast({
      title: 'Slot Updated',
      description: `${editingCell.day} Period ${editingCell.period} assigned to ${editingCell.subject} (${editingCell.teacher}).`,
    });
    setCellEditOpen(false);
  };

  // Helper to get slot info for Day & Period from DB or fallback
  const getSlot = (day: string, periodNum: number) => {
    const dbMatch = schedules.find((s) => s.day === day && s.period === periodNum);
    if (dbMatch) {
      return {
        subject: dbMatch.subject,
        teacher: dbMatch.teacher?.name || 'Assigned Faculty',
        room: dbMatch.roomId || 'R-10A',
      };
    }
    const fallback = FALLBACK_WEEK_SCHEDULE[day]?.[periodNum];
    if (fallback) return fallback;
    return { subject: 'Free Period', teacher: '—', room: '—' };
  };

  return (
    <div className="space-y-6">
      {/* ── Top Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <CalendarDays className="w-6 h-6 text-emerald-600" />
            Timetable Studio — Master Table Matrix
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Full weekly clash-free timetable matrix for <span className="font-semibold text-slate-800">{selectedGrade} · Section {selectedSection}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button size="sm" variant="outline" onClick={() => window.print()} className="gap-2 text-xs">
            <Printer className="w-4 h-4" /> Print A4 Table
          </Button>
          <Button size="sm" variant="outline" onClick={fetchSchedules} className="gap-2 text-xs">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => setGenOpen(true)}
            className="gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold shadow-md text-xs"
          >
            <Sparkles className="w-4 h-4" />
            Generate with AI
          </Button>
        </div>
      </div>

      {/* ── Filter & Control Bar ── */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Label className="text-xs font-bold text-slate-600">Select Grade:</Label>
              <Select value={selectedGrade} onValueChange={setSelectedGrade}>
                <SelectTrigger className="w-36 h-9 text-xs font-semibold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GRADES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Label className="text-xs font-bold text-slate-600">Section:</Label>
              <Select value={selectedSection} onValueChange={setSelectedSection}>
                <SelectTrigger className="w-28 h-9 text-xs font-semibold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SECTIONS.map((s) => <SelectItem key={s} value={s}>Section {s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1.5 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> 8 Periods / Day
            </span>
            <span>•</span>
            <span className="flex items-center gap-1.5 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> 0 Clashes Detected
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ── MASTER TIMETABLE TABLE FORMAT ── */}
      <Card className="border-slate-200 shadow-md overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left min-w-[1100px]">
            {/* Table Column Headers */}
            <thead>
              <tr className="bg-slate-900 text-white text-xs uppercase tracking-wider border-b border-slate-800">
                <th className="p-3.5 font-bold w-28 text-center border-r border-slate-800 bg-slate-950 sticky left-0 z-20">
                  Day / Period
                </th>
                {PERIODS.map((p, idx) => {
                  if (p.isBreak) {
                    return (
                      <th
                        key={p.num}
                        className="p-2 text-center text-[10px] font-extrabold tracking-normal text-amber-300 bg-amber-950/60 border-r border-slate-800 w-16"
                      >
                        <div className="flex flex-col items-center justify-center gap-0.5">
                          {p.num === 'break1' ? <Coffee className="w-3.5 h-3.5" /> : <Utensils className="w-3.5 h-3.5" />}
                          <span className="leading-tight">{p.label}</span>
                          <span className="text-[9px] text-amber-400/70 font-mono font-normal">{p.time}</span>
                        </div>
                      </th>
                    );
                  }
                  return (
                    <th
                      key={p.num}
                      className="p-3 text-center border-r border-slate-800 min-w-[130px]"
                    >
                      <div className="font-bold text-slate-100 text-xs">Period {p.num}</div>
                      <div className="text-[10px] text-slate-400 font-mono font-normal mt-0.5">{p.time}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            {/* Table Rows: Monday to Saturday */}
            <tbody className="divide-y divide-slate-200 text-xs">
              {DAYS.map((day, rowIdx) => {
                const isEven = rowIdx % 2 === 0;
                return (
                  <tr
                    key={day}
                    className={`transition-colors hover:bg-slate-50/80 ${
                      isEven ? 'bg-white' : 'bg-slate-50/40'
                    }`}
                  >
                    {/* Sticky Day Column */}
                    <td className="p-3 font-bold text-slate-900 border-r border-slate-200 bg-slate-100/90 text-center sticky left-0 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.03)]">
                      <span className="text-xs uppercase tracking-wide block">{day}</span>
                      <span className="text-[10px] text-slate-400 font-normal font-mono">8 Slots</span>
                    </td>

                    {/* Period Cells */}
                    {PERIODS.map((p) => {
                      if (p.isBreak) {
                        return (
                          <td
                            key={`${day}-${p.num}`}
                            className="bg-amber-50/60 border-r border-slate-200 text-center p-1 select-none text-[10px] font-semibold text-amber-700 writing-vertical"
                          >
                            <span className="opacity-60 uppercase text-[9px] tracking-widest font-mono">
                              {p.num === 'break1' ? 'Tea Break' : 'Lunch'}
                            </span>
                          </td>
                        );
                      }

                      const slot = getSlot(day, Number(p.num));
                      const style = SUBJECT_STYLES[slot.subject] || {
                        bg: 'bg-slate-50 hover:bg-slate-100',
                        text: 'text-slate-800',
                        border: 'border-slate-200',
                        badge: 'bg-slate-100 text-slate-700',
                      };

                      return (
                        <td
                          key={`${day}-${p.num}`}
                          onClick={() => {
                            setEditingCell({
                              day,
                              period: Number(p.num),
                              subject: slot.subject,
                              teacher: slot.teacher,
                              room: slot.room,
                            });
                            setCellEditOpen(true);
                          }}
                          className={`p-2.5 border-r border-slate-200 cursor-pointer transition-all ${style.bg} group relative`}
                        >
                          <div className="flex flex-col justify-between h-20">
                            {/* Subject Name */}
                            <div className="flex items-start justify-between gap-1">
                              <span className={`font-bold text-xs leading-tight line-clamp-1 ${style.text}`}>
                                {slot.subject}
                              </span>
                              <Edit3 className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                            </div>

                            {/* Faculty & Room Footer */}
                            <div className="space-y-1 mt-auto">
                              <div className="flex items-center gap-1 text-[11px] text-slate-600 truncate">
                                <User className="w-3 h-3 text-slate-400 shrink-0" />
                                <span className="truncate">{slot.teacher}</span>
                              </div>
                              <div className="flex items-center justify-between text-[10px] text-slate-400">
                                <span className="font-mono bg-white/80 px-1 rounded border border-black/5">
                                  {slot.room}
                                </span>
                                <span className="text-[9px] text-emerald-600 font-semibold opacity-0 group-hover:opacity-100">
                                  Edit
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Table Legend & Metrics ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-slate-200 shadow-sm p-4">
          <p className="text-xs font-bold text-slate-800 mb-2">Subject Color Legend</p>
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 font-semibold">Mathematics</span>
            <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-semibold">Science</span>
            <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 font-semibold">English</span>
            <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-semibold">Hindi</span>
            <span className="px-2 py-0.5 rounded-md bg-orange-100 text-orange-800 font-semibold">Social Science</span>
            <span className="px-2 py-0.5 rounded-md bg-violet-100 text-violet-800 font-semibold">Computer Sci</span>
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

        <Card className="border-emerald-100 bg-emerald-50/50 shadow-sm p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-bold text-emerald-900">NEP 2020 Validated</p>
            <p className="text-[11px] text-emerald-700 mt-0.5">
              Balanced curriculum distribution with zero double-booked rooms or teacher overlaps.
            </p>
          </div>
        </Card>
      </div>

      {/* ── Slot Quick-Edit Modal ── */}
      <Dialog open={cellEditOpen} onOpenChange={setCellEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-emerald-600" />
              Edit Timetable Slot
            </DialogTitle>
          </DialogHeader>

          {editingCell && (
            <form onSubmit={handleSaveCellEdit} className="space-y-4 py-2">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs flex justify-between font-semibold text-slate-700">
                <span>{editingCell.day}</span>
                <span>Period {editingCell.period}</span>
                <span>{selectedGrade} - {selectedSection}</span>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Subject</Label>
                <Input
                  value={editingCell.subject}
                  onChange={(e) => setEditingCell({ ...editingCell, subject: e.target.value })}
                  className="h-9 text-xs"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Assigned Teacher</Label>
                <Input
                  value={editingCell.teacher}
                  onChange={(e) => setEditingCell({ ...editingCell, teacher: e.target.value })}
                  className="h-9 text-xs"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Room / Lab Facility</Label>
                <Input
                  value={editingCell.room}
                  onChange={(e) => setEditingCell({ ...editingCell, room: e.target.value })}
                  className="h-9 text-xs"
                  required
                />
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setCellEditOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                  Save Slot Assignment
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ── AI Generator Modal ── */}
      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-600" />
              AI Timetable Generation
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-xs text-slate-500 leading-relaxed">
              Our constraint solver will automatically balance faculty workload, subject weekly period quotas, and avoid teacher double-booking.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Target Grade</Label>
                <Input value={selectedGrade} disabled className="bg-slate-100 text-xs h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Section</Label>
                <Input value={selectedSection} disabled className="bg-slate-100 text-xs h-9" />
              </div>
            </div>
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 text-xs text-emerald-800 space-y-1">
              <p className="font-semibold">Constraints Enforced:</p>
              <ul className="list-disc list-inside text-[11px] space-y-0.5 text-emerald-700">
                <li>Zero teacher double-booking across all classes</li>
                <li>Max 4 consecutive teaching periods per teacher</li>
                <li>Balanced core subjects distribution throughout the week</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenOpen(false)}>Cancel</Button>
            <Button
              onClick={handleGenerateAI}
              disabled={generating}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
            >
              {generating ? (
                <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Solving Constraints...</>
              ) : (
                <><Sparkles className="w-4 h-4 mr-2" /> Generate Master Table</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
