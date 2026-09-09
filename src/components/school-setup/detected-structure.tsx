'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Info, Layers, Loader2, Plus, Trash2, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

interface DetectedGrade {
  grade: string;
  configured: boolean;
  sections: { section: string; periods: number }[];
  totalPeriods: number;
}

interface DetectedSubject {
  grade: string;
  subject: string;
  periods: number;
}

interface Detection {
  hasExistingTimetable: boolean;
  totalPeriods: number;
  grades: DetectedGrade[];
  detectedSubjects: DetectedSubject[];
  summary: {
    gradesDetected: number;
    gradesConfigured: number;
    sectionsDetected: number;
    subjectsConfigured: number;
    subjectsDetectedOnly: number;
  };
}

function getNextSectionLetter(existingSections: { section: string }[]): string {
  const letters = existingSections.map((s) => s.section.trim().toUpperCase());
  if (letters.length === 0) return 'A';
  for (let i = 0; i < 26; i++) {
    const char = String.fromCharCode(65 + i);
    if (!letters.includes(char)) {
      return char;
    }
  }
  return `S${letters.length + 1}`;
}

/**
 * Academic structure a school already has, whether or not it was ever configured.
 *
 * An established tenant has grades, sections and subjects living in its
 * timetable. Showing School Setup as blank would be untrue, and writing what we
 * infer would be worse - a subject that appears once in a legacy import is not
 * necessarily one the school wants to schedule against.
 *
 * So detection is shown, labelled as detected, and adopted only on request.
 */
