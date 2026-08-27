'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { User, Shield, Building2, KeyRound, Save, RefreshCw } from 'lucide-react';
import { getClientAuthHeaders, patchStoredUser, readStoredUser } from '@/lib/client-session';

export default function ProfilePage() {
  const { toast } = useToast();
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSession(readStoredUser());
    fetch('/api/profile', { headers: getClientAuthHeaders(), credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        setProfile(d.profile);
        setName(d.profile?.name || '');
        setPhone(d.profile?.phone || '');
      })
      .catch(() => {});
  }, []);

  const saveProfile = async () => {
    setSaving(true);
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
      credentials: 'include',
      body: JSON.stringify({ name, phone }),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast({ title: 'Could not save', description: d.error, variant: 'destructive' });
      return;
    }
    patchStoredUser({ name });
    setSession((prev: any) => ({ ...(prev || {}), name }));
    toast({ title: 'Profile saved' });
  };

  const changePassword = async () => {
    if (newPassword !== confirm) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
      credentials: 'include',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const d = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      toast({ title: 'Password not updated', description: d.error, variant: 'destructive' });
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setConfirm('');
    toast({ title: 'Password updated' });
  };

  const school = profile?.school;
  const role = session?.role || profile?.role || 'admin';

  return (
    <div className="w-full space-y-5">
      <div className="flex items-center gap-4 bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-xs">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white text-xl font-bold flex items-center justify-center shadow-md shrink-0">
          {(name || session?.name || 'U').charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#081A33]">My profile</h1>
            <Badge className="bg-blue-50 text-[#2563EB] border border-blue-200 font-bold text-[10px] uppercase tracking-wider capitalize">
              {role}
            </Badge>
          </div>
          <p className="text-xs text-[#64748B] font-medium mt-1 truncate">
            {session?.email || profile?.email || 'Your login identity, school workspace, and password.'}
          </p>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
            <User className="w-4 h-4 text-blue-600" /> Personal details
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Displayed in the header and used for substitutions, leave, and support tickets.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 pt-2 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Display name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Email</Label>
              <Input value={session?.email || profile?.email || ''} disabled className="h-9 text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" className="h-9 text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Role</Label>
              <Input value={role} disabled className="h-9 text-xs capitalize" />
            </div>
            {profile?.subject ? (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Subject</Label>
                <Input value={profile.subject} disabled className="h-9 text-xs" />
              </div>
            ) : null}
          </div>
          <Button disabled={saving} onClick={saveProfile} className="bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 text-white font-bold h-9 text-xs">
            {saving ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            Save profile
          </Button>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-600" /> School workspace
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Institution this login is attached to. School-wide details are edited in School Settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 pt-2">
          {school ? (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-[11px] text-slate-500 font-semibold uppercase tracking-wide">School</dt>
                <dd className="font-semibold">{school.name}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-slate-500 font-semibold uppercase tracking-wide">Code</dt>
                <dd className="font-mono font-semibold">{school.code}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-slate-500 font-semibold uppercase tracking-wide">Admin login</dt>
                <dd className="truncate">{school.email}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-slate-500 font-semibold uppercase tracking-wide">Status</dt>
                <dd className="capitalize">{school.status || 'active'}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-slate-500">No school workspace attached to this account.</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-blue-600" /> Security
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Demo quick-login accounts cannot change password. School, teacher, and created member logins can.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 pt-2 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Current</Label>
              <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="h-9 text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">New</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="h-9 text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Confirm</Label>
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-9 text-xs" />
            </div>
          </div>
          <Button disabled={saving || !currentPassword || !newPassword} variant="outline" onClick={changePassword} className="h-9 text-xs font-bold">
            <Shield className="w-4 h-4 mr-1" /> Update password
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
