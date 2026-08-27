import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import {
  addDays,
  addMonths,
  ensureDefaultPlans,
  isSuperAdminRequest,
  unauthorized,
  writeAudit,
} from '@/lib/superadmin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!isSuperAdminRequest(request)) return unauthorized();

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  const status = searchParams.get('status');

  const tenants = await db.school.findMany({
    where: {
      ...(status && status !== 'all' ? { status } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q } },
              { code: { contains: q } },
              { email: { contains: q } },
            ],
          }
        : {}),
    },
    include: {
      featureFlags: true,
      _count: { select: { teachers: true, schedules: true, payments: true, subscriptions: true } },
      subscriptions: { orderBy: { createdAt: 'desc' }, take: 1, include: { plan: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ tenants });
}

export async function POST(request: Request) {
  if (!isSuperAdminRequest(request)) return unauthorized();
  await ensureDefaultPlans();

  const body = await request.json();
  const {
    name, code, email, password, planName, contactName, phone, notes, billingCycle,
  } = body as Record<string, string>;

  if (!name || !code || !email || !password) {
    return NextResponse.json({ error: 'name, code, email and password are required' }, { status: 400 });
  }

  const existing = await db.school.findFirst({
    where: { OR: [{ email: email.toLowerCase() }, { code: code.toUpperCase() }] },
  });
  if (existing) {
    return NextResponse.json({ error: 'A tenant with this email or school code already exists' }, { status: 409 });
  }

  const school = await db.school.create({
    data: {
      name,
      code: code.toUpperCase(),
      email: email.toLowerCase(),
      password,
      contactName: contactName || undefined,
      phone: phone || undefined,
      notes: notes || undefined,
      includedSeats: 5,
      extraSeats: 0,
      status: 'active',
    },
  });

  const planKey = (planName || 'trial').toLowerCase();
  const plan = await db.plan.findUnique({ where: { name: planKey } });

  await db.schoolFeatureFlags.create({
    data: {
      schoolId: school.id,
      planName: planKey,
      maxTeachers: plan?.maxTeachers ?? 50,
      maxGrades: plan?.maxGrades ?? 12,
      maxPeriodsPerDay: plan?.maxPeriodsPerDay ?? 8,
      trialEndsAt: planKey === 'trial' ? addDays(new Date(), 14) : undefined,
    },
  });

  if (plan) {
    const cycle = billingCycle === 'yearly' ? 'yearly' : 'monthly';
    const amount = cycle === 'yearly' ? plan.priceYearly : plan.priceMonthly;
    await db.subscription.create({
      data: {
        schoolId: school.id,
        planId: plan.id,
        status: planKey === 'trial' ? 'trial' : 'active',
        billingCycle: cycle,
        amount,
        currency: plan.currency,
        currentPeriodEnd: cycle === 'yearly' ? addMonths(new Date(), 12) : addMonths(new Date(), 1),
      },
    });
  }

  await writeAudit(request, 'tenant.create', 'school', school.id, { name, code: school.code, plan: planKey });
  return NextResponse.json({ success: true, school }, { status: 201 });
}
