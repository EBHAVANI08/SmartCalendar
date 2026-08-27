'use client';

import { useEffect, useState } from 'react';
import { Activity, Database, Cpu, MemoryStick, RefreshCw, Server } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const tone: Record<string, string> = {
  healthy: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  configured: 'bg-blue-50 text-blue-800 border-blue-200',
  degraded: 'bg-amber-50 text-amber-800 border-amber-200',
  unconfigured: 'bg-slate-100 text-slate-600 border-slate-200',
  unhealthy: 'bg-rose-50 text-rose-800 border-rose-200',
};

export default function HealthPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    fetch('/api/superadmin/health')
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Health check failed');
        setData(j);
        setError('');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (error) return <p className="text-rose-600 text-sm">{error}</p>;
  if (!data) return <p className="text-slate-500 text-sm">Checking platform health…</p>;

  const uptime = `${Math.floor(data.server.uptimeSec / 3600)}h ${Math.floor((data.server.uptimeSec % 3600) / 60)}m`;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">System health</h1>
          <p className="text-sm text-slate-500 mt-1">Live status of the app server, MongoDB, AI providers, and job queues.</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <Card className="py-0">
        <CardContent className="p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-violet-700" />
            <div>
              <p className="font-bold">Overall status</p>
              <p className="text-xs text-slate-500">{new Date(data.timestamp).toLocaleString('en-IN')}</p>
            </div>
          </div>
          <Badge className={tone[data.overall]}>{data.overall}</Badge>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {data.services.map((s: any) => (
          <Card key={s.id} className="py-0">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-bold text-sm">{s.name}</p>
                <Badge className={tone[s.status] || tone.configured}>{s.status}</Badge>
              </div>
              {s.latencyMs != null && <p className="text-xs text-slate-500">{s.latencyMs} ms</p>}
              {s.detail && <p className="text-xs text-slate-500">{s.detail}</p>}
              {s.collections && (
                <p className="text-[11px] text-slate-500">
                  {s.collections.schools} schools · {s.collections.teachers} teachers
                </p>
              )}
              {s.error && <p className="text-xs text-rose-600">{s.error}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="py-0">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2"><Server className="w-4 h-4 text-slate-500" /><h2 className="font-bold">Server</h2></div>
            <dl className="text-sm space-y-1 text-slate-600">
              <div className="flex justify-between"><dt>Node</dt><dd className="font-mono">{data.server.node}</dd></div>
              <div className="flex justify-between"><dt>Env</dt><dd>{data.server.env}</dd></div>
              <div className="flex justify-between"><dt>Uptime</dt><dd>{uptime}</dd></div>
              <div className="flex justify-between"><dt>CPUs</dt><dd>{data.server.cpus}</dd></div>
              <div className="flex justify-between"><dt>Host</dt><dd className="truncate max-w-[140px]">{data.server.hostname}</dd></div>
            </dl>
          </CardContent>
        </Card>
        <Card className="py-0">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2"><MemoryStick className="w-4 h-4 text-slate-500" /><h2 className="font-bold">Memory</h2></div>
            <dl className="text-sm space-y-1 text-slate-600">
              <div className="flex justify-between"><dt>Heap used</dt><dd>{data.memory.heapUsedMb} MB</dd></div>
              <div className="flex justify-between"><dt>RSS</dt><dd>{data.memory.rssMb} MB</dd></div>
              <div className="flex justify-between"><dt>System used</dt><dd>{data.memory.systemUsedPct}%</dd></div>
              <div className="flex justify-between"><dt>Free</dt><dd>{data.memory.systemFreeMb} MB</dd></div>
            </dl>
          </CardContent>
        </Card>
        <Card className="py-0">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2"><Cpu className="w-4 h-4 text-slate-500" /><h2 className="font-bold">Queues</h2></div>
            <dl className="text-sm space-y-1 text-slate-600">
              <div className="flex justify-between"><dt>Notification deliveries</dt><dd>{data.queues.notificationDeliveries}</dd></div>
              <div className="flex justify-between"><dt>Generation jobs</dt><dd>{data.queues.generationJobs}</dd></div>
            </dl>
            <p className="text-[11px] text-slate-400 mt-3 flex items-center gap-1">
              <Database className="w-3 h-3" /> Mongo ping included in Atlas check above
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
