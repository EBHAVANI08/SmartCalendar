import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import {
  isSuperAdminRequest,
  nextInvoiceNumber,
  unauthorized,
  validateCoupon,
  writeAudit,
} from '@/lib/superadmin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!isSuperAdminRequest(request)) return unauthorized();
  const { searchParams } = new URL(request.url);
  const schoolId = searchParams.get('schoolId');
  const status = searchParams.get('status');

  const payments = await db.payment.findMany({
    where: {
      ...(schoolId ? { schoolId } : {}),
      ...(status && status !== 'all' ? { status } : {}),
    },
    include: { school: { select: { id: true, name: true, code: true } }, invoice: { select: { number: true } } },
    orderBy: { paidAt: 'desc' },
    take: 200,
  });
  return NextResponse.json({ payments });
}

export async function POST(request: Request) {
  if (!isSuperAdminRequest(request)) return unauthorized();
  const body = await request.json();
  const { schoolId, amount, method, reference, notes, couponCode, createInvoice } = body;
  if (!schoolId || amount == null) {
    return NextResponse.json({ error: 'schoolId and amount are required' }, { status: 400 });
  }

  const school = await db.school.findUnique({
    where: { id: schoolId },
    include: { featureFlags: true },
  });
  if (!school) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  let discount = 0;
  let appliedCode: string | undefined;
  if (couponCode) {
    const result = await validateCoupon(String(couponCode), Number(amount), school.featureFlags?.planName);
    if ('error' in result && result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    if (result.coupon) {
      discount = result.discount || 0;
      appliedCode = result.coupon.code;
      await db.coupon.update({
        where: { id: result.coupon.id },
        data: { usedCount: { increment: 1 } },
      });
      await db.couponRedemption.create({
        data: { couponId: result.coupon.id, schoolId, discount },
      });
    }
  }

  const net = Math.max(0, Number(amount) - discount);
  let invoiceId: string | undefined;

  if (createInvoice !== false) {
    const invoice = await db.invoice.create({
      data: {
        schoolId,
        number: await nextInvoiceNumber(),
        amount: Number(amount),
        discount,
        total: net,
        currency: body.currency || 'INR',
        status: 'paid',
        paidAt: new Date(),
        couponCode: appliedCode,
        notes: notes || undefined,
      },
    });
    invoiceId = invoice.id;
  }

  const payment = await db.payment.create({
    data: {
      schoolId,
      invoiceId,
      amount: net,
      currency: body.currency || 'INR',
      method: method || 'manual',
      status: body.status || 'completed',
      reference: reference || undefined,
      couponCode: appliedCode,
      discount,
      notes: notes || undefined,
      paidAt: body.paidAt ? new Date(body.paidAt) : new Date(),
    },
    include: { school: { select: { name: true, code: true } } },
  });

  await writeAudit(request, 'payment.record', 'payment', payment.id, {
    schoolId,
    amount: net,
    coupon: appliedCode,
  });

  return NextResponse.json({ success: true, payment }, { status: 201 });
}
