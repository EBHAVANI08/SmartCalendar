'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  CalendarDays, Plus, ChevronLeft, ChevronRight,
  Clock, MapPin, Sparkles, Printer, Bookmark,
  Flag, Edit2, Trash2, Loader2, Calendar as CalendarIcon,
  CheckCircle2, Info, RefreshCw, X
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

interface CalendarEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  endDate?: string;
  category: string;
  source?: 'school' | 'leave' | 'cover';
  description?: string;
  time?: string;
  location?: string;
  readOnly?: boolean;
}

const CATEGORY_STYLES: Record<string, { label: string; bg: string; badge: string; dot: string }> = {
  holiday: {
    label: 'Public Holiday',
    bg: 'bg-rose-50/90 border-rose-200 text-rose-800 hover:bg-rose-100',
    badge: 'bg-rose-100 text-rose-800 border-rose-300',
    dot: 'bg-rose-500',
  },
  exam: {
    label: 'Examination',
    bg: 'bg-blue-50/90 border-blue-200 text-blue-900 hover:bg-blue-100',
    badge: 'bg-blue-100 text-blue-800 border-blue-300',
    dot: 'bg-blue-600',
  },
  event: {
    label: 'School Event',
    bg: 'bg-indigo-50/90 border-indigo-200 text-indigo-900 hover:bg-indigo-100',
    badge: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    dot: 'bg-indigo-600',
  },
  ptm: {
    label: 'PTM Meet',
    bg: 'bg-sky-50/90 border-sky-200 text-sky-900 hover:bg-sky-100',
    badge: 'bg-sky-100 text-sky-800 border-sky-300',
    dot: 'bg-sky-600',
  },
  workshop: {
    label: 'Faculty Workshop',
    bg: 'bg-amber-50/90 border-amber-200 text-amber-900 hover:bg-amber-100',
    badge: 'bg-amber-100 text-amber-800 border-amber-300',
    dot: 'bg-amber-500',
  },
  leave: {
    label: 'Approved Leave',
    bg: 'bg-violet-50/90 border-violet-200 text-violet-800 hover:bg-violet-100',
    badge: 'bg-violet-100 text-violet-800 border-violet-300',
    dot: 'bg-violet-500',
  },
  substitution: {
    label: 'Substitution Cover',
    bg: 'bg-teal-50/90 border-teal-200 text-teal-800 hover:bg-teal-100',
    badge: 'bg-teal-100 text-teal-800 border-teal-300',
    dot: 'bg-teal-500',
  },
};

const styleFor = (category: string) =>
  CATEGORY_STYLES[category] ?? {
    label: category,
    bg: 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100',
    badge: 'bg-slate-100 text-slate-800 border-slate-300',
    dot: 'bg-slate-500',
  };

