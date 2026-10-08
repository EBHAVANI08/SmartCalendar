'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Loader2, Lock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

const MIN_PASSWORD_LENGTH = 6; // Matches /api/auth/change-password.

/**
 * Shown after signing in with a password someone else chose (temporary,
 * migrated or reset). The session can reach nothing else until this succeeds.
 */
export default function ChangePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (!res.ok || !data.success) {
        setError(data.error || 'Could not change the password. Please try again.');
        return;
      }

      let role = '';
      try {
        const stored = JSON.parse(localStorage.getItem('smart_calendar_auth_session') || 'null');
        if (stored?.user) {
          stored.user.mustChangePassword = false;
          stored.token = data.token;
          role = stored.user.role || '';
          localStorage.setItem('smart_calendar_auth_session', JSON.stringify(stored));
          sessionStorage.setItem('sc_user', JSON.stringify(stored.user));
        }
        if (data.token) sessionStorage.setItem('sc_token', data.token);
      } catch {}
      router.push(role === 'superadmin' ? '/superadmin' : '/dashboard');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mb-2">
            <Lock className="w-5 h-5 text-blue-600" />
          </div>
          <CardTitle>Set a new password</CardTitle>
          <CardDescription>
            Your current password was set for you. Choose your own to continue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-password">New password</Label>
              <Input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </div>
            {error && (
              <div className="flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save and continue'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
