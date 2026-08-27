'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

export default function OwnerTicketsPage() {
  const { toast } = useToast();
  const [tickets, setTickets] = useState<any[]>([]);
  const [reply, setReply] = useState<Record<string, string>>({});

  const load = () => fetch('/api/superadmin/tickets').then((r) => r.json()).then((d) => setTickets(d.tickets || []));
  useEffect(() => { load(); }, []);

  const send = async (id: string) => {
    if (!reply[id]) return;
    await fetch(`/api/superadmin/tickets/${id}/replies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: reply[id] }),
    });
    setReply({ ...reply, [id]: '' });
    toast({ title: 'Reply sent' });
    load();
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Support tickets</h1>
        <p className="text-sm text-slate-500 mt-1">Queries raised by school admins, teachers, and staff from inside the app.</p>
      </div>
      {(tickets || []).map((t) => (
        <Card key={t.id} className="py-0">
          <CardContent className="p-5 space-y-2">
            <div className="flex justify-between gap-3">
              <div>
                <p className="font-bold">{t.subject}</p>
                <p className="text-[11px] text-slate-500">{t.school?.name || 'Platform'} · {t.createdByEmail} ({t.createdByRole}) · {t.category}</p>
              </div>
              <Badge variant="outline">{t.status}</Badge>
            </div>
            {t.replies?.map((r: any) => (
              <p key={r.id} className="text-sm bg-slate-50 rounded-lg px-3 py-2">
                <span className="text-[11px] text-slate-500">{r.authorRole} · {new Date(r.createdAt).toLocaleString('en-IN')}</span>
                <span className="block">{r.body}</span>
              </p>
            ))}
            <div className="flex gap-2">
              <Input value={reply[t.id] || ''} onChange={(e) => setReply({ ...reply, [t.id]: e.target.value })} placeholder="Reply…" />
              <Button onClick={() => send(t.id)}>Reply</Button>
            </div>
          </CardContent>
        </Card>
      ))}
      {tickets.length === 0 && <p className="text-sm text-slate-500">No tickets yet.</p>}
    </div>
  );
}
