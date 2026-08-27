'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Building2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';

const statusStyle: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  suspended: 'bg-amber-50 text-amber-800 border-amber-200',
  cancelled: 'bg-slate-100 text-slate-600 border-slate-200',
};

export default function TenantsPage() {
  const { toast } = useToast();
  const [tenants, setTenants] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', code: '', email: '', password: 'school123', planName: 'trial',
    contactName: '', phone: '', notes: '', billingCycle: 'monthly',
  });

  const load = () => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    fetch(`/api/superadmin/tenants?${params}`)
      .then((r) => r.json())
      .then((d) => setTenants(d.tenants || []));
  };

  useEffect(() => {
    load();
    fetch('/api/superadmin/plans').then((r) => r.json()).then((d) => setPlans(d.plans || []));
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [q, status]);

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

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Tenants & customers</h1>
          <p className="text-sm text-slate-500 mt-1">Every school that purchased or is evaluating Smart Calendar.</p>
        </div>
        <Button onClick={() => setOpen(true)} className="bg-violet-700 hover:bg-violet-800">
          <Plus className="w-4 h-4 mr-1" /> New tenant
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, code, email…" className="pl-9 bg-white" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <Card className="py-0 overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="text-left font-bold px-4 py-3">School</th>
                  <th className="text-left font-bold px-4 py-3">Plan</th>
                  <th className="text-left font-bold px-4 py-3">Usage</th>
                  <th className="text-left font-bold px-4 py-3">Status</th>
                  <th className="text-left font-bold px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => (
                  <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/superadmin/tenants/${t.id}`} className="font-bold text-slate-900 hover:text-violet-700">{t.name}</Link>
                      <p className="text-[11px] text-slate-500 font-mono">{t.code} · {t.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="capitalize">{t.subscriptions?.[0]?.plan?.displayName || t.featureFlags?.planName || '—'}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{t._count.teachers} teachers · {t._count.schedules} slots</td>
                    <td className="px-4 py-3">
                      <Badge className={statusStyle[t.status] || statusStyle.active}>{t.status || 'active'}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{new Date(t.createdAt).toLocaleDateString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {tenants.length === 0 && (
              <div className="p-10 text-center text-slate-500">
                <Building2 className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                No tenants match this filter.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Provision a new tenant</DialogTitle>
            <DialogDescription>Creates a school workspace, plan, and login for the customer.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>School name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>School code</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <Label>Plan</Label>
              <select className="h-9 w-full rounded-md border px-2 text-sm" value={form.planName} onChange={(e) => setForm({ ...form, planName: e.target.value })}>
                {plans.map((p) => <option key={p.id} value={p.name}>{p.displayName}</option>)}
              </select>
            </div>
            <div>
              <Label>Admin email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label>Temp password</Label>
              <Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <div>
              <Label>Contact name</Label>
              <Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Internal notes</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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
    </div>
  );
}
