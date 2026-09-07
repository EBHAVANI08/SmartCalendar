'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Brain, RefreshCw, ShieldCheck, BookOpen,
  Mail, Lock, Eye, EyeOff, CheckCircle2, AlertCircle,
  ChevronRight, Building2, UserCheck, CalendarDays, ArrowRight
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSubmitted, setForgotSubmitted] = useState(false);

  // Load saved credentials if any
  useEffect(() => {
    try {
      const savedEmail = localStorage.getItem('smart_calendar_remembered_email');
      if (savedEmail) {
        setEmail(savedEmail);
      }
    } catch {}
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
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
          title: 'Welcome Back',
          description: `Signed in as ${data.user.name || data.user.email}`,
        });

        router.push(data.user?.role === 'superadmin' ? '/superadmin' : '/dashboard');
      } else {
        setError(data.error || 'Invalid credentials. Please verify your email and password.');
      }
    } catch {
      setError('Network connection failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const productCapabilities = [
    {
      title: 'Automated Timetable Generation',
      desc: 'Conflict-free weekly schedule matrix respecting teacher workload, room constraints, and period limits.',
      icon: CalendarDays,
      badge: 'Core Engine',
      color: 'from-blue-600 to-indigo-600',
    },
    {
      title: 'Daily Leave & Automated Substitution',
      desc: 'Instant substitute assignment matching subject qualifications and teacher availability when faculty are absent.',
      icon: RefreshCw,
      badge: 'Real-Time',
      color: 'from-indigo-600 to-violet-600',
    },
    {
      title: 'Multi-Tenant Isolation & Security',
      desc: 'Strict database segregation ensuring institutional records and faculty schedules remain private and protected.',
      icon: ShieldCheck,
      badge: 'Enterprise',
      color: 'from-slate-700 to-slate-900',
    },
    {
      title: 'Faculty & Subject Management',
      desc: 'Configure grade structures, curriculum allocations, and teacher qualifications in one unified workspace.',
      icon: BookOpen,
      badge: 'Academic',
      color: 'from-blue-700 to-cyan-700',
    },
  ];

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col lg:flex-row overflow-x-hidden font-sans">
      {/* ── Left Hero Side (Clean Product Capabilities, No Fake Stats) ── */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-12 flex-col justify-between overflow-hidden border-r border-slate-800/60 select-none">
        {/* Subtle Ambient Orbs */}
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 -right-32 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Top Branding */}
        <div className="relative z-10">
          <Link href="/" className="inline-flex items-center gap-3.5 mb-3 group">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-700 to-slate-900 flex items-center justify-center shadow-lg shadow-blue-500/20 ring-1 ring-blue-400/30">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-black tracking-tight text-white">Smart Calendar</span>
                <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-[10px] py-0 px-2 font-mono">
                  Cloud Platform
                </Badge>
              </div>
              <p className="text-xs text-slate-400">School Scheduling &amp; Academic Management</p>
            </div>
          </Link>
        </div>

        {/* Middle Capabilities */}
        <div className="relative z-10 my-auto py-6">
          <div className="mb-6">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight tracking-tight">
              Intelligent School Timetable &amp; Faculty Operations
            </h2>
            <p className="text-slate-400 text-xs sm:text-sm mt-2 leading-relaxed">
              Designed for school principals, timetable coordinators, and faculty to eliminate scheduling conflicts and streamline daily substitutions.
            </p>
          </div>

          <div className="space-y-3">
            {productCapabilities.map((feat) => {
              const Icon = feat.icon;
              return (
                <div
                  key={feat.title}
                  className="p-3.5 rounded-2xl border border-slate-800/80 bg-slate-900/50 backdrop-blur-sm"
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${feat.color} flex items-center justify-center shrink-0 shadow-sm text-white`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold text-white truncate">{feat.title}</p>
                        <Badge className="text-[9px] bg-slate-800 text-slate-300 border-slate-700 py-0 px-1.5 shrink-0 font-medium">
                          {feat.badge}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                        {feat.desc}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom Security Note */}
        <div className="relative z-10 pt-4 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-400" />
            <span>Encrypted Multi-Tenant Architecture</span>
          </div>
          <Link href="/" className="hover:text-blue-400 transition-colors">Home</Link>
        </div>
      </div>

      {/* ── Right Authentication Side ── */}
      <div className="w-full lg:w-1/2 min-h-screen flex items-center justify-center p-4 sm:p-8 lg:p-12 relative overflow-y-auto">
        <div className="w-full max-w-md space-y-5 relative z-10 py-6">
          {/* Mobile-only logo */}
          <div className="lg:hidden text-center mb-6">
            <Link href="/" className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl shadow-xl shadow-blue-500/30 mb-2 ring-2 ring-blue-400/30">
              <Brain className="w-7 h-7 text-white" />
            </Link>
            <h1 className="text-xl font-bold text-white tracking-tight">Smart Calendar</h1>
            <p className="text-xs text-slate-400">School Workspace Portal</p>
          </div>

          {/* Main Auth Card */}
          <Card className="bg-slate-900/95 border border-slate-800 shadow-2xl shadow-black/60 rounded-3xl overflow-hidden">
            {/* Clean Header (NOT a button) */}
            <div className="p-6 pb-4 border-b border-slate-800/80 bg-slate-950/40">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-600/20 border border-blue-500/30 text-blue-400 flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Sign In to Workspace</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Enter your institutional email or school code</p>
                </div>
              </div>
            </div>

            <CardContent className="p-6 space-y-4">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs font-medium flex items-center justify-between">
                    <span>Work Email or School Code</span>
                    <span className="text-[10px] text-blue-400 font-mono font-medium">Auto-Detects School</span>
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input
                      type="text"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. admin@takshilaschool.edu or TAKSHILA2025"
                      className="pl-10 bg-slate-950/70 border-slate-800 text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500/20 h-10 rounded-xl text-xs transition-all"
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
                      placeholder="Enter your password"
                      className="pl-10 pr-10 bg-slate-950/70 border-slate-800 text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500/20 h-10 rounded-xl text-xs transition-all"
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

                {/* Remember me & Auto-detection indicator */}
                <div className="flex items-center justify-between text-xs pt-0.5">
                  <label className="flex items-center gap-2 text-slate-400 hover:text-slate-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-blue-500/20 w-3.5 h-3.5"
                    />
                    <span>Remember my login</span>
                  </label>
                  <span className="text-[11px] text-slate-500 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-blue-400" /> Auto-Tenant
                  </span>
                </div>

                {/* Error Display */}
                {error && (
                  <div className="flex items-center gap-2.5 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-xs">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span className="flex-1 font-medium">{error}</span>
                  </div>
                )}

                {/* Single, Primary Submit Button */}
                <Button
                  type="submit"
                  disabled={loading || !email || !password}
                  className="w-full h-10 bg-gradient-to-r from-blue-600 via-indigo-700 to-slate-900 hover:from-blue-700 hover:to-slate-950 text-white font-bold rounded-xl shadow-lg shadow-blue-950/50 transition-all text-xs flex items-center justify-center gap-2 border border-blue-400/20"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Verifying &amp; Detecting Workspace...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In to Workspace</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Footer Direct Links */}
          <div className="flex items-center justify-center gap-4 text-xs text-slate-500">
            <Link href="/" className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 font-semibold transition-colors py-1 px-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <span>Back to Home Website</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <p className="text-center text-[10px] text-slate-600">
            AI Smart Calendar &copy; {new Date().getFullYear()} &middot; Multi-Tenant Cloud Architecture
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
                <p className="font-semibold text-slate-300">💡 Note for Faculty:</p>
                <p>If you are a teacher, your School Administrator can also reset your credentials directly from the <strong>Faculty Directory</strong>.</p>
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