export function DetectedStructure({ onAdopted }: { onAdopted?: () => void }) {
  const { toast } = useToast();
  const [data, setData] = useState<Detection | null>(null);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [adopting, setAdopting] = useState(false);
  const [showAllSubjects, setShowAllSubjects] = useState(false);

  // Section Add / Delete states
  const [activeAddGrade, setActiveAddGrade] = useState<string | null>(null);
  const [newSectionName, setNewSectionName] = useState('');
  const [isAddingSection, setIsAddingSection] = useState(false);

  // Delete Section confirmation dialog
  const [deleteTarget, setDeleteTarget] = useState<{ grade: string; section: string; periods: number } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Add Grade dialog state
  const [addGradeOpen, setAddGradeOpen] = useState(false);
  const [newGradeName, setNewGradeName] = useState('');
  const [newGradeInitialSection, setNewGradeInitialSection] = useState('A');
  const [isAddingGrade, setIsAddingGrade] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/school/detected-structure');
      if (!res.ok) return;
      const body = await res.json().catch(() => null);
      if (body?.success) setData(body);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const key = (s: DetectedSubject) => `${s.grade}|${s.subject}`;

  const toggle = (s: DetectedSubject) =>
    setPicked((prev) => {
      const next = new Set(prev);
      const k = key(s);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  /** Handle adding a section to an existing grade */
  const handleStartAddSection = (grade: string, existingSections: { section: string }[]) => {
    setActiveAddGrade(grade);
    setNewSectionName(getNextSectionLetter(existingSections));
  };

  const handleSaveSection = async (grade: string) => {
    const sec = newSectionName.trim().toUpperCase();
    if (!sec) {
      toast({ title: 'Section name required', variant: 'destructive' });
      return;
    }
    setIsAddingSection(true);
    try {
      const res = await fetch('/api/school/detected-structure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade, section: sec }),
      });
      const result = await res.json().catch(() => null);
      if (res.ok && result?.success) {
        toast({
          title: 'Section Added',
          description: `Section ${sec} added to ${grade} successfully.`,
        });
        setActiveAddGrade(null);
        setNewSectionName('');
        await load();
        onAdopted?.();
      } else {
        toast({
          title: 'Failed to add section',
          description: result?.error || 'Something went wrong',
          variant: 'destructive',
        });
      }
    } catch (err) {
      toast({
        title: 'Error',
        description: String(err),
        variant: 'destructive',
      });
    } finally {
      setIsAddingSection(false);
    }
  };

  /** Handle deleting a section from a grade */
  const handleDeleteSection = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch('/api/school/detected-structure', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grade: deleteTarget.grade,
          section: deleteTarget.section,
        }),
      });
      const result = await res.json().catch(() => null);
      if (res.ok && result?.success) {
        toast({
          title: 'Section Deleted',
          description: `Section ${deleteTarget.section} removed from ${deleteTarget.grade}.`,
        });
        setDeleteTarget(null);
        await load();
        onAdopted?.();
      } else {
        toast({
          title: 'Failed to delete section',
          description: result?.error || 'Something went wrong',
          variant: 'destructive',
        });
      }
    } catch (err) {
      toast({
        title: 'Error',
        description: String(err),
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  /** Handle adding an entirely new grade */
  const handleSaveGrade = async () => {
    const g = newGradeName.trim();
    const s = (newGradeInitialSection.trim() || 'A').toUpperCase();
    if (!g) {
      toast({ title: 'Grade name is required', variant: 'destructive' });
      return;
    }
    setIsAddingGrade(true);
    try {
      const res = await fetch('/api/school/detected-structure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade: g, section: s }),
      });
      const result = await res.json().catch(() => null);
      if (res.ok && result?.success) {
        toast({
          title: 'Grade Added',
          description: `${g} with Section ${s} created successfully.`,
        });
        setAddGradeOpen(false);
        setNewGradeName('');
        setNewGradeInitialSection('A');
        await load();
        onAdopted?.();
      } else {
        toast({
          title: 'Failed to create grade',
          description: result?.error || 'Something went wrong',
          variant: 'destructive',
        });
      }
    } catch (err) {
      toast({
        title: 'Error',
        description: String(err),
        variant: 'destructive',
      });
    } finally {
      setIsAddingGrade(false);
    }
  };

  /** Create a GradeSubjectConfig for each chosen pair. Nothing implicit. */
  const adopt = async () => {
    if (!picked.size || !data) return;
    setAdopting(true);
    let created = 0;
    const failed: string[] = [];
    try {
      for (const k of picked) {
        const [grade, subject] = k.split('|');
        const found = data.detectedSubjects.find((s) => s.grade === grade && s.subject === subject);
        const weekly = Math.min(20, Math.max(1, Math.round((found?.periods ?? 1) / Math.max(1, data.grades.find((g) => g.grade === grade)?.sections.length ?? 1))));

        const res = await fetch('/api/subjects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ grade, subjectName: subject, weeklyPeriods: weekly }),
        });
        if (res.ok) created++;
        else failed.push(`${grade} · ${subject}`);
      }

      toast({
        title: `${created} subject configuration(s) added`,
        description: failed.length ? `${failed.length} could not be added: ${failed.slice(0, 3).join(', ')}` : undefined,
        variant: failed.length ? 'destructive' : undefined,
      });
      setPicked(new Set());
      await load();
      onAdopted?.();
    } finally {
      setAdopting(false);
    }
  };

  if (loading) {
    return <p className="text-xs text-slate-400 py-6 text-center">Reading your existing timetable…</p>;
  }
  if (!data?.hasExistingTimetable && (!data?.grades || data.grades.length === 0)) {
    return (
      <Card className="border-dashed border-slate-200">
        <CardContent className="p-6 text-center">
          <Layers className="w-6 h-6 text-slate-300 mx-auto mb-2" />
          <p className="text-xs font-semibold text-slate-600">No timetable structure yet</p>
          <p className="text-[11px] text-slate-400 mt-1 mb-4">
            Add your grades and sections below or create a timetable.
          </p>
          <Button size="sm" onClick={() => setAddGradeOpen(true)} className="text-xs gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            Add First Grade
          </Button>
        </CardContent>
      </Card>
    );
  }

  const shownSubjects = showAllSubjects ? data.detectedSubjects : data.detectedSubjects.slice(0, 20);

  return (
    <div className="space-y-4" data-testid="detected-structure">
      <div className="flex items-start gap-2.5 p-3 rounded-xl border border-blue-200 bg-blue-50">
        <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-xs font-bold text-blue-950">Academic Structure &amp; Sections</p>
          <p className="text-[11px] text-blue-800 mt-0.5">
            {data.totalPeriods > 0 ? (
              <>
                Active across {data.totalPeriods} scheduled periods. {data.summary.gradesDetected} grade(s),{' '}
                {data.summary.sectionsDetected} section(s).
              </>
            ) : (
              <>
                Configured with {data.summary.gradesDetected} grade(s) and {data.summary.sectionsDetected} section(s).
              </>
            )}
            {' '}You can add or remove sections for each grade directly below.
          </p>
        </div>
      </div>

      {/* Grades and sections */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="p-4 pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-bold text-slate-900">Grades &amp; Sections</CardTitle>
            <CardDescription className="text-[11px]">
              Manage sections for each grade. Sections reflect immediately across all timetable views.
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAddGradeOpen(true)}
            className="h-8 text-xs gap-1.5 border-blue-200 hover:border-blue-400 hover:bg-blue-50 text-blue-700 font-medium"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Grade
          </Button>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {data.grades.map((g) => {
              const isAddingHere = activeAddGrade === g.grade;
              return (
                <div
                  key={g.grade}
                  className="rounded-xl border border-slate-200 p-3 bg-white hover:border-slate-300 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-slate-100">
                    <span className="text-xs font-bold text-slate-900">{g.grade}</span>
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={`text-[9px] px-1.5 py-0 ${
                          g.configured
                            ? 'border-emerald-300 text-emerald-800 bg-emerald-50/50'
                            : 'border-amber-300 text-amber-800 bg-amber-50/50'
                        }`}
                      >
                        {g.configured ? 'configured' : 'detected only'}
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleStartAddSection(g.grade, g.sections)}
                        className="h-6 px-1.5 text-[11px] text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                        title={`Add section to ${g.grade}`}
                      >
                        <Plus className="w-3 h-3 mr-0.5" />
                        Section
                      </Button>
                    </div>
                  </div>

                  {/* Section pills */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {g.sections.map((s) => (
                      <div
                        key={s.section}
                        className="group inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 border border-slate-200/80 text-[11px] text-slate-700 transition-colors"
                      >
                        <span className="font-semibold">{s.section}</span>
                        {s.periods > 0 && (
                          <span className="text-[10px] text-slate-400">({s.periods})</span>
                        )}
                        <button
                          type="button"
                          onClick={() => setDeleteTarget({ grade: g.grade, section: s.section, periods: s.periods })}
                          className="ml-0.5 text-slate-400 hover:text-red-600 hover:bg-red-50 p-0.5 rounded transition-colors"
                          title={`Delete section ${s.section}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}

                    {g.sections.length === 0 && (
                      <span className="text-[10px] text-slate-400 italic">No sections configured</span>
                    )}
                  </div>

                  {/* Inline Add Section Form */}
                  {isAddingHere && (
                    <div className="mt-2.5 pt-2 border-t border-blue-100 bg-blue-50/50 p-2 rounded-lg flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-blue-900 shrink-0">Section:</span>
                      <Input
                        value={newSectionName}
                        onChange={(e) => setNewSectionName(e.target.value.toUpperCase())}
                        placeholder="e.g. C"
                        className="h-7 text-xs bg-white uppercase font-bold w-20 px-2"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSaveSection(g.grade);
                          } else if (e.key === 'Escape') {
                            setActiveAddGrade(null);
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        className="h-7 px-2.5 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                        disabled={isAddingSection || !newSectionName.trim()}
                        onClick={() => handleSaveSection(g.grade)}
                      >
                        {isAddingSection ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-1.5 text-slate-500 hover:text-slate-700"
                        onClick={() => setActiveAddGrade(null)}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Dialog for Deleting a Section */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-red-600 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              Delete Section {deleteTarget?.section}?
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600 pt-1">
              Are you sure you want to delete <strong>Section {deleteTarget?.section}</strong> from{' '}
              <strong>{deleteTarget?.grade}</strong>?
            </DialogDescription>
          </DialogHeader>

          {deleteTarget && deleteTarget.periods > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-900 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                Warning: {deleteTarget.periods} Scheduled Period(s) will be removed
              </p>
              <p className="text-[11px] text-red-800">
                This section currently has scheduled periods in the timetable. Deleting it will permanently remove all timetable slots associated with {deleteTarget.grade} Section {deleteTarget.section}.
              </p>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 mt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => setDeleteTarget(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="text-xs gap-1.5 bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDeleteSection}
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              {isDeleting ? 'Deleting…' : 'Delete Section'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Grade Dialog */}
      <Dialog open={addGradeOpen} onOpenChange={setAddGradeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-600" />
              Add New Grade
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600">
              Enter the grade name and initial section to include it in the academic structure.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs font-semibold text-slate-700">Grade Name</Label>
              <Input
                placeholder="e.g. Grade 11, UKG, Nursery"
                value={newGradeName}
                onChange={(e) => setNewGradeName(e.target.value)}
                className="text-xs mt-1"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-700">Initial Section</Label>
              <Input
                placeholder="e.g. A"
                value={newGradeInitialSection}
                onChange={(e) => setNewGradeInitialSection(e.target.value.toUpperCase())}
                className="text-xs mt-1 uppercase"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => setAddGradeOpen(false)}
              disabled={isAddingGrade}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
              onClick={handleSaveGrade}
              disabled={isAddingGrade || !newGradeName.trim()}
            >
              {isAddingGrade ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              {isAddingGrade ? 'Creating…' : 'Create Grade'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Subjects present in the timetable but never configured */}
      {data.detectedSubjects.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-bold text-slate-900">
              Detected Subjects ({data.detectedSubjects.length})
            </CardTitle>
            <CardDescription className="text-[11px]">
              Scheduled in your timetable but not in Subject Management. Select the ones to adopt — the
              weekly requirement is seeded from how often each is already taught.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-3">
            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-72 overflow-y-auto">
              {shownSubjects.map((s) => (
                <label
                  key={key(s)}
                  className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    data-testid="detected-subject"
                    checked={picked.has(key(s))}
                    onChange={() => toggle(s)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-[11px] font-semibold text-slate-800 flex-1 truncate">
                    {s.subject}
                  </span>
                  <span className="text-[10px] text-slate-500">{s.grade}</span>
                  <span className="text-[10px] text-slate-400">{s.periods} periods</span>
                </label>
              ))}
            </div>

            {data.detectedSubjects.length > 20 && (
              <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setShowAllSubjects((v) => !v)}>
                {showAllSubjects ? 'Show fewer' : `Show all ${data.detectedSubjects.length}`}
              </Button>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                className="h-8 text-xs gap-1.5"
                disabled={!picked.size || adopting}
                data-testid="adopt-detected-subjects"
                onClick={adopt}
              >
                {adopting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                {adopting ? 'Adding…' : `Add ${picked.size || ''} selected to Subject Configuration`}
              </Button>
              {picked.size > 0 && (
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setPicked(new Set())}>
                  Clear
                </Button>
              )}
              <span className="text-[10px] text-slate-400">
                Nothing is added until you choose it.
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {data.detectedSubjects.length === 0 && (
        <div className="flex items-center gap-2 p-3 rounded-xl border border-emerald-200 bg-emerald-50">
          <Check className="w-4 h-4 text-emerald-700 shrink-0" />
          <p className="text-[11px] text-emerald-900">
            Every subject in your timetable is already configured.
          </p>
        </div>
      )}
    </div>
  );
}

