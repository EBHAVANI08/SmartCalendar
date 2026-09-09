'use client';

import React, { useEffect, useState, useMemo } from 'react';
import {
  LifeBuoy, MessageSquare, Send, Plus, CheckCircle2, Clock,
  AlertCircle, ChevronRight, ShieldCheck, RefreshCw, Filter,
  HelpCircle, User, Sparkles, BookOpen, Layers, ArrowUpRight,
  Flame, CalendarDays, Check
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { getClientAuthHeaders } from '@/lib/client-session';

interface TicketReply {
  id: string;
  authorName?: string;
  authorEmail?: string;
  authorRole?: string;
  body: string;
  createdAt: string;
}

interface SupportTicket {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  createdByName?: string;
  createdByEmail?: string;
  createdByRole?: string;
  createdAt: string;
  updatedAt?: string;
  replies?: TicketReply[];
}

interface TenantMessage {
  id: string;
  subject: string;
  body: string;
  channel?: string;
  direction?: 'inbound' | 'outbound';
  fromName?: string;
  fromRole?: string;
  createdAt: string;
}

const CATEGORY_MAP: Record<string, { label: string; icon: string }> = {
  general: { label: 'General Inquiry', icon: '💬' },
  timetable: { label: 'Timetable Studio & CSP', icon: '📅' },
  biometric: { label: 'Biometric Attendance Sync', icon: '⚡' },
  substitution: { label: 'Substitution & Coverage', icon: '🔄' },
  billing: { label: 'Billing & Plan Upgrade', icon: '💳' },
  access: { label: 'Roles & Staff Access', icon: '🔑' },
  bug: { label: 'Issue / Bug Report', icon: '🐞' },
  feature: { label: 'Feature Request', icon: '💡' },
};

const PRIORITY_STYLES: Record<string, { badge: string; text: string; dot: string }> = {
  urgent: { badge: 'bg-rose-50 text-rose-800 border-rose-200', text: 'Urgent', dot: 'bg-rose-500' },
  high: { badge: 'bg-amber-50 text-amber-800 border-amber-200', text: 'High Priority', dot: 'bg-amber-500' },
  normal: { badge: 'bg-blue-50 text-blue-800 border-blue-200', text: 'Normal', dot: 'bg-blue-500' },
  low: { badge: 'bg-slate-50 text-slate-700 border-slate-200', text: 'Low', dot: 'bg-slate-400' },
};

const STATUS_STYLES: Record<string, { badge: string; text: string }> = {
  open: { badge: 'bg-amber-50 text-amber-800 border-amber-300 font-bold', text: 'Open / Pending Review' },
  in_progress: { badge: 'bg-blue-50 text-blue-800 border-blue-300 font-bold', text: 'In Progress' },
  resolved: { badge: 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold', text: 'Resolved' },
  closed: { badge: 'bg-slate-100 text-slate-600 border-slate-300 font-medium', text: 'Closed' },
};

export default function SupportPage() {
  const { toast } = useToast();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [messages, setMessages] = useState<TenantMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'tickets' | 'messages' | 'faq'>('tickets');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [newTicketOpen, setNewTicketOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [form, setForm] = useState({
    subject: '',
    body: '',
    category: 'timetable',
    priority: 'normal',
  });
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [replySubmitting, setReplySubmitting] = useState<Record<string, boolean>>({});

  // Direct Message form state
  const [msgForm, setMsgForm] = useState({ subject: '', body: '' });
  const [msgSubmitting, setMsgSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const authHeaders = getClientAuthHeaders();
      const [tRes, mRes] = await Promise.all([
        fetch('/api/tickets', { headers: { ...authHeaders }, credentials: 'include' }),
        fetch('/api/messages', { headers: { ...authHeaders }, credentials: 'include' }),
      ]);
      const tData = await tRes.json().catch(() => ({}));
      const mData = await mRes.json().catch(() => ({}));
      setTickets(tData.tickets || []);
      setMessages(mData.messages || []);
    } catch {
      toast({
        title: 'Could not load tickets',
        description: 'Failed to fetch support records. Please check your network connection.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subject.trim() || !form.body.trim()) {
      toast({ title: 'Missing fields', description: 'Please provide both a subject and details.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const authHeaders = getClientAuthHeaders();
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: 'Could not submit ticket', description: data.error || 'Server error', variant: 'destructive' });
        return;
      }
      toast({
        title: 'Support Ticket Submitted',
        description: 'Your request has been logged. Our engineering and academic ops team will reply shortly.',
      });
      setForm({ subject: '', body: '', category: 'timetable', priority: 'normal' });
      setNewTicketOpen(false);
      loadData();
    } catch {
      toast({ title: 'Submission Failed', description: 'Check connection and try again.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendReply = async (ticketId: string) => {
    const text = replyText[ticketId]?.trim();
    if (!text) return;
    setReplySubmitting((prev) => ({ ...prev, [ticketId]: true }));
    try {
      const authHeaders = getClientAuthHeaders();
      const res = await fetch(`/api/tickets/${ticketId}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        credentials: 'include',
        body: JSON.stringify({ body: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: 'Reply Failed', description: data.error || 'Could not send reply', variant: 'destructive' });
        return;
      }
      toast({ title: 'Follow-up Sent', description: 'Your message was added to the ticket thread.' });
      setReplyText((prev) => ({ ...prev, [ticketId]: '' }));
      loadData();
    } catch {
      toast({ title: 'Network Error', description: 'Could not send reply.', variant: 'destructive' });
    } finally {
      setReplySubmitting((prev) => ({ ...prev, [ticketId]: false }));
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgForm.subject.trim() || !msgForm.body.trim()) return;
    setMsgSubmitting(true);
    try {
      const authHeaders = getClientAuthHeaders();
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        credentials: 'include',
        body: JSON.stringify(msgForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: 'Could not send message', description: data.error, variant: 'destructive' });
        return;
      }
      toast({ title: 'Message Dispatched', description: 'Your message was delivered to the platform operations desk.' });
      setMsgForm({ subject: '', body: '' });
      loadData();
    } catch {
      toast({ title: 'Send Error', description: 'Network failed.', variant: 'destructive' });
    } finally {
      setMsgSubmitting(false);
    }
  };

  // KPI Calculations
  const openCount = tickets.filter((t) => !t.status || t.status === 'open' || t.status === 'in_progress').length;
  const resolvedCount = tickets.filter((t) => t.status === 'resolved' || t.status === 'closed').length;
  const filteredTickets = useMemo(() => {
    if (statusFilter === 'all') return tickets;
    if (statusFilter === 'open') return tickets.filter((t) => !t.status || t.status === 'open' || t.status === 'in_progress');
    return tickets.filter((t) => t.status === 'resolved' || t.status === 'closed');
  }, [tickets, statusFilter]);

  const faqs = [
    {
      q: 'How does the automated Constraint Satisfaction (CSP) Timetable Solver work?',
      a: 'The generator allocates teachers to periods while strictly respecting teacher workload quotas, room facilities (e.g. Physics/Chemistry labs), single-period distribution rules, and avoiding any concurrent teacher or room conflicts.',
    },
    {
      q: 'How do I synchronize our Biometric IoT Attendance device?',
      a: 'Navigate to Settings > Biometric Integration. Copy your school API Key and webhook endpoint URL into your ZKTeco / eSSL push setup. Unrecorded morning punches automatically surface substitution suggestions.',
    },
    {
      q: 'How are teacher substitutions resolved?',
      a: 'The system matches teachers qualified in the same subject and grade who have a free period at that time. If no direct subject teacher is available, coordinators can assign available cover staff with manual override auditing.',
    },
    {
      q: 'Can I export high-resolution printable timetables?',
      a: 'Yes! From the Timetable Studio, click "Print (Grade-Section)" or "Print Master Timetable" to generate high-resolution A4 Landscape sheets ready for physical school notice boards and staff rooms.',
    },
  ];

  return (
    <div className="bg-[#F8FAFC] min-h-screen p-4 sm:p-6 lg:p-8 space-y-6 text-[#172033]">
      {/* ── Executive Header ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-700 via-indigo-800 to-slate-900 flex items-center justify-center text-white shadow-md shadow-blue-900/30 shrink-0 border border-blue-500/20">
            <LifeBuoy className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#081A33]">
                Support & Academic Helpdesk Hub
              </h1>
              <Badge className="bg-blue-50 text-[#2563EB] border border-blue-200 font-bold text-[10px] uppercase tracking-wider">
                24/7 SLA Support
              </Badge>
            </div>
            <p className="text-xs text-[#64748B] font-medium mt-1">
              Direct line to the Smart Calendar product engineering, AI solvers, and school operations desk.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={loadData}
            className="gap-2 text-xs border-[#E2E8F0] text-[#0F2747] bg-white hover:bg-slate-50 font-bold h-9 shadow-xs px-3.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={() => setNewTicketOpen(true)}
            className="gap-2 text-xs bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 hover:from-blue-800 hover:to-slate-950 text-white font-bold h-9 shadow-md shadow-blue-900/20 px-4 rounded-xl"
          >
            <Plus className="w-4 h-4" />
            Raise Support Ticket
          </Button>
        </div>
      </div>

      {/* ── Helpdesk KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-[#E2E8F0] bg-white shadow-xs p-5 relative overflow-hidden">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Open Tickets</p>
              <h3 className="text-2xl font-black text-[#081A33] mt-1">{openCount}</h3>
              <p className="text-[11px] text-amber-700 font-semibold mt-1 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Awaiting resolution
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center font-bold">
              <AlertCircle className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card className="border-[#E2E8F0] bg-white shadow-xs p-5 relative overflow-hidden">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Resolved Tickets</p>
              <h3 className="text-2xl font-black text-[#081A33] mt-1">{resolvedCount}</h3>
              <p className="text-[11px] text-emerald-700 font-semibold mt-1 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Successfully closed
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center font-bold">
              <Check className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card className="border-[#E2E8F0] bg-white shadow-xs p-5 relative overflow-hidden">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Direct Inquiries</p>
              <h3 className="text-2xl font-black text-[#081A33] mt-1">{messages.length}</h3>
              <p className="text-[11px] text-indigo-700 font-semibold mt-1 flex items-center gap-1">
                <MessageSquare className="w-3 h-3" /> Operations channel
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center justify-center font-bold">
              <MessageSquare className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card className="border-[#E2E8F0] bg-white shadow-xs p-5 relative overflow-hidden">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Priority SLA</p>
              <h3 className="text-2xl font-black text-[#081A33] mt-1">&lt; 2 Hrs</h3>
              <p className="text-[11px] text-blue-700 font-semibold mt-1 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Direct engineering queue
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center font-bold">
              <Sparkles className="w-5 h-5" />
            </div>
          </div>
        </Card>
      </div>

      {/* ── Segmented Tabs & Filters ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E2E8F0] pb-3">
        <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl w-fit">
          <button
            type="button"
            onClick={() => setActiveTab('tickets')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'tickets'
                ? 'bg-white text-[#081A33] shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LifeBuoy className="w-3.5 h-3.5" />
            Support Tickets
            <Badge variant="outline" className="ml-1 text-[10px] py-0 px-1.5 font-bold">
              {tickets.length}
            </Badge>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('messages')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'messages'
                ? 'bg-white text-[#081A33] shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Direct Messages & Alerts
            <Badge variant="outline" className="ml-1 text-[10px] py-0 px-1.5 font-bold">
              {messages.length}
            </Badge>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('faq')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'faq'
                ? 'bg-white text-[#081A33] shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            Knowledge & FAQs
          </button>
        </div>

        {activeTab === 'tickets' && (
          <div className="flex items-center gap-1.5 self-end sm:self-auto">
            <span className="text-xs font-bold text-slate-400 mr-1 flex items-center gap-1">
              <Filter className="w-3 h-3" /> Filter:
            </span>
            {(['all', 'open', 'resolved'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold capitalize transition-all border ${
                  statusFilter === st
                    ? 'bg-blue-50 text-blue-700 border-blue-300'
                    : 'bg-white text-slate-600 border-[#E2E8F0] hover:bg-slate-50'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── TAB 1: Tickets Feed ── */}
      {activeTab === 'tickets' && (
        <div className="space-y-4">
          {filteredTickets.length === 0 ? (
            <Card className="border-[#E2E8F0] bg-white p-12 text-center shadow-xs">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center mx-auto mb-4">
                <LifeBuoy className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-slate-900">No Support Tickets Found</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                {statusFilter === 'all'
                  ? 'Your school has not logged any support tickets. If you have questions about timetable setup, biometric syncing, or feature customizations, raise a ticket.'
                  : `No tickets matching the "${statusFilter}" filter status.`}
              </p>
              <Button
                type="button"
                onClick={() => setNewTicketOpen(true)}
                className="mt-5 text-xs bg-blue-700 hover:bg-blue-800 text-white font-bold h-9 px-4 rounded-xl"
              >
                <Plus className="w-4 h-4 mr-1.5" /> Raise New Ticket
              </Button>
            </Card>
          ) : (
            filteredTickets.map((t) => {
              const catInfo = CATEGORY_MAP[t.category] || { label: t.category, icon: '📋' };
              const priorityInfo = PRIORITY_STYLES[t.priority] || PRIORITY_STYLES.normal;
              const statusInfo = STATUS_STYLES[t.status] || STATUS_STYLES.open;

              return (
                <Card key={t.id} className="border-[#E2E8F0] bg-white shadow-xs hover:border-slate-300 transition-all overflow-hidden">
                  <div className="p-5 border-b border-[#E2E8F0] bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center justify-center text-base shrink-0 mt-0.5">
                        {catInfo.icon}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-mono font-bold text-slate-400">
                            #{t.id.slice(-6).toUpperCase()}
                          </span>
                          <h3 className="text-sm sm:text-base font-bold text-[#081A33]">
                            {t.subject}
                          </h3>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 mt-1">
                          <span className="font-semibold text-slate-700">{catInfo.label}</span>
                          <span>&middot;</span>
                          <span>Opened by {t.createdByName || t.createdByEmail || 'School Admin'}</span>
                          <span>&middot;</span>
                          <span>{new Date(t.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold border ${priorityInfo.badge}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${priorityInfo.dot}`} />
                        {priorityInfo.text}
                      </span>
                      <span className={`px-2.5 py-1 rounded-md text-[11px] border ${statusInfo.badge}`}>
                        {statusInfo.text}
                      </span>
                    </div>
                  </div>

                  {/* Replies & Conversation Thread */}
                  <CardContent className="p-5 space-y-4">
                    <div className="space-y-3">
                      {(t.replies || []).map((r, rIdx) => {
                        const isSupportStaff = r.authorRole === 'superadmin' || r.authorRole === 'support' || (r.authorEmail && r.authorEmail.includes('smartcalendar.com'));
                        return (
                          <div
                            key={r.id || rIdx}
                            className={`p-4 rounded-xl border text-xs leading-relaxed ${
                              isSupportStaff
                                ? 'bg-blue-50/70 border-blue-200 ml-4 sm:ml-8 text-blue-950'
                                : 'bg-white border-[#E2E8F0] mr-4 sm:mr-8 text-slate-800'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                  isSupportStaff ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'
                                }`}>
                                  {isSupportStaff ? 'SC' : (r.authorName?.[0] || 'U')}
                                </div>
                                <span className="font-bold text-slate-900">
                                  {r.authorName || r.authorEmail || (isSupportStaff ? 'Smart Calendar Support' : 'School Administrator')}
                                </span>
                                {isSupportStaff && (
                                  <Badge className="bg-blue-700 text-white text-[9px] py-0 px-1.5 font-bold">
                                    Official Response
                                  </Badge>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400">
                                {new Date(r.createdAt || t.createdAt).toLocaleDateString('en-IN', {
                                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                                })}
                              </span>
                            </div>
                            <p className="whitespace-pre-wrap pl-8 font-normal">{r.body}</p>
                          </div>
                        );
                      })}
                    </div>

                    {/* In-line Reply Box */}
                    <div className="pt-2 border-t border-[#E2E8F0] flex items-center gap-2.5">
                      <Input
                        placeholder="Add a follow-up response or question to this ticket…"
                        value={replyText[t.id] || ''}
                        onChange={(e) => setReplyText((prev) => ({ ...prev, [t.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendReply(t.id);
                          }
                        }}
                        className="h-10 text-xs bg-slate-50 focus:bg-white border-[#E2E8F0]"
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={replySubmitting[t.id] || !replyText[t.id]?.trim()}
                        onClick={() => handleSendReply(t.id)}
                        className="gap-1.5 text-xs bg-blue-700 hover:bg-blue-800 text-white font-bold h-10 px-4 rounded-xl shrink-0"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Reply
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* ── TAB 2: Direct Inquiries & Broadcasts ── */}
      {activeTab === 'messages' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* New Message Composer */}
          <Card className="border-[#E2E8F0] bg-white shadow-xs p-5 lg:col-span-1 h-fit">
            <h3 className="text-sm font-bold text-[#081A33] mb-1">Direct Message to Operations</h3>
            <p className="text-xs text-slate-500 mb-4">
              Send an urgent advisory or account query directly to the platform team.
            </p>
            <form onSubmit={handleSendMessage} className="space-y-3.5">
              <div>
                <Label className="text-xs font-bold text-slate-700">Subject</Label>
                <Input
                  required
                  placeholder="e.g. Requesting extra faculty seat limit"
                  value={msgForm.subject}
                  onChange={(e) => setMsgForm({ ...msgForm, subject: e.target.value })}
                  className="mt-1 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs font-bold text-slate-700">Message</Label>
                <Textarea
                  required
                  rows={4}
                  placeholder="Write your message here…"
                  value={msgForm.body}
                  onChange={(e) => setMsgForm({ ...msgForm, body: e.target.value })}
                  className="mt-1 text-xs resize-none"
                />
              </div>
              <Button
                type="submit"
                disabled={msgSubmitting || !msgForm.subject.trim() || !msgForm.body.trim()}
                className="w-full text-xs bg-blue-700 hover:bg-blue-800 text-white font-bold h-9 rounded-xl"
              >
                <Send className="w-3.5 h-3.5 mr-1.5" /> Send Direct Message
              </Button>
            </form>
          </Card>

          {/* Message History Feed */}
          <div className="lg:col-span-2 space-y-3">
            {messages.length === 0 ? (
              <Card className="border-[#E2E8F0] bg-white p-10 text-center shadow-xs">
                <MessageSquare className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-slate-800">No Direct Messages</h4>
                <p className="text-xs text-slate-500 mt-1">
                  You haven’t sent or received any direct broadcast alerts yet.
                </p>
              </Card>
            ) : (
              messages.map((m) => (
                <Card key={m.id} className="border-[#E2E8F0] bg-white shadow-xs p-4">
                  <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-100 pb-2 mb-2">
                    <span className="font-bold text-slate-700">
                      {m.direction === 'outbound' ? 'From: Platform Team' : `From: ${m.fromName || 'School Admin'}`}
                    </span>
                    <span>{new Date(m.createdAt).toLocaleString('en-IN')}</span>
                  </div>
                  <h4 className="text-sm font-bold text-[#081A33] mb-1">{m.subject}</h4>
                  <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">{m.body}</p>
                </Card>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── TAB 3: FAQ & Guides ── */}
      {activeTab === 'faq' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {faqs.map((f, idx) => (
            <Card key={idx} className="border-[#E2E8F0] bg-white shadow-xs p-5">
              <h4 className="text-sm font-bold text-[#081A33] flex items-start gap-2 mb-2">
                <span className="w-5 h-5 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center text-xs shrink-0 font-bold">
                  {idx + 1}
                </span>
                {f.q}
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed pl-7">
                {f.a}
              </p>
            </Card>
          ))}
        </div>
      )}

      {/* ── NEW TICKET MODAL ── */}
      <Dialog open={newTicketOpen} onOpenChange={setNewTicketOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 text-lg">
              <LifeBuoy className="w-5 h-5 text-blue-700" />
              Raise Academic Support Ticket
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Submit your query, bug report, or timetable assistance request to our engineering operations team.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateTicket} className="space-y-4 pt-2">
            <div>
              <Label className="text-xs font-bold text-slate-700">Subject Title</Label>
              <Input
                required
                placeholder="e.g. Conflict warning when moving Grade 10 Science period"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                className="mt-1 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold text-slate-700">Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger className="mt-1 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_MAP).map(([k, v]) => (
                      <SelectItem key={k} value={k} className="text-xs">
                        {v.icon} {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-700">Priority Level</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger className="mt-1 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low" className="text-xs">⚪ Low</SelectItem>
                    <SelectItem value="normal" className="text-xs">🔵 Normal</SelectItem>
                    <SelectItem value="high" className="text-xs">🟠 High Priority</SelectItem>
                    <SelectItem value="urgent" className="text-xs">🔴 Urgent / Blocker</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold text-slate-700">Details & Description</Label>
              <Textarea
                required
                rows={4}
                placeholder="Describe your query, the affected class/teacher, or steps to reproduce…"
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                className="mt-1 text-xs resize-none"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setNewTicketOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting || !form.subject.trim() || !form.body.trim()}
                className="bg-blue-700 hover:bg-blue-800 text-white font-bold"
              >
                {submitting ? 'Submitting…' : 'Submit Ticket'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
