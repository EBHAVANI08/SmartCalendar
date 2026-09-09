'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Plus, Search, Building2, Pencil, Trash2, LogIn,
  CheckCircle2, Ban, PowerOff, AlertTriangle, ShieldCheck,
  RefreshCw, MoreVertical, ExternalLink
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const statusStyle: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  suspended: 'bg-amber-50 text-amber-800 border-amber-200',
  cancelled: 'bg-slate-100 text-slate-600 border-slate-200',
  inactive: 'bg-slate-100 text-slate-600 border-slate-200',
};

export default function TenantsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [tenants, setTenants] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // New tenant form
  const [form, setForm] = useState({
    name: '', code: '', email: '', password: 'school123', planName: 'trial',
    contactName: '', phone: '', notes: '', billingCycle: 'monthly',
  });

  // Edit tenant state
  const [editOpen, setEditOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editTenant, setEditTenant] = useState<any>(null);
  const [editForm, setEditForm] = useState({
    name: '', code: '', email: '', contactName: '', phone: '',
    notes: '', status: 'active', planName: 'trial',
  });

  // Delete tenant state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<any>(null);

  const load = () => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    fetch(`/api/superadmin/tenants?${params}`)
      .then((r) => r.json())
      .then((d) => setTenants(d.tenants || []))
      .catch(() => {});
  };

  useEffect(() => {
    load();
    fetch('/api/superadmin/plans')
      .then((r) => r.json())
      .then((d) => setPlans(d.plans || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [q, status]);

  // Create new tenant
  const create = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/superadmin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Create failed');
      toast({ title: 'Tenant created', description: `${form.name} is live on the ${form.planName} plan.` });
      setOpen(false);
      setForm({ name: '', code: '', email: '', password: 'school123', planName: 'trial', contactName: '', phone: '', notes: '', billingCycle: 'monthly' });
      load();
    } catch (e: any) {
      toast({ title: 'Could not create tenant', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (t: any) => {
    setEditTenant(t);
    setEditForm({
      name: t.name || '',
      code: t.code || '',
      email: t.email || '',
      contactName: t.contactName || '',
      phone: t.phone || '',
      notes: t.notes || '',
      status: t.status || 'active',
      planName: t.subscriptions?.[0]?.plan?.name || t.featureFlags?.planName || 'trial',
    });
    setEditOpen(true);
  };

  // Save Edit
  const saveEdit = async () => {
    if (!editTenant) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/superadmin/tenants/${editTenant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Update failed');
      toast({ title: 'Tenant Updated', description: `${editForm.name} changes saved successfully.` });
      setEditOpen(false);
      setEditTenant(null);
      load();
    } catch (e: any) {
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
    } finally {
      setSavingEdit(false);
    }
  };

  // Quick Status Action (active, suspended, inactive/cancelled)
  const updateStatus = async (tenantId: string, action: 'activate' | 'suspend' | 'inactive') => {
    try {
      const res = await fetch(`/api/superadmin/tenants/${tenantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Status change failed');
      const label = action === 'activate' ? 'Activated' : action === 'suspend' ? 'Suspended' : 'Marked Inactive';
      toast({ title: `School ${label}`, description: 'Tenant status updated.' });
      load();
    } catch (e: any) {
      toast({ title: 'Action failed', description: e.message, variant: 'destructive' });
    }
  };

  // Delete Tenant
  const handleDeleteTenant = async (permanent: boolean) => {
    if (!selectedTenant) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/superadmin/tenants/${selectedTenant.id}?permanent=${permanent ? 'true' : 'false'}`, {
        method: 'DELETE',
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Delete failed');
      toast({
        title: permanent ? 'School Deleted Permanently' : 'School Deactivated',
        description: permanent ? 'Tenant workspace and data purged.' : 'School marked as cancelled/inactive.',
      });
      setDeleteOpen(false);
      setSelectedTenant(null);
      load();
    } catch (e: any) {
      toast({ title: 'Action failed', description: e.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  // Impersonate Tenant
  const impersonate = async (t: any) => {
    try {
      const currentToken = sessionStorage.getItem('sc_token');
      const currentUser = sessionStorage.getItem('sc_user');
      let parsedUser = null;
      try {
        parsedUser = currentUser ? JSON.parse(currentUser) : null;
      } catch {}

      const owner = { user: parsedUser, token: currentToken };

      const res = await fetch(`/api/superadmin/tenants/${t.id}/impersonate`, { method: 'POST' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Access denied');

      const ownerSession = {
        user: owner.user || d.superadminUser,
        token: owner.token || d.superadminToken,
      };

      sessionStorage.setItem('sc_owner_session', JSON.stringify(ownerSession));
      localStorage.setItem('sc_owner_session', JSON.stringify(ownerSession));

      sessionStorage.setItem('sc_user', JSON.stringify(d.user));
      if (d.token) sessionStorage.setItem('sc_token', d.token);

      const schoolLabel = t.name || d.user?.name || 'Tenant School';
      sessionStorage.setItem('sc_impersonating', schoolLabel);
      localStorage.setItem('sc_impersonating', schoolLabel);

      localStorage.setItem(
        'smart_calendar_auth_session',
        JSON.stringify({
          isLoggedIn: true,
          user: d.user,
          role: d.user.role || 'admin',
          token: d.token,
        })
      );

      window.location.href = '/dashboard';
    } catch (e: any) {
      toast({ title: 'Impersonation failed', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Tenants & customers</h1>
          <p className="text-sm text-slate-500 mt-1">Manage school workspaces, subscriptions, status, and permissions.</p>
        </div>
        <Button onClick={() => setOpen(true)} className="bg-violet-700 hover:bg-violet-800 shadow-sm">
          <Plus className="w-4 h-4 mr-1" /> New tenant
        </Button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, code, email…" className="pl-9 bg-white" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="cancelled">Inactive / Cancelled</option>
        </select>
      </div>

      {/* Tenants Table */}
      <Card className="py-0 overflow-hidden shadow-sm border-slate-200">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="text-left font-bold px-4 py-3">School</th>
                  <th className="text-left font-bold px-4 py-3">Plan</th>
                  <th className="text-left font-bold px-4 py-3">Usage</th>
                  <th className="text-left font-bold px-4 py-3">Status</th>
                  <th className="text-left font-bold px-4 py-3">Created</th>
                  <th className="text-right font-bold px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tenants.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/superadmin/tenants/${t.id}`} className="font-bold text-slate-900 hover:text-violet-700 flex items-center gap-1.5 group">
                        <span>{t.name}</span>
                        <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400" />
                      </Link>
                      <p className="text-[11px] text-slate-500 font-mono mt-0.5">{t.code} &middot; {t.email}</p>
                    </td>

                    <td className="px-4 py-3">
                      <Badge variant="outline" className="capitalize bg-slate-50 font-medium">
                        {t.subscriptions?.[0]?.plan?.displayName || t.featureFlags?.planName || 'Trial'}
                      </Badge>
                    </td>

                    <td className="px-4 py-3 text-slate-600 font-medium text-xs">
                      {t._count.teachers} teachers &middot; {t._count.schedules} slots
                    </td>

                    <td className="px-4 py-3">
                      <Badge className={`${statusStyle[t.status] || statusStyle.active} text-xs font-semibold px-2 py-0.5`}>
                        {t.status === 'cancelled' ? 'inactive' : (t.status || 'active')}
                      </Badge>
                    </td>

                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {new Date(t.createdAt).toLocaleDateString('en-IN')}
                    </td>

                    {/* Actions Column */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Quick Edit */}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleOpenEdit(t)}
                          title="Edit Tenant Details"
                          className="h-8 w-8 p-0 text-slate-600 hover:text-violet-700 hover:bg-violet-50"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>

                        {/* Quick Impersonate (Login As School) */}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => impersonate(t)}
                          title="Login as School"
                          className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        >
                          <LogIn className="w-4 h-4" />
                        </Button>

                        {/* Status Dropdown Menu */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-slate-600 hover:text-slate-900"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 bg-white shadow-xl border-slate-200">
                            <DropdownMenuLabel className="text-xs text-slate-500">Manage Tenant</DropdownMenuLabel>
                            
                            <DropdownMenuItem onClick={() => handleOpenEdit(t)} className="cursor-pointer gap-2">
                              <Pencil className="w-3.5 h-3.5 text-slate-500" /> Edit School Info
                            </DropdownMenuItem>

                            <DropdownMenuItem onClick={() => impersonate(t)} className="cursor-pointer gap-2 text-blue-600">
                              <LogIn className="w-3.5 h-3.5" /> Login as School
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />
                            <DropdownMenuLabel className="text-[10px] uppercase font-bold text-slate-400">Change Status</DropdownMenuLabel>

                            {t.status !== 'active' && (
                              <DropdownMenuItem onClick={() => updateStatus(t.id, 'activate')} className="cursor-pointer gap-2 text-emerald-600">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Set Active
                              </DropdownMenuItem>
                            )}

                            {t.status !== 'suspended' && (
                              <DropdownMenuItem onClick={() => updateStatus(t.id, 'suspend')} className="cursor-pointer gap-2 text-amber-600">
                                <Ban className="w-3.5 h-3.5" /> Suspend Access
                              </DropdownMenuItem>
                            )}

                            {t.status !== 'cancelled' && (
                              <DropdownMenuItem onClick={() => updateStatus(t.id, 'inactive')} className="cursor-pointer gap-2 text-slate-600">
                                <PowerOff className="w-3.5 h-3.5" /> Mark Inactive
                              </DropdownMenuItem>
                            )}

                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedTenant(t);
                                setDeleteOpen(true);
                              }}
                              className="cursor-pointer gap-2 text-rose-600 focus:text-rose-700 focus:bg-rose-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Delete School
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {tenants.length === 0 && (
              <div className="p-12 text-center text-slate-500">
                <Building2 className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                <p className="font-semibold text-slate-700">No school tenants found</p>
                <p className="text-xs text-slate-400 mt-0.5">Try searching with a different term or clear the status filter.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Provision New Tenant Modal ── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle>Provision a new tenant</DialogTitle>
            <DialogDescription>Creates a school workspace, plan, and login for the customer.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2">
              <Label>School name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. St. Xavier High School" />
            </div>
            <div>
              <Label>School code</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="e.g. STXAVIER" />
            </div>
            <div>
              <Label>Plan</Label>
              <select className="h-9 w-full rounded-md border border-slate-200 px-2 text-sm bg-white" value={form.planName} onChange={(e) => setForm({ ...form, planName: e.target.value })}>
                {plans.map((p) => <option key={p.id} value={p.name}>{p.displayName}</option>)}
              </select>
            </div>
            <div>
              <Label>Admin email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="admin@school.edu" />
            </div>
            <div>
              <Label>Initial password</Label>
              <Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <div>
              <Label>Contact name</Label>
              <Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} placeholder="Principal / Admin" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 9876543210" />
            </div>
            <div className="col-span-2">
              <Label>Internal notes</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Onboarding notes, billing contact, etc." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={saving || !form.name || !form.code || !form.email} onClick={create} className="bg-violet-700 hover:bg-violet-800">
              {saving ? 'Creating…' : 'Create tenant'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Tenant Modal ── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Pencil className="w-5 h-5 text-violet-600" />
              Edit School Tenant
            </DialogTitle>
            <DialogDescription>Update details, subscription plan, and active status for {editTenant?.name}.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2">
              <Label>School name</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div>
              <Label>School code</Label>
              <Input value={editForm.code} onChange={(e) => setEditForm({ ...editForm, code: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <Label>Admin email</Label>
              <Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
            </div>
            <div>
              <Label>Plan</Label>
              <select className="h-9 w-full rounded-md border border-slate-200 px-2 text-sm bg-white" value={editForm.planName} onChange={(e) => setEditForm({ ...editForm, planName: e.target.value })}>
                {plans.map((p) => <option key={p.id} value={p.name}>{p.displayName}</option>)}
              </select>
            </div>
            <div>
              <Label>Status</Label>
              <select className="h-9 w-full rounded-md border border-slate-200 px-2 text-sm bg-white font-medium" value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                <option value="active">Active (Full Access)</option>
                <option value="suspended">Suspended (Paused)</option>
                <option value="cancelled">Inactive / Cancelled</option>
              </select>
            </div>
            <div>
              <Label>Contact name</Label>
              <Input value={editForm.contactName} onChange={(e) => setEditForm({ ...editForm, contactName: e.target.value })} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Internal notes</Label>
              <Input value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button disabled={savingEdit || !editForm.name || !editForm.email} onClick={saveEdit} className="bg-violet-700 hover:bg-violet-800">
              {savingEdit ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete / Deactivate Tenant Confirmation Modal ── */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-md bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="w-5 h-5" />
              Manage School Removal
            </DialogTitle>
            <DialogDescription className="text-slate-600 text-xs">
              Select how you want to remove <strong className="text-slate-900">{selectedTenant?.name}</strong>:
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <p className="font-semibold text-xs text-slate-800 flex items-center gap-1.5">
                <PowerOff className="w-3.5 h-3.5 text-slate-600" /> Option 1: Soft Deactivate (Recommended)
              </p>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Marks the school as inactive/cancelled and pauses all logins, but keeps all timetables and historical data safely stored in the database.
              </p>
              <Button
                variant="outline"
                size="sm"
                disabled={deleting}
                onClick={() => handleDeleteTenant(false)}
                className="w-full mt-2 border-slate-300 text-slate-700 hover:bg-slate-100"
              >
                Deactivate School
              </Button>
            </div>

            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-1">
              <p className="font-semibold text-xs text-rose-800 flex items-center gap-1.5">
                <Trash2 className="w-3.5 h-3.5 text-rose-600" /> Option 2: Permanent Purge (Irreversible)
              </p>
              <p className="text-[11px] text-rose-700 leading-relaxed">
                Permanently deletes the school, its teachers, timetables, and records from the database. This action cannot be undone.
              </p>
              <Button
                variant="destructive"
                size="sm"
                disabled={deleting}
                onClick={() => handleDeleteTenant(true)}
                className="w-full mt-2 bg-rose-600 hover:bg-rose-700 text-white"
              >
                {deleting ? 'Purging…' : 'Purge School Permanently'}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
