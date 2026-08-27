'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Ban, CheckCircle2, KeyRound, LogIn, Save, Plus, Send,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { TENANT_MODULES, TENANT_ROLE_MODULES } from '@/lib/access';

function inr(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
}

const FLAG_FIELDS: { key: string; label: string }[] = [
  { key: 'aiTimetableEnabled', label: 'AI timetable' },
  { key: 'manualTimetableEnabled', label: 'Manual timetable' },
  { key: 'bulkImportEnabled', label: 'Bulk import' },
  { key: 'substitutionEnabled', label: 'Substitutions' },
  { key: 'autoSubstitutionEnabled', label: 'Auto substitution' },
  { key: 'workloadAnalyticsEnabled', label: 'Workload analytics' },
  { key: 'teacherNotifyEnabled', label: 'Teacher notifications' },
  { key: 'ptPeriodsEnabled', label: 'PT periods' },
];

const TABS = ['overview', 'members', 'billing', 'messages', 'tickets', 'access'] as const;

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [tab, setTab] = useState<(typeof TABS)[number]>('overview');
  const [data, setData] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', email: '', contactName: '', phone: '', notes: '' });
  const [planName, setPlanName] = useState('standard');
  const [flags, setFlags] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [extraSeats, setExtraSeats] = useState('0');
  const [memberForm, setMemberForm] = useState({
    name: '', email: '', password: 'member123', role: 'staff', modules: TENANT_ROLE_MODULES.staff as string[],
  });
  const [msg, setMsg] = useState({ subject: '', body: '', channel: 'message' });
  const [ticketReply, setTicketReply] = useState<Record<string, string>>({});

  const load = () => {
    fetch(`/api/superadmin/tenants/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        const t = d.tenant;
        if (!t) return;
        setForm({
          name: t.name || '',
          email: t.email || '',
          contactName: t.contactName || '',
          phone: t.phone || '',
          notes: t.notes || '',
        });
        setPlanName(t.featureFlags?.planName || 'standard');
        setFlags(t.featureFlags || {});
        setExtraSeats(String(t.extraSeats ?? d.seats?.extra ?? 0));
      });
  };

  useEffect(() => {
    load();
    fetch('/api/superadmin/plans').then((r) => r.json()).then((d) => setPlans(d.plans || []));
  }, [id]);

  if (!data?.tenant) return <p className="text-slate-500 text-sm">Loading tenant…</p>;
  const t = data.tenant;
  const seats = data.seats || { included: 5, extra: 0, allowed: 5, used: 1, remaining: 4 };

  const patch = async (body: Record<string, unknown>, ok: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/superadmin/tenants/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Update failed');
      toast({ title: ok, description: d.password ? `New password: ${d.password}` : undefined });
      load();
    } catch (e: any) {
      toast({ title: 'Action failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const impersonate = async () => {
    const owner = { user: sessionStorage.getItem('sc_user'), token: sessionStorage.getItem('sc_token') };
    const res = await fetch(`/api/superadmin/tenants/${id}/impersonate`, { method: 'POST' });
    const d = await res.json();
    if (!res.ok) {
      toast({ title: 'Access denied', description: d.error, variant: 'destructive' });
      return;
    }
    sessionStorage.setItem('sc_owner_session', JSON.stringify(owner));
    sessionStorage.setItem('sc_user', JSON.stringify(d.user));
    if (d.token) sessionStorage.setItem('sc_token', d.token);
    sessionStorage.setItem('sc_impersonating', t.name);
    router.push('/dashboard');
  };

  const addMember = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/superadmin/tenants/${id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(memberForm),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      toast({ title: 'User created', description: `${memberForm.email} / ${d.password}` });
      setMemberForm({ name: '', email: '', password: 'member123', role: 'staff', modules: TENANT_ROLE_MODULES.staff });
      load();
    } catch (e: any) {
      toast({ title: 'Could not add user', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const sendMessage = async () => {
    const res = await fetch('/api/superadmin/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schoolId: id, ...msg }),
    });
    const d = await res.json();
    if (!res.ok) {
      toast({ title: 'Send failed', description: d.error, variant: 'destructive' });
      return;
    }
    toast({ title: msg.channel === 'alert' ? 'Alert sent' : 'Message sent' });
    setMsg({ subject: '', body: '', channel: 'message' });
    load();
  };

  const replyTicket = async (ticketId: string) => {
    const body = ticketReply[ticketId];
    if (!body) return;
    await fetch(`/api/superadmin/tickets/${ticketId}/replies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    setTicketReply({ ...ticketReply, [ticketId]: '' });
    load();
  };

  const paid = (t.payments || []).filter((p: any) => p.status === 'completed').reduce((s: number, p: any) => s + (p.amount || 0), 0);

  return (
    <div className="space-y-5">
      <Link href="/superadmin/tenants" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="w-4 h-4 mr-1" /> All tenants
      </Link>

      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">{t.name}</h1>
          <p className="text-sm text-slate-500 font-mono mt-1">{t.code} · {t.email}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={impersonate}><LogIn className="w-4 h-4 mr-1" /> Open workspace</Button>
          {t.status === 'suspended' ? (
            <Button onClick={() => patch({ action: 'activate' }, 'Tenant activated')} className="bg-emerald-700 hover:bg-emerald-800">Activate</Button>
          ) : (
            <Button variant="outline" className="text-amber-700 border-amber-300" onClick={() => patch({ action: 'suspend' }, 'Tenant suspended')}>
              <Ban className="w-4 h-4 mr-1" /> Suspend
            </Button>
          )}
          <Button variant="outline" onClick={() => patch({ action: 'resetPassword' }, 'Password reset')}>
            <KeyRound className="w-4 h-4 mr-1" /> Reset password
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="py-0"><CardContent className="p-4">
          <p className="text-[11px] uppercase font-bold text-slate-500">Login seats</p>
          <p className="text-xl font-extrabold">{seats.used} / {seats.allowed}</p>
          <p className="text-[11px] text-slate-500">{seats.included} included + {seats.extra} extra</p>
        </CardContent></Card>
        <Card className="py-0"><CardContent className="p-4">
          <p className="text-[11px] uppercase font-bold text-slate-500">Collected</p>
          <p className="text-xl font-extrabold text-emerald-700">{inr(paid)}</p>
        </CardContent></Card>
        <Card className="py-0"><CardContent className="p-4">
          <p className="text-[11px] uppercase font-bold text-slate-500">Open tickets</p>
          <p className="text-xl font-extrabold">{(data.tickets || []).filter((x: any) => x.status === 'open' || x.status === 'pending').length}</p>
        </CardContent></Card>
        <Card className="py-0"><CardContent className="p-4">
          <p className="text-[11px] uppercase font-bold text-slate-500">Plan</p>
          <p className="text-xl font-extrabold capitalize">{t.featureFlags?.planName || 'standard'}</p>
        </CardContent></Card>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button key={item} onClick={() => setTab(item)} className={`px-3 py-1.5 rounded-lg text-sm font-bold capitalize ${tab === item ? 'bg-violet-700 text-white' : 'bg-white border text-slate-600'}`}>
            {item}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <Card className="py-0 xl:col-span-2">
            <CardContent className="p-5 space-y-4">
              <h2 className="font-bold">Customer profile</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><Label>School name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div><Label>Admin email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div><Label>Contact</Label><Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} /></div>
                <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              </div>
              <Button disabled={saving} onClick={() => patch(form, 'Tenant profile saved')} className="bg-violet-700 hover:bg-violet-800"><Save className="w-4 h-4 mr-1" /> Save profile</Button>
            </CardContent>
          </Card>
          <Card className="py-0">
            <CardContent className="p-5 space-y-3">
              <h2 className="font-bold">Subscription & seats</h2>
              <Badge className="capitalize">{t.status}</Badge>
              <div>
                <Label>Plan</Label>
                <select className="h-9 w-full rounded-md border px-2 text-sm mt-1" value={planName} onChange={(e) => setPlanName(e.target.value)}>
                  {plans.map((p) => <option key={p.id} value={p.name}>{p.displayName} · {inr(p.priceMonthly)}/mo</option>)}
                </select>
              </div>
              <Button disabled={saving} variant="outline" onClick={() => patch({ action: 'assignPlan', planName }, 'Plan assigned')}>Apply plan</Button>
              <div className="pt-3 border-t space-y-2">
                <p className="text-xs text-slate-500">Basic package includes <b>5 login seats</b> (school admin + 4 users). Grant extras if they need more.</p>
                <Label>Extra seats</Label>
                <div className="flex gap-2">
                  <Input type="number" min={0} value={extraSeats} onChange={(e) => setExtraSeats(e.target.value)} />
                  <Button onClick={() => patch({ action: 'grantSeats', extraSeats: Number(extraSeats) }, 'Seats updated')} className="bg-violet-700 hover:bg-violet-800">Grant</Button>
                </div>
                <p className="text-[11px] text-slate-500">{seats.used} used · {seats.remaining} remaining</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'members' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <Card className="py-0 xl:col-span-2">
            <CardContent className="p-5">
              <h2 className="font-bold mb-3">People with login access</h2>
              <div className="space-y-2 max-h-[420px] overflow-y-auto">
                <div className="rounded-lg border px-3 py-2 bg-slate-50">
                  <p className="font-bold text-sm">{t.name} (school admin)</p>
                  <p className="text-[11px] text-slate-500 font-mono">{t.email} · always counts as 1 seat</p>
                </div>
                {(data.members || []).map((m: any) => (
                  <div key={m.id} className="rounded-lg border px-3 py-2 flex justify-between">
                    <div>
                      <p className="font-bold text-sm">{m.name}</p>
                      <p className="text-[11px] text-slate-500">{m.email} · {m.role}</p>
                    </div>
                    <Badge variant="outline">{m.status}</Badge>
                  </div>
                ))}
                {(data.teachers || []).map((teacher: any) => (
                  <div key={teacher.id} className="rounded-lg border px-3 py-2 flex justify-between">
                    <div>
                      <p className="font-bold text-sm">{teacher.name}</p>
                      <p className="text-[11px] text-slate-500">{teacher.email} · faculty</p>
                    </div>
                    <Badge variant="outline">teacher</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card className="py-0">
            <CardContent className="p-5 space-y-3">
              <h2 className="font-bold">Create user (role-based)</h2>
              <p className="text-xs text-slate-500">Uses one of {seats.remaining} remaining seats.</p>
              <div><Label>Name</Label><Input value={memberForm.name} onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })} /></div>
              <div><Label>Email / login</Label><Input value={memberForm.email} onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })} /></div>
              <div><Label>Password</Label><Input value={memberForm.password} onChange={(e) => setMemberForm({ ...memberForm, password: e.target.value })} /></div>
              <div>
                <Label>Role</Label>
                <select className="h-9 w-full rounded-md border px-2 text-sm" value={memberForm.role} onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value, modules: TENANT_ROLE_MODULES[e.target.value] || TENANT_ROLE_MODULES.staff })}>
                  {Object.keys(TENANT_ROLE_MODULES).map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Modules</Label>
                {TENANT_MODULES.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={memberForm.modules.includes(m.id)} onChange={(e) => {
                      const next = e.target.checked ? [...memberForm.modules, m.id] : memberForm.modules.filter((x) => x !== m.id);
                      setMemberForm({ ...memberForm, modules: next });
                    }} />
                    {m.label}
                  </label>
                ))}
              </div>
              <Button disabled={saving || !memberForm.name || !memberForm.email} onClick={addMember} className="w-full bg-violet-700 hover:bg-violet-800">
                <Plus className="w-4 h-4 mr-1" /> Create login
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'billing' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <Card className="py-0">
            <CardContent className="p-5">
              <h2 className="font-bold mb-3">Payments</h2>
              {(t.payments || []).map((p: any) => (
                <div key={p.id} className="flex justify-between text-sm border-b py-2">
                  <span>{new Date(p.paidAt).toLocaleDateString('en-IN')} · {p.method}{p.couponCode ? ` · ${p.couponCode}` : ''}</span>
                  <span className="font-bold text-emerald-700">{inr(p.amount)}</span>
                </div>
              ))}
              {(!t.payments || t.payments.length === 0) && <p className="text-sm text-slate-500">No payments yet.</p>}
            </CardContent>
          </Card>
          <Card className="py-0">
            <CardContent className="p-5">
              <h2 className="font-bold mb-3">Invoices</h2>
              {(t.invoices || []).map((inv: any) => (
                <div key={inv.id} className="flex justify-between text-sm border-b py-2">
                  <span className="font-mono">{inv.number} · {inv.status}</span>
                  <span className="font-bold">{inr(inv.total)}</span>
                </div>
              ))}
              {(!t.invoices || t.invoices.length === 0) && <p className="text-sm text-slate-500">No invoices yet. Recording a payment creates one.</p>}
              <h3 className="font-bold mt-4 mb-2 text-sm">Coupons used</h3>
              {(t.couponRedemptions || []).map((c: any) => (
                <p key={c.id} className="text-xs text-slate-600">{c.coupon?.code} · {inr(c.discount)} off</p>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'messages' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <Card className="py-0 xl:col-span-2">
            <CardContent className="p-5">
              <h2 className="font-bold mb-3">Conversation</h2>
              <div className="space-y-2 max-h-[420px] overflow-y-auto">
                {(data.messages || []).map((m: any) => (
                  <div key={m.id} className={`rounded-lg border px-3 py-2 ${m.direction === 'outbound' ? 'bg-violet-50 border-violet-100' : 'bg-white'}`}>
                    <div className="flex justify-between text-[11px] text-slate-500">
                      <span>{m.channel} · {m.fromName} · {m.direction}</span>
                      <span>{new Date(m.createdAt).toLocaleString('en-IN')}</span>
                    </div>
                    <p className="font-bold text-sm">{m.subject}</p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{m.body}</p>
                  </div>
                ))}
                {(!data.messages || data.messages.length === 0) && <p className="text-sm text-slate-500">No messages yet.</p>}
              </div>
            </CardContent>
          </Card>
          <Card className="py-0">
            <CardContent className="p-5 space-y-3">
              <h2 className="font-bold">Send message / alert</h2>
              <select className="h-9 w-full rounded-md border px-2 text-sm" value={msg.channel} onChange={(e) => setMsg({ ...msg, channel: e.target.value })}>
                <option value="message">Message</option>
                <option value="alert">Alert</option>
                <option value="announcement">Announcement</option>
              </select>
              <Input placeholder="Subject" value={msg.subject} onChange={(e) => setMsg({ ...msg, subject: e.target.value })} />
              <Textarea rows={5} placeholder="Body" value={msg.body} onChange={(e) => setMsg({ ...msg, body: e.target.value })} />
              <Button disabled={!msg.subject || !msg.body} onClick={sendMessage} className="w-full bg-violet-700 hover:bg-violet-800">
                <Send className="w-4 h-4 mr-1" /> Send
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'tickets' && (
        <Card className="py-0">
          <CardContent className="p-5 space-y-4">
            <h2 className="font-bold">Queries & tickets</h2>
            {(data.tickets || []).map((ticket: any) => (
              <div key={ticket.id} className="rounded-xl border p-3 space-y-2">
                <div className="flex justify-between gap-2">
                  <div>
                    <p className="font-bold">{ticket.subject}</p>
                    <p className="text-[11px] text-slate-500">{ticket.category} · {ticket.createdByEmail} · {ticket.createdByRole}</p>
                  </div>
                  <Badge variant="outline">{ticket.status}</Badge>
                </div>
                {ticket.replies?.map((r: any) => (
                  <p key={r.id} className="text-sm bg-slate-50 rounded-lg px-3 py-2">
                    <span className="text-[11px] text-slate-500">{r.authorRole} · {new Date(r.createdAt).toLocaleString('en-IN')}</span>
                    <span className="block">{r.body}</span>
                  </p>
                ))}
                <div className="flex gap-2">
                  <Input value={ticketReply[ticket.id] || ''} onChange={(e) => setTicketReply({ ...ticketReply, [ticket.id]: e.target.value })} placeholder="Reply as owner…" />
                  <Button onClick={() => replyTicket(ticket.id)}>Reply</Button>
                </div>
              </div>
            ))}
            {(!data.tickets || data.tickets.length === 0) && <p className="text-sm text-slate-500">No tickets from this tenant. They can raise one from Support in their workspace.</p>}
          </CardContent>
        </Card>
      )}

      {tab === 'access' && (
        <Card className="py-0">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold">Product modules for this school</h2>
              <Button disabled={saving} size="sm" onClick={async () => {
                setSaving(true);
                const res = await fetch(`/api/superadmin/feature-flags?schoolId=${id}`, {
                  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(flags),
                });
                const d = await res.json();
                setSaving(false);
                if (!res.ok) toast({ title: 'Save failed', description: d.error, variant: 'destructive' });
                else toast({ title: 'Feature access updated' });
              }} className="bg-violet-700 hover:bg-violet-800">Save access</Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {FLAG_FIELDS.map((f) => (
                <label key={f.key} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                  <span>{f.label}</span>
                  <Switch checked={Boolean(flags[f.key])} onCheckedChange={(v) => setFlags({ ...flags, [f.key]: v })} />
                </label>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
