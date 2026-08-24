'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Brain, Sparkles, BookOpen, RefreshCw, Plus,
  Search, Clock, GraduationCap, Target, CheckCircle2,
  Download, Eye, Lightbulb, Users
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';

interface LessonPlan {
  id: string;
  teacherId?: string;
  grade: string;
  subject: string;
  topic: string;
  board: string;
  duration: number;
  aiGenerated: boolean;
  createdAt: string;
  objectives: string;
  planContent: string;
  teacher?: { name: string };
}

interface ParsedPlan {
  title?: string;
  grade: string;
  subject: string;
  topic: string;
  duration: string;
  objectives: string[];
  warmUp?: { activity: string; duration: string; description: string };
  mainContent?: { section: string; duration: string; description: string }[];
  differentiation?: { struggling: string; onLevel: string; advanced: string };
  assessment?: { formative: string; summative: string };
  resources?: string[];
  homework?: string;
  keyVocabulary?: string[];
}

const GRADES = ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];
const SUBJECTS = ['Mathematics', 'Science', 'English', 'Hindi', 'Social Science', 'Physics', 'Chemistry', 'Biology', 'History', 'Geography', 'Economics', 'Computer Science'];
const BOARDS = ['CBSE', 'ICSE', 'IB', 'Cambridge', 'State Board'];

