'use client';

import { useEffect, useState } from 'react';
import { Plus, TicketPercent } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

export default function CouponsPage() {
  const { toast } = useToast();
  const [coupons, setCoupons] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    code: '', description: '', discountType: 'percent', discountValue: '20',
    maxRedemptions: '', minAmount: '0', appliesToPlan: '', expiresAt: '',
  });

  const load = () => {
    fetch('/api/superadmin/coupons').then((r) => r.json()).then((d) => setCoupons(d.coupons || []));
    fetch('/api/superadmin/plans').then((r) => r.json()).then((d) => setPlans(d.plans || []));
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/superadmin/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          discountValue: Number(form.discountValue),
          maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : undefined,
          minAmount: Number(form.minAmount || 0),
          appliesToPlan: form.appliesToPlan || undefined,
          expiresAt: form.expiresAt || undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      toast({ title: 'Coupon created', description: d.coupon.code });
      setOpen(false);
      setForm({ code: '', description: '', discountType: 'percent', discountValue: '20', maxRedemptions: '', minAmount: '0', appliesToPlan: '', expiresAt: '' });
      load();
    } catch (e: any) {
      toast({ title: 'Could not create coupon', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (c: any) => {
    await fetch(`/api/superadmin/coupons/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !c.isActive }),
    });
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Coupons</h1>
          <p className="text-sm text-slate-500 mt-1">Create promo codes for trials, annual discounts, and partner offers.</p>
        </div>
        <Button onClick={() => setOpen(true)} className="bg-violet-700 hover:bg-violet-800">
          <Plus className="w-4 h-4 mr-1" /> New coupon
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {coupons.map((c) => (
          <Card key={c.id} className="py-0">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono font-extrabold text-lg tracking-wide">{c.code}</p>
                  <p className="text-xs text-slate-500">{c.description || 'No description'}</p>
                </div>
                <Badge className={c.isActive ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-100 text-slate-600'}>
                  {c.isActive ? 'Active' : 'Off'}
                </Badge>
              </div>
              <p className="text-sm font-bold text-violet-800">
                {c.discountType === 'percent' ? `${c.discountValue}% off` : `₹${c.discountValue} off`}
              </p>
              <p className="text-[11px] text-slate-500">
                Used {c.usedCount}{c.maxRedemptions != null ? ` / ${c.maxRedemptions}` : ''}
                {c.appliesToPlan ? ` · ${c.appliesToPlan} plan` : ''}
                {c.expiresAt ? ` · expires ${new Date(c.expiresAt).toLocaleDateString('en-IN')}` : ''}
              </p>
              <Button size="sm" variant="outline" onClick={() => toggle(c)}>
                {c.isActive ? 'Deactivate' : 'Activate'}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      {coupons.length === 0 && (
        <Card className="py-0"><CardContent className="p-10 text-center text-slate-500">
          <TicketPercent className="w-8 h-8 mx-auto mb-2 text-slate-300" />No coupons yet. Create WELCOME20 to get started.
        </CardContent></Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create coupon</DialogTitle>
            <DialogDescription>Codes are stored in uppercase. Apply them when recording a payment.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Code</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="WELCOME20" />
            </div>
            <div>
              <Label>Type</Label>
              <select className="h-9 w-full rounded-md border px-2 text-sm" value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value })}>
                <option value="percent">Percent</option>
                <option value="fixed">Fixed INR</option>
              </select>
            </div>
            <div>
              <Label>Value</Label>
              <Input type="number" value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: e.target.value })} />
            </div>
            <div>
              <Label>Max redemptions</Label>
              <Input type="number" value={form.maxRedemptions} onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value })} placeholder="Unlimited" />
            </div>
            <div>
              <Label>Min amount</Label>
              <Input type="number" value={form.minAmount} onChange={(e) => setForm({ ...form, minAmount: e.target.value })} />
            </div>
            <div>
              <Label>Plan lock</Label>
              <select className="h-9 w-full rounded-md border px-2 text-sm" value={form.appliesToPlan} onChange={(e) => setForm({ ...form, appliesToPlan: e.target.value })}>
                <option value="">Any plan</option>
                {plans.map((p) => <option key={p.id} value={p.name}>{p.displayName}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <Label>Expires</Label>
              <Input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={saving || !form.code} onClick={create} className="bg-violet-700 hover:bg-violet-800">Create coupon</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
