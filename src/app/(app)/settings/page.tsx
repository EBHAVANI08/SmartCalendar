'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Settings, Building2, Sliders, ShieldCheck,
  Sparkles, Save, RefreshCw, AlertTriangle,
  CalendarClock, ArrowRight, Info, Check,
  Layers, BookOpen, DoorOpen
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import SubjectManagementPage from '../subjects/page';
import DayConfigPage from '../day-config/page';
import RoomsPage from '../rooms/page';
import { DetectedStructure } from '@/components/school-setup/detected-structure';
import { SetupChecklistFull } from '@/components/dashboard/setup-checklist';

interface SchoolProfile {
  id: string;
  name: string;
  code: string;
  /** Displayed only. The login identity is not editable here. */
  email: string;
  board: string;
  phone: string;
  address: string;
  contactName: string;
  status: string;
}

const BOARDS = ['CBSE', 'ICSE', 'IB', 'Cambridge', 'State Board'];

interface DayConfig {
  workingDays: number;
  startTime: string;
  endTime: string;
  breakAfter: number;
  breakMinutes: number;
  lunchAfter: number;
  lunchMinutes: number;
}

interface FeatureFlags {
  planName: string;
  maxTeachers: number;
  maxGrades: number;
  maxPeriodsPerDay: number;
  aiTimetableEnabled: boolean;
  bulkImportEnabled: boolean;
  substitutionEnabled: boolean;
  autoSubstitutionEnabled: boolean;
  workloadAnalyticsEnabled: boolean;
  teacherNotifyEnabled: boolean;
  trialEndsAt?: string | null;
}

/** A control we deliberately do not render as an editable switch, because
 *  nothing behind it would run. Showing the reason beats showing a toggle. */
function ComingSoon({ title, why }: { title: string; why: string }) {
  return (
    <div className="flex items-start justify-between p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70">
      <div className="space-y-0.5 pr-4">
        <p className="text-xs font-bold text-slate-700">{title}</p>
        <p className="text-[11px] text-slate-500 max-w-xl">{why}</p>
      </div>
      <Badge variant="outline" className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-slate-300">
        Coming soon
      </Badge>
    </div>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs font-bold text-slate-900">{value}</span>
    </div>
  );
}

export type SettingsTabId = 'profile' | 'timetable' | 'automation' | 'security';
export type TimetableSubTabId = 'days' | 'structure' | 'subjects' | 'rooms' | 'summary';

