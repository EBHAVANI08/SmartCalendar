'use client';

import { useEffect, useState } from 'react';
import { CreditCard, Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

function inr(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
}

export default function PaymentsPage() {
  const { toast } = useToast();
  const [payments, setPayments] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [tab, setTab] = useState<'payments' | 'invoices' | 'plans'>('payments');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    schoolId: '', amount: '', method: 'upi', couponCode: '', reference: '', notes: '',
  });

  const load = () => {
    fetch('/api/superadmin/payments').then((r) => r.json()).then((d) => setPayments(d.payments || []));
    fetch('/api/superadmin/invoices').then((r) => r.json()).then((d) => setInvoices(d.invoices || []));
    fetch('/api/superadmin/plans').then((r) => r.json()).then((d) => setPlans(d.plans || []));
    fetch('/api/superadmin/tenants').then((r) => r.json()).then((d) => setTenants(d.tenants || []));
  };

  useEffect(() => { load(); }, []);

  const record = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/superadmin/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: form.schoolId,
          amount: Number(form.amount),
          method: form.method,
          couponCode: form.couponCode || undefined,
          reference: form.reference || undefined,
          notes: form.notes || undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      toast({ title: 'Payment recorded', description: `${inr(d.payment.amount)} from ${d.payment.school?.name || 'tenant'}` });
      setOpen(false);
      setForm({ schoolId: '', amount: '', method: 'upi', couponCode: '', reference: '', notes: '' });
      load();
    } catch (e: any) {
      toast({ title: 'Could not record payment', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const markPaid = async (id: string) => {
    await fetch('/api/superadmin/invoices', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'paid' }),
    });
    toast({ title: 'Invoice marked paid' });
    load();
  };

  const savePlan = async (plan: any) => {
    await fetch('/api/superadmin/plans', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(plan),
    });
    toast({ title: `${plan.displayName} plan updated` });
    load();
  };

  const revenue = payments.filter((p) => p.status === 'completed').reduce((s, p) => s + (p.amount || 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Payments & billing</h1>
          <p className="text-sm text-slate-500 mt-1">Record customer payments, issue invoices, and manage plan prices.</p>
        </div>
        <Button onClick={() => setOpen(true)} className="bg-violet-700 hover:bg-violet-800">
          <Plus className="w-4 h-4 mr-1" /> Record payment
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="py-0"><CardContent className="p-4"><p className="text-[11px] uppercase font-bold text-slate-500">Collected</p><p className="text-2xl font-extrabold text-emerald-700">{inr(revenue)}</p></CardContent></Card>
        <Card className="py-0"><CardContent className="p-4"><p className="text-[11px] uppercase font-bold text-slate-500">Payments</p><p className="text-2xl font-extrabold">{payments.length}</p></CardContent></Card>
        <Card className="py-0"><CardContent className="p-4"><p className="text-[11px] uppercase font-bold text-slate-500">Open invoices</p><p className="text-2xl font-extrabold">{invoices.filter((i) => i.status !== 'paid' && i.status !== 'void').length}</p></CardContent></Card>
      </div>

      <div className="flex gap-2">
        {(['payments', 'invoices', 'plans'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-lg text-sm font-bold capitalize ${tab === t ? 'bg-violet-700 text-white' : 'bg-white border text-slate-600'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'payments' && (
        <Card className="py-0 overflow-hidden">
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                <tr>
                  <th className="text-left px-4 py-3">Tenant</th>
                  <th className="text-left px-4 py-3">Amount</th>
                  <th className="text-left px-4 py-3">Method</th>
                  <th className="text-left px-4 py-3">Coupon</th>
                  <th className="text-left px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="px-4 py-3 font-medium">{p.school?.name}<span className="block text-[11px] text-slate-400 font-mono">{p.school?.code}</span></td>
                    <td className="px-4 py-3 font-bold text-emerald-700">{inr(p.amount)}</td>
                    <td className="px-4 py-3 capitalize">{p.method}{p.reference ? ` · ${p.reference}` : ''}</td>
                    <td className="px-4 py-3">{p.couponCode || '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{new Date(p.paidAt).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {payments.length === 0 && <p className="p-8 text-center text-slate-500"><CreditCard className="w-6 h-6 mx-auto mb-2 text-slate-300" />No payments yet.</p>}
          </CardContent>
        </Card>
      )}

      {tab === 'invoices' && (
        <Card className="py-0 overflow-hidden">
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                <tr>
                  <th className="text-left px-4 py-3">Number</th>
                  <th className="text-left px-4 py-3">Tenant</th>
                  <th className="text-left px-4 py-3">Total</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-t">
                    <td className="px-4 py-3 font-mono font-bold">{inv.number}</td>
                    <td className="px-4 py-3">{inv.school?.name}</td>
                    <td className="px-4 py-3">{inr(inv.total)}</td>
                    <td className="px-4 py-3"><Badge variant="outline" className="capitalize">{inv.status}</Badge></td>
                    <td className="px-4 py-3">{inv.status !== 'paid' && <Button size="sm" variant="outline" onClick={() => markPaid(inv.id)}>Mark paid</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {tab === 'plans' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {plans.map((p) => (
            <Card key={p.id} className="py-0">
              <CardContent className="p-4 space-y-3">
                <div>
                  <h3 className="font-extrabold">{p.displayName}</h3>
                  <p className="text-xs text-slate-500">{p.description}</p>
                </div>
                <div>
                  <Label>Monthly (INR)</Label>
                  <Input type="number" value={p.priceMonthly} onChange={(e) => setPlans(plans.map((x) => x.id === p.id ? { ...x, priceMonthly: Number(e.target.value) } : x))} />
                </div>
                <div>
                  <Label>Yearly (INR)</Label>
                  <Input type="number" value={p.priceYearly} onChange={(e) => setPlans(plans.map((x) => x.id === p.id ? { ...x, priceYearly: Number(e.target.value) } : x))} />
                </div>
                <p className="text-[11px] text-slate-500">{p.maxTeachers} teachers · {p.maxGrades} grades</p>
                <Button size="sm" onClick={() => savePlan(p)} className="w-full bg-violet-700 hover:bg-violet-800">Save plan</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record a payment</DialogTitle>
            <DialogDescription>Logs a received UPI, bank, card, or gateway payment against a tenant. Optional coupon is applied automatically.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Tenant</Label>
              <select className="h-9 w-full rounded-md border px-2 text-sm" value={form.schoolId} onChange={(e) => setForm({ ...form, schoolId: e.target.value })}>
                <option value="">Select school…</option>
                {tenants.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Amount (INR)</Label>
                <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div>
                <Label>Method</Label>
                <select className="h-9 w-full rounded-md border px-2 text-sm" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                  <option value="upi">UPI</option>
                  <option value="bank">Bank transfer</option>
                  <option value="card">Card</option>
                  <option value="razorpay">Razorpay</option>
                  <option value="stripe">Stripe</option>
                  <option value="manual">Manual / cash</option>
                </select>
              </div>
            </div>
            <div>
              <Label>Coupon code (optional)</Label>
              <Input value={form.couponCode} onChange={(e) => setForm({ ...form, couponCode: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <Label>Reference / UTR</Label>
              <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={saving || !form.schoolId || !form.amount} onClick={record} className="bg-violet-700 hover:bg-violet-800">Save payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