export default function LessonPlansPage() {
  const { toast } = useToast();
  const [plans, setPlans] = useState<LessonPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [search, setSearch] = useState('');
  const [viewPlan, setViewPlan] = useState<LessonPlan | null>(null);
  const [genOpen, setGenOpen] = useState(false);
  const [form, setForm] = useState({ grade: '', subject: '', topic: '', board: 'CBSE', duration: '40' });

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/lesson-plans');
      if (r.ok) {
        const d = await r.json();
        setPlans(d.lessonPlans || d.data || []);
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  const filtered = plans.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.subject?.toLowerCase().includes(q) || p.topic?.toLowerCase().includes(q) || p.grade?.toLowerCase().includes(q) || p.teacher?.name?.toLowerCase().includes(q);
  });

  const handleGenerate = async () => {
    if (!form.grade || !form.subject || !form.topic) {
      toast({ title: 'Validation', description: 'Grade, subject, and topic are required.', variant: 'destructive' });
      return;
    }
    setGenerating(true);
    try {
      const r = await fetch('/api/lesson-plans/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, duration: parseInt(form.duration) }),
      });
      const d = await r.json();
      if (r.ok) {
        toast({ title: 'Lesson Plan Generated!', description: `AI created a ${form.duration}-minute plan for ${form.topic}` });
        setGenOpen(false);
        setForm({ grade: '', subject: '', topic: '', board: 'CBSE', duration: '40' });
        fetchPlans();
        if (d.lessonPlan) setViewPlan(d.lessonPlan);
      } else {
        toast({ title: 'Generation Failed', description: d.error, variant: 'destructive' });
      }
    } finally { setGenerating(false); }
  };

  const parsePlan = (plan: LessonPlan): ParsedPlan | null => {
    try { return JSON.parse(plan.planContent); } catch { return null; }
  };
  const parseObjectives = (obj: string): string[] => {
    try { return JSON.parse(obj); } catch { return [obj]; }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">AI Lesson Plan Studio</h1>
          <p className="text-sm text-slate-500 mt-0.5">{plans.length} AI-generated lesson plans in your library</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={fetchPlans} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button size="sm" className="gap-2 bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-700 hover:to-purple-800 text-white shadow-md" onClick={() => setGenOpen(true)}>
            <Sparkles className="w-4 h-4" /> Generate with AI
          </Button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Plans', value: plans.length, icon: BookOpen, color: 'text-violet-600 bg-violet-50' },
          { label: 'AI Generated', value: plans.filter(p => p.aiGenerated).length, icon: Brain, color: 'text-emerald-600 bg-emerald-50' },
          { label: 'Subjects', value: new Set(plans.map(p => p.subject)).size, icon: Target, color: 'text-blue-600 bg-blue-50' },
          { label: 'Grades', value: new Set(plans.map(p => p.grade)).size, icon: GraduationCap, color: 'text-amber-600 bg-amber-50' },
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

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input placeholder="Search plans by subject, topic, grade…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Plans Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="border-slate-200">
              <CardContent className="p-5">
                <div className="space-y-3">
                  <div className="h-4 bg-slate-200 rounded w-3/4" />
                  <div className="h-3 bg-slate-100 rounded w-1/2" />
                  <div className="h-16 bg-slate-100 rounded" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed border-slate-200">
          <CardContent className="py-16 text-center">
            <Brain className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <p className="text-slate-600 font-medium">No lesson plans yet</p>
            <p className="text-slate-400 text-sm mt-1">Click <strong>Generate with AI</strong> to create your first lesson plan.</p>
            <Button size="sm" className="mt-4 gap-2 bg-violet-600 hover:bg-violet-700" onClick={() => setGenOpen(true)}>
              <Sparkles className="w-4 h-4" /> Generate with AI
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(plan => {
            const objs = parseObjectives(plan.objectives);
            return (
              <Card key={plan.id} className="border-slate-200 hover:shadow-md hover:scale-[1.01] transition-all duration-200 cursor-pointer group" onClick={() => setViewPlan(plan)}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-2 mb-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center text-white shrink-0 shadow-md">
                      <BookOpen className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-800 truncate group-hover:text-violet-700 transition-colors">{plan.topic}</p>
                      <div className="flex gap-1.5 mt-1 flex-wrap">
                        <Badge className="text-[10px] bg-slate-100 text-slate-600 border-slate-200">{plan.grade}</Badge>
                        <Badge className="text-[10px] bg-violet-50 text-violet-700 border-violet-200">{plan.subject}</Badge>
                        <Badge className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">{plan.board}</Badge>
                      </div>
                    </div>
                  </div>
                  {objs.length > 0 && (
                    <div className="mb-3 space-y-1">
                      {objs.slice(0, 2).map((o, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-xs text-slate-500">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                          <span className="line-clamp-1">{o}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{plan.duration} min</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <Brain className="w-3.5 h-3.5 text-violet-400" />
                      <span>{plan.aiGenerated ? 'AI Generated' : 'Manual'}</span>
                    </div>
                    <span className="text-xs text-slate-400">{new Date(plan.createdAt).toLocaleDateString('en-IN')}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Generate Dialog */}
      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-600" />
              Generate AI Lesson Plan
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Grade</Label>
                <Select value={form.grade} onValueChange={v => setForm(f => ({ ...f, grade: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select grade" /></SelectTrigger>
                  <SelectContent>{GRADES.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Subject</Label>
                <Select value={form.subject} onValueChange={v => setForm(f => ({ ...f, subject: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
                  <SelectContent>{SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Topic / Chapter</Label>
              <Input placeholder="e.g., Photosynthesis, Quadratic Equations…" value={form.topic} onChange={e => setForm(f => ({ ...f, topic: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Board</Label>
                <Select value={form.board} onValueChange={v => setForm(f => ({ ...f, board: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{BOARDS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Duration (min)</Label>
                <Select value={form.duration} onValueChange={v => setForm(f => ({ ...f, duration: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 min</SelectItem>
                    <SelectItem value="40">40 min</SelectItem>
                    <SelectItem value="45">45 min</SelectItem>
                    <SelectItem value="60">60 min</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => setGenOpen(false)} className="flex-1">Cancel</Button>
            <Button
              onClick={handleGenerate}
              disabled={generating}
              className="flex-1 bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-700 hover:to-purple-800 text-white"
            >
              {generating ? (
                <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Generating…</>
              ) : (
                <><Sparkles className="w-4 h-4 mr-2" /> Generate</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Plan Dialog */}
      <Dialog open={!!viewPlan} onOpenChange={() => setViewPlan(null)}>
        <DialogContent className="max-w-2xl h-[80vh] p-0">
          {viewPlan && (() => {
            const parsed = parsePlan(viewPlan);
            const objs = parseObjectives(viewPlan.objectives);
            return (
              <div className="flex flex-col h-full">
                <div className="p-6 pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center text-white shadow-md">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">{viewPlan.topic}</h2>
                      <div className="flex gap-2 mt-0.5">
                        <Badge className="text-[10px] bg-slate-100 text-slate-600 border-slate-200">{viewPlan.grade}</Badge>
                        <Badge className="text-[10px] bg-violet-50 text-violet-700 border-violet-200">{viewPlan.subject}</Badge>
                        <Badge className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">{viewPlan.board}</Badge>
                        <Badge className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">{viewPlan.duration} min</Badge>
                      </div>
                    </div>
                  </div>
                </div>
                <ScrollArea className="flex-1 p-6">
                  <div className="space-y-5">
                    {objs.length > 0 && (
                      <div>
                        <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                          <Target className="w-4 h-4 text-violet-500" /> Learning Objectives
                        </h3>
                        <ul className="space-y-1.5">
                          {objs.map((o, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /> {o}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {parsed?.warmUp && (
                      <div>
                        <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                          <Lightbulb className="w-4 h-4 text-amber-500" /> Warm-Up
                          <Badge className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 ml-1">{parsed.warmUp.duration}</Badge>
                        </h3>
                        <p className="text-sm text-slate-600 bg-amber-50 rounded-xl p-3">{parsed.warmUp.description}</p>
                      </div>
                    )}
                    {parsed?.mainContent && parsed.mainContent.length > 0 && (
                      <div>
                        <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                          <BookOpen className="w-4 h-4 text-blue-500" /> Main Content
                        </h3>
                        <div className="space-y-2">
                          {parsed.mainContent.map((mc, i) => (
                            <div key={i} className="bg-blue-50 rounded-xl p-3">
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-sm font-semibold text-blue-800">{mc.section}</p>
                                <Badge className="text-[10px] bg-blue-100 text-blue-700 border-blue-200">{mc.duration}</Badge>
                              </div>
                              <p className="text-xs text-slate-600">{mc.description}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {parsed?.differentiation && (
                      <div>
                        <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                          <Users className="w-4 h-4 text-violet-500" /> Differentiation Strategy
                        </h3>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { label: 'Struggling', value: parsed.differentiation.struggling, color: 'bg-rose-50 text-rose-700 border-rose-200' },
                            { label: 'On Level', value: parsed.differentiation.onLevel, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                            { label: 'Advanced', value: parsed.differentiation.advanced, color: 'bg-blue-50 text-blue-700 border-blue-200' },
                          ].map(d => (
                            <div key={d.label} className={`rounded-xl p-2.5 border ${d.color.split(' ').slice(2).join(' ')}`}>
                              <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${d.color.split(' ')[1]}`}>{d.label}</p>
                              <p className="text-xs text-slate-600">{d.value}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {parsed?.homework && (
                      <div className="bg-slate-50 rounded-xl p-3">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Homework</p>
                        <p className="text-sm text-slate-700">{parsed.homework}</p>
                      </div>
                    )}
                    {parsed?.keyVocabulary && parsed.keyVocabulary.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Key Vocabulary</p>
                        <div className="flex flex-wrap gap-1.5">
                          {parsed.keyVocabulary.map((v, i) => (
                            <Badge key={i} className="text-[11px] bg-violet-50 text-violet-700 border-violet-200">{v}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