function SchoolSettingsContent({
  pageTitle = 'School Settings',
  pageDescription = 'Institutional profile and timetable structure settings in one place.',
  headerExtra,
}: {
  pageTitle?: string;
  pageDescription?: string;
  headerExtra?: React.ReactNode;
} = {}) {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<SettingsTabId>('profile');
  const [timetableSubTab, setTimetableSubTab] = useState<TimetableSubTabId>('days');

  useEffect(() => {
    const t = searchParams.get('tab');
    const s = searchParams.get('sub');
    if (t === 'structure' || t === 'days' || t === 'subjects' || t === 'rooms') {
      setActiveTab('timetable');
      setTimetableSubTab(t as TimetableSubTabId);
    } else if (t === 'timetable') {
      setActiveTab('timetable');
      if (s && ['days', 'structure', 'subjects', 'rooms', 'summary'].includes(s)) {
        setTimetableSubTab(s as TimetableSubTabId);
      }
    } else if (t === 'profile' || t === 'automation' || t === 'security') {
      setActiveTab(t as SettingsTabId);
    }
  }, [searchParams]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [profile, setProfile] = useState<SchoolProfile | null>(null);
  const [form, setForm] = useState({ name: '', board: '', phone: '', address: '', contactName: '' });
  const [dayConfig, setDayConfig] = useState<DayConfig | null>(null);
  const [dayRows, setDayRows] = useState<{ day: string; periods: number }[]>([]);
  const [totalWeekly, setTotalWeekly] = useState<number>(0);
  const [flags, setFlags] = useState<FeatureFlags | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [pRes, dRes, fRes] = await Promise.all([
        fetch('/api/school/profile'),
        fetch('/api/school/day-config'),
        fetch('/api/school/feature-flags'),
      ]);

      const pData = await pRes.json().catch(() => ({}));
      if (!pRes.ok) throw new Error(pData?.error || 'Could not load the school profile.');
      setProfile(pData.profile);
      setForm({
        name: pData.profile?.name ?? '',
        board: pData.profile?.board ?? '',
        phone: pData.profile?.phone ?? '',
        address: pData.profile?.address ?? '',
        contactName: pData.profile?.contactName ?? '',
      });

      if (dRes.ok) {
        const dData = await dRes.json().catch(() => ({}));
        setDayConfig(dData.config ?? null);
        setDayRows(Array.isArray(dData.days) ? dData.days : []);
        setTotalWeekly(dData.totalWeeklyPeriods ?? 0);
      }
      if (fRes.ok) {
        const fData = await fRes.json().catch(() => ({}));
        setFlags(fData.flags ?? null);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (activeTab === 'timetable' && timetableSubTab === 'summary') {
      load();
    }
  }, [activeTab, timetableSubTab, load]);

  const dirty = Boolean(
    profile &&
    (form.name !== profile.name ||
     form.board !== (profile.board ?? '') ||
     form.phone !== (profile.phone ?? '') ||
     form.address !== (profile.address ?? '') ||
     form.contactName !== (profile.contactName ?? ''))
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/school/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));

      // Success is claimed only after the server confirms the write.
      if (!res.ok) {
        setSaveError(data?.error || `Save failed (HTTP ${res.status}).`);
        toast({
          title: 'Not saved',
          description: data?.error || `The server rejected the change (HTTP ${res.status}).`,
          variant: 'destructive',
        });
        return;
      }

      setProfile(data.profile);
      setForm({
        name: data.profile.name,
        board: data.profile.board ?? '',
        phone: data.profile.phone ?? '',
        address: data.profile.address ?? '',
        contactName: data.profile.contactName ?? '',
      });
      toast({ title: 'School profile saved', description: 'Reload the page and these values will still be here.' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error.';
      setSaveError(message);
      toast({ title: 'Not saved', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-700 via-indigo-800 to-slate-900 flex items-center justify-center text-white shadow-md shadow-blue-900/30 shrink-0 border border-blue-500/20">
            <Settings className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#081A33]">{pageTitle}</h1>
              {profile && (
                <Badge className="bg-blue-50 text-[#2563EB] border border-blue-200 font-bold text-[10px] uppercase tracking-wider">
                  {profile.name}
                </Badge>
              )}
            </div>
            <p className="text-xs text-[#64748B] font-medium mt-1">
              {pageDescription}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {headerExtra}
          {activeTab === 'profile' && (
            <Button
              onClick={handleSave}
              disabled={saving || loading || !dirty}
              data-testid="save-school-profile"
              className="gap-2 bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 hover:from-blue-800 hover:to-slate-950 text-white font-bold h-9 shadow-md text-xs px-3.5 border-none disabled:opacity-50"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin text-amber-300" /> : <Save className="w-4 h-4 text-amber-300" />}
              <span>{saving ? 'Saving…' : dirty ? 'Save Profile' : 'Saved'}</span>
            </Button>
          )}
        </div>
      </div>

      {loadError && (
        <div className="flex items-start gap-3 p-4 rounded-2xl border border-red-200 bg-red-50">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-red-900">Could not load settings</p>
            <p className="text-[11px] text-red-800 mt-0.5">{loadError}</p>
            <Button size="sm" variant="outline" className="mt-2 h-7 text-[11px]" onClick={load}>Try again</Button>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {[
          { id: 'profile', label: 'Institutional Profile', icon: Building2, testId: 'school-setup-tab-profile' },
          { id: 'timetable', label: 'Timetable Structure', icon: Sliders, testId: 'school-setup-tab-timetable' },
          { id: 'automation', label: 'Plan & Automation', icon: Sparkles, testId: 'school-setup-tab-automation' },
          { id: 'security', label: 'Tenant Isolation & Security', icon: ShieldCheck, testId: 'school-setup-tab-security' },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              data-testid={tab.testId}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                isActive ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Tab 1: Profile (the only editable tab) ── */}
      {activeTab === 'profile' && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-base font-bold text-slate-900">Official Institution Profile</CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Saved to your school record. Used on printed timetables and official notifications.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-2 space-y-4">
            {loading ? (
              <p className="text-xs text-slate-400 py-6 text-center">Loading school profile…</p>
            ) : (
              <>
                {saveError && (
                  <div className="flex items-start gap-2.5 p-3 rounded-xl border border-red-200 bg-red-50">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-red-800">{saveError}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">School Official Name</Label>
                    <Input
                      data-testid="settings-school-name"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Tenant Identifier Code</Label>
                    <Input value={profile?.code ?? ''} disabled className="h-9 text-xs font-mono bg-slate-50" />
                    <p className="text-[10px] text-slate-400">
                      Issued by the platform and used to identify your data. Contact support to change it.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Affiliation Board</Label>
                    <Select
                      value={form.board || 'none'}
                      onValueChange={(v) => setForm({ ...form, board: v === 'none' ? '' : v })}
                    >
                      <SelectTrigger className="h-9 text-xs" data-testid="settings-school-board">
                        <SelectValue placeholder="Select a board…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not specified</SelectItem>
                        {BOARDS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Contact Phone</Label>
                    <Input
                      data-testid="settings-school-phone"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      className="h-9 text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Campus Address</Label>
                  <Input
                    data-testid="settings-school-address"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="Street, city, state, PIN"
                    className="h-9 text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Primary Contact Name</Label>
                  <Input
                    data-testid="settings-contact-name"
                    value={form.contactName}
                    onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                    placeholder="Principal or administrator"
                    className="h-9 text-xs"
                  />
                </div>

                {/* Login identity. Deliberately not editable from a school-details
                    Save action — changing it changes how the Admin signs in. */}
                <div className="pt-3 border-t border-slate-200 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Label className="text-xs font-semibold">Admin Login Email</Label>
                    <Badge variant="outline" className="text-[10px] font-bold text-slate-500 border-slate-300">
                      Login identity — managed separately
                    </Badge>
                  </div>
                  <Input
                    data-testid="settings-school-email"
                    type="email"
                    value={profile?.email ?? ''}
                    disabled
                    readOnly
                    className="h-9 text-xs bg-slate-50"
                  />
                  <p className="text-[10px] text-slate-400">
                    This is the address you sign in with. Changing it needs re-authentication and
                    confirmation, so it is handled by a separate secure workflow rather than this form.
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Tab 2: Timetable structure (Houses all 4 modules: Days & Periods, Academic Structure, Subjects, Rooms) ── */}
      <div className={activeTab === 'timetable' ? 'space-y-4' : 'hidden'}>
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="p-5 pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-bold text-slate-900">Timetable Structure</CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  Configure teaching days, academic structure, subjects, and rooms in one unified workspace.
                </CardDescription>
              </div>
            </div>

            {/* Sub-tabs: Days & Periods, Academic Structure, Subjects, Rooms, Weekly Summary */}
            <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-100 mt-3">
              {[
                { id: 'days', label: 'Days & Periods', icon: CalendarClock, desc: 'Working days & breaks' },
                { id: 'structure', label: 'Academic Structure', icon: Layers, desc: 'Grades & sections' },
                { id: 'subjects', label: 'Subjects', icon: BookOpen, desc: 'Subject rules & allocation' },
                { id: 'rooms', label: 'Rooms', icon: DoorOpen, desc: 'Capacity & types' },
                { id: 'summary', label: 'Weekly Summary', icon: Info, desc: 'Teaching hours overview' },
              ].map((st) => {
                const SubIcon = st.icon;
                const isSubActive = timetableSubTab === st.id;
                return (
                  <button
                    key={st.id}
                    type="button"
                    data-testid={`school-setup-tab-${st.id}`}
                    onClick={() => setTimetableSubTab(st.id as TimetableSubTabId)}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border ${
                      isSubActive
                        ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-xs'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <SubIcon className={`w-3.5 h-3.5 ${isSubActive ? 'text-blue-600' : 'text-slate-400'}`} />
                    <span>{st.label}</span>
                  </button>
                );
              })}
            </div>
          </CardHeader>
        </Card>

        {/* Selected sub-module */}
        <div className="pt-1">
          {timetableSubTab === 'days' && <DayConfigPage onSaved={load} />}
          {timetableSubTab === 'structure' && <DetectedStructure />}
          {timetableSubTab === 'subjects' && <SubjectManagementPage />}
          {timetableSubTab === 'rooms' && <RoomsPage />}
          {timetableSubTab === 'summary' && (
            <div className="space-y-4">
              <SetupChecklistFull />
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="p-5 pb-3">
                  <CardTitle className="text-sm font-bold text-slate-900">Teaching Week Overview</CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Calculated from your working days and period counts.
                  </CardDescription>
                </CardHeader>
              <CardContent className="p-5 pt-2 space-y-4">
                {dayConfig ? (
                  <>
                    <div className="rounded-2xl border border-slate-200 p-4">
                      <ReadOnlyRow label="Working days per week" value={dayConfig.workingDays} />
                      <ReadOnlyRow label="School hours" value={`${dayConfig.startTime} – ${dayConfig.endTime}`} />
                      <ReadOnlyRow label="Short break" value={`${dayConfig.breakMinutes} min, after period ${dayConfig.breakAfter}`} />
                      <ReadOnlyRow label="Lunch" value={`${dayConfig.lunchMinutes} min, after period ${dayConfig.lunchAfter}`} />
                      <ReadOnlyRow label="Total teaching periods per week" value={totalWeekly} />
                    </div>

                    {dayRows.length > 0 && (
                      <div className="rounded-2xl border border-slate-200 p-4">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Periods per day</p>
                        <div className="flex flex-wrap gap-2">
                          {dayRows.map((d) => (
                            <span key={d.day} className="px-2.5 py-1 rounded-lg bg-slate-100 text-[11px] font-semibold text-slate-700">
                              {d.day}: {d.periods}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
                    <p className="text-xs font-bold text-amber-900">Your teaching week is not configured yet.</p>
                    <p className="text-[11px] text-amber-800 mt-1">
                      Configure your working days and period counts in Days &amp; Periods tab above.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
            </div>
          )}
        </div>
      </div>

      {/* ── Tab 3: Plan & automation ── */}
      {activeTab === 'automation' && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-base font-bold text-slate-900">Plan &amp; Automation</CardTitle>
            <CardDescription className="text-xs text-slate-500">
              What your current plan includes. These entitlements are set by the platform, not from this page.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-2 space-y-4">
            {flags ? (
              <>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <ReadOnlyRow label="Plan" value={<span className="capitalize">{flags.planName}</span>} />
                  <ReadOnlyRow label="Faculty limit" value={flags.maxTeachers} />
                  <ReadOnlyRow label="Grade limit" value={flags.maxGrades} />
                  <ReadOnlyRow label="Max periods per day" value={flags.maxPeriodsPerDay} />
                  {flags.trialEndsAt && (
                    <ReadOnlyRow label="Trial ends" value={new Date(flags.trialEndsAt).toLocaleDateString()} />
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 p-4 space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Included capabilities</p>
                  {[
                    ['AI timetable generation', flags.aiTimetableEnabled],
                    ['Bulk import', flags.bulkImportEnabled],
                    ['Substitution management', flags.substitutionEnabled],
                    ['Automatic substitute recommendation', flags.autoSubstitutionEnabled],
                    ['Workload analytics', flags.workloadAnalyticsEnabled],
                    ['Teacher notifications', flags.teacherNotifyEnabled],
                  ].map(([label, on]) => (
                    <div key={String(label)} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
                      <span className="text-xs text-slate-600">{label}</span>
                      {on
                        ? <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700"><Check className="w-3.5 h-3.5" />Included</span>
                        : <span className="text-[11px] font-bold text-slate-400">Not in plan</span>}
                    </div>
                  ))}
                </div>

                <p className="text-[11px] text-slate-500">
                  To change a limit or add a capability, raise a request in{' '}
                  <Link href="/support" className="font-semibold text-blue-700 underline">Support &amp; Tickets</Link>.
                </p>
              </>
            ) : (
              <p className="text-xs text-slate-400 py-4 text-center">Loading plan…</p>
            )}

            <div className="pt-3 border-t border-slate-200 space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Per-school preferences</p>
              <ComingSoon
                title="Biometric device sync"
                why="No attendance device adapter exists yet. The Attendance page generates simulated punches and is labelled as such."
              />
              <ComingSoon
                title="WhatsApp and SMS notifications"
                why="No messaging provider is connected. Notifications are recorded in the app but are not sent anywhere."
              />
              <ComingSoon
                title="Per-school automation preferences"
                why="Turning included capabilities on and off for your own school needs a preferences store that does not exist yet. Until then these follow your plan."
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Tab 4: Security ── */}
      {activeTab === 'security' && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-base font-bold text-slate-900">Tenant Isolation &amp; Security</CardTitle>
            <CardDescription className="text-xs text-slate-500">
              What is actually in place today. Nothing on this tab is editable.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-2 space-y-4">
            <div className="p-4 bg-blue-50 rounded-2xl border border-blue-200 flex items-start gap-3.5">
              <ShieldCheck className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-blue-950">Tenant scoping</p>
                <p className="text-[11px] text-blue-800 mt-0.5 leading-relaxed">
                  Your timetable, faculty, leave, substitution and attendance records are tagged with
                  school ID{' '}
                  <code className="font-mono bg-blue-100 px-1 rounded text-blue-900">{profile?.code ?? '—'}</code>.
                  Each API request derives your school from the signed session rather than from anything
                  the browser sends, so a request cannot ask for another school&apos;s data.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Session security</span>
                <p className="text-xs font-bold text-slate-900">HMAC-SHA256 signed JWT</p>
                <p className="text-[11px] text-slate-500">Expires 7 days after issue</p>
              </div>
              <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Passwords</span>
                <p className="text-xs font-bold text-slate-900">bcrypt hashed</p>
                <p className="text-[11px] text-slate-500">Changing a password requires the current one</p>
              </div>
              <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Attendance webhook</span>
                <p className="text-xs font-bold text-slate-900">Disabled</p>
                <p className="text-[11px] text-slate-500">
                  Requires an HMAC-signed request and a configured secret. No device is connected.
                </p>
              </div>
              <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Audit trail</span>
                <p className="text-xs font-bold text-slate-900">Recorded</p>
                <p className="text-[11px] text-slate-500">
                  Timetable edits, faculty changes and overrides are logged with the actor
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-2xl border border-amber-300 bg-amber-50">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-900">
                Role separation is still being rolled out. Anyone who can sign in to your school can
                currently reach the administrative screens, so only issue accounts to staff you intend
                to have full access.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function SchoolSettingsPage(props: {
  pageTitle?: string;
  pageDescription?: string;
  headerExtra?: React.ReactNode;
}) {
  return (
    <Suspense fallback={<div className="p-6 text-xs text-slate-400">Loading settings…</div>}>
      <SchoolSettingsContent {...props} />
    </Suspense>
  );
}

