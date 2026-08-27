import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { ensureDefaultPlans, isSuperAdminRequest, unauthorized, writeAudit } from '@/lib/superadmin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!isSuperAdminRequest(request)) return unauthorized();
  await ensureDefaultPlans();
  const plans = await db.plan.findMany({ orderBy: { sortOrder: 'asc' } });
  return NextResponse.json({ plans });
}

export async function POST(request: Request) {
  if (!isSuperAdminRequest(request)) return unauthorized();
  const body = await request.json();
  if (!body.name || !body.displayName) {
    return NextResponse.json({ error: 'name and displayName are required' }, { status: 400 });
  }
  const plan = await db.plan.create({
    data: {
      name: String(body.name).toLowerCase().replace(/\s+/g, '-'),
      displayName: body.displayName,
      description: body.description || undefined,
      priceMonthly: Number(body.priceMonthly || 0),
      priceYearly: Number(body.priceYearly || 0),
      currency: body.currency || 'INR',
      maxTeachers: Number(body.maxTeachers || 50),
      maxGrades: Number(body.maxGrades || 12),
      maxPeriodsPerDay: Number(body.maxPeriodsPerDay || 8),
      features: Array.isArray(body.features) ? JSON.stringify(body.features) : (body.features || '[]'),
      isActive: body.isActive !== false,
      sortOrder: Number(body.sortOrder || 99),
    },
  });
  await writeAudit(request, 'plan.create', 'plan', plan.id, { name: plan.name });
  return NextResponse.json({ success: true, plan }, { status: 201 });
}

export async function PUT(request: Request) {
  if (!isSuperAdminRequest(request)) return unauthorized();
  const body = await request.json();
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const plan = await db.plan.update({
    where: { id: body.id },
    data: {
      displayName: body.displayName,
      description: body.description,
      priceMonthly: body.priceMonthly != null ? Number(body.priceMonthly) : undefined,
      priceYearly: body.priceYearly != null ? Number(body.priceYearly) : undefined,
      maxTeachers: body.maxTeachers != null ? Number(body.maxTeachers) : undefined,
      maxGrades: body.maxGrades != null ? Number(body.maxGrades) : undefined,
      maxPeriodsPerDay: body.maxPeriodsPerDay != null ? Number(body.maxPeriodsPerDay) : undefined,
      isActive: body.isActive,
      features: Array.isArray(body.features) ? JSON.stringify(body.features) : body.features,
    },
  });
  await writeAudit(request, 'plan.update', 'plan', plan.id);
  return NextResponse.json({ success: true, plan });
}
