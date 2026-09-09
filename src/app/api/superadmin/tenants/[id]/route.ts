import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import {
  addMonths,
  ensureDefaultPlans,
  isSuperAdminRequest,
  seatUsage,
  unauthorized,
  writeAudit,
} from '@/lib/superadmin';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  if (!(await isSuperAdminRequest(request))) return unauthorized();
  const { id } = await ctx.params;

  const tenant = await db.school.findUnique({
    where: { id },
    include: {
      featureFlags: true,
      _count: { select: { teachers: true, schedules: true } },
      subscriptions: { orderBy: { createdAt: 'desc' }, include: { plan: true } },
      payments: { orderBy: { paidAt: 'desc' }, take: 25 },
      invoices: { orderBy: { createdAt: 'desc' }, take: 25 },
      couponRedemptions: { include: { coupon: true }, orderBy: { createdAt: 'desc' } },
    },
  });
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  const teachers = await db.teacher.findMany({
    where: { schoolId: id },
    select: { id: true, name: true, email: true, subject: true, role: true, createdAt: true },
    orderBy: { name: 'asc' },
    take: 80,
  });
  const members = await db.workspaceMember.findMany({
    where: { schoolId: id },
    orderBy: { createdAt: 'desc' },
  });
  const tickets = await db.supportTicket.findMany({
    where: { schoolId: id },
    include: { replies: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const messages = await db.tenantMessage.findMany({
    where: { schoolId: id },
    orderBy: { createdAt: 'desc' },
    take: 80,
  });
  const seats = await seatUsage(id);

  const { password: _pw, ...safe } = tenant;
  return NextResponse.json({ tenant: safe, teachers, members, tickets, messages, seats });
}

export async function PATCH(request: Request, ctx: Ctx) {
  if (!(await isSuperAdminRequest(request))) return unauthorized();
  await ensureDefaultPlans();
  const { id } = await ctx.params;
  const body = await request.json();
  const action = body.action as string | undefined;

  const existing = await db.school.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  if (action === 'suspend' || action === 'activate' || action === 'cancel' || action === 'inactive') {
    const status = action === 'suspend' ? 'suspended' : (action === 'cancel' || action === 'inactive') ? 'cancelled' : 'active';
    const school = await db.school.update({ where: { id }, data: { status } });
    if (action !== 'activate') {
      await db.subscription.updateMany({
        where: { schoolId: id, status: { in: ['active', 'trial'] } },
        data: { status: (action === 'cancel' || action === 'inactive') ? 'cancelled' : 'paused', cancelledAt: (action === 'cancel' || action === 'inactive') ? new Date() : undefined },
      });
    }
    await writeAudit(request, `tenant.${action}`, 'school', id, { status });
    return NextResponse.json({ success: true, school });
  }

  if (action === 'resetPassword') {
    const password = (body.password as string) || `School${Math.random().toString(36).slice(2, 8)}`;
    const hashedPassword = await bcrypt.hash(password, 10);
    await db.school.update({ where: { id }, data: { password: hashedPassword } });
    await writeAudit(request, 'tenant.resetPassword', 'school', id);
    return NextResponse.json({ success: true, password });
  }

  if (action === 'assignPlan') {
    const plan = await db.plan.findUnique({ where: { name: String(body.planName || '').toLowerCase() } });
    if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    const cycle = body.billingCycle === 'yearly' ? 'yearly' : 'monthly';
    const amount = cycle === 'yearly' ? plan.priceYearly : plan.priceMonthly;

    await db.subscription.updateMany({
      where: { schoolId: id, status: { in: ['active', 'trial'] } },
      data: { status: 'cancelled', cancelledAt: new Date() },
    });
    const subscription = await db.subscription.create({
      data: {
        schoolId: id,
        planId: plan.id,
        status: plan.name === 'trial' ? 'trial' : 'active',
        billingCycle: cycle,
        amount,
        currency: plan.currency,
        currentPeriodEnd: cycle === 'yearly' ? addMonths(new Date(), 12) : addMonths(new Date(), 1),
      },
    });
    await db.schoolFeatureFlags.upsert({
      where: { schoolId: id },
      create: {
        schoolId: id,
        planName: plan.name,
        maxTeachers: plan.maxTeachers,
        maxGrades: plan.maxGrades,
        maxPeriodsPerDay: plan.maxPeriodsPerDay,
      },
      update: {
        planName: plan.name,
        maxTeachers: plan.maxTeachers,
        maxGrades: plan.maxGrades,
        maxPeriodsPerDay: plan.maxPeriodsPerDay,
      },
    });
    await writeAudit(request, 'tenant.assignPlan', 'school', id, { plan: plan.name, cycle });
    return NextResponse.json({ success: true, subscription });
  }

  if (action === 'grantSeats') {
    const extraSeats = Math.max(0, Number(body.extraSeats ?? existing.extraSeats ?? 0));
    const includedSeats = body.includedSeats != null ? Math.max(1, Number(body.includedSeats)) : undefined;
    const school = await db.school.update({
      where: { id },
      data: { extraSeats, ...(includedSeats != null ? { includedSeats } : {}) },
    });
    await writeAudit(request, 'tenant.grantSeats', 'school', id, { extraSeats, includedSeats });
    return NextResponse.json({ success: true, school });
  }

  if (body.planName) {
    const plan = await db.plan.findUnique({ where: { name: String(body.planName).toLowerCase() } });
    if (plan) {
      await db.schoolFeatureFlags.upsert({
        where: { schoolId: id },
        create: {
          schoolId: id,
          planName: plan.name,
          maxTeachers: plan.maxTeachers,
          maxGrades: plan.maxGrades,
          maxPeriodsPerDay: plan.maxPeriodsPerDay,
        },
        update: {
          planName: plan.name,
          maxTeachers: plan.maxTeachers,
          maxGrades: plan.maxGrades,
          maxPeriodsPerDay: plan.maxPeriodsPerDay,
        },
      });
    }
  }

  const school = await db.school.update({
    where: { id },
    data: {
      name: body.name ?? undefined,
      code: body.code ? String(body.code).toUpperCase() : undefined,
      email: body.email ? String(body.email).toLowerCase() : undefined,
      contactName: body.contactName,
      phone: body.phone,
      notes: body.notes,
      status: body.status ?? undefined,
    },
  });
  await writeAudit(request, 'tenant.update', 'school', id, { fields: Object.keys(body) });
  return NextResponse.json({ success: true, school });
}

export async function DELETE(request: Request, ctx: Ctx) {
  if (!(await isSuperAdminRequest(request))) return unauthorized();
  const { id } = await ctx.params;
  const url = new URL(request.url);
  const permanent = url.searchParams.get('permanent') === 'true';

  if (permanent) {
    // Delete associated records first
    await db.schedule.deleteMany({ where: { schoolId: id } }).catch(() => null);
    await db.substitution.deleteMany({ where: { schoolId: id } }).catch(() => null);
    await db.room.deleteMany({ where: { schoolId: id } }).catch(() => null);
    await db.gradeSubjectConfig.deleteMany({ where: { schoolId: id } }).catch(() => null);
    await db.calendarEvent.deleteMany({ where: { schoolId: id } }).catch(() => null);
    await db.teacher.deleteMany({ where: { schoolId: id } }).catch(() => null);
    await db.subscription.deleteMany({ where: { schoolId: id } }).catch(() => null);
    await db.payment.deleteMany({ where: { schoolId: id } }).catch(() => null);
    await db.invoice.deleteMany({ where: { schoolId: id } }).catch(() => null);
    await db.schoolFeatureFlags.deleteMany({ where: { schoolId: id } }).catch(() => null);
    await db.schoolPreferences.deleteMany({ where: { schoolId: id } }).catch(() => null);
    await db.workspaceMember.deleteMany({ where: { schoolId: id } }).catch(() => null);
    await db.supportTicket.deleteMany({ where: { schoolId: id } }).catch(() => null);
    await db.tenantMessage.deleteMany({ where: { schoolId: id } }).catch(() => null);
    const school = await db.school.delete({ where: { id } });
    await writeAudit(request, 'tenant.deletePermanent', 'school', id);
    return NextResponse.json({ success: true, deleted: true, school });
  }

  const school = await db.school.update({ where: { id }, data: { status: 'cancelled' } });
  await writeAudit(request, 'tenant.cancel', 'school', id);
  return NextResponse.json({ success: true, school });
}
