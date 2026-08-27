import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { ensureDefaultPlans, isSuperAdminRequest, unauthorized } from '@/lib/superadmin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!isSuperAdminRequest(request)) return unauthorized();
  await ensureDefaultPlans();

  const now = new Date();
  const monthAgo = new Date(now);
  monthAgo.setDate(monthAgo.getDate() - 30);

  const [
    schools,
    teachers,
    schedules,
    activeTenants,
    suspendedTenants,
    payments,
    monthPayments,
    coupons,
    activeCoupons,
    invoices,
    overdueInvoices,
    subscriptions,
    recentTenants,
    recentPayments,
    recentAudit,
  ] = await Promise.all([
    db.school.count(),
    db.teacher.count(),
    db.schedule.count(),
    db.school.count({ where: { status: 'active' } }),
    db.school.count({ where: { status: 'suspended' } }),
    db.payment.aggregate({
      _sum: { amount: true },
      _count: true,
      where: { status: 'completed' },
    }),
    db.payment.aggregate({
      _sum: { amount: true },
      _count: true,
      where: { status: 'completed', paidAt: { gte: monthAgo } },
    }),
    db.coupon.count(),
    db.coupon.count({ where: { isActive: true } }),
    db.invoice.count(),
    db.invoice.count({ where: { status: { in: ['issued', 'overdue'] } } }),
    db.subscription.groupBy({ by: ['status'], _count: { _all: true } }),
    db.school.findMany({
      orderBy: { createdAt: 'desc' },
      take: 6,
      include: { featureFlags: true, _count: { select: { teachers: true, schedules: true } } },
    }),
    db.payment.findMany({
      orderBy: { paidAt: 'desc' },
      take: 6,
      include: { school: { select: { name: true, code: true } } },
    }),
    db.platformAuditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8 }),
  ]);

  const mrr = await db.subscription.aggregate({
    _sum: { amount: true },
    where: { status: { in: ['active', 'trial'] }, billingCycle: 'monthly' },
  });
  const yearly = await db.subscription.aggregate({
    _sum: { amount: true },
    where: { status: { in: ['active', 'trial'] }, billingCycle: 'yearly' },
  });

  return NextResponse.json({
    kpis: {
      tenants: schools,
      activeTenants,
      suspendedTenants,
      teachers,
      schedules,
      revenueAllTime: payments._sum.amount || 0,
      revenue30d: monthPayments._sum.amount || 0,
      payments30d: monthPayments._count,
      mrr: (mrr._sum.amount || 0) + Math.round((yearly._sum.amount || 0) / 12),
      coupons,
      activeCoupons,
      invoices,
      overdueInvoices,
    },
    subscriptions: Object.fromEntries(subscriptions.map((s) => [s.status, s._count._all])),
    recentTenants,
    recentPayments,
    recentAudit,
  });
}
