'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  CalendarDays, Plus, ChevronLeft, ChevronRight, Filter,
  Clock, MapPin, Tag, CheckCircle2, AlertCircle, Sparkles,
  Printer, Bookmark, Users, Award, BookOpen, Flag,
  Edit2, Trash2, Loader2
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
  category: string;
  /** Where the entry came from. Derived entries are not editable here. */
  source?: 'school' | 'leave' | 'cover';
  description?: string;
  time?: string;
  location?: string;
  readOnly?: boolean;
}

const CATEGORY_STYLES = {
  holiday: { label: 'Public Holiday', bg: 'bg-rose-50 border-rose-200 text-rose-700', badge: 'bg-rose-100 text-rose-800 border-rose-300' },
  exam: { label: 'Examination', bg: 'bg-blue-50 border-blue-200 text-blue-700', badge: 'bg-blue-100 text-blue-800 border-blue-300' },
  event: { label: 'School Event', bg: 'bg-indigo-50 border-indigo-200 text-indigo-700', badge: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  ptm: { label: 'PTM', bg: 'bg-sky-50 border-sky-200 text-sky-700', badge: 'bg-sky-100 text-sky-800 border-sky-300' },
  workshop: { label: 'Faculty Workshop', bg: 'bg-amber-50 border-amber-200 text-amber-700', badge: 'bg-amber-100 text-amber-800 border-amber-300' },
  leave: { label: 'Approved Leave', bg: 'bg-violet-50 border-violet-200 text-violet-700', badge: 'bg-violet-100 text-violet-800 border-violet-300' },
  substitution: { label: 'Substitution', bg: 'bg-teal-50 border-teal-200 text-teal-700', badge: 'bg-teal-100 text-teal-800 border-teal-300' },
} as Record<string, { label: string; bg: string; badge: string }>;

const styleFor = (category: string) =>
  CATEGORY_STYLES[category] ?? { label: category, bg: 'bg-slate-50 border-slate-200 text-slate-700', badge: 'bg-slate-100 text-slate-800 border-slate-300' };

export default function AcademicCalendarPage() {
  const { toast } = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [schoolName, setSchoolName] = useState('');
  const [counts, setCounts] = useState({ school: 0, leave: 0, cover: 0 });
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [addModalOpen, setAddModalOpen] = useState(false);

  // Edit Event state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editCategory, setEditCategory] = useState<string>('event');
  const [editTime, setEditTime] = useState('09:00 - 12:00');
  const [editLocation, setEditLocation] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form states for new event
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDate, setNewEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [newEventCategory, setNewEventCategory] = useState<string>('event');
  const [newEventTime, setNewEventTime] = useState('09:00 - 12:00');
  const [newEventLocation, setNewEventLocation] = useState('School Campus');
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

  // The month currently on screen, as the API expects it.
  const rangeFrom = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const rangeTo = `${year}-${String(month + 1).padStart(2, '0')}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`;

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/calendar/feed?from=${rangeFrom}&to=${rangeTo}`);
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
  }, [rangeFrom, rangeTo]);

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

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventTitle.trim() || !newEventDate) return;

    // Times are optional; when both are given the event is not all-day.
    const [startRaw, endRaw] = (newEventTime || '').split('-').map((x) => x.trim());
    const allDay = !startRaw || !endRaw;
    const startAt = new Date(`${newEventDate}T${allDay ? '00:00' : startRaw}:00`);
    const endAt = new Date(`${newEventDate}T${allDay ? '23:59' : endRaw}:00`);

    setSaving(true);
    try {
      const res = await fetch('/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newEventTitle.trim(),
          description: [newEventDesc, newEventLocation ? `Location: ${newEventLocation}` : '']
            .filter(Boolean).join(' — ') || undefined,
          category: newEventCategory,
          status: 'published',
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          allDay,
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

      toast({ title: 'Event added', description: `"${newEventTitle}" saved for ${newEventDate}.` });
      setAddModalOpen(false);
      setNewEventTitle('');
      setNewEventDesc('');
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
    setEditingEvent(ev);
    setEditTitle(ev.title);
    setEditDate(ev.date);
    setEditCategory(ev.category || 'event');
    setEditTime(ev.time || '09:00 - 12:00');
    setEditLocation(ev.location || '');
    setEditDesc(ev.description || '');
    setEditModalOpen(true);
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEvent || !editTitle.trim() || !editDate) return;

    const [startRaw, endRaw] = (editTime || '').split('-').map((x) => x.trim());
    const allDay = !startRaw || !endRaw;
    const startAt = new Date(`${editDate}T${allDay ? '00:00' : startRaw}:00`);
    const endAt = new Date(`${editDate}T${allDay ? '23:59' : endRaw}:00`);

    setSaving(true);
    try {
      const res = await fetch('/api/calendar/events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingEvent.id,
          title: editTitle.trim(),
          description: [editDesc, editLocation ? `Location: ${editLocation}` : '']
            .filter(Boolean).join(' — ') || undefined,
          category: editCategory,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          allDay,
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
      toast({ title: 'Event updated', description: `"${editTitle}" has been updated.` });
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
        toast({ title: 'Event deleted', description: `"${ev.title}" was removed.` });
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

  return (
    <div id="printable-timetable-container" className="space-y-6">
      {/* ── Enterprise SaaS Academic Calendar Header ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-700 via-indigo-800 to-slate-900 flex items-center justify-center text-white shadow-md shadow-blue-900/30 shrink-0 border border-blue-500/20">
            <CalendarDays className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#081A33]">
                Academic Calendar & School Milestones
              </h1>
              <Badge className="bg-blue-50 text-[#2563EB] border border-blue-200 font-bold text-[10px] uppercase tracking-wider">
                {schoolName || 'Academic Calendar'}
              </Badge>
            </div>
            <p className="text-xs text-[#64748B] font-medium mt-1">
              Institutional events, examination schedules, term breaks, and board milestones.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="outline" size="sm" onClick={() => { document.title = `${schoolName || 'School'} — Academic Calendar`; window.print(); }} className="gap-2 text-xs border-[#E2E8F0] text-[#0F2747] bg-white hover:bg-slate-50 font-bold h-9 shadow-xs px-3.5">
            <Printer className="w-4 h-4 text-[#2563EB]" /> Print Calendar
          </Button>
          <Button
            size="sm"
            onClick={() => setAddModalOpen(true)}
            className="gap-2 bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 hover:from-blue-800 hover:to-slate-950 text-white font-bold h-9 shadow-md text-xs px-3.5 border-none"
          >
            <Plus className="w-4 h-4 text-amber-300" /> Add Event / Holiday
          </Button>
        </div>
      </div>

      {/* ── Month Navigator & Filters ── */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-4 flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Month Switcher */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={prevMonth}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={nextMonth}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <h2 className="text-lg font-bold text-slate-900 min-w-44">
              {monthNames[month]} {year}
            </h2>
            <Button variant="ghost" size="sm" onClick={goToToday} className="text-xs text-emerald-600 font-bold hover:bg-emerald-50">
              Current Term
            </Button>
          </div>

          {/* Category Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'all', label: 'All Events' },
              { id: 'holiday', label: 'Holidays' },
              { id: 'exam', label: 'Exams' },
              { id: 'event', label: 'Events' },
              { id: 'ptm', label: 'PTM' },
              { id: 'workshop', label: 'Workshops' },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  selectedCategory === cat.id
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Main Layout: Calendar Grid + Upcoming Sidebar ── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Monthly Calendar Grid (3 Cols) */}
        <div className="lg:col-span-3 space-y-3">
          <Card className="border-slate-200 shadow-sm overflow-hidden">
            {/* Day Header Row */}
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center py-2.5 text-xs font-bold text-slate-600 uppercase tracking-wider">
              <span className="text-rose-600">Sun</span>
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span>Sat</span>
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
                const isToday = dayNum === 24 && month === 7 && year === 2026;

                return (
                  <div
                    key={dayNum}
                    className={`bg-white min-h-24 p-2 flex flex-col justify-between transition-colors hover:bg-slate-50/80 ${
                      isToday ? 'ring-2 ring-emerald-500 ring-inset bg-emerald-50/20' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${
                          isToday ? 'bg-emerald-600 text-white' : 'text-slate-700'
                        }`}
                      >
                        {dayNum}
                      </span>
                      {dayEvents.length > 0 && (
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1 rounded">
                          {dayEvents.length}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1 mt-1">
                      {dayEvents.slice(0, 2).map((ev) => {
                        const style = styleFor(ev.category);
                        return (
                          <div
                            key={ev.id}
                            className={`p-1 rounded text-[10px] font-semibold border truncate leading-tight ${style.bg}`}
                            title={`${ev.title} (${ev.time || 'All Day'})`}
                          >
                            {ev.title}
                          </div>
                        );
                      })}
                      {dayEvents.length > 2 && (
                        <span className="text-[9px] text-slate-500 font-semibold block text-center">
                          +{dayEvents.length - 2} more
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
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="p-4 pb-2 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-emerald-600" />
                Upcoming Milestones
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {loading && (
                <p className="text-xs text-slate-400 py-6 text-center">Loading calendar…</p>
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

              {!loading && !loadError && filteredEvents.length === 0 && (
                <div className="py-6 text-center" data-testid="calendar-empty">
                  <p className="text-xs font-semibold text-slate-600">No calendar events yet</p>
                  <p className="text-[11px] text-slate-400 mt-1 max-w-[220px] mx-auto">
                    Approved leave and substitution cover appear here automatically. Add holidays,
                    exams and school events yourself.
                  </p>
                  <Button size="sm" className="mt-3 h-7 text-[11px] gap-1.5" onClick={() => setAddModalOpen(true)}>
                    <Plus className="w-3 h-3" /> Add Event
                  </Button>
                </div>
              )}

              {filteredEvents.slice(0, 6).map((ev) => {
                const style = styleFor(ev.category);
                return (
                  <div key={ev.id} className="p-3 rounded-xl border border-slate-100 bg-slate-50 hover:bg-white hover:border-emerald-200 transition-all">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${style.badge}`}>
                        {style.label}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">{ev.date}</span>
                    </div>
                    <p className="text-xs font-bold text-slate-900 leading-snug">{ev.title}</p>
                    {ev.readOnly && (
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        From {ev.source === 'leave' ? 'Leave Management' : 'Substitutions'} — not editable here
                      </p>
                    )}
                    {ev.location && (
                      <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-1">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        {ev.location}
                      </p>
                    )}

                    {!ev.readOnly && (
                      <div className="flex items-center justify-end gap-1.5 mt-2 pt-2 border-t border-slate-100">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[10px] text-slate-600 hover:text-blue-600 hover:bg-blue-50"
                          onClick={(e) => handleOpenEditEvent(ev, e)}
                        >
                          <Edit2 className="w-3 h-3 mr-1 text-blue-600" /> Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={deletingId === ev.id}
                          className="h-6 px-2 text-[10px] text-slate-600 hover:text-rose-600 hover:bg-rose-50"
                          onClick={(e) => handleDeleteEvent(ev, e)}
                        >
                          {deletingId === ev.id ? (
                            <Loader2 className="w-3 h-3 animate-spin text-rose-600" />
                          ) : (
                            <Trash2 className="w-3 h-3 mr-1 text-rose-500" />
                          )}
                          Delete
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* What this month actually contains, by source */}
          <Card className="border-slate-200 p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-slate-800 text-white flex items-center justify-center shrink-0">
                <Flag className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900">{monthNames[month]} {year}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {events.length} entr{events.length === 1 ? 'y' : 'ies'} this month
                </p>
              </div>
            </div>
            <div className="space-y-1">
              {([
                ['School events', counts.school],
                ['Approved leave', counts.leave],
                ['Substitution cover', counts.cover],
              ] as [string, number][]).map(([label, n]) => (
                <div key={label} className="flex items-center justify-between py-1 border-b border-slate-100 last:border-0">
                  <span className="text-[11px] text-slate-600">{label}</span>
                  <span className="text-[11px] font-bold text-slate-900">{n}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
              Regular teaching periods are not shown here — see the Timetable.
            </p>
          </Card>
        </div>
      </div>

      {/* ── Add Event Modal Dialog ── */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-emerald-600" />
              Schedule Academic Event
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleAddEvent} className="space-y-3.5 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Event / Milestone Title</Label>
              <Input
                value={newEventTitle}
                onChange={(e) => setNewEventTitle(e.target.value)}
                placeholder="e.g. Mid-Term Science Practical Exams"
                required
                className="text-xs h-9"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Date</Label>
                <Input
                  type="date"
                  value={newEventDate}
                  onChange={(e) => setNewEventDate(e.target.value)}
                  required
                  className="text-xs h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Category</Label>
                <Select value={newEventCategory} onValueChange={(val: any) => setNewEventCategory(val)}>
                  <SelectTrigger className="text-xs h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="holiday">Public Holiday</SelectItem>
                    <SelectItem value="exam">Examination</SelectItem>
                    <SelectItem value="event">School Event</SelectItem>
                    <SelectItem value="ptm">Parent-Teacher Meet</SelectItem>
                    <SelectItem value="workshop">Faculty Workshop</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Timing</Label>
                <Input
                  value={newEventTime}
                  onChange={(e) => setNewEventTime(e.target.value)}
                  placeholder="e.g. 09:00 - 12:00"
                  className="text-xs h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Venue / Location</Label>
                <Input
                  value={newEventLocation}
                  onChange={(e) => setNewEventLocation(e.target.value)}
                  placeholder="e.g. Examination Hall"
                  className="text-xs h-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Description / Notes</Label>
              <Input
                value={newEventDesc}
                onChange={(e) => setNewEventDesc(e.target.value)}
                placeholder="Optional briefing for faculty and parents"
                className="text-xs h-9"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setAddModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                Save Milestone
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit Event Modal Dialog ── */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-blue-600" />
              Edit Academic Milestone
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleEditSave} className="space-y-3.5 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Event / Milestone Title</Label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="e.g. Annual Sports Day"
                required
                className="text-xs h-9"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Date</Label>
                <Input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  required
                  className="text-xs h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Category</Label>
                <Select value={editCategory} onValueChange={(val: any) => setEditCategory(val)}>
                  <SelectTrigger className="text-xs h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="holiday">Public Holiday</SelectItem>
                    <SelectItem value="exam">Examination</SelectItem>
                    <SelectItem value="event">School Event</SelectItem>
                    <SelectItem value="ptm">Parent-Teacher Meet</SelectItem>
                    <SelectItem value="workshop">Faculty Workshop</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Timing</Label>
                <Input
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  placeholder="e.g. 09:00 - 12:00"
                  className="text-xs h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Venue / Location</Label>
                <Input
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  placeholder="e.g. Main Auditorium"
                  className="text-xs h-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Description / Notes</Label>
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
              <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white font-bold">
                {saving ? 'Saving…' : 'Update Milestone'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
