'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ClipboardList, Plus, Search, RefreshCw, CheckCircle2,
  Clock, XCircle, AlertTriangle, Calendar, User,
  FileText, Filter
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

interface LeaveApplication {
  id: string;
  teacherId: string;
  leaveType: string;
  reason: string;
  startDate: string;
  endDate: string;
  status: string;
  appliedAt: string;
  approvedBy?: string;
  isEmergency: boolean;
  teacher: { id: string; name: string; email: string; subject: string; phone?: string };
}

const LEAVE_TYPES = ['sick', 'casual', 'personal', 'maternity', 'official_duty', 'training', 'family_emergency', 'medical_appointment'];
const leaveTypeLabel: Record<string, string> = {
  sick: 'Sick Leave', casual: 'Casual Leave', personal: 'Personal Leave',
  maternity: 'Maternity Leave', official_duty: 'Official Duty', training: 'Training',
  family_emergency: 'Family Emergency', medical_appointment: 'Medical Appointment',
};
const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending:  { label: 'Pending',  color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Clock },
  approved: { label: 'Approved', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: 'bg-rose-100 text-rose-700 border-rose-200', icon: XCircle },
};

export default function LeavesPage() {
  const { toast } = useToast();
  const [leaves, setLeaves] = useState<LeaveApplication[]>([]);
  const [stats, setStats] = useState({ totalPending: 0, totalApproved: 0, totalActive: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [applyOpen, setApplyOpen] = useState(false);
  const [teachers, setTeachers] = useState<{ id: string; name: string; subject: string }[]>([]);
  const [form, setForm] = useState({ teacherId: '', leaveType: 'sick', startDate: '', endDate: '', reason: '', isEmergency: false });
  const [saving, setSaving] = useState(false);

  const fetchLeaves = useCallback(async () => {
    setLoading(true);
    try {
      const url = statusFilter !== 'all' ? `/api/leaves?status=${statusFilter}` : '/api/leaves';
      const r = await fetch(url);
      if (r.ok) {
        const d = await r.json();
        setLeaves(d.leaves || []);
        if (d.stats) setStats(d.stats);
      }
    } finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { fetchLeaves(); }, [fetchLeaves]);

  useEffect(() => {
    fetch('/api/teachers').then(r => r.ok ? r.json() : null).then(d => {
      if (d) setTeachers(d.teachers || d.data || []);
    });
  }, []);

  const filtered = leaves.filter(l => {
    if (!search) return true;
    const q = search.toLowerCase();
    return l.teacher?.name?.toLowerCase().includes(q) || l.leaveType.toLowerCase().includes(q) || l.teacher?.subject?.toLowerCase().includes(q);
  });

  const handleApply = async () => {
    if (!form.teacherId || !form.startDate || !form.endDate) {
      toast({ title: 'Validation Error', description: 'Teacher, start date, and end date are required.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const r = await fetch('/api/leaves/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherId: form.teacherId, type: form.leaveType, startDate: form.startDate, endDate: form.endDate, reason: form.reason }),
      });
      if (r.ok) {
        toast({ title: 'Leave Applied', description: 'Leave application submitted successfully.' });
        setApplyOpen(false);
        setForm({ teacherId: '', leaveType: 'sick', startDate: '', endDate: '', reason: '', isEmergency: false });
        fetchLeaves();
      } else {
        const d = await r.json();
        toast({ title: 'Error', description: d.error, variant: 'destructive' });
      }
    } finally { setSaving(false); }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      const r = await fetch('/api/leaves', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status, approvedBy: 'Admin' }),
      });
      if (r.ok) {
        toast({ title: status === 'approved' ? 'Leave Approved' : 'Leave Rejected', description: `Leave has been ${status}.` });
        fetchLeaves();
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to update leave status.', variant: 'destructive' });
    }
  };

  const dayCount = (start: string, end: string) => {
    const diff = (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(1, Math.round(diff) + 1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Leave Management</h1>
          <p className="text-sm text-slate-500 mt-0.5">Review, approve, and track teacher leave applications</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={fetchLeaves} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button size="sm" className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setApplyOpen(true)}>
            <Plus className="w-4 h-4" /> Apply Leave
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Active Today', value: stats.totalActive, icon: AlertTriangle, c: 'bg-rose-50 text-rose-600 border-rose-100' },
          { label: 'Pending Review', value: stats.totalPending, icon: Clock, c: 'bg-amber-50 text-amber-600 border-amber-100' },
          { label: 'Total Approved', value: stats.totalApproved, icon: CheckCircle2, c: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
        ].map(s => (
          <Card key={s.label} className={`border ${s.c.split(' ').slice(2).join(' ')}`}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${s.c.split(' ').slice(0, 2).join(' ')} bg-opacity-10 flex items-center justify-center`}>
                <s.icon className={`w-5 h-5 ${s.c.split(' ')[1]}`} />
              </div>
              <div>
                <p className={`text-2xl font-extrabold ${s.c.split(' ')[1]}`}>{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Search by teacher or leave type…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <Filter className="w-4 h-4 mr-2 text-slate-400" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {loading ? (
        <Card className="border-slate-200">
          <CardContent className="py-16 text-center">
            <RefreshCw className="w-8 h-8 mx-auto text-slate-300 animate-spin mb-3" />
            <p className="text-slate-400">Loading leave applications…</p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed border-slate-200">
          <CardContent className="py-16 text-center">
            <ClipboardList className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <p className="text-slate-600 font-medium">No leave applications found</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Teacher</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Leave Type</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Duration</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Reason</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Applied</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="py-3 px-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(leave => {
                  const sc = statusConfig[leave.status] || statusConfig.pending;
                  const StatusIcon = sc.icon;
                  const days = dayCount(leave.startDate, leave.endDate);
                  return (
                    <tr key={leave.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 font-bold text-xs shrink-0">
                            {leave.teacher?.name?.charAt(0)}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800">{leave.teacher?.name}</p>
                            <p className="text-[11px] text-slate-400">{leave.teacher?.subject}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-slate-700 capitalize">{leaveTypeLabel[leave.leaveType] || leave.leaveType}</span>
                        {leave.isEmergency && (
                          <Badge className="ml-2 text-[9px] bg-rose-100 text-rose-700 border-rose-200">Emergency</Badge>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-slate-700 font-medium">{leave.startDate} → {leave.endDate}</p>
                        <p className="text-xs text-slate-400">{days} day{days !== 1 ? 's' : ''}</p>
                      </td>
                      <td className="py-3 px-4 text-slate-600 max-w-[180px]">
                        <p className="truncate text-xs">{leave.reason}</p>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-400">
                        {new Date(leave.appliedAt).toLocaleDateString('en-IN')}
                      </td>
                      <td className="py-3 px-4">
                        <Badge className={`text-[10px] flex items-center gap-1 w-fit ${sc.color}`}>
                          <StatusIcon className="w-3 h-3" /> {sc.label}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        {leave.status === 'pending' && (
                          <div className="flex gap-1.5">
                            <button onClick={() => handleUpdateStatus(leave.id, 'approved')} className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 transition-colors" title="Approve">
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleUpdateStatus(leave.id, 'rejected')} className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 transition-colors" title="Reject">
                              <XCircle className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Apply Leave Dialog */}
      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-emerald-600" />
              Apply Leave Application
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Teacher</Label>
              <Select value={form.teacherId} onValueChange={v => setForm(f => ({ ...f, teacherId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select teacher…" />
                </SelectTrigger>
                <SelectContent>
                  {teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.name} ({t.subject})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Leave Type</Label>
              <Select value={form.leaveType} onValueChange={v => setForm(f => ({ ...f, leaveType: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAVE_TYPES.map(t => <SelectItem key={t} value={t}>{leaveTypeLabel[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start Date</Label>
                <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>End Date</Label>
                <Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Textarea placeholder="Reason for leave…" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyOpen(false)}>Cancel</Button>
            <Button onClick={handleApply} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? 'Submitting…' : 'Submit Application'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
