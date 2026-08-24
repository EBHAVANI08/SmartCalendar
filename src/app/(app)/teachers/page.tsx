'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Users, Plus, Search, Filter, Mail, Phone, BookOpen,
  Edit2, Trash2, Eye, Download, UserCheck, AlertCircle,
  GraduationCap, Award, TrendingUp, MoreVertical
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

interface Teacher {
  id: string;
  name: string;
  email: string;
  phone?: string;
  subject: string;
  grades: string;
  role: string;
  schoolId?: string;
  schedules?: { id: string }[];
  _count?: { schedules: number; absentSubstitutions: number };
}

export default function TeachersPage() {
  const { toast } = useToast();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [filtered, setFiltered] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [addOpen, setAddOpen] = useState(false);
  const [viewTeacher, setViewTeacher] = useState<Teacher | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', subject: '', grades: '' });
  const [saving, setSaving] = useState(false);

  const fetchTeachers = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/teachers');
      if (r.ok) {
        const d = await r.json();
        setTeachers(d.teachers || d.data || []);
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTeachers(); }, [fetchTeachers]);

  useEffect(() => {
    let list = [...teachers];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t => t.name.toLowerCase().includes(q) || t.email.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q));
    }
    if (subjectFilter !== 'all') {
      list = list.filter(t => t.subject === subjectFilter);
    }
    setFiltered(list);
  }, [teachers, search, subjectFilter]);

  const uniqueSubjects = [...new Set(teachers.map(t => t.subject).filter(Boolean))].sort();

  const handleSave = async () => {
    if (!form.name || !form.email || !form.subject) {
      toast({ title: 'Validation Error', description: 'Name, email, and subject are required.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const r = await fetch('/api/teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, grades: form.grades ? JSON.stringify(form.grades.split(',').map(s => s.trim())) : '[]' }),
      });
      if (r.ok) {
        toast({ title: 'Teacher Added', description: `${form.name} has been added to the faculty.` });
        setAddOpen(false);
        setForm({ name: '', email: '', phone: '', subject: '', grades: '' });
        fetchTeachers();
      } else {
        const d = await r.json();
        toast({ title: 'Error', description: d.error || 'Failed to add teacher', variant: 'destructive' });
      }
    } finally { setSaving(false); }
  };

  const gradesDisplay = (gradesJson: string) => {
    try { return JSON.parse(gradesJson).join(', '); } catch { return gradesJson; }
  };

  const subjectColor: Record<string, string> = {
    Mathematics: 'bg-blue-100 text-blue-700 border-blue-200',
    Science: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    English: 'bg-amber-100 text-amber-700 border-amber-200',
    Hindi: 'bg-orange-100 text-orange-700 border-orange-200',
    History: 'bg-violet-100 text-violet-700 border-violet-200',
    Geography: 'bg-teal-100 text-teal-700 border-teal-200',
    Physics: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    Chemistry: 'bg-pink-100 text-pink-700 border-pink-200',
    Biology: 'bg-green-100 text-green-700 border-green-200',
    Computer: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  };
  const getBadgeClass = (subject: string) => {
    const key = Object.keys(subjectColor).find(k => subject.toLowerCase().includes(k.toLowerCase()));
    return key ? subjectColor[key] : 'bg-slate-100 text-slate-700 border-slate-200';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Faculty Directory</h1>
          <p className="text-sm text-slate-500 mt-0.5">{filtered.length} of {teachers.length} teachers</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="gap-2">
            <Download className="w-4 h-4" /> Export
          </Button>
          <Button size="sm" className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4" /> Add Teacher
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Faculty', value: teachers.length, icon: Users, color: 'text-blue-600 bg-blue-50' },
          { label: 'Subjects Covered', value: uniqueSubjects.length, icon: BookOpen, color: 'text-emerald-600 bg-emerald-50' },
          { label: 'Full Time', value: teachers.filter(t => t.role === 'teacher').length, icon: UserCheck, color: 'text-violet-600 bg-violet-50' },
          { label: 'Admins', value: teachers.filter(t => t.role === 'admin').length, icon: Award, color: 'text-amber-600 bg-amber-50' },
        ].map(s => (
          <Card key={s.label} className="border-slate-200">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${s.color.split(' ')[1]} flex items-center justify-center`}>
                <s.icon className={`w-5 h-5 ${s.color.split(' ')[0]}`} />
              </div>
              <div>
                <p className="text-xl font-bold text-slate-800">{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search + Filter */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search by name, email, or subject…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={subjectFilter} onValueChange={setSubjectFilter}>
          <SelectTrigger className="w-44">
            <Filter className="w-4 h-4 mr-2 text-slate-400" />
            <SelectValue placeholder="All Subjects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Subjects</SelectItem>
            {uniqueSubjects.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

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
                <div className="space-y-2">
                  <div className="h-3 bg-slate-100 rounded" />
                  <div className="h-3 bg-slate-100 rounded w-4/5" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-slate-200 border-dashed">
          <CardContent className="py-16 text-center">
            <Users className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium">No teachers found</p>
            <p className="text-slate-400 text-sm mt-1">Try adjusting your search or add a new teacher.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(teacher => {
            const initials = teacher.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
            const gradesStr = gradesDisplay(teacher.grades);
            return (
              <Card key={teacher.id} className="border-slate-200 hover:shadow-md hover:scale-[1.01] transition-all duration-200 cursor-pointer group" onClick={() => setViewTeacher(teacher)}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-white font-bold text-base shrink-0 shadow-md">
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-800 truncate group-hover:text-emerald-700 transition-colors">{teacher.name}</p>
                      <Badge className={`text-[10px] px-2 py-0.5 mt-1 ${getBadgeClass(teacher.subject)}`}>
                        {teacher.subject}
                      </Badge>
                    </div>
                    <button className="text-slate-300 hover:text-slate-600 p-1 rounded transition-colors" onClick={e => { e.stopPropagation(); }}>
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-1.5 text-xs text-slate-500">
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <span className="truncate">{teacher.email}</span>
                    </div>
                    {teacher.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span>{teacher.phone}</span>
                      </div>
                    )}
                    {gradesStr && (
                      <div className="flex items-start gap-2">
                        <GraduationCap className="w-3.5 h-3.5 text-slate-400 mt-0.5" />
                        <span className="truncate">{gradesStr}</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                      <TrendingUp className="w-3 h-3" />
                      <span>{teacher._count?.schedules || teacher.schedules?.length || 0} periods/week</span>
                    </div>
                    <Badge className="text-[10px] px-1.5 bg-slate-100 text-slate-500 border-slate-200 capitalize">
                      {teacher.role}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Teacher Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-600" />
              Add New Teacher
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {[
              { label: 'Full Name', key: 'name', placeholder: 'e.g., Dr. Priya Sharma' },
              { label: 'Email', key: 'email', placeholder: 'e.g., priya@school.edu' },
              { label: 'Phone (optional)', key: 'phone', placeholder: 'e.g., +91 98765 43210' },
              { label: 'Subject', key: 'subject', placeholder: 'e.g., Mathematics' },
              { label: 'Grades (comma-separated)', key: 'grades', placeholder: 'e.g., Grade 9, Grade 10' },
            ].map(f => (
              <div key={f.key} className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700">{f.label}</Label>
                <Input
                  placeholder={f.placeholder}
                  value={(form as any)[f.key]}
                  onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? 'Saving…' : 'Add Teacher'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Teacher Dialog */}
      <Dialog open={!!viewTeacher} onOpenChange={() => setViewTeacher(null)}>
        <DialogContent className="max-w-md">
          {viewTeacher && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-white font-bold">
                    {viewTeacher.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-base font-bold">{viewTeacher.name}</p>
                    <p className="text-xs text-slate-500 font-normal capitalize">{viewTeacher.role}</p>
                  </div>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-xs text-slate-400 mb-1">Subject</p>
                    <p className="font-semibold text-slate-800">{viewTeacher.subject}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-xs text-slate-400 mb-1">Weekly Periods</p>
                    <p className="font-semibold text-slate-800">{viewTeacher._count?.schedules || viewTeacher.schedules?.length || 0}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-xs text-slate-400 mb-1">Email</p>
                    <p className="font-semibold text-slate-800 text-xs break-all">{viewTeacher.email}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-xs text-slate-400 mb-1">Phone</p>
                    <p className="font-semibold text-slate-800 text-xs">{viewTeacher.phone || 'N/A'}</p>
                  </div>
                </div>
                {viewTeacher.grades && (
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-xs text-slate-400 mb-2">Teaching Grades</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(() => { try { return JSON.parse(viewTeacher.grades); } catch { return [viewTeacher.grades]; } })().map((g: string) => (
                        <Badge key={g} className="text-[11px] bg-blue-50 text-blue-700 border-blue-200">{g}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
