'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

export default function SupportPage() {
  const { toast } = useToast();
  const [tickets, setTickets] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [tab, setTab] = useState<'tickets' | 'inbox'>('tickets');
  const [form, setForm] = useState({ subject: '', body: '', category: 'general', priority: 'normal' });
  const [reply, setReply] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState({ subject: '', body: '' });

  const load = () => {
    fetch('/api/tickets').then((r) => r.json()).then((d) => setTickets(d.tickets || []));
    fetch('/api/messages').then((r) => r.json()).then((d) => setMessages(d.messages || []));
  };
  useEffect(() => { load(); }, []);

  const raise = async () => {
    const res = await fetch('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const d = await res.json();
    if (!res.ok) {
      toast({ title: 'Could not raise ticket', description: d.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Ticket raised', description: 'The product owner team will reply here.' });
    setForm({ subject: '', body: '', category: 'general', priority: 'normal' });
    load();
  };

  const sendMsg = async () => {
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg),
    });
    const d = await res.json();
    if (!res.ok) {
      toast({ title: 'Send failed', description: d.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Message sent to owner' });
    setMsg({ subject: '', body: '' });
    load();
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Support</h1>
        <p className="text-sm text-slate-500 mt-1">Raise a ticket or message the application owner. Available to every role in this school.</p>
      </div>
      <div className="flex gap-2">
        <button onClick={() => setTab('tickets')} className={`px-3 py-1.5 rounded-lg text-sm font-bold ${tab === 'tickets' ? 'bg-blue-700 text-white' : 'bg-white border'}`}>Tickets</button>
        <button onClick={() => setTab('inbox')} className={`px-3 py-1.5 rounded-lg text-sm font-bold ${tab === 'inbox' ? 'bg-blue-700 text-white' : 'bg-white border'}`}>Messages & alerts</button>
      </div>

      {tab === 'tickets' && (
        <>
          <Card className="py-0">
            <CardContent className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2"><Label>Subject</Label><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
              <div>
                <Label>Category</Label>
                <select className="h-9 w-full rounded-md border px-2 text-sm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  <option value="general">General</option>
                  <option value="billing">Billing</option>
                  <option value="access">Access / seats</option>
                  <option value="bug">Bug</option>
                  <option value="feature">Feature request</option>
                  <option value="demo">Demo help</option>
                </select>
              </div>
              <div>
                <Label>Priority</Label>
                <select className="h-9 w-full rounded-md border px-2 text-sm" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div className="md:col-span-2"><Label>Details</Label><Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></div>
              <Button disabled={!form.subject || !form.body} onClick={raise}>Raise ticket</Button>
            </CardContent>
          </Card>
          {tickets.map((t) => (
            <Card key={t.id} className="py-0">
              <CardContent className="p-5 space-y-2">
                <div className="flex justify-between"><p className="font-bold">{t.subject}</p><Badge variant="outline">{t.status}</Badge></div>
                {t.replies?.map((r: any) => (
                  <p key={r.id} className="text-sm bg-slate-50 rounded-lg px-3 py-2">
                    <span className="text-[11px] text-slate-500">{r.authorRole}</span>
                    <span className="block">{r.body}</span>
                  </p>
                ))}
                <div className="flex gap-2">
                  <Input value={reply[t.id] || ''} onChange={(e) => setReply({ ...reply, [t.id]: e.target.value })} placeholder="Add a follow-up…" />
                  <Button variant="outline" onClick={async () => {
                    await fetch(`/api/tickets/${t.id}/replies`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: reply[t.id] }) });
                    setReply({ ...reply, [t.id]: '' });
                    load();
                  }}>Reply</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </>
      )}

      {tab === 'inbox' && (
        <>
          <Card className="py-0">
            <CardContent className="p-5 space-y-3">
              <h2 className="font-bold">Message the owner</h2>
              <Input placeholder="Subject" value={msg.subject} onChange={(e) => setMsg({ ...msg, subject: e.target.value })} />
              <Textarea placeholder="Message" value={msg.body} onChange={(e) => setMsg({ ...msg, body: e.target.value })} />
              <Button disabled={!msg.subject || !msg.body} onClick={sendMsg}>Send</Button>
            </CardContent>
          </Card>
          {messages.map((m) => (
            <div key={m.id} className={`rounded-lg border px-4 py-3 ${m.direction === 'outbound' ? 'bg-blue-50' : 'bg-white'}`}>
              <div className="flex justify-between text-xs text-slate-500">
                <span>{m.channel} · {m.fromName}</span>
                <span>{new Date(m.createdAt).toLocaleString('en-IN')}</span>
              </div>
              <p className="font-bold text-sm">{m.subject}</p>
              <p className="text-sm whitespace-pre-wrap">{m.body}</p>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
