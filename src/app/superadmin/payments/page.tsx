'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  CreditCard,
  Plus,
  Layers,
  Eye,
  Printer,
  FileText,
  CheckCircle2,
  ShieldCheck,
  Building2,
  Calendar,
  Mail,
  Phone,
  MapPin,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

function inr(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
}

export default function PaymentsPage() {
  const { toast } = useToast();
  const [payments, setPayments] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [tab, setTab] = useState<'payments' | 'invoices'>('payments');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    schoolId: '', amount: '', method: 'upi', couponCode: '', reference: '', notes: '',
  });

  // View Invoice Modal State
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);

  const load = () => {
    fetch('/api/superadmin/payments').then((r) => r.json()).then((d) => setPayments(d.payments || []));
    fetch('/api/superadmin/invoices').then((r) => r.json()).then((d) => setInvoices(d.invoices || []));
    fetch('/api/superadmin/plans').then((r) => r.json()).then((d) => setPlans(d.plans || []));
    fetch('/api/superadmin/tenants').then((r) => r.json()).then((d) => setTenants(d.tenants || []));
  };

  useEffect(() => { load(); }, []);

  const record = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/superadmin/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: form.schoolId,
          amount: Number(form.amount),
          method: form.method,
          couponCode: form.couponCode || undefined,
          reference: form.reference || undefined,
          notes: form.notes || undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      toast({ title: 'Payment recorded', description: `${inr(d.payment.amount)} from ${d.payment.school?.name || 'tenant'}` });
      setOpen(false);
      setForm({ schoolId: '', amount: '', method: 'upi', couponCode: '', reference: '', notes: '' });
      load();
    } catch (e: any) {
      toast({ title: 'Could not record payment', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const markPaid = async (id: string) => {
    await fetch('/api/superadmin/invoices', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'paid' }),
    });
    toast({ title: 'Invoice marked paid' });
    if (selectedInvoice && selectedInvoice.id === id) {
      setSelectedInvoice({ ...selectedInvoice, status: 'paid', paidAt: new Date().toISOString() });
    }
    load();
  };

  const handleViewInvoice = (inv: any) => {
    setSelectedInvoice(inv);
    setInvoiceModalOpen(true);
  };

  const handlePrint = () => {
    if (!selectedInvoice) return;
    const logoUrl = window.location.origin + '/logo.png?v=3';
    const printWindow = window.open('', '_blank', 'width=850,height=900');
    if (!printWindow) return;

    const isPaid = selectedInvoice.status === 'paid';
    const subtotal = selectedInvoice.amount || 0;
    const discount = selectedInvoice.discount || 0;
    const taxable = Math.max(0, subtotal - discount);
    const tax = selectedInvoice.tax > 0 ? selectedInvoice.tax : Math.round(taxable * 0.18 * 100) / 100;
    const cgst = Math.round((tax / 2) * 100) / 100;
    const sgst = Math.round((tax / 2) * 100) / 100;
    const grandTotal = selectedInvoice.total && selectedInvoice.total !== subtotal ? selectedInvoice.total : taxable + tax;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <title>Tax Invoice - ${selectedInvoice.number}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
              font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              color: #0f172a;
              background: #fff;
              padding: 40px;
              line-height: 1.5;
            }
            .accent-bar {
              height: 6px;
              width: 100%;
              background: linear-gradient(90deg, #7c3aed 0%, #6366f1 50%, #8b5cf6 100%);
              border-radius: 4px;
              margin-bottom: 28px;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              border-bottom: 1px solid #e2e8f0;
              padding-bottom: 24px;
              margin-bottom: 28px;
            }
            .logo-wrap {
              display: flex;
              align-items: center;
              gap: 12px;
            }
            .logo-img {
              height: 44px;
              width: auto;
              object-contain: contain;
            }
            .logo-tagline {
              font-size: 11px;
              color: #64748b;
              font-weight: 500;
              margin-top: 4px;
            }
            .inv-meta {
              text-align: right;
            }
            .inv-title {
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 0.12em;
              font-weight: 800;
              color: #7c3aed;
            }
            .inv-number {
              font-size: 22px;
              font-weight: 800;
              font-family: monospace;
              color: #0f172a;
              margin: 4px 0 6px 0;
            }
            .badge {
              display: inline-flex;
              align-items: center;
              padding: 4px 12px;
              border-radius: 9999px;
              font-size: 11px;
              font-weight: 800;
              letter-spacing: 0.05em;
              text-transform: uppercase;
              background: ${isPaid ? '#ecfdf5' : '#fffbeb'};
              color: ${isPaid ? '#047857' : '#b45309'};
              border: 1px solid ${isPaid ? '#a7f3d0' : '#fde68a'};
            }
            .cards-grid {
              display: grid;
              grid-template-columns: 1.2fr 0.8fr;
              gap: 20px;
              margin-bottom: 30px;
            }
            .info-card {
              background: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 12px;
              padding: 18px;
            }
            .info-label {
              font-size: 10px;
              text-transform: uppercase;
              font-weight: 800;
              letter-spacing: 0.08em;
              color: #64748b;
              margin-bottom: 8px;
            }
            .school-name {
              font-size: 16px;
              font-weight: 800;
              color: #0f172a;
            }
            .code-pill {
              display: inline-block;
              font-family: monospace;
              font-weight: 700;
              font-size: 11px;
              background: #ede9fe;
              color: #6d28d9;
              padding: 2px 8px;
              border-radius: 6px;
              margin-top: 4px;
            }
            .meta-line {
              font-size: 12px;
              color: #475569;
              margin-top: 4px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              border-radius: 10px;
              overflow: hidden;
              border: 1px solid #e2e8f0;
              margin-bottom: 24px;
            }
            thead th {
              background: #0f172a;
              color: #ffffff;
              font-size: 11px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.06em;
              padding: 12px 16px;
              text-align: left;
            }
            tbody td {
              padding: 14px 16px;
              border-bottom: 1px solid #f1f5f9;
              font-size: 13px;
            }
            .item-title {
              font-weight: 700;
              color: #0f172a;
              font-size: 14px;
            }
            .item-features {
              font-size: 11px;
              color: #64748b;
              margin-top: 4px;
            }
            .totals-wrap {
              display: flex;
              justify-content: flex-end;
              margin-bottom: 30px;
            }
            .totals-box {
              width: 320px;
              background: #faf5ff;
              border: 1px solid #e9d5ff;
              border-radius: 12px;
              padding: 18px;
            }
            .total-row {
              display: flex;
              justify-content: space-between;
              font-size: 13px;
              color: #475569;
              margin-bottom: 8px;
            }
            .grand-total {
              display: flex;
              justify-content: space-between;
              border-top: 2px solid #7c3aed;
              padding-top: 10px;
              margin-top: 6px;
              font-size: 18px;
              font-weight: 800;
              color: #0f172a;
            }
            .payment-card {
              background: #ecfdf5;
              border: 1px solid #a7f3d0;
              border-radius: 10px;
              padding: 14px 18px;
              font-size: 12px;
              color: #065f46;
              margin-bottom: 30px;
            }
            .footer-seal {
              border-top: 1px dashed #cbd5e1;
              padding-top: 20px;
              display: flex;
              justify-content: space-between;
              align-items: center;
              font-size: 11px;
              color: #94a3b8;
            }
            @media print {
              body { padding: 20px; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="accent-bar"></div>

          <div class="header">
            <div class="logo-wrap">
              <img src="${logoUrl}" alt="Smart Calendar" class="logo-img" onerror="this.style.display='none'" />
              <div>
                <div style="font-size: 18px; font-weight: 800; color: #7c3aed;">Smart Calendar</div>
                <div class="logo-tagline">AI Timetable & Educational Cloud Suite</div>
              </div>
            </div>

            <div class="inv-meta">
              <div class="inv-title">Official Tax Invoice</div>
              <div class="inv-number">${selectedInvoice.number}</div>
              <span class="badge">
                ${isPaid ? '✓ PAID & VERIFIED' : selectedInvoice.status}
              </span>
            </div>
          </div>

          <div class="cards-grid">
            <div class="info-card">
              <div class="info-label">Billed To (Tenant School)</div>
              <div class="school-name">${selectedInvoice.school?.name || 'School Tenant'}</div>
              <div class="code-pill">CODE: ${selectedInvoice.school?.code || '—'}</div>
              ${selectedInvoice.school?.email ? `<div class="meta-line">📧 ${selectedInvoice.school?.email}</div>` : ''}
              ${selectedInvoice.school?.phone ? `<div class="meta-line">📞 ${selectedInvoice.school?.phone}</div>` : ''}
              ${selectedInvoice.school?.address ? `<div class="meta-line">📍 ${selectedInvoice.school?.address}</div>` : ''}
            </div>

            <div class="info-card">
              <div class="info-label">Invoice & Platform Details</div>
              <div class="meta-line"><strong>Issued Date:</strong> ${new Date(selectedInvoice.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
              ${selectedInvoice.dueDate ? `<div class="meta-line"><strong>Due Date:</strong> ${new Date(selectedInvoice.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>` : ''}
              <div class="meta-line"><strong>Issued By:</strong> Kam Global for AI & Digital Media Solutions Pvt. Ltd</div>
              <div class="meta-line"><strong>Support / Billing:</strong> support@kiccpa.com</div>
              <div class="meta-line"><strong>Currency:</strong> INR (₹)</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 55%;">Service Item & Description</th>
                <th style="width: 15%; text-align: center;">Qty</th>
                <th style="width: 15%; text-align: right;">Unit Price</th>
                <th style="width: 15%; text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <div class="item-title">School SaaS Cloud Subscription</div>
                  <div class="item-features">
                    • AI Timetable Solver & Conflict Prevention<br/>
                    • Real-Time Teacher Substitution Engine<br/>
                    • Multi-Grade & Teacher Workload Optimization
                  </div>
                </td>
                <td style="text-align: center; font-weight: 600;">1 Tier</td>
                <td style="text-align: right; font-weight: 600;">₹${subtotal.toLocaleString('en-IN')}</td>
                <td style="text-align: right; font-weight: 700; color: #0f172a;">₹${subtotal.toLocaleString('en-IN')}</td>
              </tr>
            </tbody>
          </table>

          <div class="totals-wrap">
            <div class="totals-box">
              <div class="total-row">
                <span>Subtotal (Base Value):</span>
                <span style="font-weight: 600;">₹${subtotal.toLocaleString('en-IN')}</span>
              </div>
              ${discount > 0 ? `
              <div class="total-row" style="color: #059669; font-weight: 600;">
                <span>Discount Applied ${selectedInvoice.couponCode ? `(${selectedInvoice.couponCode})` : ''}:</span>
                <span>- ₹${discount.toLocaleString('en-IN')}</span>
              </div>` : ''}
              <div class="total-row" style="border-top: 1px dashed #e9d5ff; padding-top: 6px;">
                <span>Taxable Amount:</span>
                <span style="font-weight: 600;">₹${taxable.toLocaleString('en-IN')}</span>
              </div>
              <div class="total-row" style="color: #6b21a8;">
                <span>CGST (9%):</span>
                <span style="font-weight: 600;">+ ₹${cgst.toLocaleString('en-IN')}</span>
              </div>
              <div class="total-row" style="color: #6b21a8;">
                <span>SGST (9%):</span>
                <span style="font-weight: 600;">+ ₹${sgst.toLocaleString('en-IN')}</span>
              </div>
              <div class="total-row" style="font-weight: 700; color: #581c87; border-top: 1px solid #e9d5ff; padding-top: 4px;">
                <span>Total 18% GST:</span>
                <span>+ ₹${tax.toLocaleString('en-IN')}</span>
              </div>
              <div class="grand-total">
                <span>Grand Total (Incl. 18% GST):</span>
                <span style="color: #7c3aed;">₹${grandTotal.toLocaleString('en-IN')}</span>
              </div>
              <div style="font-size: 10px; color: #94a3b8; text-align: right; margin-top: 6px;">
                SAC Code: 998313 • 18% GST
              </div>
            </div>
          </div>

          ${isPaid && selectedInvoice.payments && selectedInvoice.payments.length > 0 ? `
          <div class="payment-card">
            <strong>✓ Payment Confirmation:</strong>
            ${selectedInvoice.payments.map((p: any) => `
              <div>
                ₹${(p.amount || 0).toLocaleString('en-IN')} paid via <b>${(p.method || '').toUpperCase()}</b>
                ${p.reference ? `(UTR/Ref: <code>${p.reference}</code>)` : ''}
                on ${new Date(p.paidAt).toLocaleDateString('en-IN')}.
              </div>
            `).join('')}
          </div>` : ''}

          <div class="footer-seal">
            <div>
              <strong>Kam Global for AI & Digital Media Solutions Pvt. Ltd</strong> • Computer-Generated Verified Digital Invoice
            </div>
            <div>
              Verification ID: <code>${selectedInvoice.id}</code>
            </div>
          </div>

          <script>
            window.onload = function() {
              setTimeout(function() { window.print(); }, 200);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const revenue = payments.filter((p) => p.status === 'completed').reduce((s, p) => s + (p.amount || 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Payments & billing</h1>
          <p className="text-sm text-slate-500 mt-1">Record customer payments, issue invoices, and manage plan prices.</p>
        </div>
        <Button onClick={() => setOpen(true)} className="bg-violet-700 hover:bg-violet-800">
          <Plus className="w-4 h-4 mr-1" /> Record payment
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="py-0"><CardContent className="p-4"><p className="text-[11px] uppercase font-bold text-slate-500">Collected</p><p className="text-2xl font-extrabold text-emerald-700">{inr(revenue)}</p></CardContent></Card>
        <Card className="py-0"><CardContent className="p-4"><p className="text-[11px] uppercase font-bold text-slate-500">Payments</p><p className="text-2xl font-extrabold">{payments.length}</p></CardContent></Card>
        <Card className="py-0"><CardContent className="p-4"><p className="text-[11px] uppercase font-bold text-slate-500">Open invoices</p><p className="text-2xl font-extrabold">{invoices.filter((i) => i.status !== 'paid' && i.status !== 'void').length}</p></CardContent></Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(['payments', 'invoices'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-bold capitalize transition-all ${
                tab === t
                  ? 'bg-violet-700 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <Link
          href="/superadmin/plans"
          className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 flex items-center gap-1.5 transition-colors"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Manage Plans & Pricing</span>
          <span>→</span>
        </Link>
      </div>

      {tab === 'payments' && (
        <Card className="py-0 overflow-hidden">
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                <tr>
                  <th className="text-left px-4 py-3">Tenant</th>
                  <th className="text-left px-4 py-3">Amount</th>
                  <th className="text-left px-4 py-3">Method</th>
                  <th className="text-left px-4 py-3">Coupon</th>
                  <th className="text-left px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="px-4 py-3 font-medium">{p.school?.name}<span className="block text-[11px] text-slate-400 font-mono">{p.school?.code}</span></td>
                    <td className="px-4 py-3 font-bold text-emerald-700">{inr(p.amount)}</td>
                    <td className="px-4 py-3 capitalize">{p.method}{p.reference ? ` · ${p.reference}` : ''}</td>
                    <td className="px-4 py-3">{p.couponCode || '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{new Date(p.paidAt).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {payments.length === 0 && <p className="p-8 text-center text-slate-500"><CreditCard className="w-6 h-6 mx-auto mb-2 text-slate-300" />No payments yet.</p>}
          </CardContent>
        </Card>
      )}

      {tab === 'invoices' && (
        <Card className="py-0 overflow-hidden">
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                <tr>
                  <th className="text-left px-4 py-3">Invoice #</th>
                  <th className="text-left px-4 py-3">Tenant</th>
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-left px-4 py-3">Total</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const isPaid = inv.status === 'paid';
                  return (
                    <tr key={inv.id} className="border-t hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleViewInvoice(inv)}
                          className="font-mono font-bold text-violet-700 hover:text-violet-900 hover:underline flex items-center gap-1.5"
                        >
                          <FileText className="w-3.5 h-3.5 text-violet-500" />
                          {inv.number}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{inv.school?.name}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{inv.school?.code}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {new Date(inv.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-900">{inr(inv.total)}</td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={`capitalize font-bold text-[11px] ${
                            isPaid
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : inv.status === 'overdue'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {inv.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleViewInvoice(inv)}
                            className="h-8 text-xs font-bold text-violet-700 border-violet-200 hover:bg-violet-50"
                          >
                            <Eye className="w-3.5 h-3.5 mr-1" /> View Invoice
                          </Button>
                          {!isPaid && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => markPaid(inv.id)}
                              className="h-8 text-xs font-bold text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                            >
                              Mark paid
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {invoices.length === 0 && (
              <p className="p-8 text-center text-slate-500">
                <FileText className="w-6 h-6 mx-auto mb-2 text-slate-300" />
                No invoices issued yet.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Ultra-Stylish View Invoice Modal */}
      <Dialog open={invoiceModalOpen} onOpenChange={setInvoiceModalOpen}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden rounded-2xl border-slate-200/80 shadow-2xl max-h-[92vh] flex flex-col">
          <DialogHeader className="sr-only">
            <DialogTitle>Tax Invoice {selectedInvoice?.number}</DialogTitle>
            <DialogDescription>Detailed school subscription tax invoice receipt</DialogDescription>
          </DialogHeader>
          {selectedInvoice && (() => {
            const subtotal = selectedInvoice.amount || 0;
            const discount = selectedInvoice.discount || 0;
            const taxable = Math.max(0, subtotal - discount);
            const tax = selectedInvoice.tax > 0 ? selectedInvoice.tax : Math.round(taxable * 0.18 * 100) / 100;
            const cgst = Math.round((tax / 2) * 100) / 100;
            const sgst = Math.round((tax / 2) * 100) / 100;
            const grandTotal = selectedInvoice.total && selectedInvoice.total !== subtotal ? selectedInvoice.total : taxable + tax;

            return (
              <div className="flex flex-col h-full overflow-y-auto">
                {/* Sleek Gradient Accent Ribbon */}
                <div className="h-2 w-full bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 shrink-0" />

                <div className="p-6 sm:p-8 space-y-6 flex-1">
                  {/* Header with Official Logo & Status Badge */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
                    <div className="flex items-center gap-3.5">
                      {/* Brand Logo */}
                      <div className="p-2 rounded-xl bg-white border border-slate-200/80 shadow-xs">
                        <img
                          src="/logo.png?v=3"
                          alt="Smart Calendar"
                          className="h-9 w-auto object-contain"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h2 className="text-xl font-black text-slate-900 tracking-tight">Smart Calendar</h2>
                          <Sparkles className="w-4 h-4 text-violet-600" />
                        </div>
                        <p className="text-xs text-slate-500 font-medium">AI Timetable & Educational Cloud Platform</p>
                      </div>
                    </div>

                    <div className="sm:text-right space-y-1">
                      <div className="text-[10px] font-black uppercase tracking-widest text-violet-700 font-mono">
                        OFFICIAL TAX INVOICE
                      </div>
                      <div className="text-2xl font-black font-mono text-slate-900 tracking-tight">
                        {selectedInvoice.number}
                      </div>
                      <div>
                        {selectedInvoice.status === 'paid' ? (
                          <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-300 font-black text-[11px] uppercase px-3 py-0.5 shadow-xs">
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600 inline" />
                            PAID & VERIFIED
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-50 text-amber-700 border border-amber-300 font-black text-[11px] uppercase px-3 py-0.5">
                            {selectedInvoice.status}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 2-Column Info Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Customer / School Info */}
                    <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/70 space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-slate-400" /> BILLED TO
                      </p>
                      <h3 className="text-base font-black text-slate-900">{selectedInvoice.school?.name}</h3>
                      <div className="inline-block px-2 py-0.5 rounded bg-violet-100/80 text-violet-800 font-mono font-bold text-[11px]">
                        TENANT CODE: {selectedInvoice.school?.code}
                      </div>
                      <div className="text-xs text-slate-600 space-y-1 pt-1">
                        {selectedInvoice.school?.email && (
                          <p className="flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5 text-slate-400" />
                            {selectedInvoice.school?.email}
                          </p>
                        )}
                        {selectedInvoice.school?.phone && (
                          <p className="flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-slate-400" />
                            {selectedInvoice.school?.phone}
                          </p>
                        )}
                        {selectedInvoice.school?.address && (
                          <p className="flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            {selectedInvoice.school?.address}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Invoice Details & Issuer */}
                    <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/70 space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" /> INVOICE DETAILS
                      </p>
                      <div className="text-xs space-y-1.5 pt-1">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Invoice Date:</span>
                          <span className="font-bold text-slate-800">
                            {new Date(selectedInvoice.createdAt).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </span>
                        </div>
                        {selectedInvoice.dueDate && (
                          <div className="flex justify-between">
                            <span className="text-slate-500">Payment Due:</span>
                            <span className="font-bold text-slate-800">
                              {new Date(selectedInvoice.dueDate).toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-slate-500">GST Rate:</span>
                          <span className="font-bold text-violet-700">18% (CGST 9% + SGST 9%)</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">SAC / HSN Code:</span>
                          <span className="font-mono text-slate-700">998313 (IT Software)</span>
                        </div>
                        <div className="flex justify-between items-start pt-1 border-t border-slate-200/60 gap-2">
                          <span className="text-slate-500 shrink-0">Issued By:</span>
                          <span className="font-semibold text-slate-800 text-right">
                            Kam Global for AI & Digital Media Solutions Pvt. Ltd
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500">Support / Billing:</span>
                          <a href="mailto:support@kiccpa.com" className="text-violet-700 font-semibold hover:underline">
                            support@kiccpa.com
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Stylish Itemized Table */}
                  <div className="rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                    <table className="w-full text-left">
                      <thead className="bg-slate-900 text-white text-[11px] uppercase font-bold tracking-wider">
                        <tr>
                          <th className="py-3 px-4">Item & Description</th>
                          <th className="py-3 px-4 text-center">Plan Tier</th>
                          <th className="py-3 px-4 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        <tr className="bg-white">
                          <td className="py-3.5 px-4">
                            <p className="font-extrabold text-slate-900 text-sm">
                              Smart Calendar Educational Cloud Subscription
                            </p>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              SAC: 998313 • Cloud access to timetable solver, attendance, substitutions & faculty manager
                            </p>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              <span className="px-2 py-0.5 rounded bg-slate-100 text-[10px] font-semibold text-slate-700">
                                ✓ AI Timetable Solver
                              </span>
                              <span className="px-2 py-0.5 rounded bg-slate-100 text-[10px] font-semibold text-slate-700">
                                ✓ Auto Substitutions
                              </span>
                              <span className="px-2 py-0.5 rounded bg-slate-100 text-[10px] font-semibold text-slate-700">
                                ✓ Faculty Workload Engine
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-center font-bold text-slate-700">
                            1 School License
                          </td>
                          <td className="py-3.5 px-4 text-right font-extrabold text-slate-900 text-sm">
                            {inr(subtotal)}
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    {/* Financial Totals Block with 18% GST */}
                    <div className="bg-gradient-to-br from-slate-50 to-violet-50/40 p-4 sm:p-5 border-t border-slate-200">
                      <div className="max-w-xs ml-auto space-y-2 text-xs">
                        <div className="flex justify-between text-slate-600">
                          <span>Subtotal (Base Value):</span>
                          <span className="font-semibold text-slate-800">{inr(subtotal)}</span>
                        </div>
                        {discount > 0 && (
                          <div className="flex justify-between text-emerald-700 font-bold">
                            <span>Discount {selectedInvoice.couponCode ? `(${selectedInvoice.couponCode})` : ''}:</span>
                            <span>- {inr(discount)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-slate-700 font-medium pt-1 border-t border-dashed border-slate-200">
                          <span>Taxable Amount:</span>
                          <span className="font-bold text-slate-900">{inr(taxable)}</span>
                        </div>
                        <div className="flex justify-between text-violet-700">
                          <span>CGST (9%):</span>
                          <span className="font-semibold">+ {inr(cgst)}</span>
                        </div>
                        <div className="flex justify-between text-violet-700">
                          <span>SGST (9%):</span>
                          <span className="font-semibold">+ {inr(sgst)}</span>
                        </div>
                        <div className="flex justify-between text-violet-900 font-bold bg-violet-100/70 px-2 py-1 rounded">
                          <span>Total 18% GST:</span>
                          <span>+ {inr(tax)}</span>
                        </div>
                        <div className="flex justify-between items-center text-base font-black text-slate-900 pt-2 border-t-2 border-violet-600">
                          <span>Grand Total:</span>
                          <span className="text-xl text-violet-700 font-mono font-black">
                            {inr(grandTotal)}
                          </span>
                        </div>
                        <p className="text-[10px] text-right text-slate-400 font-medium pt-1">
                          SAC: 998313 • 18% GST Included
                        </p>
                      </div>
                    </div>
                  </div>

                {/* Paid Confirmation Box */}
                {selectedInvoice.status === 'paid' && selectedInvoice.payments && selectedInvoice.payments.length > 0 && (
                  <div className="rounded-xl bg-emerald-50/70 border border-emerald-200 p-3.5 text-xs text-emerald-900 space-y-1">
                    <div className="font-bold flex items-center gap-1.5 text-emerald-800">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Payment Authenticated & Reconciled
                    </div>
                    {selectedInvoice.payments.map((p: any) => (
                      <p key={p.id} className="text-emerald-800/80">
                        Received <span className="font-bold">{inr(p.amount)}</span> via <span className="font-bold uppercase">{p.method}</span>
                        {p.reference ? ` (Ref/UTR: ${p.reference})` : ''} on {new Date(p.paidAt).toLocaleDateString('en-IN')}.
                      </p>
                    ))}
                  </div>
                )}

                {/* Digital Verification & Stamp */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 text-[11px] text-slate-400 border-t border-slate-100">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-violet-600" />
                    <span>Cryptographically Generated & Verified SaaS Invoice</span>
                  </div>
                  <div className="font-mono text-[10px]">
                    DOC ID: {selectedInvoice.id}
                  </div>
                </div>
              </div>

              {/* Sticky Dialog Footer Actions */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col-reverse sm:flex-row items-center justify-between gap-2 shrink-0">
                <Button variant="outline" onClick={() => setInvoiceModalOpen(false)} className="w-full sm:w-auto">
                  Close
                </Button>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  {selectedInvoice.status !== 'paid' && (
                    <Button
                      variant="outline"
                      onClick={() => markPaid(selectedInvoice.id)}
                      className="text-emerald-700 border-emerald-200 hover:bg-emerald-50 font-bold text-xs flex-1 sm:flex-initial"
                    >
                      Mark as Paid
                    </Button>
                  )}
                  <Button
                    onClick={handlePrint}
                    className="bg-violet-700 hover:bg-violet-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 flex-1 sm:flex-initial shadow-sm"
                  >
                    <Printer className="w-3.5 h-3.5" /> Print / Save PDF
                  </Button>
                </div>
              </div>
            </div>
          );
        })()}
        </DialogContent>
      </Dialog>

      {/* Record Payment Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record a payment</DialogTitle>
            <DialogDescription>Logs a received UPI, bank, card, or gateway payment against a tenant. Optional coupon is applied automatically.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Tenant</Label>
              <select className="h-9 w-full rounded-md border px-2 text-sm" value={form.schoolId} onChange={(e) => setForm({ ...form, schoolId: e.target.value })}>
                <option value="">Select school…</option>
                {tenants.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Amount (INR)</Label>
                <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div>
                <Label>Method</Label>
                <select className="h-9 w-full rounded-md border px-2 text-sm" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                  <option value="upi">UPI</option>
                  <option value="bank">Bank transfer</option>
                  <option value="card">Card</option>
                  <option value="razorpay">Razorpay</option>
                  <option value="stripe">Stripe</option>
                  <option value="manual">Manual / cash</option>
                </select>
              </div>
            </div>
            <div>
              <Label>Coupon code (optional)</Label>
              <Input value={form.couponCode} onChange={(e) => setForm({ ...form, couponCode: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <Label>Reference / UTR</Label>
              <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={saving || !form.schoolId || !form.amount} onClick={record} className="bg-violet-700 hover:bg-violet-800">Save payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
