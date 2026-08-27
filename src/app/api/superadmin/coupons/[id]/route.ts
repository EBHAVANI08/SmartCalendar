import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { isSuperAdminRequest, unauthorized, writeAudit } from '@/lib/superadmin';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  if (!isSuperAdminRequest(request)) return unauthorized();
  const { id } = await ctx.params;
  const body = await request.json();
  const coupon = await db.coupon.update({
    where: { id },
    data: {
      description: body.description,
      discountType: body.discountType,
      discountValue: body.discountValue != null ? Number(body.discountValue) : undefined,
      maxRedemptions: body.maxRedemptions != null && body.maxRedemptions !== '' ? Number(body.maxRedemptions) : undefined,
      minAmount: body.minAmount != null ? Number(body.minAmount) : undefined,
      appliesToPlan: body.appliesToPlan,
      startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      isActive: body.isActive,
    },
  });
  await writeAudit(request, 'coupon.update', 'coupon', id);
  return NextResponse.json({ success: true, coupon });
}

export async function DELETE(request: Request, ctx: Ctx) {
  if (!isSuperAdminRequest(request)) return unauthorized();
  const { id } = await ctx.params;
  const coupon = await db.coupon.update({ where: { id }, data: { isActive: false } });
  await writeAudit(request, 'coupon.deactivate', 'coupon', id);
  return NextResponse.json({ success: true, coupon });
}
