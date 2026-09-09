'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ClipboardList, Search, Loader2, CheckCircle2, XCircle, Clock,
  CalendarDays, User, ChevronDown, ChevronUp, AlertCircle, CalendarPlus,
  Trash2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { AffectedPeriods } from '@/components/timetable/affected-periods';
import { ApplyLeaveDialog } from '@/components/leaves/apply-leave';

interface Leave {
  id: string;
  leaveType: string;
  reason: string;
  startDate: string;
  endDate: string;
  status: string;
  appliedAt: string;
  approvedBy: string | null;
  isEmergency: boolean;
  teacher: { id: string; name: string; email: string; subject: string; phone?: string | null } | null;
}

const STATUS_STYLE: Record<string, string> = {
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200',
};

export default function LeaveManagementPage() {
  const { toast } = useToast();
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [stats, setStats] = useState({ totalPending: 0, totalApproved: 0, totalActive: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/leaves?limit=100');
      const data = await res.json();
      if (res.ok && data.success) {
        setLeaves(data.leaves ?? []);
        setStats(data.stats ?? { totalPending: 0, totalApproved: 0, totalActive: 0 });
      }
    } catch {
      toast({ title: 'Could not load leaves', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const decide = async (leave: Leave, status: 'approved' | 'rejected') => {
    setBusy(leave.id);
    try {
      const res = await fetch('/api/leaves', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: leave.id, status, approvedBy: 'Admin' }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast({ title: 'Not updated', description: data.error, variant: 'destructive' });
        return;
      }

      // Approving resolves the affected periods from the timetable automatically.
      const subs = data.substitutions;
      toast({
        title: status === 'approved' ? 'Leave approved' : 'Leave rejected',
        description:
          status === 'approved' && subs && !subs.error
            ? `${subs.affectedPeriods} affected period(s) found; ${subs.created} sent to Substitution.`
            : `${leave.teacher?.name ?? 'Teacher'} — ${status}.`,
      });
      if (status === 'approved') setExpanded(leave.id);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const deleteLeave = async (leave: Leave) => {
    if (!confirm(`Cancel and delete leave application for ${leave.teacher?.name ?? 'teacher'}?`)) return;
    setBusy(leave.id);
    try {
      const res = await fetch(`/api/leaves?id=${encodeURIComponent(leave.id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({ title: 'Leave cancelled', description: 'The leave application has been removed.' });
        await load();
      } else {
        toast({ title: 'Could not delete leave', description: data.error || 'Request rejected', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Request failed', description: 'Network error deleting leave.', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leaves.filter((l) => {
      if (statusFilter !== 'all' && l.status !== statusFilter) return false;
      if (!q) return true;
      return (
        (l.teacher?.name ?? '').toLowerCase().includes(q) ||
        (l.leaveType ?? '').toLowerCase().includes(q) ||
        (l.reason ?? '').toLowerCase().includes(q)
      );
    });
  }, [leaves, search, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-blue-600" /> Leave Management
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Approving a leave resolves the teacher&rsquo;s affected classes from the published timetable and
            sends them to Substitution — nothing is re-entered by hand.
          </p>
        </div>
        <Button size="sm" className="gap-2 shrink-0" onClick={() => setApplyOpen(true)} data-testid="open-apply-leave">
          <CalendarPlus className="w-4 h-4" /> Apply for Leave
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6">
          <p className="text-xs text-slate-500 font-medium flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Pending</p>
          <p className="text-2xl font-bold text-amber-600">{stats.totalPending}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-xs text-slate-500 font-medium flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Approved</p>
          <p className="text-2xl font-bold text-emerald-600">{stats.totalApproved}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-xs text-slate-500 font-medium flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" /> Active today</p>
          <p className="text-2xl font-bold text-blue-600">{stats.totalActive}</p>
        </CardContent></Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Search by teacher, type or reason…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-500 text-sm">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading leave applications…
        </div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-16 text-center">
          <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-700">No leave applications</p>
          <p className="text-xs text-slate-500 mt-1">
            {leaves.length === 0 ? 'None have been submitted yet.' : 'None match the current filter.'}
          </p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((l) => {
            const open = expanded === l.id;
            return (
              <Card key={l.id}>
                <CardContent className="pt-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-900 flex items-center gap-1.5">
                          <User className="w-4 h-4 text-slate-400" />
                          {l.teacher?.name ?? 'Unknown teacher'}
                        </span>
                        <Badge variant="outline" className={STATUS_STYLE[l.status] ?? ''}>{l.status}</Badge>
                        <Badge variant="outline" className="text-[11px] bg-slate-50">{l.leaveType}</Badge>
                        {l.isEmergency && (
                          <Badge variant="outline" className="text-[11px] bg-rose-50 text-rose-700 border-rose-200">
                            <AlertCircle className="w-3 h-3 mr-1" /> emergency
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1.5">
                        {l.startDate}{l.endDate !== l.startDate ? ` → ${l.endDate}` : ''}
                        {l.teacher?.subject ? ` · ${l.teacher.subject}` : ''}
                        {l.approvedBy ? ` · decided by ${l.approvedBy}` : ''}
                      </p>
                      {l.reason && <p className="text-sm text-slate-700 mt-2">{l.reason}</p>}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {l.status === 'pending' && (
                        <>
                          <Button size="sm" variant="outline" disabled={busy === l.id}
                            onClick={() => decide(l, 'rejected')}>
                            <XCircle className="w-4 h-4 mr-1" /> Reject
                          </Button>
                          <Button size="sm" disabled={busy === l.id} onClick={() => decide(l, 'approved')}>
                            {busy === l.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                            Approve
                          </Button>
                        </>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setExpanded(open ? null : l.id)}>
                        {open ? <ChevronUp className="w-4 h-4 mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}
                        Affected classes
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy === l.id}
                        title="Cancel & Delete Application"
                        className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 h-8 px-2"
                        onClick={() => deleteLeave(l)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {open && (
                    <div className="mt-4 pt-4 border-t">
                      <AffectedPeriods leaveId={l.id} status={l.status} />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ApplyLeaveDialog open={applyOpen} onOpenChange={setApplyOpen} onApplied={load} />
    </div>
  );
}
