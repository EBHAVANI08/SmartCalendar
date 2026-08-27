'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Brain, Sparkles, RefreshCw, ShieldCheck, BookOpen,
  Mail, Lock, Eye, EyeOff, CheckCircle2, AlertCircle,
  GraduationCap, UserPlus, LogOut, ChevronRight,
  Building2, User, Settings
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [email, setEmail] = useState('admin@takshilaschool.edu');
  const [password, setPassword] = useState('school123');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSubmitted, setForgotSubmitted] = useState(false);
  
  // Registration form states
  const [schoolName, setSchoolName] = useState('');
  const [schoolCode, setSchoolCode] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [board, setBoard] = useState('CBSE');

  const [activeFeatureIndex, setActiveFeatureIndex] = useState(0);

  // Load saved credentials
  useEffect(() => {
    try {
      const savedEmail = localStorage.getItem('smart_calendar_remembered_email');
      if (savedEmail) {
        setEmail(savedEmail);
      }
    } catch {}
  }, []);

  // Feature carousel timer on hero side
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveFeatureIndex((prev) => (prev + 1) % 4);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // Password strength calculation
  const getPasswordStrength = (pass: string) => {
    if (!pass) return 0;
    let score = 0;
    if (pass.length >= 8) score += 25;
    if (/[A-Z]/.test(pass)) score += 25;
    if (/[0-9]/.test(pass)) score += 25;
    if (/[^A-Za-z0-9]/.test(pass)) score += 25;
    return score;
  };

  const passwordStrength = getPasswordStrength(password);
  const getStrengthLabel = (score: number) => {
    if (score <= 25) return { label: 'Weak', color: 'bg-rose-500 text-rose-400' };
    if (score <= 50) return { label: 'Fair', color: 'bg-amber-500 text-amber-400' };
    if (score <= 75) return { label: 'Good', color: 'bg-blue-500 text-blue-400' };
    return { label: 'Strong & Secure', color: 'bg-emerald-500 text-emerald-400' };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (registering) {
        if (!schoolName.trim() || !schoolCode.trim()) {
          setError('School Name and School Code are required.');
          setLoading(false);
          return;
        }
        if (password !== confirmPassword) {
          setError('Passwords do not match.');
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          setError('Password must be at least 6 characters.');
          setLoading(false);
          return;
        }
      }

      const res = await fetch(registering ? '/api/auth/register-school' : '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          registering
            ? { name: schoolName, code: schoolCode, email, password }
            : { email, password }
        ),
      });

      let data: any = {};
      try {
        data = await res.json();
      } catch {
        data = { error: 'Authentication service response format invalid.' };
      }

      if (res.ok && data?.success) {
        if (rememberMe) {
          try {
            localStorage.setItem('smart_calendar_remembered_email', email);
          } catch {}
        } else {
          try {
            localStorage.removeItem('smart_calendar_remembered_email');
          } catch {}
        }

        // Store in localStorage and sessionStorage for full routing sync
        try {
          localStorage.setItem(
            'smart_calendar_auth_session',
            JSON.stringify({
              isLoggedIn: true,
              user: data.user,
              role: data.user.role || 'admin',
            })
          );
          sessionStorage.setItem('sc_user', JSON.stringify(data.user));
          if (data.token) sessionStorage.setItem('sc_token', data.token);
        } catch {}

        toast({
          title: 'Welcome Back!',
          description: `Logged in as ${data.user.name || data.user.email}`,
        });

        // Redirect owners to the command center; everyone else to the school dashboard
        router.push(data.user?.role === 'superadmin' ? '/superadmin' : '/dashboard');
      } else {
        setError(data.error || 'Authentication failed. Please verify credentials.');
      }
    } catch {
      setError('Network connection failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const heroFeatures = [
    {
      title: 'Autonomous Substitution Engine',
      desc: 'Instant conflict-free substitute allocation matching subjects, grade expertise, and teacher availability within 3 seconds.',
      icon: RefreshCw,
      badge: 'Zero Class Loss',
      color: 'from-emerald-500 to-teal-500',
    },
    {
      title: 'Hardware Biometric Sync',
      desc: 'Seamless real-time attendance ingestion from biometric fingerprint & face scanners with automated WhatsApp alerts.',
      icon: Brain,
      badge: 'IoT Connected',
      color: 'from-teal-500 to-cyan-500',
    },
    {
      title: 'Unified Multi-Tenant Isolation',
      desc: 'Single domain architecture with strict database boundaries, encrypted credentials, and automatic school workspace detection.',
      icon: ShieldCheck,
      badge: 'Bank-Grade Security',
      color: 'from-blue-500 to-indigo-500',
    },
    {
      title: 'AI LessonDNA™ Transfer',
      desc: 'Substitutes instantly receive syllabus progress, warm-up exercises, and Bloom taxonomy lesson plans before the bell rings.',
      icon: BookOpen,
      badge: 'NEP 2020 Aligned',
      color: 'from-purple-500 to-violet-500',
    },
  ];

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col lg:flex-row overflow-x-hidden font-sans">
      {/* ── Left Hero / Enterprise Showcase Side (Hidden on small screens, shown lg+) ── */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-12 flex-col justify-between overflow-hidden border-r border-slate-800/60 select-none">
        {/* Ambient Glowing Orbs */}
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none animate-pulse" />
        <div className="absolute top-1/2 -right-32 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none animate-pulse" style={{ animationDelay: '1.5s' }} />
        <div className="absolute -bottom-32 left-1/4 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
        
        {/* Subtle Grid Lines */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:48px_48px] pointer-events-none" />

        {/* Top Branding */}
        <div className="relative z-10">
          <Link href="/" className="inline-flex items-center gap-3.5 mb-3 group">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-700 to-slate-900 flex items-center justify-center shadow-xl shadow-blue-500/30 ring-2 ring-blue-400/30 group-hover:scale-105 transition-transform">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold tracking-tight text-white">Smart Calendar</span>
                <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-[10px] py-0 px-2 font-mono">
                  Enterprise Cloud v3.4
                </Badge>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">Autonomous School Scheduling & Attendance Platform</p>
            </div>
          </Link>
        </div>

        {/* Middle Feature Showcase */}
        <div className="relative z-10 my-auto py-8">
          <div className="mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-semibold mb-3">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Next-Generation Timetable Intelligence</span>
            </div>
            <h2 className="text-3xl font-extrabold text-white leading-tight tracking-tight">
              Empowering 50+ Educational Institutions with Autonomous AI Operations.
            </h2>
            <p className="text-slate-400 text-sm mt-2 leading-relaxed">
              Eliminate timetable clashes, automate daily teacher substitutions, and deliver continuous learning without missing a single period.
            </p>
          </div>

          {/* Interactive Feature Carousel Cards */}
          <div className="space-y-3">
            {heroFeatures.map((feat, idx) => {
              const Icon = feat.icon;
              const isActive = activeFeatureIndex === idx;
              return (
                <div
                  key={feat.title}
                  onClick={() => setActiveFeatureIndex(idx)}
                  className={`p-4 rounded-2xl border transition-all duration-300 cursor-pointer ${
                    isActive
                      ? 'bg-slate-900/90 border-blue-500/40 shadow-xl shadow-blue-950/40 scale-[1.01]'
                      : 'bg-slate-900/40 border-slate-800/60 hover:bg-slate-900/60 opacity-70 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${feat.color} flex items-center justify-center shrink-0 shadow-md`}>
                      <Icon className="w-4.5 h-4.5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-bold text-white truncate">{feat.title}</p>
                        <Badge className="text-[9px] bg-slate-800 text-slate-300 border-slate-700 py-0 px-1.5 shrink-0">
                          {feat.badge}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed line-clamp-2">
                        {feat.desc}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* KPI Metrics Ribbon */}
          <div className="grid grid-cols-4 gap-3 mt-8 pt-6 border-t border-slate-800/80">
            {[
              { val: '50+', lbl: 'Schools Live' },
              { val: '99.98%', lbl: 'System SLA' },
              { val: '2.4M+', lbl: 'Periods Solved' },
              { val: '0s', lbl: 'Class Delay' },
            ].map((kpi) => (
              <div key={kpi.lbl} className="text-center p-2 rounded-xl bg-slate-900/50 border border-slate-800/50">
                <p className="text-base font-extrabold text-blue-400 font-mono">{kpi.val}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{kpi.lbl}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Principal Trust Badge & Security Guarantee */}
        <div className="relative z-10 pt-4 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-400" />
            <span>256-bit Encrypted Tenant Isolation</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/" className="hover:text-blue-400 transition-colors">Home</Link>
            <span>•</span>
            <Link href="/brochure" className="hover:text-blue-400 transition-colors">Brochure</Link>
          </div>
        </div>
      </div>

      {/* ── Right Authentication & Onboarding Side ── */}
      <div className="w-full lg:w-1/2 min-h-screen flex items-center justify-center p-4 sm:p-8 lg:p-12 relative overflow-y-auto">
        {/* Background elements for mobile view */}
        <div className="lg:hidden absolute top-[-10%] left-[-10%] w-72 h-72 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="lg:hidden absolute bottom-[-10%] right-[-10%] w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-md space-y-6 relative z-10 py-6">
          {/* Mobile-only logo */}
          <div className="lg:hidden text-center mb-6">
            <Link href="/" className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl shadow-xl shadow-blue-500/30 mb-3 ring-2 ring-blue-400/30">
              <Brain className="w-8 h-8 text-white" />
            </Link>
            <h1 className="text-2xl font-bold text-white tracking-tight">AI Smart Calendar</h1>
            <p className="text-xs text-blue-400/80 font-medium">Multi-Tenant School Management</p>
          </div>

          {/* Main Auth Card Container */}
          <Card className="bg-slate-900/90 border border-slate-800 backdrop-blur-2xl shadow-2xl shadow-black/60 rounded-3xl overflow-hidden">
            {/* Top Switcher: Sign In vs Register School */}
            <div className="grid grid-cols-2 border-b border-slate-800 bg-slate-950/40 p-1.5 gap-1.5">
              <button
                type="button"
                onClick={() => { setRegistering(false); setError(''); }}
                className={`py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  !registering
                    ? 'bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 text-white shadow-lg shadow-blue-950/50'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <LogOut className="w-3.5 h-3.5 rotate-180" />
                <span>Sign In</span>
              </button>
              <button
                type="button"
                onClick={() => { setRegistering(true); setError(''); }}
                className={`py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  registering
                    ? 'bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 text-white shadow-lg shadow-blue-950/50'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Register School</span>
              </button>
            </div>

            <CardContent className="p-6 sm:p-7 space-y-5">
              {!registering ? (
                /* ── Sign In Form with Auto-Tenant Detection ── */
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-slate-300 text-xs font-medium flex items-center justify-between">
                      <span>Work Email or School Code</span>
                      <span className="text-[10px] text-blue-400 font-mono font-bold">Auto-Detects School</span>
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <Input
                        type="text"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="e.g. admin@takshilaschool.edu or TAKSHILA2025"
                        className="pl-10 bg-slate-950/60 border-slate-800 text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500/20 h-11 rounded-xl text-sm transition-all"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-slate-300 text-xs font-medium">Password</Label>
                      <button
                        type="button"
                        onClick={() => { setForgotEmail(email); setForgotOpen(true); }}
                        className="text-[11px] text-blue-400 hover:text-blue-300 hover:underline transition-colors font-medium"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your account password"
                        className="pl-10 pr-10 bg-slate-950/60 border-slate-800 text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500/20 h-11 rounded-xl text-sm transition-all"
                        required
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200 transition-colors"
                        onClick={() => setShowPassword((v) => !v)}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Remember me & Secure Session */}
                  <div className="flex items-center justify-between text-xs pt-0.5">
                    <label className="flex items-center gap-2 text-slate-400 hover:text-slate-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-blue-500/20 w-4 h-4"
                      />
                      <span>Remember my login</span>
                    </label>
                    <span className="text-[11px] text-slate-500 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-400" /> Auto-Tenant
                    </span>
                  </div>

                  {/* Error Display */}
                  {error && (
                    <div className="flex items-center gap-2.5 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-xs animate-shake">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span className="flex-1 font-medium">{error}</span>
                    </div>
                  )}

                  {/* Submit Button */}
                  <Button
                    type="submit"
                    disabled={loading || !email || !password}
                    className="w-full h-11 bg-gradient-to-r from-blue-600 via-indigo-700 to-slate-900 hover:from-blue-700 hover:to-slate-950 text-white font-bold rounded-xl shadow-lg shadow-blue-950/50 transition-all text-sm flex items-center justify-center gap-2 border border-blue-400/20"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Verifying & Detecting Workspace...</span>
                      </>
                    ) : (
                      <>
                        <LogOut className="w-4 h-4 rotate-180" />
                        <span>Sign In to Workspace</span>
                      </>
                    )}
                  </Button>
                </form>
              ) : (
                /* ── Registration Mode ── */
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-3">
                    <p className="font-bold text-xs text-blue-300 flex items-center gap-1.5">
                      <GraduationCap className="w-4 h-4" />
                      Create New School Workspace
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Instantly provision an isolated, secure multi-tenant calendar database.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-slate-300 text-xs font-medium">School Official Name</Label>
                      <Input
                        value={schoolName}
                        onChange={(e) => {
                          setSchoolName(e.target.value);
                          if (!schoolCode) {
                            setSchoolCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10));
                          }
                        }}
                        placeholder="e.g. Cambridge International School"
                        className="bg-slate-950/60 border-slate-800 text-slate-100 placeholder:text-slate-500 focus:border-blue-500 h-10 rounded-xl text-sm"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="space-y-1.5">
                        <Label className="text-slate-300 text-xs font-medium">Tenant Code</Label>
                        <Input
                          value={schoolCode}
                          onChange={(e) => setSchoolCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
                          placeholder="e.g. CIS_DELHI"
                          className="bg-slate-950/60 border-slate-800 text-slate-100 font-mono text-xs focus:border-blue-500 h-10 rounded-xl"
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-slate-300 text-xs font-medium">Curriculum Board</Label>
                        <Select value={board} onValueChange={setBoard}>
                          <SelectTrigger className="bg-slate-950/60 border-slate-800 text-slate-200 h-10 rounded-xl text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                            <SelectItem value="CBSE">CBSE (India)</SelectItem>
                            <SelectItem value="ICSE">ICSE / ISC</SelectItem>
                            <SelectItem value="IB">IB World School</SelectItem>
                            <SelectItem value="Cambridge">Cambridge IGCSE</SelectItem>
                            <SelectItem value="State">State Board</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-slate-300 text-xs font-medium">Administrator Email</Label>
                      <Input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="principal@yourschool.edu"
                        className="bg-slate-950/60 border-slate-800 text-slate-100 placeholder:text-slate-500 focus:border-blue-500 h-10 rounded-xl text-sm"
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-slate-300 text-xs font-medium">Admin Password</Label>
                        {password && (
                          <span className={`text-[10px] font-semibold ${getStrengthLabel(passwordStrength).color}`}>
                            {getStrengthLabel(passwordStrength).label}
                          </span>
                        )}
                      </div>
                      <div className="relative">
                        <Input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Min. 8 characters"
                          className="pr-10 bg-slate-950/60 border-slate-800 text-slate-100 placeholder:text-slate-500 focus:border-blue-500 h-10 rounded-xl text-sm"
                          required
                        />
                        <button
                          type="button"
                          tabIndex={-1}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200"
                          onClick={() => setShowPassword((v) => !v)}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {password && (
                        <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden mt-1">
                          <div
                            className={`h-full transition-all duration-300 ${
                              passwordStrength <= 25
                                ? 'bg-rose-500 w-1/4'
                                : passwordStrength <= 50
                                ? 'bg-amber-500 w-2/4'
                                : passwordStrength <= 75
                                ? 'bg-blue-500 w-3/4'
                                : 'bg-blue-600 w-full'
                            }`}
                          />
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-slate-300 text-xs font-medium">Confirm Password</Label>
                      <div className="relative">
                        <Input
                          type={showConfirmPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Repeat password"
                          className="pr-10 bg-slate-950/60 border-slate-800 text-slate-100 placeholder:text-slate-500 focus:border-blue-500 h-10 rounded-xl text-sm"
                          required
                        />
                        <button
                          type="button"
                          tabIndex={-1}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200"
                          onClick={() => setShowConfirmPassword((v) => !v)}
                        >
                          {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-xs">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <Button
                    type="submit"
                    disabled={loading || !schoolName || !email || !password || !confirmPassword}
                    className="w-full h-11 bg-gradient-to-r from-blue-600 via-indigo-700 to-slate-900 hover:from-blue-700 hover:to-slate-950 text-white font-bold rounded-xl shadow-lg shadow-blue-950/50 transition-all text-sm flex items-center justify-center gap-2 border border-blue-400/20"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Creating School Database...</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4" />
                        <span>Complete Workspace Registration</span>
                      </>
                    )}
                  </Button>
                </form>
              )}

              {/* ── Dummy tenant: Takshila School only ── */}
              {!registering && (
                <div className="p-3.5 bg-slate-950/70 rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between font-bold text-slate-200 text-xs">
                    <span>⚡ Select Role for 1-Click Login:</span>
                    <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-[9px] font-mono">Takshila School</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={async () => {
                        setEmail('admin@takshilaschool.edu');
                        setPassword('school123');
                        setLoading(true);
                        try {
                          const res = await fetch('/api/auth/login', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email: 'admin@takshilaschool.edu', password: 'school123' }),
                          });
                          const data = await res.json();
                          if (res.ok && data?.success) {
                            localStorage.setItem('smart_calendar_auth_session', JSON.stringify({ isLoggedIn: true, user: data.user, role: 'admin' }));
                            sessionStorage.setItem('sc_user', JSON.stringify(data.user));
                            if (data.token) sessionStorage.setItem('sc_token', data.token);
                            toast({ title: 'Admin Logged In', description: 'Logged in as Takshila School Principal' });
                            router.push('/dashboard');
                          } else {
                            setError(data.error || 'Takshila admin login failed.');
                          }
                        } catch {
                          setError('Network connection failed. Please try again.');
                        } finally {
                          setLoading(false);
                        }
                      }}
                      className="p-2.5 rounded-xl bg-blue-950/40 border border-blue-500/30 hover:border-blue-400 text-left transition-all group cursor-pointer"
                    >
                      <span className="text-blue-300 font-extrabold text-[11px] block truncate group-hover:text-blue-200">Admin</span>
                      <span className="text-[9px] text-blue-400/80 block font-mono">Takshila Principal</span>
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        setEmail('afreen.deshmukh@takshilaschool.edu');
                        setPassword('teacher123');
                        setLoading(true);
                        try {
                          const res = await fetch('/api/auth/login', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email: 'afreen.deshmukh@takshilaschool.edu', password: 'teacher123' }),
                          });
                          const data = await res.json();
                          if (res.ok && data?.success) {
                            localStorage.setItem('smart_calendar_auth_session', JSON.stringify({ isLoggedIn: true, user: data.user, role: 'teacher' }));
                            sessionStorage.setItem('sc_user', JSON.stringify(data.user));
                            if (data.token) sessionStorage.setItem('sc_token', data.token);
                            toast({ title: 'Teacher Logged In', description: 'Logged in as Afreen Deshmukh' });
                            router.push('/dashboard');
                          } else {
                            setError(data.error || 'Takshila teacher login failed.');
                          }
                        } catch {
                          setError('Network connection failed. Please try again.');
                        } finally {
                          setLoading(false);
                        }
                      }}
                      className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 hover:border-emerald-400 text-left transition-all group cursor-pointer"
                    >
                      <span className="text-emerald-300 font-extrabold text-[11px] block truncate group-hover:text-emerald-200">Teacher</span>
                      <span className="text-[9px] text-emerald-400/80 block font-mono">Afreen Deshmukh</span>
                    </button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Footer Direct Links */}
          <div className="flex items-center justify-center gap-4 text-xs text-slate-500">
            <Link href="/" className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 font-semibold transition-colors py-1 px-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <span>Back to Home Website</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <p className="text-center text-[11px] text-slate-600">
            AI Smart Calendar &copy; {new Date().getFullYear()} &middot; Multi-Tenant Cloud &middot; All Rights Reserved
          </p>
        </div>
      </div>

      {/* ── Forgot Password Dialog Modal ── */}
      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="max-w-md bg-slate-900 border-slate-800 text-slate-100">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Lock className="w-5 h-5 text-blue-400" />
              Reset Account Access
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Enter your registered work email to receive password reset instructions or reach your school tenant administrator.
            </DialogDescription>
          </DialogHeader>
          
          {forgotSubmitted ? (
            <div className="py-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-white">Reset Request Logged</p>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                If <span className="text-blue-300">{forgotEmail}</span> matches a registered school or faculty account, instructions have been dispatched.
              </p>
              <Button
                variant="outline"
                className="mt-2 text-xs border-slate-700 bg-slate-800 text-white"
                onClick={() => { setForgotOpen(false); setForgotSubmitted(false); }}
              >
                Return to Sign In
              </Button>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300">Registered Email Address</Label>
                <Input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="name@school.edu"
                  className="bg-slate-950 border-slate-800 text-white h-10 text-sm"
                  required
                />
              </div>
              <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-[11px] text-slate-400 space-y-1">
                <p className="font-semibold text-slate-300">💡 School Admin Note:</p>
                <p>If you are a faculty teacher, your School Admin can directly reset your credentials from the <strong>Faculty Directory</strong> tab.</p>
              </div>
              <DialogFooter className="flex gap-2">
                <Button variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs" onClick={() => setForgotOpen(false)}>
                  Cancel
                </Button>
                <Button
                  className="bg-gradient-to-r from-blue-600 via-indigo-700 to-slate-900 hover:from-blue-700 hover:to-slate-950 text-white text-xs font-bold"
                  onClick={() => {
                    if (forgotEmail) setForgotSubmitted(true);
                  }}
                >
                  Send Reset Link
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
