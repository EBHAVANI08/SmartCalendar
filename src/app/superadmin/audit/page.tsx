'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function AuditPage() {
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/superadmin/audit')
      .then((r) => r.json())
      .then((d) => setLogs(d.logs || []));
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Audit log</h1>
        <p className="text-sm text-slate-500 mt-1">Every owner action — tenant changes, payments, coupons, and workspace access.</p>
      </div>
      <Card className="py-0 overflow-hidden">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
              <tr>
                <th className="text-left px-4 py-3">When</th>
                <th className="text-left px-4 py-3">Actor</th>
                <th className="text-left px-4 py-3">Action</th>
                <th className="text-left px-4 py-3">Entity</th>
                <th className="text-left px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(l.createdAt).toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3">{l.actorEmail}</td>
                  <td className="px-4 py-3"><Badge variant="outline">{l.action}</Badge></td>
                  <td className="px-4 py-3 font-mono text-[11px]">{l.entityType}{l.entityId ? ` · ${l.entityId.slice(-6)}` : ''}</td>
                  <td className="px-4 py-3 text-[11px] text-slate-500 max-w-xs truncate">{l.details || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {logs.length === 0 && <p className="p-8 text-center text-slate-500">No owner actions recorded yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
