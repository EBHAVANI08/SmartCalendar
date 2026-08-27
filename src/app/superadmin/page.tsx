'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Building2, CreditCard, TicketPercent, Users, TrendingUp,
  AlertTriangle, ArrowRight, Activity, PauseCircle,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

function inr(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
}

export default function SuperadminOverviewPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/superadmin/overview')
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Failed to load');
        setData(j);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return <p className="text-rose-600 text-sm font-medium">{error}</p>;
  }
  if (!data) {
    return <p className="text-slate-500 text-sm">Loading owner overview…</p>;
  }

  const k = data.kpis;
  const cards = [
    { label: 'Tenants', value: k.tenants, sub: `${k.activeTenants} active`, icon: Building2, href: '/superadmin/tenants', color: 'text-blue-700 bg-blue-50' },
    { label: 'MRR', value: inr(k.mrr), sub: 'Active + trial monthly', icon: TrendingUp, href: '/superadmin/payments', color: 'text-emerald-700 bg-emerald-50' },
    { label: 'Revenue (30d)', value: inr(k.revenue30d), sub: `${k.payments30d} payments`, icon: CreditCard, href: '/superadmin/payments', color: 'text-indigo-700 bg-indigo-50' },
    { label: 'Faculty records', value: k.teachers, sub: `${k.schedules} timetable slots`, icon: Users, href: '/superadmin/tenants', color: 'text-violet-700 bg-violet-50' },
    { label: 'Coupons', value: k.activeCoupons, sub: `${k.coupons} total`, icon: TicketPercent, href: '/superadmin/coupons', color: 'text-amber-700 bg-amber-50' },
    { label: 'Open invoices', value: k.overdueInvoices, sub: `${k.invoices} issued`, icon: AlertTriangle, href: '/superadmin/payments', color: 'text-rose-700 bg-rose-50' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Platform overview</h1>
        <p className="text-sm text-slate-500 mt-1">Customers, revenue, and live usage across every school tenant.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.label} href={c.href}>
              <Card className="hover:shadow-md transition-shadow py-0">
                <CardContent className="p-5 flex items-start justify-between">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{c.label}</p>
                    <p className="text-2xl font-extrabold text-slate-900 mt-1">{c.value}</p>
                    <p className="text-xs text-slate-500 mt-1">{c.sub}</p>
                  </div>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {k.suspendedTenants > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 text-sm font-medium">
          <PauseCircle className="w-4 h-4" />
          {k.suspendedTenants} tenant{k.suspendedTenants === 1 ? '' : 's'} currently suspended.
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="py-0">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-slate-900">Recent tenants</h2>
              <Button asChild variant="ghost" size="sm" className="text-violet-700">
                <Link href="/superadmin/tenants">View all <ArrowRight className="w-3.5 h-3.5 ml-1" /></Link>
              </Button>
            </div>
            <div className="space-y-2">
              {data.recentTenants.map((t: any) => (
                <Link key={t.id} href={`/superadmin/tenants/${t.id}`} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2.5 hover:bg-slate-50">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{t.name}</p>
                    <p className="text-[11px] text-slate-500 font-mono">{t.code} · {t.email}</p>
                  </div>
                  <div className="text-right">
                    <Badge className="bg-blue-50 text-blue-800 border-blue-200">{t.featureFlags?.planName || 'standard'}</Badge>
                    <p className="text-[10px] text-slate-400 mt-1">{t._count.teachers} teachers</p>
                  </div>
                </Link>
              ))}
              {data.recentTenants.length === 0 && <p className="text-sm text-slate-500">No tenants yet. Create the first customer.</p>}
            </div>
          </CardContent>
        </Card>

        <Card className="py-0">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-slate-900">Latest payments</h2>
              <Button asChild variant="ghost" size="sm" className="text-violet-700">
                <Link href="/superadmin/payments">Billing <ArrowRight className="w-3.5 h-3.5 ml-1" /></Link>
              </Button>
            </div>
            <div className="space-y-2">
              {data.recentPayments.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2.5">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{p.school?.name || 'Tenant'}</p>
                    <p className="text-[11px] text-slate-500">{p.method} · {new Date(p.paidAt).toLocaleDateString('en-IN')}</p>
                  </div>
                  <p className="text-sm font-extrabold text-emerald-700">{inr(p.amount)}</p>
                </div>
              ))}
              {data.recentPayments.length === 0 && <p className="text-sm text-slate-500">No payments recorded yet.</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="py-0">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-violet-600" />
            <h2 className="font-bold text-slate-900">Recent owner actions</h2>
          </div>
          <div className="space-y-1.5">
            {data.recentAudit.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between text-sm border-b border-slate-50 py-1.5 last:border-0">
                <span className="font-medium text-slate-800">{a.action}</span>
                <span className="text-[11px] text-slate-500">{a.actorEmail} · {new Date(a.createdAt).toLocaleString('en-IN')}</span>
              </div>
            ))}
            {data.recentAudit.length === 0 && <p className="text-sm text-slate-500">No audit events yet.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
