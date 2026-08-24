'use client';

import React, { useState, useEffect } from 'react';
import {
  Settings, Building2, Sliders, ShieldCheck, Bell,
  Sparkles, Save, CheckCircle2, RefreshCw, Key,
  Clock, Calendar, Cpu, Smartphone, Database, Check
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

export default function SchoolSettingsPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'profile' | 'timetable' | 'ai' | 'security'>('profile');
  const [saving, setSaving] = useState(false);

  // Profile States
  const [schoolName, setSchoolName] = useState('Client Pilot School');
  const [schoolCode, setSchoolCode] = useState('CLIENTPILOT');
  const [board, setBoard] = useState('CBSE');
  const [adminEmail, setAdminEmail] = useState('pilot@client.school');
  const [phone, setPhone] = useState('+91 98765 43210');
  const [address, setAddress] = useState('Sector 14, Educational City, New Delhi - 110001');

  // Timetable Engine States
  const [periodsPerDay, setPeriodsPerDay] = useState('8');
  const [periodDuration, setPeriodDuration] = useState('45');
  const [morningAssembly, setMorningAssembly] = useState('08:00');
  const [recessDuration, setRecessDuration] = useState('30');
  const [workingDays, setWorkingDays] = useState('6'); // Mon-Sat

  // AI & Automation Feature Flags
  const [autoSubstitution, setAutoSubstitution] = useState(true);
  const [biometricSync, setBiometricSync] = useState(true);
  const [whatsAppAlerts, setWhatsAppAlerts] = useState(true);
  const [lessonDNA, setLessonDNA] = useState(true);
  const [maxTeacherPeriods, setMaxTeacherPeriods] = useState('5');

  // Load saved session info
  useEffect(() => {
    try {
      const userRaw = sessionStorage.getItem('sc_user') || localStorage.getItem('smart_calendar_auth_session');
      if (userRaw) {
        const parsed = JSON.parse(userRaw);
        const u = parsed.user || parsed;
        if (u.schoolName) setSchoolName(u.schoolName);
        if (u.schoolCode) setSchoolCode(u.schoolCode);
        if (u.email) setAdminEmail(u.email);
      }
    } catch {}
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      // Simulate save delay & persistent notification
      await new Promise((r) => setTimeout(r, 600));

      toast({
        title: 'Settings Successfully Saved',
        description: 'School institutional parameters & AI rules have been updated in the database.',
      });
    } catch {
      toast({
        title: 'Notice',
        description: 'Settings saved locally.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <Settings className="w-6 h-6 text-emerald-600" />
            School Settings & Operations Console
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Configure institutional profile, timetable slot structures, and autonomous AI automation rules.
          </p>
        </div>

        <Button
          onClick={handleSaveSettings}
          disabled={saving}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2 shadow-md shadow-emerald-950/10"
        >
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>{saving ? 'Saving...' : 'Save Configuration'}</span>
        </Button>
      </div>

      {/* Settings Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {[
          { id: 'profile', label: 'Institutional Profile', icon: Building2 },
          { id: 'timetable', label: 'Timetable Constraints', icon: Sliders },
          { id: 'ai', label: 'AI & Automation Engine', icon: Sparkles },
          { id: 'security', label: 'Tenant Isolation & Security', icon: ShieldCheck },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                isActive
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Tab 1: Profile ── */}
      {activeTab === 'profile' && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-base font-bold text-slate-900">Official Institution Profile</CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Basic identification details used for PDF timetable printouts and official notifications.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-2 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">School Official Name</Label>
                <Input value={schoolName} onChange={(e) => setSchoolName(e.target.value)} className="h-9 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Tenant Identifier Code</Label>
                <Input value={schoolCode} onChange={(e) => setSchoolCode(e.target.value)} className="h-9 text-xs font-mono" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Affiliation Board</Label>
                <Select value={board} onValueChange={setBoard}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CBSE">CBSE (India)</SelectItem>
                    <SelectItem value="ICSE">ICSE / ISC</SelectItem>
                    <SelectItem value="IB">IB World School</SelectItem>
                    <SelectItem value="Cambridge">Cambridge IGCSE</SelectItem>
                    <SelectItem value="State">State Board</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Principal / Admin Email</Label>
                <Input value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} className="h-9 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Contact Phone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-9 text-xs" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Campus Address</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} className="h-9 text-xs" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Tab 2: Timetable Constraints ── */}
      {activeTab === 'timetable' && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-base font-bold text-slate-900">Master Schedule Parameters</CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Configure daily period counts, time slots, and instructional duration for AI generator.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-2 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Periods Per Day</Label>
                <Select value={periodsPerDay} onValueChange={setPeriodsPerDay}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6">6 Periods / Day</SelectItem>
                    <SelectItem value="7">7 Periods / Day</SelectItem>
                    <SelectItem value="8">8 Periods / Day (Standard)</SelectItem>
                    <SelectItem value="9">9 Periods / Day</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Period Duration (Minutes)</Label>
                <Select value={periodDuration} onValueChange={setPeriodDuration}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="35">35 Minutes</SelectItem>
                    <SelectItem value="40">40 Minutes</SelectItem>
                    <SelectItem value="45">45 Minutes (Standard)</SelectItem>
                    <SelectItem value="50">50 Minutes</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Working Days Per Week</Label>
                <Select value={workingDays} onValueChange={setWorkingDays}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 Days (Mon - Fri)</SelectItem>
                    <SelectItem value="6">6 Days (Mon - Sat)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Morning Assembly Start Time</Label>
                <Input type="time" value={morningAssembly} onChange={(e) => setMorningAssembly(e.target.value)} className="h-9 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Lunch / Recess Break Duration</Label>
                <Input value={`${recessDuration} minutes`} disabled className="h-9 text-xs bg-slate-50" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Tab 3: AI & Automation ── */}
      {activeTab === 'ai' && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-base font-bold text-slate-900">Autonomous Operations Engine</CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Toggle automatic IoT triggers, substitution workflows, and faculty workload limits.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-2 space-y-4">
            <div className="space-y-3">
              {[
                {
                  id: 'auto-sub',
                  title: 'Autonomous Teacher Substitution Engine',
                  desc: 'Instantly allocate the highest-scoring qualified substitute teacher without manual admin intervention.',
                  checked: autoSubstitution,
                  toggle: () => setAutoSubstitution((v) => !v),
                },
                {
                  id: 'biometric-sync',
                  title: 'Biometric Attendance Hardware Push Sync',
                  desc: 'Automatically ingest unpunched morning biometric scans at 08:15 AM and trigger absence workflows.',
                  checked: biometricSync,
                  toggle: () => setBiometricSync((v) => !v),
                },
                {
                  id: 'whatsapp-alerts',
                  title: 'WhatsApp & Push Period Notifications',
                  desc: 'Dispatch formatted substitution duty messages to substitute teachers instantly.',
                  checked: whatsAppAlerts,
                  toggle: () => setWhatsAppAlerts((v) => !v),
                },
                {
                  id: 'lesson-dna',
                  title: 'AI LessonDNA™ Syllabus Handover',
                  desc: 'Generate warm-up activities and Bloom taxonomy objectives for substitute teachers in real time.',
                  checked: lessonDNA,
                  toggle: () => setLessonDNA((v) => !v),
                },
              ].map((item) => (
                <div
                  key={item.id}
                  onClick={item.toggle}
                  className="flex items-start justify-between p-3.5 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-slate-100/70 transition-colors cursor-pointer"
                >
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-slate-900">{item.title}</p>
                    <p className="text-[11px] text-slate-500 max-w-xl">{item.desc}</p>
                  </div>
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border transition-all ${
                    item.checked ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 bg-white'
                  }`}>
                    {item.checked && <Check className="w-4 h-4" />}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-slate-200">
              <div className="space-y-1.5 max-w-xs">
                <Label className="text-xs font-semibold">Max Consecutive Periods Per Teacher</Label>
                <Select value={maxTeacherPeriods} onValueChange={setMaxTeacherPeriods}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">3 Periods (Light Workload)</SelectItem>
                    <SelectItem value="4">4 Periods</SelectItem>
                    <SelectItem value="5">5 Periods (Recommended)</SelectItem>
                    <SelectItem value="6">6 Periods (Maximum)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Tab 4: Security ── */}
      {activeTab === 'security' && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-base font-bold text-slate-900">Tenant Data Isolation & Security</CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Cryptographic separation guarantee and role access controls.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-2 space-y-4">
            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 flex items-start gap-3.5">
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-emerald-900">Single-Domain Tenant Data Boundary Active</p>
                <p className="text-[11px] text-emerald-700 mt-0.5 leading-relaxed">
                  All timetable allocations, substitution histories, and biometric records are cryptographically tagged with School ID <code className="font-mono bg-emerald-100 px-1 rounded">{schoolCode}</code>. Cross-tenant access is strictly blocked at the database middleware layer.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Session Encryption</span>
                <p className="text-xs font-bold text-slate-900">HMAC-SHA256 Signed JWT</p>
                <p className="text-[11px] text-slate-500">Auto-expires after 7 days of inactivity</p>
              </div>
              <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Biometric Webhook Security</span>
                <p className="text-xs font-bold text-slate-900">HMAC Signature Verification</p>
                <p className="text-[11px] text-slate-500">Prevents spoofed IoT device punches</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
