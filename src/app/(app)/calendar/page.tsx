'use client';

import React, { useState, useEffect } from 'react';
import {
  CalendarDays, Plus, ChevronLeft, ChevronRight, Filter,
  Clock, MapPin, Tag, CheckCircle2, AlertCircle, Sparkles,
  Printer, Bookmark, Users, Award, BookOpen, Flag
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
  category: 'holiday' | 'exam' | 'event' | 'ptm' | 'workshop';
  description?: string;
  time?: string;
  location?: string;
}

const INITIAL_EVENTS: CalendarEvent[] = [
  { id: '1', title: 'Independence Day Holiday', date: '2026-08-15', category: 'holiday', description: 'National Holiday - School closed', time: 'All Day' },
  { id: '2', title: 'Periodic Assessment I (Grades 6-12)', date: '2026-08-20', category: 'exam', description: 'Mathematics & Science written exams', time: '08:30 - 11:30', location: 'Examination Hall' },
  { id: '3', title: 'NEP 2020 Pedagogical Workshop', date: '2026-08-25', category: 'workshop', description: 'Faculty training on Bloom taxonomy integration', time: '14:00 - 16:30', location: 'AV Auditorium' },
  { id: '4', title: 'Annual Inter-House Science Fair', date: '2026-08-28', category: 'event', description: 'Robotics & Environmental innovation showcases', time: '09:00 - 14:00', location: 'Main Grounds' },
  { id: '5', title: 'Term-1 Parent-Teacher Meeting (PTM)', date: '2026-09-05', category: 'ptm', description: 'Progress card discussion & attendance reviews', time: '08:30 - 13:00', location: 'Classrooms' },
  { id: '6', title: 'Teachers Day Celebrations', date: '2026-09-05', category: 'event', description: 'Special morning assembly organized by Student Council', time: '08:00 - 10:00', location: 'Assembly Hall' },
  { id: '7', title: 'Mid-Term Examinations Begin', date: '2026-09-18', category: 'exam', description: 'Comprehensive assessments for Grades 1 to 12', time: '08:30 - 12:00', location: 'Assigned Blocks' },
  { id: '8', title: 'Gandhi Jayanti Holiday', date: '2026-10-02', category: 'holiday', description: 'National Holiday', time: 'All Day' },
];

const CATEGORY_STYLES = {
  holiday: { label: 'Public Holiday', bg: 'bg-rose-50 border-rose-200 text-rose-700', badge: 'bg-rose-100 text-rose-800 border-rose-300' },
  exam: { label: 'Examination', bg: 'bg-blue-50 border-blue-200 text-blue-700', badge: 'bg-blue-100 text-blue-800 border-blue-300' },
  event: { label: 'School Event', bg: 'bg-indigo-50 border-indigo-200 text-indigo-700', badge: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  ptm: { label: 'PTM', bg: 'bg-sky-50 border-sky-200 text-sky-700', badge: 'bg-sky-100 text-sky-800 border-sky-300' },
  workshop: { label: 'Faculty Workshop', bg: 'bg-amber-50 border-amber-200 text-amber-700', badge: 'bg-amber-100 text-amber-800 border-amber-300' },
};

export default function AcademicCalendarPage() {
  const { toast } = useToast();
  const [currentDate, setCurrentDate] = useState(new Date(2026, 7, 1)); // August 2026
  const [events, setEvents] = useState<CalendarEvent[]>(INITIAL_EVENTS);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [addModalOpen, setAddModalOpen] = useState(false);

  // Form states for new event
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDate, setNewEventDate] = useState('2026-08-26');
  const [newEventCategory, setNewEventCategory] = useState<CalendarEvent['category']>('event');
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
    setCurrentDate(new Date(2026, 7, 1));
  };

  const handleAddEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventTitle.trim() || !newEventDate) return;

    const newEv: CalendarEvent = {
      id: String(Date.now()),
      title: newEventTitle,
      date: newEventDate,
      category: newEventCategory,
      time: newEventTime,
      location: newEventLocation,
      description: newEventDesc,
    };

    setEvents([newEv, ...events]);
    toast({
      title: 'Academic Event Added',
      description: `"${newEventTitle}" scheduled for ${newEventDate}.`,
    });

    setAddModalOpen(false);
    setNewEventTitle('');
    setNewEventDesc('');
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
                Takshila School
              </Badge>
            </div>
            <p className="text-xs text-[#64748B] font-medium mt-1">
              Institutional events, examination schedules, term breaks, and board milestones.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="outline" size="sm" onClick={() => { document.title = 'Takshila School — Academic Calendar'; window.print(); }} className="gap-2 text-xs border-[#E2E8F0] text-[#0F2747] bg-white hover:bg-slate-50 font-bold h-9 shadow-xs px-3.5">
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
                        const style = CATEGORY_STYLES[ev.category];
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
              {filteredEvents.slice(0, 6).map((ev) => {
                const style = CATEGORY_STYLES[ev.category];
                return (
                  <div key={ev.id} className="p-3 rounded-xl border border-slate-100 bg-slate-50 hover:bg-white hover:border-emerald-200 transition-all">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${style.badge}`}>
                        {style.label}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">{ev.date}</span>
                    </div>
                    <p className="text-xs font-bold text-slate-900 leading-snug">{ev.title}</p>
                    {ev.location && (
                      <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-1">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        {ev.location}
                      </p>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Quick Stats Card */}
          <Card className="border-emerald-100 bg-emerald-50/50 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <Flag className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-emerald-900">CBSE Term-1 Active</p>
                <p className="text-[11px] text-emerald-700 mt-0.5">218 Teaching Days scheduled in 2026-27</p>
              </div>
            </div>
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
    </div>
  );
}