export default function AcademicCalendarPage() {
  const { toast } = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [schoolName, setSchoolName] = useState('');
  const [counts, setCounts] = useState({ school: 0, leave: 0, cover: 0 });
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [includeLeaves, setIncludeLeaves] = useState<boolean>(false);

  // Modals
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [infoModalOpen, setInfoModalOpen] = useState(false);
  const [selectedInfoEvent, setSelectedInfoEvent] = useState<CalendarEvent | null>(null);

  // Edit Event state
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editCategory, setEditCategory] = useState<string>('event');
  const [editIsAllDay, setEditIsAllDay] = useState(true);
  const [editStartTime, setEditStartTime] = useState('09:00');
  const [editEndTime, setEditEndTime] = useState('12:00');
  const [editLocation, setEditLocation] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form states for new event
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventStartDate, setNewEventStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [newEventEndDate, setNewEventEndDate] = useState('');
  const [newEventCategory, setNewEventCategory] = useState<string>('event');
  const [newEventIsAllDay, setNewEventIsAllDay] = useState(true);
  const [newEventStartTime, setNewEventStartTime] = useState('09:00');
  const [newEventEndTime, setNewEventEndTime] = useState('12:00');
  const [newEventLocation, setNewEventLocation] = useState('');
  const [newEventDesc, setNewEventDesc] = useState('');

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Month range boundaries for API
  const rangeFrom = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const rangeTo = `${year}-${String(month + 1).padStart(2, '0')}-${String(
    new Date(year, month + 1, 0).getDate()
  ).padStart(2, '0')}`;

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/calendar/feed?from=${rangeFrom}&to=${rangeTo}&includeLeaves=${includeLeaves}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Could not load the calendar (HTTP ${res.status}).`);
      setEvents(Array.isArray(data.entries) ? data.entries : []);
      setCounts(data.counts ?? { school: 0, leave: 0, cover: 0 });
    } catch (err) {
      setEvents([]);
      setCounts({ school: 0, leave: 0, cover: 0 });
      setLoadError(err instanceof Error ? err.message : 'Could not load the calendar.');
    } finally {
      setLoading(false);
    }
  }, [rangeFrom, rangeTo, includeLeaves]);

  useEffect(() => {
    loadEvents();
    try {
      const raw = sessionStorage.getItem('sc_user') || localStorage.getItem('smart_calendar_auth_session');
      if (raw) {
        const parsed = JSON.parse(raw);
        setSchoolName(parsed.schoolName || parsed.user?.schoolName || '');
      }
    } catch {}
  }, [loadEvents]);

  // One-click standard milestones seeder
  const handleSeedStandardCalendar = async (reset = false) => {
    setSeeding(true);
    try {
      const res = await fetch(`/api/calendar/seed?reset=${reset}`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        toast({
          title: '✅ Academic Milestones Loaded',
          description: data.message || 'Standard national holidays and term milestones populated.',
        });
        await loadEvents();
      } else {
        toast({
          title: 'Notice',
          description: data.message || data.error || 'Calendar already populated.',
        });
      }
    } catch (err) {
      toast({
        title: 'Error loading milestones',
        description: err instanceof Error ? err.message : 'Network error.',
        variant: 'destructive',
      });
    } finally {
      setSeeding(false);
    }
  };

  // Open add event for a specific date cell
  const handleOpenAddForDate = (dayNumber: number) => {
    const monthFormatted = String(month + 1).padStart(2, '0');
    const dayFormatted = String(dayNumber).padStart(2, '0');
    const dateStr = `${year}-${monthFormatted}-${dayFormatted}`;
    setNewEventStartDate(dateStr);
    setNewEventEndDate('');
    setNewEventTitle('');
    setNewEventDesc('');
    setNewEventLocation('');
    setNewEventCategory('event');
    setNewEventIsAllDay(true);
    setAddModalOpen(true);
  };

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventTitle.trim() || !newEventStartDate) return;

    const startAt = newEventIsAllDay
      ? new Date(`${newEventStartDate}T00:00:00.000Z`)
      : new Date(`${newEventStartDate}T${newEventStartTime || '09:00'}:00.000Z`);

    const effectiveEndDate = newEventEndDate || newEventStartDate;
    const endAt = newEventIsAllDay
      ? new Date(`${effectiveEndDate}T23:59:59.000Z`)
      : new Date(`${effectiveEndDate}T${newEventEndTime || '12:00'}:00.000Z`);

    setSaving(true);
    try {
      const res = await fetch('/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newEventTitle.trim(),
          description: newEventDesc.trim() || undefined,
          roomId: newEventLocation.trim() || undefined,
          category: newEventCategory,
          status: 'published',
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          allDay: newEventIsAllDay,
          createdBy: 'school-admin',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: 'Event not saved',
          description: data?.error || `The server rejected the event (HTTP ${res.status}).`,
          variant: 'destructive',
        });
        return;
      }

      toast({ title: 'Milestone Added', description: `"${newEventTitle}" has been scheduled.` });
      setAddModalOpen(false);
      setNewEventTitle('');
      setNewEventDesc('');
      setNewEventLocation('');
      await loadEvents();
    } catch (err) {
      toast({
        title: 'Event not saved',
        description: err instanceof Error ? err.message : 'Network error.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleOpenEditEvent = (ev: CalendarEvent, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (ev.readOnly) {
      setSelectedInfoEvent(ev);
      setInfoModalOpen(true);
      return;
    }
    setEditingEvent(ev);
    setEditTitle(ev.title);
    setEditStartDate(ev.date);
    setEditEndDate(ev.endDate && ev.endDate !== ev.date ? ev.endDate : '');
    setEditCategory(ev.category || 'event');
    const isAll = !ev.time || ev.time.includes('All Day');
    setEditIsAllDay(isAll);
    if (!isAll && ev.time?.includes('-')) {
      const [s, ed] = ev.time.split('-').map((x) => x.trim());
      setEditStartTime(s || '09:00');
      setEditEndTime(ed || '12:00');
    } else {
      setEditStartTime('09:00');
      setEditEndTime('12:00');
    }
    setEditLocation(ev.location || '');
    setEditDesc(ev.description || '');
    setEditModalOpen(true);
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEvent || !editTitle.trim() || !editStartDate) return;

    const startAt = editIsAllDay
      ? new Date(`${editStartDate}T00:00:00.000Z`)
      : new Date(`${editStartDate}T${editStartTime || '09:00'}:00.000Z`);

    const effectiveEndDate = editEndDate || editStartDate;
    const endAt = editIsAllDay
      ? new Date(`${effectiveEndDate}T23:59:59.000Z`)
      : new Date(`${effectiveEndDate}T${editEndTime || '12:00'}:00.000Z`);

    setSaving(true);
    try {
      const res = await fetch('/api/calendar/events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingEvent.id,
          title: editTitle.trim(),
          description: editDesc.trim() || null,
          roomId: editLocation.trim() || null,
          category: editCategory,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          allDay: editIsAllDay,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: 'Event not updated',
          description: data?.error || `Server error (HTTP ${res.status}).`,
          variant: 'destructive',
        });
        return;
      }
      toast({ title: 'Milestone Updated', description: `"${editTitle}" updated successfully.` });
      setEditModalOpen(false);
      setEditingEvent(null);
      await loadEvents();
    } catch {
      toast({ title: 'Event not updated', description: 'Network error.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEvent = async (ev: CalendarEvent, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm(`Are you sure you want to delete event "${ev.title}"?`)) return;
    setDeletingId(ev.id);
    try {
      const res = await fetch(`/api/calendar/events?id=${encodeURIComponent(ev.id)}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        toast({ title: 'Event Removed', description: `"${ev.title}" deleted.` });
        if (editModalOpen) setEditModalOpen(false);
        await loadEvents();
      } else {
        toast({ title: 'Could not delete event', description: data?.error || 'Failed to delete event', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Request failed', description: 'Network error deleting event.', variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  // Dynamic Today Detection
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  const currentDay = today.getDate();

  // Calendar Grid Calculation
  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const paddingArray = Array.from({ length: firstDayIndex }, (_, i) => i);

  const filteredEvents = events.filter((ev) => {
    if (selectedCategory === 'all') return true;
    return ev.category === selectedCategory;
  });

  const getEventsForDay = (dayNumber: number) => {
    const monthFormatted = String(month + 1).padStart(2, '0');
    const dayFormatted = String(dayNumber).padStart(2, '0');
    const dateStr = `${year}-${monthFormatted}-${dayFormatted}`;
    return filteredEvents.filter((ev) => ev.date === dateStr);
  };

  // Distinct Upcoming Milestones for the Sidebar (prioritizing school events, deduplicating multi-day entries)
  const upcomingMilestones = (() => {
    const seen = new Set<string>();
    const list: CalendarEvent[] = [];
    for (const ev of events) {
      const baseId = ev.id.split('-')[0];
      if (seen.has(baseId)) continue;
      seen.add(baseId);
      list.push(ev);
    }
    return list
      .filter((ev) => selectedCategory === 'all' || ev.category === selectedCategory)
      .slice(0, 8);
  })();

  return (
    <div id="printable-timetable-container" className="space-y-6">
      {/* ── Official Header ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-700 via-indigo-800 to-slate-900 flex items-center justify-center text-white shadow-md shadow-blue-900/30 shrink-0 border border-blue-500/20">
            <CalendarDays className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#081A33]">
                Academic Calendar &amp; School Milestones
              </h1>
              <Badge className="bg-blue-50 text-[#2563EB] border border-blue-200 font-bold text-[10px] uppercase tracking-wider">
                {schoolName || 'Live Academic Matrix'}
              </Badge>
            </div>
            <p className="text-xs text-[#64748B] font-medium mt-1">
              Institutional academic schedule, examinations, gazetted holidays, term breaks, and PTMs.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Seed/Reload Standard Milestones */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSeedStandardCalendar(true)}
            disabled={seeding}
            className="gap-1.5 text-xs border-blue-200 text-blue-700 bg-blue-50/50 hover:bg-blue-100 font-bold h-9 shadow-xs px-3"
            title="Populate or refresh official CBSE/Board academic holidays & exam milestones"
          >
            {seeding ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            )}
            Load Standard CBSE Milestones
          </Button>

          {/* Print Calendar */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              document.title = `${schoolName || 'School'} — Academic Calendar (${monthNames[month]} ${year})`;
              window.print();
            }}
            className="gap-2 text-xs border-[#E2E8F0] text-[#0F2747] bg-white hover:bg-slate-50 font-bold h-9 shadow-xs px-3.5"
          >
            <Printer className="w-4 h-4 text-[#2563EB]" /> Print Calendar
          </Button>

          {/* Add Event */}
          <Button
            size="sm"
            onClick={() => {
              setNewEventStartDate(new Date().toISOString().slice(0, 10));
              setNewEventEndDate('');
              setNewEventTitle('');
              setNewEventDesc('');
              setNewEventLocation('');
              setNewEventCategory('event');
              setNewEventIsAllDay(true);
              setAddModalOpen(true);
            }}
            className="gap-2 bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 hover:from-blue-800 hover:to-slate-950 text-white font-bold h-9 shadow-md text-xs px-3.5 border-none cursor-pointer"
          >
            <Plus className="w-4 h-4 text-amber-300" /> Add Event / Holiday
          </Button>
        </div>
      </div>

      {/* ── Banner if 0 School Events in DB ── */}
      {!loading && counts.school === 0 && (
        <div className="p-4 bg-gradient-to-r from-blue-50 via-indigo-50 to-white rounded-2xl border border-blue-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <p className="text-xs font-bold text-blue-950">Academic Calendar is Ready to Populate</p>
              <p className="text-[11px] text-blue-800 mt-0.5">
                Load standard CBSE/Board gazetted holidays, periodic tests, term exams, vacations, and PTMs with one click.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => handleSeedStandardCalendar(false)}
            disabled={seeding}
            className="bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold shrink-0 h-8"
          >
            {seeding ? 'Populating…' : 'Populate Milestones Now'}
          </Button>
        </div>
      )}

      {/* ── Month Navigator & Filters ── */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-4 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          {/* Month Switcher */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={prevMonth} title="Previous Month">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={nextMonth} title="Next Month">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <h2 className="text-lg font-black text-slate-900 min-w-44 tracking-tight">
              {monthNames[month]} {year}
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={goToToday}
              className={`text-xs font-bold h-7 px-2.5 rounded-lg border ${
                month === currentMonth && year === currentYear
                  ? 'bg-blue-50 text-blue-700 border-blue-300'
                  : 'text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              Today
            </Button>
          </div>

          {/* Category Filter Pills + Leaves Toggle */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-1">
              {[
                { id: 'all', label: 'All Milestones' },
                { id: 'holiday', label: 'Holidays' },
                { id: 'exam', label: 'Exams' },
                { id: 'event', label: 'Events' },
                { id: 'ptm', label: 'PTM' },
                { id: 'workshop', label: 'Workshops' },
              ].map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    selectedCategory === cat.id
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Toggle Staff Absence Feed */}
            <div className="border-l border-slate-200 pl-2 ml-1">
              <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-600 hover:text-slate-900">
                <input
                  type="checkbox"
                  checked={includeLeaves}
                  onChange={(e) => setIncludeLeaves(e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-indigo-600 accent-indigo-600 cursor-pointer"
                />
                <span>Include Staff Leaves &amp; Cover</span>
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Main Layout: Calendar Grid + Upcoming Sidebar ── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Monthly Calendar Grid (3 Cols) */}
        <div className="lg:col-span-3 space-y-3">
          <Card className="border-slate-200 shadow-sm overflow-hidden bg-white">
            {/* Day Header Row */}
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center py-2.5 text-xs font-bold text-slate-600 uppercase tracking-wider">
              <span className="text-rose-600">Sun</span>
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span className="text-slate-500">Sat</span>
            </div>

            {/* Dates Grid */}
            <div className="grid grid-cols-7 auto-rows-fr bg-slate-200 gap-px">
              {/* Padding empty cells */}
              {paddingArray.map((_, idx) => (
                <div key={`pad-${idx}`} className="bg-slate-50/50 min-h-24 p-2 text-slate-300 select-none" />
              ))}

              {/* Day cells */}
              {daysArray.map((dayNum) => {
                const dayEvents = getEventsForDay(dayNum);
                // Dynamically detect today without any hardcoding
                const isToday =
                  dayNum === currentDay && month === currentMonth && year === currentYear;

                return (
                  <div
                    key={dayNum}
                    onClick={() => handleOpenAddForDate(dayNum)}
                    className={`bg-white min-h-28 p-2 flex flex-col justify-between transition-colors cursor-pointer group hover:bg-blue-50/25 relative ${
                      isToday ? 'ring-2 ring-blue-600 ring-inset bg-blue-50/30' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                          isToday
                            ? 'bg-blue-700 text-white shadow-xs'
                            : 'text-slate-800 group-hover:bg-slate-100'
                        }`}
                      >
                        {dayNum}
                      </span>
                      <div className="flex items-center gap-1">
                        {dayEvents.length > 0 && (
                          <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1 rounded">
                            {dayEvents.length}
                          </span>
                        )}
                        <span
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-blue-600 font-bold bg-blue-50 hover:bg-blue-100 px-1 rounded"
                          title="Schedule milestone on this date"
                        >
                          +
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1 mt-1.5 overflow-hidden">
                      {dayEvents.slice(0, 3).map((ev) => {
                        const style = styleFor(ev.category);
                        return (
                          <div
                            key={ev.id}
                            onClick={(e) => handleOpenEditEvent(ev, e)}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border truncate leading-snug cursor-pointer transition-transform hover:scale-[1.01] flex items-center gap-1 shadow-2xs ${style.bg}`}
                            title={`${ev.title} — ${ev.time || 'All Day'}${ev.location ? ` @ ${ev.location}` : ''}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                            <span className="truncate">{ev.title}</span>
                          </div>
                        );
                      })}
                      {dayEvents.length > 3 && (
                        <span className="text-[9px] text-slate-500 font-bold block text-center pt-0.5">
                          +{dayEvents.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Upcoming Milestones Sidebar (1 Col) */}
        <div className="space-y-4">
          <Card className="border-slate-200 shadow-sm bg-white">
            <CardHeader className="p-4 pb-2.5 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-800 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Bookmark className="w-4 h-4 text-blue-700" />
                  Upcoming Milestones
                </span>
                <Badge variant="outline" className="text-[10px] font-bold text-slate-600 bg-slate-50">
                  {upcomingMilestones.length} Events
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3.5 space-y-2.5">
              {loading && (
                <div className="py-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" /> Loading milestones…
                </div>
              )}

              {loadError && !loading && (
                <div className="p-3 rounded-xl border border-red-200 bg-red-50">
                  <p className="text-[11px] font-bold text-red-900">Could not load the calendar</p>
                  <p className="text-[11px] text-red-800 mt-0.5">{loadError}</p>
                  <Button size="sm" variant="outline" className="mt-2 h-7 text-[11px]" onClick={loadEvents}>
                    Try again
                  </Button>
                </div>
              )}

              {!loading && !loadError && upcomingMilestones.length === 0 && (
                <div className="py-6 text-center" data-testid="calendar-empty">
                  <CalendarIcon className="w-8 h-8 mx-auto text-slate-300 mb-1.5" />
                  <p className="text-xs font-bold text-slate-700">No milestones scheduled</p>
                  <p className="text-[11px] text-slate-400 mt-1 max-w-[200px] mx-auto">
                    Add holidays, examinations, and events directly to the database.
                  </p>
                  <Button size="sm" className="mt-3 h-7 text-[11px] gap-1.5" onClick={() => setAddModalOpen(true)}>
                    <Plus className="w-3 h-3" /> Add Event
                  </Button>
                </div>
              )}

              {upcomingMilestones.map((ev) => {
                const style = styleFor(ev.category);
                return (
                  <div
                    key={ev.id}
                    onClick={(e) => handleOpenEditEvent(ev, e)}
                    className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-white hover:border-blue-300 hover:shadow-xs transition-all cursor-pointer group"
                  >
                    <div className="flex items-center justify-between gap-1.5 mb-1">
                      <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border ${style.badge}`}>
                        {style.label}
                      </span>
                      <span className="text-[10px] font-mono font-semibold text-slate-500">
                        {ev.date}{ev.endDate && ev.endDate !== ev.date ? ` to ${ev.endDate}` : ''}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-slate-900 leading-snug group-hover:text-blue-700 transition-colors">
                      {ev.title}
                    </p>
                    {ev.location && (
                      <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-1 truncate">
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                        {ev.location}
                      </p>
                    )}
                    {ev.description && (
                      <p className="text-[10px] text-slate-600 mt-0.5 line-clamp-1 italic">
                        {ev.description}
                      </p>
                    )}

                    {!ev.readOnly ? (
                      <div className="flex items-center justify-end gap-1 mt-1.5 pt-1.5 border-t border-slate-200/60">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-5 px-1.5 text-[9px] text-slate-600 hover:text-blue-700 hover:bg-blue-50 font-bold"
                          onClick={(e) => handleOpenEditEvent(ev, e)}
                        >
                          <Edit2 className="w-2.5 h-2.5 mr-1" /> Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={deletingId === ev.id}
                          className="h-5 px-1.5 text-[9px] text-slate-600 hover:text-rose-600 hover:bg-rose-50 font-bold"
                          onClick={(e) => handleDeleteEvent(ev, e)}
                        >
                          {deletingId === ev.id ? (
                            <Loader2 className="w-2.5 h-2.5 animate-spin text-rose-600" />
                          ) : (
                            <Trash2 className="w-2.5 h-2.5 mr-1 text-rose-500" />
                          )}
                          Delete
                        </Button>
                      </div>
                    ) : (
                      <p className="text-[9px] text-slate-400 mt-1 italic">
                        From {ev.source === 'leave' ? 'Leave Management' : 'Substitutions'}
                      </p>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Real-time Month Ledger */}
          <Card className="border-slate-200 p-4 bg-white shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-slate-800 text-white flex items-center justify-center shrink-0">
                <Flag className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900">{monthNames[month]} {year}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {counts.school} School Milestones in Database
                </p>
              </div>
            </div>
            <div className="space-y-1.5 pt-1">
              {[
                ['School Academic Milestones', counts.school, 'text-blue-700 font-black'],
                ['Approved Staff Leaves', counts.leave, 'text-violet-700 font-bold'],
                ['Substitution Covers', counts.cover, 'text-teal-700 font-bold'],
              ].map(([label, n, colorClass]) => (
                <div key={label as string} className="flex items-center justify-between py-1 border-b border-slate-100 last:border-0 text-xs">
                  <span className="text-slate-600">{label}</span>
                  <span className={colorClass as string}>{n}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 mt-2.5 leading-relaxed">
              Timetable schedules have their own dedicated view in Timetable Studio.
            </p>
          </Card>
        </div>
      </div>

      {/* ── Add Event Modal Dialog ── */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 font-black">
              <CalendarDays className="w-5 h-5 text-blue-700" />
              Schedule Academic Milestone
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleAddEvent} className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-800">Event / Milestone Title</Label>
              <Input
                value={newEventTitle}
                onChange={(e) => setNewEventTitle(e.target.value)}
                placeholder="e.g. Mid-Term Science Practical Exams"
                required
                className="text-xs h-9"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-800">Start Date</Label>
                <Input
                  type="date"
                  value={newEventStartDate}
                  onChange={(e) => setNewEventStartDate(e.target.value)}
                  required
                  className="text-xs h-9"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-800">End Date (Optional)</Label>
                <Input
                  type="date"
                  value={newEventEndDate}
                  min={newEventStartDate}
                  onChange={(e) => setNewEventEndDate(e.target.value)}
                  placeholder="Leave empty for 1-day"
                  className="text-xs h-9"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-800">Category</Label>
                <Select value={newEventCategory} onValueChange={(val: any) => setNewEventCategory(val)}>
                  <SelectTrigger className="text-xs h-9 font-semibold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="holiday">Public / Gazetted Holiday</SelectItem>
                    <SelectItem value="exam">Examination &amp; Assessments</SelectItem>
                    <SelectItem value="event">School Event / Celebration</SelectItem>
                    <SelectItem value="ptm">Parent-Teacher Meeting (PTM)</SelectItem>
                    <SelectItem value="workshop">Faculty Workshop / Training</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-800">Venue / Location</Label>
                <Input
                  value={newEventLocation}
                  onChange={(e) => setNewEventLocation(e.target.value)}
                  placeholder="e.g. Examination Hall, Auditorium"
                  className="text-xs h-9"
                />
              </div>
            </div>

            {/* All Day Toggle & Timing */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-slate-800 cursor-pointer flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-600" />
                  All-Day Milestone
                </Label>
                <input
                  type="checkbox"
                  checked={newEventIsAllDay}
                  onChange={(e) => setNewEventIsAllDay(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded cursor-pointer accent-blue-600"
                />
              </div>

              {!newEventIsAllDay && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <span className="text-[10px] text-slate-500 font-semibold block mb-0.5">Start Time</span>
                    <Input
                      type="time"
                      value={newEventStartTime}
                      onChange={(e) => setNewEventStartTime(e.target.value)}
                      className="text-xs h-8 bg-white"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-semibold block mb-0.5">End Time</span>
                    <Input
                      type="time"
                      value={newEventEndTime}
                      onChange={(e) => setNewEventEndTime(e.target.value)}
                      className="text-xs h-8 bg-white"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-800">Description / Guidelines</Label>
              <Input
                value={newEventDesc}
                onChange={(e) => setNewEventDesc(e.target.value)}
                placeholder="Optional briefing for staff, students, and parents"
                className="text-xs h-9"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setAddModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 text-white font-bold">
                {saving ? 'Saving…' : 'Save Milestone'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit Event Modal Dialog ── */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-slate-900 font-black">
                <Edit2 className="w-5 h-5 text-blue-700" />
                Edit Academic Milestone
              </span>
              {editingEvent && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={deletingId === editingEvent.id}
                  onClick={(e) => handleDeleteEvent(editingEvent, e)}
                  className="h-7 text-xs text-rose-600 hover:bg-rose-50 font-bold gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleEditSave} className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-800">Event / Milestone Title</Label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="e.g. Annual Sports Day"
                required
                className="text-xs h-9"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-800">Start Date</Label>
                <Input
                  type="date"
                  value={editStartDate}
                  onChange={(e) => setEditStartDate(e.target.value)}
                  required
                  className="text-xs h-9"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-800">End Date</Label>
                <Input
                  type="date"
                  value={editEndDate}
                  min={editStartDate}
                  onChange={(e) => setEditEndDate(e.target.value)}
                  placeholder="Leave empty for 1-day"
                  className="text-xs h-9"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-800">Category</Label>
                <Select value={editCategory} onValueChange={(val: any) => setEditCategory(val)}>
                  <SelectTrigger className="text-xs h-9 font-semibold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="holiday">Public / Gazetted Holiday</SelectItem>
                    <SelectItem value="exam">Examination &amp; Assessments</SelectItem>
                    <SelectItem value="event">School Event / Celebration</SelectItem>
                    <SelectItem value="ptm">Parent-Teacher Meeting (PTM)</SelectItem>
                    <SelectItem value="workshop">Faculty Workshop / Training</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-800">Venue / Location</Label>
                <Input
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  placeholder="e.g. Main Auditorium"
                  className="text-xs h-9"
                />
              </div>
            </div>

            {/* All Day Toggle & Timing */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-slate-800 cursor-pointer flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-600" />
                  All-Day Milestone
                </Label>
                <input
                  type="checkbox"
                  checked={editIsAllDay}
                  onChange={(e) => setEditIsAllDay(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded cursor-pointer accent-blue-600"
                />
              </div>

              {!editIsAllDay && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <span className="text-[10px] text-slate-500 font-semibold block mb-0.5">Start Time</span>
                    <Input
                      type="time"
                      value={editStartTime}
                      onChange={(e) => setEditStartTime(e.target.value)}
                      className="text-xs h-8 bg-white"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-semibold block mb-0.5">End Time</span>
                    <Input
                      type="time"
                      value={editEndTime}
                      onChange={(e) => setEditEndTime(e.target.value)}
                      className="text-xs h-8 bg-white"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-800">Description / Guidelines</Label>
              <Input
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                placeholder="Brief notes"
                className="text-xs h-9"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => { setEditModalOpen(false); setEditingEvent(null); }}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="bg-blue-700 hover:bg-blue-800 text-white font-bold">
                {saving ? 'Updating…' : 'Update Milestone'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Read-Only Staff Context Info Modal ── */}
      <Dialog open={infoModalOpen} onOpenChange={setInfoModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold">
              <Info className="w-5 h-5 text-indigo-600" />
              Operational Staff Feed Entry
            </DialogTitle>
          </DialogHeader>

          {selectedInfoEvent && (
            <div className="space-y-3 py-2 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                <p className="text-sm font-bold text-slate-900">{selectedInfoEvent.title}</p>
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <CalendarDays className="w-3.5 h-3.5" />
                  <span>Date: {selectedInfoEvent.date}</span>
                  {selectedInfoEvent.time && <span>• {selectedInfoEvent.time}</span>}
                </div>
                {selectedInfoEvent.description && (
                  <p className="text-slate-700 pt-1 border-t border-slate-200/60 mt-1.5">
                    {selectedInfoEvent.description}
                  </p>
                )}
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed">
                This record was automatically synchronized from{' '}
                <strong>
                  {selectedInfoEvent.source === 'leave' ? 'Leave Management' : 'Substitutions'}
                </strong>
                . To edit or cancel this request, please visit its respective operational module.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setInfoModalOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
