'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Lock,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  GraduationCap,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Building2,
  Mail,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

function SetupPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [verifyingError, setVerifyingError] = useState<string | null>(null);
  const [teacher, setTeacher] = useState<{
    id: string;
    name: string;
    email: string;
    schoolName: string;
    subjects: string[];
  } | null>(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setVerifyingError('No setup token was provided in the link. Please open the link sent to your email.');
      setLoading(false);
      return;
    }

    const verifyToken = async () => {
      try {
        const res = await fetch(`/api/auth/verify-setup-token?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (res.ok && data.valid && data.teacher) {
          setTeacher(data.teacher);
        } else {
          setVerifyingError(data.error || 'This setup link is invalid or has expired. Please contact your school administrator.');
        }
      } catch (err: any) {
        setVerifyingError('Could not verify the invitation link. Please check your internet connection.');
      } finally {
        setLoading(false);
      }
    };

    verifyToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (password.length < 6) {
      setSubmitError('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setSubmitError('Passwords do not match. Please re-enter.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/setup-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        // Save session locally so client state is synced
        if (data.user) {
          try {
            sessionStorage.setItem('sc_user', JSON.stringify(data.user));
            localStorage.setItem('smart_calendar_auth_session', JSON.stringify(data.user));
          } catch {}
        }
        setSuccess(true);
        setTimeout(() => {
          router.push('/timetable');
        }, 2000);
      } else {
        setSubmitError(data.error || 'Failed to set password. Please try again.');
      }
    } catch (err: any) {
      setSubmitError('Network error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const hasLength = password.length >= 6;
  const hasNumberOrSymbol = /[0-9!@#$%^&*(),.?":{}|<>]/.test(password);
  const passwordsMatch = password && password === confirmPassword;

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Background glowing effects */}
      <div className="absolute top-[-10%] left-[-10%] w-[45vw] h-[45vw] rounded-full bg-blue-600/20 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[45vw] h-[45vw] rounded-full bg-indigo-500/20 blur-[140px] pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-md z-10 space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-white text-xs font-bold tracking-wide uppercase shadow-lg">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            Smart Calendar &bull; Faculty Portal
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Account Password Setup
          </h1>
          <p className="text-xs sm:text-sm text-slate-300">
            Set a secure password for your teacher account
          </p>
        </div>

        {/* Loading Card */}
        {loading && (
          <Card className="border-white/15 bg-white/95 backdrop-blur-xl shadow-2xl rounded-3xl p-8 text-center space-y-4">
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto" />
            <p className="text-sm font-semibold text-slate-700">Verifying your invitation link...</p>
          </Card>
        )}

        {/* Error State */}
        {!loading && verifyingError && (
          <Card className="border-rose-200/50 bg-white/95 backdrop-blur-xl shadow-2xl rounded-3xl p-6 sm:p-8 space-y-5 text-center">
            <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto shadow-inner">
              <AlertCircle className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-bold text-slate-900">Setup Link Invalid or Expired</h2>
              <p className="text-xs text-slate-600 leading-relaxed">{verifyingError}</p>
            </div>
            <div className="pt-2">
              <Button
                onClick={() => router.push('/login')}
                className="w-full bg-gradient-to-r from-blue-700 to-indigo-800 text-white font-bold h-11 rounded-xl shadow-md"
              >
                Go to Login Page
              </Button>
            </div>
          </Card>
        )}

        {/* Success State */}
        {!loading && success && (
          <Card className="border-emerald-200/50 bg-white/95 backdrop-blur-xl shadow-2xl rounded-3xl p-6 sm:p-8 space-y-5 text-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner animate-bounce">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-bold text-slate-900">Password Created Successfully!</h2>
              <p className="text-xs text-slate-600">
                Welcome to {teacher?.schoolName || 'your school'} faculty portal. You are being redirected to your timetable...
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 text-xs font-bold text-blue-700 pt-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Redirecting to Timetable...
            </div>
          </Card>
        )}

        {/* Setup Form */}
        {!loading && !verifyingError && !success && teacher && (
          <Card className="border-white/20 bg-white/95 backdrop-blur-xl shadow-2xl rounded-3xl overflow-hidden">
            <CardHeader className="bg-slate-50/70 border-b border-slate-100 pb-4 pt-5 px-6">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-700 to-indigo-900 text-white flex items-center justify-center font-black text-sm shadow-md shrink-0">
                  {teacher.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-slate-900 truncate flex items-center gap-1.5">
                    {teacher.name}
                  </h3>
                  <p className="text-[11px] text-slate-500 truncate flex items-center gap-1">
                    <Mail className="w-3 h-3 text-slate-400" /> {teacher.email}
                  </p>
                  <p className="text-[10px] text-indigo-700 font-semibold truncate flex items-center gap-1 mt-0.5">
                    <Building2 className="w-3 h-3" /> {teacher.schoolName}
                  </p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-6 space-y-5">
              {submitError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* New Password */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                    <span>Create New Password *</span>
                    <span className="text-[10px] font-normal text-slate-500">Min. 6 characters</span>
                  </Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pr-10 h-10 text-xs rounded-xl border-slate-200 focus:border-blue-500"
                      required
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-800">
                    Confirm Password *
                  </Label>
                  <div className="relative">
                    <Input
                      type={showConfirm ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pr-10 h-10 text-xs rounded-xl border-slate-200 focus:border-blue-500"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      tabIndex={-1}
                    >
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Password Criteria Checklist */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1.5 text-[11px]">
                  <div className="flex items-center gap-2">
                    <CheckCircle2
                      className={`w-3.5 h-3.5 ${hasLength ? 'text-emerald-600' : 'text-slate-300'}`}
                    />
                    <span className={hasLength ? 'text-emerald-800 font-semibold' : 'text-slate-500'}>
                      At least 6 characters
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2
                      className={`w-3.5 h-3.5 ${passwordsMatch ? 'text-emerald-600' : 'text-slate-300'}`}
                    />
                    <span className={passwordsMatch ? 'text-emerald-800 font-semibold' : 'text-slate-500'}>
                      Passwords match
                    </span>
                  </div>
                </div>

                {/* Submit Button */}
                <Button
                  type="submit"
                  disabled={submitting || !hasLength || !passwordsMatch}
                  className="w-full h-11 rounded-xl bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 hover:opacity-95 text-white font-bold text-xs shadow-lg shadow-blue-700/25 transition-all flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Setting Password & Signing in...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      Set Password & Access Portal
                      <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <p className="text-center text-[11px] text-slate-400">
          Smart Calendar Faculty Management &bull; Takshila School Systems
        </p>
      </div>
    </div>
  );
}

export default function SetupPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      }
    >
      <SetupPasswordContent />
    </Suspense>
  );
}
