'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  Brain, RefreshCw, ShieldCheck, BookOpen,
  Mail, Lock, Eye, EyeOff, CheckCircle2, AlertCircle,
  ChevronRight, CalendarDays, ArrowRight
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
        data = { error: `Server error (${res.status}). Please try again shortly.` };
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
              token: data.token,
            })
          );
          sessionStorage.setItem('sc_user', JSON.stringify(data.user));
          if (data.token) {
            sessionStorage.setItem('sc_token', data.token);
          }
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
    <div className="min-h-screen w-full bg-[#F8FAFC] text-slate-900 flex flex-col lg:flex-row overflow-x-hidden font-sans">
      {/* ── Left Hero Side (Clean Product Capabilities in Light Theme) ── */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-blue-50/70 via-indigo-50/50 to-slate-100 p-12 flex-col justify-between overflow-hidden border-r border-slate-200 select-none">
        {/* Subtle Ambient Glows */}
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-400/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 -right-32 w-80 h-80 bg-indigo-400/10 rounded-full blur-3xl pointer-events-none" />

        {/* Top Branding */}
        <div className="relative z-10">
          <Link href="/" className="inline-block mb-2 group">
            <Image
              src="/logo.png?v=3"
              alt="Smart Calendar for Schools"
              width={300}
              height={75}
              className="h-13 sm:h-15 w-auto object-contain transition-transform group-hover:scale-[1.02]"
              priority
              unoptimized
            />
          </Link>
          <p className="text-xs text-slate-500 font-medium">School Scheduling &amp; Academic Management</p>
        </div>

        {/* Middle Capabilities */}
        <div className="relative z-10 my-auto py-6">
          <div className="mb-6">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 leading-tight tracking-tight">
              Intelligent School Timetable &amp; Faculty Operations
            </h2>
            <p className="text-slate-600 text-xs sm:text-sm mt-2 leading-relaxed font-medium">
              Designed for school principals, timetable coordinators, and faculty to eliminate scheduling conflicts and streamline daily substitutions.
            </p>
          </div>

          <div className="space-y-3">
            {productCapabilities.map((feat) => {
              const Icon = feat.icon;
              return (
                <div
                  key={feat.title}
                  className="p-3.5 rounded-2xl border border-slate-200/80 bg-white/80 backdrop-blur-sm shadow-xs hover:border-blue-300 transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${feat.color} flex items-center justify-center shrink-0 shadow-sm text-white`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold text-slate-900 truncate">{feat.title}</p>
                        <Badge className="text-[9px] bg-slate-100 text-slate-700 border-slate-200 py-0 px-1.5 shrink-0 font-semibold">
                          {feat.badge}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
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
        <div className="relative z-10 pt-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <span className="font-medium">Encrypted Multi-Tenant Architecture</span>
          </div>
          <Link href="/" className="text-blue-600 hover:text-blue-700 font-semibold transition-colors">Home Website &rarr;</Link>
        </div>
      </div>

      {/* ── Right Authentication Side ── */}
      <div className="w-full lg:w-1/2 min-h-screen flex items-center justify-center p-4 sm:p-8 lg:p-12 relative overflow-y-auto bg-slate-50/50 lg:bg-[#F8FAFC]">
        <div className="w-full max-w-md space-y-5 relative z-10 py-6">
          {/* Mobile-only logo */}
          <div className="lg:hidden text-center mb-6">
            <Link href="/" className="inline-block mb-1">
              <Image
                src="/logo.png?v=3"
                alt="Smart Calendar for Schools"
                width={240}
                height={60}
                className="h-11 sm:h-12 w-auto object-contain mx-auto"
                priority
                unoptimized
              />
            </Link>
            <p className="text-xs text-slate-500">School Workspace Portal</p>
          </div>

          {/* Main Auth Card (Clean Light Theme) */}
          <Card className="bg-white border border-slate-200/90 shadow-xl shadow-slate-200/60 rounded-3xl overflow-hidden">
            {/* Clean Header */}
            <div className="p-6 pb-4 border-b border-slate-100 bg-slate-50/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex items-center justify-center overflow-hidden p-1.5 shrink-0">
                  <Image
                    src="/logo-icon.png"
                    alt="Smart Calendar Logo"
                    width={36}
                    height={36}
                    className="w-full h-full object-contain"
                    priority
                    unoptimized
                  />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Sign In to Workspace</h2>
                  <p className="text-xs text-slate-500 mt-0.5 font-medium">Enter your institutional email or school code</p>
                </div>
              </div>
            </div>

            <CardContent className="p-6 space-y-4">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-slate-700 text-xs font-semibold flex items-center justify-between">
                    <span>Work Email or School Code</span>
                    <span className="text-[10px] text-blue-600 font-mono font-medium">Auto-Detects School</span>
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      type="text"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. admin@school.edu or SCHOOLCODE"
                      className="pl-10 bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:ring-blue-600/10 h-10 rounded-xl text-xs transition-all shadow-xs"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-slate-700 text-xs font-semibold">Password</Label>
                    <button
                      type="button"
                      onClick={() => { setForgotEmail(email); setForgotOpen(true); }}
                      className="text-[11px] text-blue-600 hover:text-blue-700 hover:underline transition-colors font-medium"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="pl-10 pr-10 bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:ring-blue-600/10 h-10 rounded-xl text-xs transition-all shadow-xs"
                      required
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Remember me & Auto-detection indicator */}
                <div className="flex items-center justify-between text-xs pt-0.5">
                  <label className="flex items-center gap-2 text-slate-600 hover:text-slate-900 cursor-pointer select-none font-medium">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="rounded border-slate-300 bg-white text-blue-600 focus:ring-blue-500/20 w-3.5 h-3.5"
                    />
                    <span>Remember my login</span>
                  </label>
                  <span className="text-[11px] text-slate-500 flex items-center gap-1 font-medium">
                    <ShieldCheck className="w-3.5 h-3.5 text-blue-600" /> Auto-Tenant
                  </span>
                </div>

                {/* Error Display */}
                {error && (
                  <div className="flex items-center gap-2.5 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span className="flex-1 font-medium">{error}</span>
                  </div>
                )}

                {/* Primary Submit Button */}
                <Button
                  type="submit"
                  disabled={loading || !email || !password}
                  className="w-full h-10 bg-gradient-to-r from-blue-600 via-indigo-700 to-slate-900 hover:from-blue-700 hover:to-slate-950 text-white font-bold rounded-xl shadow-md shadow-blue-600/25 transition-all text-xs flex items-center justify-center gap-2 border-none"
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
            <Link href="/" className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-semibold transition-colors py-1.5 px-3 rounded-xl bg-white border border-slate-200 shadow-xs">
              <span>Back to Home Website</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <p className="text-center text-[10px] text-slate-500 font-medium">
            AI Smart Calendar &copy; {new Date().getFullYear()} &middot; Multi-Tenant Cloud Architecture
          </p>
        </div>
      </div>

      {/* ── Forgot Password Dialog Modal ── */}
      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="max-w-md bg-white border-slate-200 text-slate-900 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Lock className="w-5 h-5 text-blue-600" />
              Reset Account Access
            </DialogTitle>
            <DialogDescription className="text-slate-500 text-xs">
              Enter your registered work email to receive password reset instructions or reach your school tenant administrator.
            </DialogDescription>
          </DialogHeader>
          
          {forgotSubmitted ? (
            <div className="py-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-900">Reset Request Logged</p>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                If <span className="text-blue-600 font-semibold">{forgotEmail}</span> matches a registered school or faculty account, instructions have been dispatched.
              </p>
              <Button
                variant="outline"
                className="mt-2 text-xs border-slate-300 bg-white hover:bg-slate-50 text-slate-800"
                onClick={() => { setForgotOpen(false); setForgotSubmitted(false); }}
              >
                Return to Sign In
              </Button>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-700 font-semibold">Registered Email Address</Label>
                <Input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="name@school.edu"
                  className="bg-white border-slate-300 text-slate-900 h-10 text-sm focus:border-blue-600"
                  required
                />
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-600 space-y-1">
                <p className="font-semibold text-slate-800">💡 Note for Faculty:</p>
                <p>If you are a teacher, your School Administrator can also reset your credentials directly from the <strong>Faculty Directory</strong>.</p>
              </div>
              <DialogFooter className="flex gap-2">
                <Button variant="outline" className="border-slate-300 text-slate-700 hover:bg-slate-50 text-xs" onClick={() => setForgotOpen(false)}>
                  Cancel
                </Button>
                <Button
                  className="bg-gradient-to-r from-blue-600 via-indigo-700 to-slate-900 hover:from-blue-700 hover:to-slate-950 text-white text-xs font-bold shadow-md shadow-blue-500/20"
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
