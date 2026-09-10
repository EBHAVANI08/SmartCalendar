'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  KeyRound,
  Sparkles,
  RefreshCw,
  ShieldCheck,
  Building2,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

export default function ResetPasswordPage() {
  const router = useRouter();

  const [step, setStep] = useState<'request' | 'verify' | 'success'>('request');
  const [email, setEmail] = useState('');
  const [accountInfo, setAccountInfo] = useState<{ name: string; schoolName: string } | null>(null);
  const [otpToken, setOtpToken] = useState<string>('');

  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(0);

  // Countdown timer for Resend OTP
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [countdown]);

  // Read email from URL query if user clicked 'Forgot password' on login page
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const emailParam = params.get('email');
      if (emailParam) {
        setEmail(emailParam);
      }
    }
  }, []);

  // Step 1: Send OTP
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/reset-password/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setOtpToken(data.otpToken || '');
        setAccountInfo({
          name: data.accountName || 'Account',
          schoolName: data.schoolName || 'School',
        });
        if (data.devOtp) {
          setOtp(data.devOtp);
        }
        setStep('verify');
        setCountdown(60);
        setSuccessMessage(
          (data.message || `A 6-digit OTP code has been sent to ${email}.`) +
            (data.devOtp ? ` (Dev Demo Code: ${data.devOtp})` : '')
        );
      } else {
        setError(data.error || 'Could not send verification code. Please check your email.');
      }
    } catch {
      setError('Network connection failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Resend OTP
  const handleResendOtp = async () => {
    if (countdown > 0 || resending) return;
    setResending(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/reset-password/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setOtpToken(data.otpToken || '');
        setCountdown(60);
        setSuccessMessage('A fresh verification OTP has been sent to your email.');
      } else {
        setError(data.error || 'Failed to resend code.');
      }
    } catch {
      setError('Could not resend OTP. Please try again.');
    } finally {
      setResending(false);
    }
  };

  // Step 2: Verify OTP & Reset Password
  const handleVerifyAndReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (otp.length !== 6) {
      setError('Please enter the 6-digit verification code.');
      return;
    }

    if (password.length < 6) {
      setError('New password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please verify and re-enter.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          otp: otp.trim(),
          otpToken,
          password,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setStep('success');
        setTimeout(() => {
          router.push('/login');
        }, 3000);
      } else {
        setError(data.error || 'Invalid or expired OTP. Please check the code.');
      }
    } catch {
      setError('Failed to update password. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const hasLength = password.length >= 6;
  const passwordsMatch = password && password === confirmPassword;

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Ambient background glow effects */}
      <div className="absolute top-[-10%] left-[-10%] w-[45vw] h-[45vw] rounded-full bg-blue-600/20 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[45vw] h-[45vw] rounded-full bg-indigo-500/20 blur-[140px] pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-md z-10 space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-white text-xs font-bold tracking-wide uppercase shadow-lg">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            Smart Calendar &bull; Security Center
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Reset Your Password
          </h1>
          <p className="text-xs sm:text-sm text-slate-300">
            Secure password recovery via email OTP verification
          </p>
        </div>

        {/* Step 1: Request OTP Form */}
        {step === 'request' && (
          <Card className="border-white/20 bg-white/95 backdrop-blur-xl shadow-2xl rounded-3xl overflow-hidden">
            <CardHeader className="bg-slate-50/70 border-b border-slate-100 pb-4 pt-5 px-6">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-700 to-indigo-900 text-white flex items-center justify-center shadow-md shrink-0">
                  <KeyRound className="w-5 h-5 text-blue-200" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Forgot Password?</h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    We will send a 6-digit one-time passcode to your email.
                  </p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-6 space-y-4">
              {error && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSendOtp} className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-800">
                    Registered Email Address *
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. teacher@school.edu or admin@school.edu"
                      className="pl-10 h-10 text-xs rounded-xl border-slate-300 focus:border-blue-600 shadow-xs"
                      required
                      autoFocus
                    />
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Enter the email linked to your school faculty or admin account.
                  </p>
                </div>

                <Button
                  type="submit"
                  disabled={loading || !email}
                  className="w-full h-11 rounded-xl bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 hover:opacity-95 text-white font-bold text-xs shadow-lg shadow-blue-700/25 transition-all flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Verifying &amp; Sending OTP...</span>
                    </>
                  ) : (
                    <>
                      <span>Send 6-Digit OTP</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </Button>
              </form>

              <div className="pt-2 text-center border-t border-slate-100">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-blue-700 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to Sign In
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Verify OTP & Set New Password */}
        {step === 'verify' && (
          <Card className="border-white/20 bg-white/95 backdrop-blur-xl shadow-2xl rounded-3xl overflow-hidden">
            <CardHeader className="bg-slate-50/70 border-b border-slate-100 pb-4 pt-5 px-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-700 to-blue-900 text-white flex items-center justify-center shadow-md shrink-0">
                    <ShieldCheck className="w-5 h-5 text-indigo-200" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-slate-900">Enter OTP &amp; New Password</h2>
                    <p className="text-[11px] text-slate-500 truncate">
                      Sent to <strong>{email}</strong>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setStep('request'); setError(null); }}
                  className="text-[11px] text-blue-600 font-bold hover:underline shrink-0"
                >
                  Change
                </button>
              </div>
            </CardHeader>

            <CardContent className="p-6 space-y-4">
              {successMessage && (
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs font-semibold flex items-center gap-2">
                  <Sparkles className="w-4 h-4 shrink-0 text-blue-600" />
                  <span>{successMessage}</span>
                </div>
              )}

              {error && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleVerifyAndReset} className="space-y-4">
                {/* OTP Code Input */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-slate-800">
                      6-Digit Verification Code (OTP) *
                    </Label>
                    {countdown > 0 ? (
                      <span className="text-[11px] text-slate-500 font-mono">
                        Resend in {countdown}s
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleResendOtp}
                        disabled={resending}
                        className="text-[11px] text-blue-600 font-bold hover:underline inline-flex items-center gap-1"
                      >
                        {resending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        Resend OTP
                      </button>
                    )}
                  </div>
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456"
                    className="h-11 text-center font-mono text-xl font-bold tracking-[6px] rounded-xl border-slate-300 focus:border-blue-600 bg-white"
                    required
                    autoFocus
                  />
                  <p className="text-[10px] text-slate-500 text-center">
                    Check your inbox or spam folder for the passcode.
                  </p>
                </div>

                {/* New Password */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-800">New Password *</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pr-10 h-10 text-xs rounded-xl border-slate-300 focus:border-blue-600"
                      required
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
                  <Label className="text-xs font-bold text-slate-800">Confirm New Password *</Label>
                  <div className="relative">
                    <Input
                      type={showConfirm ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pr-10 h-10 text-xs rounded-xl border-slate-300 focus:border-blue-600"
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

                {/* Checklist */}
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

                {/* Submit */}
                <Button
                  type="submit"
                  disabled={loading || otp.length !== 6 || !hasLength || !passwordsMatch}
                  className="w-full h-11 rounded-xl bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 hover:opacity-95 text-white font-bold text-xs shadow-lg shadow-blue-700/25 transition-all flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Verifying &amp; Updating Password...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Verify OTP &amp; Reset Password</span>
                    </>
                  )}
                </Button>
              </form>

              <div className="pt-2 text-center border-t border-slate-100">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-blue-700 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Return to Sign In
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Success State */}
        {step === 'success' && (
          <Card className="border-emerald-200/50 bg-white/95 backdrop-blur-xl shadow-2xl rounded-3xl p-6 sm:p-8 space-y-5 text-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner animate-bounce">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-bold text-slate-900">Password Reset Successfully!</h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                Your account password has been updated. You can now log in to your workspace using your new password.
              </p>
            </div>
            <div className="pt-2">
              <Button
                onClick={() => router.push('/login')}
                className="w-full bg-gradient-to-r from-blue-700 to-indigo-800 text-white font-bold h-11 rounded-xl shadow-md flex items-center justify-center gap-2"
              >
                <span>Proceed to Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-[11px] text-blue-700 font-bold flex items-center justify-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Auto-redirecting to Sign In...
            </p>
          </Card>
        )}

        {/* Footer */}
        <p className="text-center text-[11px] text-slate-400">
          Smart Calendar Authentication &bull; Takshila School Systems
        </p>
      </div>
    </div>
  );
}
