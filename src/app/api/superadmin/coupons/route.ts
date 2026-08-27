import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { isSuperAdminRequest, unauthorized, writeAudit } from '@/lib/superadmin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!isSuperAdminRequest(request)) return unauthorized();
  const coupons = await db.coupon.findMany({
    include: { _count: { select: { redemptions: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ coupons });
}

export async function POST(request: Request) {
  if (!isSuperAdminRequest(request)) return unauthorized();
  const body = await request.json();
  const code = String(body.code || '').trim().toUpperCase();
  if (!code || body.discountValue == null) {
    return NextResponse.json({ error: 'code and discountValue are required' }, { status: 400 });
  }
  if (!['percent', 'fixed'].includes(body.discountType || 'percent')) {
    return NextResponse.json({ error: 'discountType must be percent or fixed' }, { status: 400 });
  }

  const existing = await db.coupon.findUnique({ where: { code } });
  if (existing) return NextResponse.json({ error: 'Coupon code already exists' }, { status: 409 });

  const coupon = await db.coupon.create({
    data: {
      code,
      description: body.description || undefined,
      discountType: body.discountType || 'percent',
      discountValue: Number(body.discountValue),
      currency: body.currency || 'INR',
      maxRedemptions: body.maxRedemptions != null && body.maxRedemptions !== '' ? Number(body.maxRedemptions) : undefined,
      minAmount: Number(body.minAmount || 0),
      appliesToPlan: body.appliesToPlan || undefined,
      startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      isActive: body.isActive !== false,
      createdBy: request.headers.get('x-user-email') || 'superadmin',
    },
  });
  await writeAudit(request, 'coupon.create', 'coupon', coupon.id, { code });
  return NextResponse.json({ success: true, coupon }, { status: 201 });
}
