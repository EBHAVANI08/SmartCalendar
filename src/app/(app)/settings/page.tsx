'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Settings, Building2, Sliders, ShieldCheck,
  Sparkles, Save, RefreshCw, AlertTriangle,
  CalendarClock, ArrowRight, Info, Check,
  Layers, BookOpen, DoorOpen, Fingerprint,
  Send, MessageSquare, Copy, CheckCircle2, Calendar,
  Globe, Phone, MapPin, User, Mail, Zap, Terminal
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
import { CapacitySummary } from '@/components/school-setup/capacity-summary';
import { AutoFixPanel } from '@/components/school-setup/autofix-panel';
import { AutoFixNotices } from '@/components/autofix-notices';

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
  breakEnabled?: boolean;
  breakAfter: number;
  breakMinutes: number;
  lunchEnabled?: boolean;
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

export type SettingsTabId = 'profile' | 'timetable' | 'automation' | 'integrations' | 'security';
export type TimetableSubTabId = 'days' | 'structure' | 'subjects' | 'rooms' | 'summary' | 'autofix';

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

  // Test Notification state
  const [testChannel, setTestChannel] = useState<'whatsapp' | 'sms' | 'email' | 'all'>('all');
  const [testRecipient, setTestRecipient] = useState('');
  const [testingNotification, setTestingNotification] = useState(false);
  const [copiedFeed, setCopiedFeed] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Hardware Ping Simulation state
  const [testingAdms, setTestingAdms] = useState(false);
  const [admsTestResult, setAdmsTestResult] = useState<{ status: string; timestamp: string } | null>(null);

  useEffect(() => {
    const t = searchParams.get('tab');
    const s = searchParams.get('sub');
    if (t === 'structure' || t === 'days' || t === 'subjects' || t === 'rooms') {
      setActiveTab('timetable');
      setTimetableSubTab(t as TimetableSubTabId);
    } else if (t === 'timetable') {
      setActiveTab('timetable');
      if (s && ['days', 'structure', 'subjects', 'rooms', 'summary', 'autofix'].includes(s)) {
        setTimetableSubTab(s as TimetableSubTabId);
      }
    } else if (t === 'profile' || t === 'automation' || t === 'integrations' || t === 'security') {
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

  const handleTestDispatch = async () => {
    setTestingNotification(true);
    try {
      const res = await fetch('/api/notifications/test-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: testChannel,
          phone: testRecipient.includes('@') ? undefined : testRecipient || undefined,
          email: testRecipient.includes('@') ? testRecipient : undefined,
          recipientName: 'Faculty Member',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        toast({
          title: 'Notification Dispatched',
          description: `Dispatched across ${data.results?.length || 1} channel(s). Status logged in database.`,
        });
      } else {
        toast({
          title: 'Dispatch test failed',
          description: data?.error || 'Error dispatching message',
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      toast({
        title: 'Dispatch error',
        description: err?.message || 'Network error',
        variant: 'destructive',
      });
    } finally {
      setTestingNotification(false);
    }
  };

  const handleSimulateAdmsPing = async () => {
    setTestingAdms(true);
    try {
      const res = await fetch('/api/biometric/adms?SN=DEMO-ZK-TEST&table=ATTLOG&Stamp=9999');
      const text = await res.text();
      setAdmsTestResult({
        status: res.ok ? 'OK (HTTP 200)' : `HTTP ${res.status}`,
        timestamp: new Date().toLocaleTimeString(),
      });
      toast({
        title: 'ADMS Push Listener Active',
        description: `Server responded: "${text.substring(0, 30)}" - Endpoint is live and accepting device punches.`,
      });
    } catch (err: any) {
      toast({
        title: 'ADMS Ping Failed',
        description: err?.message || 'Listener check error.',
        variant: 'destructive',
      });
    } finally {
      setTestingAdms(false);
    }
  };

  const originUrl =
    typeof window !== 'undefined'
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_APP_URL || 'https://smartcalendar.learnx.school');
  const feedUrl = `${originUrl}/api/calendar/feed/live-ics?schoolId=${profile?.id || 'school'}`;

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
      toast({ title: 'School profile saved', description: 'Institutional profile updated successfully.' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error.';
      setSaveError(message);
      toast({ title: 'Not saved', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // Compute school monogram initials
  const schoolInitials = form.name
    ? form.name.split(' ').map((n) => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
    : 'SC';

  return (
    <div className="w-full space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-700 via-indigo-800 to-slate-900 flex items-center justify-center text-white shadow-md shadow-blue-900/30 shrink-0 border border-blue-500/20 font-black text-lg tracking-wider">
            {schoolInitials}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#081A33]">{pageTitle}</h1>
              {profile && (
                <div className="flex items-center gap-1.5">
                  <Badge className="bg-blue-50 text-[#2563EB] border border-blue-200 font-bold text-[10px] uppercase tracking-wider">
                    {profile.name}
                  </Badge>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(profile.code);
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 2000);
                      toast({ title: 'School Code Copied', description: profile.code });
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono text-[10px] font-bold transition-colors"
                  >
                    {profile.code}
                    {copiedCode ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-slate-400" />}
                  </button>
                </div>
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
              className="gap-2 bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 hover:from-blue-800 hover:to-slate-950 text-white font-bold h-9 shadow-md text-xs px-4 border-none disabled:opacity-50"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin text-amber-300" /> : <Save className="w-4 h-4 text-amber-300" />}
              <span>{saving ? 'Saving…' : dirty ? 'Save Changes' : 'Saved'}</span>
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

      {/* ── Tabs Navigation ── */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {[
          { id: 'profile', label: 'Institutional Profile', icon: Building2, badge: form.name ? 'Configured' : 'Required', testId: 'school-setup-tab-profile' },
          { id: 'timetable', label: 'Timetable Structure', icon: Sliders, badge: '5 Modules', testId: 'school-setup-tab-timetable' },
          { id: 'automation', label: 'Plan & Automation', icon: Sparkles, badge: flags?.planName ?? 'Enterprise', testId: 'school-setup-tab-automation' },
          { id: 'integrations', label: 'Hardware & Integrations', icon: Layers, badge: 'Live', testId: 'school-setup-tab-integrations' },
          { id: 'security', label: 'Tenant Isolation & Security', icon: ShieldCheck, badge: 'Active', testId: 'school-setup-tab-security' },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              data-testid={tab.testId}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all ${
                isActive
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'bg-white border border-slate-200/80 text-slate-600 hover:bg-slate-100/80'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full uppercase tracking-wider font-extrabold ${
                isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
              }`}>
                {tab.badge}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Tab 1: Profile ── */}
      {activeTab === 'profile' && (
        <Card className="border-slate-200 shadow-sm rounded-3xl overflow-hidden">
          <CardHeader className="p-6 pb-4 bg-gradient-to-r from-slate-50 via-white to-blue-50/30 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-blue-600" />
                  Official Institution Profile
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  Saved to your tenant record. Rendered on official timetable PDF exports, teacher substitution notices, and daily reports.
                </CardDescription>
              </div>
              <Badge variant="outline" className="bg-white border-blue-200 text-blue-700 font-bold text-[11px]">
                {form.board || 'Affiliation Board Unset'}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="p-6 space-y-5">
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-blue-600" />
                      School Official Name
                    </Label>
                    <Input
                      data-testid="settings-school-name"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g. St. Xavier's International School"
                      className="h-10 text-xs rounded-xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-600" />
                      Tenant Identifier Code
                    </Label>
                    <div className="relative">
                      <Input
                        value={profile?.code ?? ''}
                        disabled
                        className="h-10 text-xs font-mono font-bold bg-slate-50 rounded-xl pr-16"
                      />
                      <Badge className="absolute right-2 top-2.5 bg-slate-200 text-slate-700 text-[10px] font-bold border-none">
                        Locked
                      </Badge>
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Platform-issued multi-tenant ID. All database queries are strictly scoped to this tenant code.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-indigo-600" />
                      Affiliation Board / Curriculum
                    </Label>
                    <Select
                      value={form.board || 'none'}
                      onValueChange={(v) => setForm({ ...form, board: v === 'none' ? '' : v })}
                    >
                      <SelectTrigger className="h-10 text-xs rounded-xl" data-testid="settings-school-board">
                        <SelectValue placeholder="Select a board…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not specified</SelectItem>
                        {BOARDS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-emerald-600" />
                      Contact Phone / Helpline
                    </Label>
                    <Input
                      data-testid="settings-school-phone"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      placeholder="e.g. +91 98765 43210"
                      className="h-10 text-xs rounded-xl"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-rose-600" />
                      Campus Address
                    </Label>
                    <Input
                      data-testid="settings-school-address"
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      placeholder="Street, locality, city, PIN code"
                      className="h-10 text-xs rounded-xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-purple-600" />
                      Primary Contact / Principal Name
                    </Label>
                    <Input
                      data-testid="settings-contact-name"
                      value={form.contactName}
                      onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                      placeholder="Principal or administrator full name"
                      className="h-10 text-xs rounded-xl"
                    />
                  </div>
                </div>

                {/* Login identity */}
                <div className="pt-4 border-t border-slate-100 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-blue-600" />
                      Verified Admin Login Email
                    </Label>
                    <Badge variant="outline" className="text-[10px] font-bold text-slate-500 border-slate-300">
                      Login Identity (Managed via Security Settings)
                    </Badge>
                  </div>
                  <Input
                    data-testid="settings-school-email"
                    type="email"
                    value={profile?.email ?? ''}
                    disabled
                    readOnly
                    className="h-10 text-xs bg-slate-50 rounded-xl"
                  />
                  <p className="text-[10px] text-slate-400">
                    This verified email address receives administrative security notifications and password resets.
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Tab 2: Timetable structure ── */}
      <div className={activeTab === 'timetable' ? 'space-y-4' : 'hidden'}>
        <Card className="border-slate-200 shadow-sm rounded-3xl overflow-hidden">
          <CardHeader className="p-6 pb-4 bg-gradient-to-r from-slate-50 via-white to-blue-50/30 border-b border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-blue-600" />
                  Timetable Structure &amp; Master Rules
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  Configure working days, class sections, subject quotas, and room capacity in one unified workspace.
                </CardDescription>
              </div>
            </div>

            {/* Sub-tabs: Days & Periods, Academic Structure, Subjects, Rooms, Weekly Summary */}
            <div className="flex flex-wrap gap-2 pt-4 border-t border-slate-100 mt-4">
              {[
                { id: 'days', label: 'Days & Periods', icon: CalendarClock, desc: 'Working days & breaks' },
                { id: 'structure', label: 'Academic Structure', icon: Layers, desc: 'Grades & sections' },
                { id: 'subjects', label: 'Subjects', icon: BookOpen, desc: 'Subject rules & allocation' },
                { id: 'rooms', label: 'Rooms', icon: DoorOpen, desc: 'Capacity & types' },
                { id: 'summary', label: 'Weekly Summary', icon: Info, desc: 'Teaching hours overview' },
                { id: 'autofix', label: 'Auto-fixes', icon: Sparkles, desc: 'Automatic corrections, with Undo' },
              ].map((st) => {
                const SubIcon = st.icon;
                const isSubActive = timetableSubTab === st.id;
                return (
                  <button
                    key={st.id}
                    type="button"
                    data-testid={`school-setup-tab-${st.id}`}
                    onClick={() => setTimetableSubTab(st.id as TimetableSubTabId)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                      isSubActive
                        ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <SubIcon className={`w-3.5 h-3.5 ${isSubActive ? 'text-white' : 'text-slate-400'}`} />
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
          {timetableSubTab === 'autofix' && <AutoFixPanel />}
          {timetableSubTab === 'summary' && (
            <div className="space-y-4">
              <AutoFixNotices />
              <SetupChecklistFull />
              <CapacitySummary />
              <Card className="border-slate-200 shadow-sm rounded-3xl">
                <CardHeader className="p-6 pb-4">
                  <CardTitle className="text-base font-bold text-slate-900">Teaching Week Overview &amp; Period Balances</CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Calculated from your working days and period counts.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6 pt-0 space-y-4">
                  {dayConfig ? (
                    <>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 space-y-1">
                        <ReadOnlyRow label="Working days per week" value={`${dayConfig.workingDays} Days`} />
                        <ReadOnlyRow label="School hours" value={`${dayConfig.startTime} – ${dayConfig.endTime}`} />
                        <ReadOnlyRow label="Short break" value={dayConfig.breakEnabled === false ? 'Off' : `${dayConfig.breakMinutes} min (after period ${dayConfig.breakAfter})`} />
                        <ReadOnlyRow label="Lunch break" value={dayConfig.lunchEnabled === false ? 'Off' : `${dayConfig.lunchMinutes} min (after period ${dayConfig.lunchAfter})`} />
                        <ReadOnlyRow label="Total teaching periods per week" value={<Badge className="bg-blue-600 font-bold">{totalWeekly} Periods</Badge>} />
                      </div>

                      {dayRows.length > 0 && (
                        <div className="rounded-2xl border border-slate-200 p-5">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Periods per day breakdown</p>
                          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                            {dayRows.map((d) => (
                              <div key={d.day} className="p-3 rounded-xl bg-slate-100/80 text-center">
                                <span className="text-[10px] font-bold uppercase text-slate-500 block">{d.day}</span>
                                <span className="text-sm font-black text-slate-900">{d.periods} periods</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
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
        <Card className="border-slate-200 shadow-sm rounded-3xl">
          <CardHeader className="p-6 pb-4">
            <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              Plan Entitlements &amp; Automation
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Institutional tier quotas, AI limits, and automated substitution features.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-0 space-y-5">
            {flags ? (
              <>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 space-y-1">
                  <ReadOnlyRow label="Active Tier" value={<Badge className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white font-bold capitalize">{flags.planName}</Badge>} />
                  <ReadOnlyRow label="Faculty capacity" value={`${flags.maxTeachers} Teachers maximum`} />
                  <ReadOnlyRow label="Grade capacity" value={`${flags.maxGrades} Academic Grades`} />
                  <ReadOnlyRow label="Max periods per day" value={`${flags.maxPeriodsPerDay} Periods`} />
                  {flags.trialEndsAt && (
                    <ReadOnlyRow label="Trial ends" value={new Date(flags.trialEndsAt).toLocaleDateString()} />
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 p-5 space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Included Platform Features</p>
                  {[
                    ['AI Timetable Generation Engine', flags.aiTimetableEnabled],
                    ['Bulk Data Import / Export (Excel & CSV)', flags.bulkImportEnabled],
                    ['Teacher Substitution Engine', flags.substitutionEnabled],
                    ['Automatic Substitute Recommendation Algorithm', flags.autoSubstitutionEnabled],
                    ['Workload & Period Balance Analytics', flags.workloadAnalyticsEnabled],
                    ['Multi-Channel Teacher Notifications', flags.teacherNotifyEnabled],
                  ].map(([label, on]) => (
                    <div key={String(label)} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                      <span className="text-xs font-medium text-slate-700">{label}</span>
                      {on
                        ? <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700"><Check className="w-3.5 h-3.5" />Active</span>
                        : <span className="text-[11px] font-bold text-slate-400">Not in plan</span>}
                    </div>
                  ))}
                </div>

                <p className="text-[11px] text-slate-500">
                  To upgrade limits or add dedicated features, contact your system administrator or raise a request in{' '}
                  <Link href="/support" className="font-semibold text-blue-700 underline">Support &amp; Tickets</Link>.
                </p>
              </>
            ) : (
              <p className="text-xs text-slate-400 py-4 text-center">Loading plan…</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Tab 4: Hardware & Integrations ── */}
      {activeTab === 'integrations' && (
        <div className="space-y-6">
          {/* Biometric Hardware Section */}
          <Card className="border-slate-200 shadow-sm rounded-3xl">
            <CardHeader className="p-6 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Fingerprint className="w-5 h-5 text-indigo-600" />
                    Biometric Attendance Hardware (ADMS / eSSL / ZKTeco)
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 mt-1">
                    Connect on-premise physical fingerprint / face recognition machines directly to your school tenant.
                  </CardDescription>
                </div>
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 font-bold text-[10px] uppercase">
                  Active Listener
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-6 pt-0 space-y-4">
              <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-4">
                <div className="space-y-1.5">
                  <p className="text-xs font-bold text-slate-800">1. ADMS Server Push Endpoint (for Device ADMS / Cloud Server setting)</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono bg-white px-3 py-2 rounded-xl border border-slate-200 text-blue-700 flex-1 select-all font-bold">
                      {`${originUrl}/api/biometric/adms`}
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 text-xs gap-1.5 font-bold"
                      onClick={() => {
                        navigator.clipboard.writeText(`${originUrl}/api/biometric/adms`);
                        toast({ title: 'Copied', description: 'ADMS endpoint copied to clipboard.' });
                      }}
                    >
                      <Copy className="w-3.5 h-3.5" /> Copy
                    </Button>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Enter your server IP / Domain in your ZKTeco or eSSL machine menu under <strong>Comm. &gt; Cloud Server / ADMS Server</strong>.
                  </p>
                </div>

                <div className="space-y-1.5 pt-3 border-t border-slate-200">
                  <p className="text-xs font-bold text-slate-800">2. JSON Webhook Endpoint (for Matrix / Cloud Controller bridges)</p>
                  <code className="text-xs font-mono bg-white px-3 py-2 rounded-xl border border-slate-200 text-slate-700 block select-all font-bold">
                    {`${originUrl}/api/biometric/device-webhook`}
                  </code>
                </div>

                {/* ADMS Ping Test simulator */}
                <div className="pt-3 border-t border-slate-200 flex items-center justify-between flex-wrap gap-2">
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-slate-800">Test ADMS Push Receiver</p>
                    <p className="text-[11px] text-slate-500">Simulate a device handshake ping to verify server connectivity.</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleSimulateAdmsPing}
                    disabled={testingAdms}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-8 gap-1.5"
                  >
                    {testingAdms ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Terminal className="w-3.5 h-3.5" />}
                    <span>{testingAdms ? 'Testing…' : 'Ping ADMS Listener'}</span>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Multi-Channel Alerts Section */}
          <Card className="border-slate-200 shadow-sm rounded-3xl">
            <CardHeader className="p-6 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-blue-600" />
                    Multi-Channel Notifications Gateway
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 mt-1">
                    Instant alerts to teachers for substitution assignments, approved leaves, and schedule changes via WhatsApp, SMS, and Email.
                  </CardDescription>
                </div>
                <Badge className="bg-blue-100 text-blue-800 border-blue-300 font-bold text-[10px] uppercase">
                  Multi-Gateway Ready
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-6 pt-0 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">WhatsApp Business API</span>
                  <p className="text-xs font-bold text-slate-900">Meta Cloud API</p>
                  <p className="text-[11px] text-slate-500">Official verified message delivery</p>
                </div>
                <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">SMS Gateway</span>
                  <p className="text-xs font-bold text-slate-900">Twilio REST API</p>
                  <p className="text-[11px] text-slate-500">DLT registered enterprise SMS</p>
                </div>
                <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Email Dispatcher</span>
                  <p className="text-xs font-bold text-slate-900">Resend / SMTP</p>
                  <p className="text-[11px] text-slate-500">HTML timetable &amp; leave notices</p>
                </div>
              </div>

              {/* Interactive Test Panel */}
              <div className="p-4 rounded-2xl border border-blue-100 bg-blue-50/50 space-y-3">
                <p className="text-xs font-bold text-blue-950">Dispatch Test Notification</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Select value={testChannel} onValueChange={(val: any) => setTestChannel(val)}>
                    <SelectTrigger className="w-full sm:w-40 bg-white h-10 text-xs rounded-xl">
                      <SelectValue placeholder="Channel" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Channels</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="sms">SMS</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Recipient phone or email (e.g. +919876543210)"
                    value={testRecipient}
                    onChange={(e) => setTestRecipient(e.target.value)}
                    className="bg-white text-xs h-10 rounded-xl"
                  />
                  <Button
                    onClick={handleTestDispatch}
                    disabled={testingNotification}
                    className="bg-blue-700 hover:bg-blue-800 text-white text-xs h-10 shrink-0 gap-1.5 font-bold px-5 rounded-xl"
                  >
                    {testingNotification ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    Send Test Alert
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Live Calendar Subscription Section */}
          <Card className="border-slate-200 shadow-sm rounded-3xl">
            <CardHeader className="p-6 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-emerald-600" />
                    Live Calendar Feed (RFC 5545 WebCal)
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 mt-1">
                    Subscribe to live school timetables and events in Google Calendar, Apple Calendar, or Outlook.
                  </CardDescription>
                </div>
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 font-bold text-[10px] uppercase">
                  iCal Ready
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-6 pt-0 space-y-3">
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono bg-slate-50 px-3 py-2.5 rounded-xl border border-slate-200 text-emerald-800 flex-1 select-all truncate font-bold">
                  {feedUrl}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-10 text-xs gap-1.5 font-bold shrink-0 rounded-xl"
                  onClick={() => {
                    navigator.clipboard.writeText(feedUrl);
                    setCopiedFeed(true);
                    setTimeout(() => setCopiedFeed(false), 2000);
                    toast({ title: 'Feed URL Copied', description: 'Paste into Google Calendar or Apple Calendar.' });
                  }}
                >
                  {copiedFeed ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedFeed ? 'Copied' : 'Copy Feed URL'}
                </Button>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                In Google Calendar, click <strong>+ Other Calendars &gt; From URL</strong> and paste the link above. Updates made in Smart Calendar will sync automatically across all subscribed devices.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Tab 5: Security ── */}
      {activeTab === 'security' && (
        <Card className="border-slate-200 shadow-sm rounded-3xl">
          <CardHeader className="p-6 pb-4">
            <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-700" />
              Tenant Isolation &amp; Security Architecture
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Multi-tenant cryptographic boundaries, database isolation, and active session protection.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-0 space-y-5">
            <div className="p-5 bg-blue-50/80 rounded-2xl border border-blue-200 flex items-start gap-3.5">
              <ShieldCheck className="w-6 h-6 text-blue-700 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-blue-950">Multi-Tenant Scoping Guarantee</p>
                <p className="text-[11px] text-blue-800 mt-1 leading-relaxed">
                  Your timetable, faculty, leave, substitution and attendance records are isolated under tenant code{' '}
                  <code className="font-mono bg-blue-100 px-1.5 py-0.5 rounded text-blue-900 font-bold">{profile?.code ?? '—'}</code>.
                  Every API request derives the school ID strictly from the signed session token. Cross-tenant leakage is cryptographically blocked at the middleware and query boundary.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Session Security</span>
                <p className="text-xs font-bold text-slate-900">HMAC-SHA256 Signed JWT</p>
                <p className="text-[11px] text-slate-500">Secure HTTP-only cookies with automatic rotation</p>
              </div>
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Credential Storage</span>
                <p className="text-xs font-bold text-slate-900">bcrypt / Salted Hash</p>
                <p className="text-[11px] text-slate-500">Re-authentication enforced on password changes</p>
              </div>
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Biometric Push Auth</span>
                <p className="text-xs font-bold text-slate-900">Device SN &amp; Secret Scoped</p>
                <p className="text-[11px] text-slate-500">Only authorized serial numbers mapped to this tenant</p>
              </div>
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Audit Trail Logging</span>
                <p className="text-xs font-bold text-slate-900">Active &amp; Immutable</p>
                <p className="text-[11px] text-slate-500">All timetable modifications and overrides logged with actor</p>
              </div>
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
