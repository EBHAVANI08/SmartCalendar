'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

export default function OwnerMessagesPage() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [form, setForm] = useState({ schoolId: '', subject: '', body: '', channel: 'alert' });

  const load = () => {
    fetch('/api/superadmin/messages').then((r) => r.json()).then((d) => setMessages(d.messages || []));
    fetch('/api/superadmin/tenants').then((r) => r.json()).then((d) => setTenants(d.tenants || []));
  };
  useEffect(() => { load(); }, []);

  const send = async () => {
    const res = await fetch('/api/superadmin/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const d = await res.json();
    if (!res.ok) {
      toast({ title: 'Send failed', description: d.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Sent to tenant' });
    setForm({ ...form, subject: '', body: '' });
    load();
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Messages & alerts</h1>
        <p className="text-sm text-slate-500 mt-1">Broadcast billing reminders, downtime alerts, or replies to a school.</p>
      </div>
      <Card className="py-0">
        <CardContent className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Tenant</Label>
            <select className="h-9 w-full rounded-md border px-2 text-sm" value={form.schoolId} onChange={(e) => setForm({ ...form, schoolId: e.target.value })}>
              <option value="">Select school…</option>
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <Label>Type</Label>
            <select className="h-9 w-full rounded-md border px-2 text-sm" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
              <option value="alert">Alert</option>
              <option value="message">Message</option>
              <option value="announcement">Announcement</option>
            </select>
          </div>
          <div className="md:col-span-2"><Label>Subject</Label><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
          <div className="md:col-span-2"><Label>Body</Label><Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></div>
          <Button disabled={!form.schoolId || !form.subject || !form.body} onClick={send} className="bg-violet-700 hover:bg-violet-800">Send</Button>
        </CardContent>
      </Card>
      {(messages || []).map((m) => (
        <div key={m.id} className="rounded-lg border bg-white px-4 py-3">
          <div className="flex justify-between text-xs text-slate-500">
            <span>{m.school?.name} · {m.direction} · {m.fromName}</span>
            <span>{new Date(m.createdAt).toLocaleString('en-IN')}</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline">{m.channel}</Badge>
            <p className="font-bold text-sm">{m.subject}</p>
          </div>
          <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">{m.body}</p>
        </div>
      ))}
    </div>
  );
}
