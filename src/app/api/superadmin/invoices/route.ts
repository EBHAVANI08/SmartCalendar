import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { isSuperAdminRequest, nextInvoiceNumber, unauthorized, writeAudit } from '@/lib/superadmin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!isSuperAdminRequest(request)) return unauthorized();
  const { searchParams } = new URL(request.url);
  const schoolId = searchParams.get('schoolId');
  const status = searchParams.get('status');

  const invoices = await db.invoice.findMany({
    where: {
      ...(schoolId ? { schoolId } : {}),
      ...(status && status !== 'all' ? { status } : {}),
    },
    include: { school: { select: { id: true, name: true, code: true } }, payments: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return NextResponse.json({ invoices });
}

export async function POST(request: Request) {
  if (!isSuperAdminRequest(request)) return unauthorized();
  const body = await request.json();
  if (!body.schoolId || body.amount == null) {
    return NextResponse.json({ error: 'schoolId and amount are required' }, { status: 400 });
  }
  const discount = Number(body.discount || 0);
  const tax = Number(body.tax || 0);
  const amount = Number(body.amount);
  const invoice = await db.invoice.create({
    data: {
      schoolId: body.schoolId,
      number: await nextInvoiceNumber(),
      amount,
      discount,
      tax,
      total: Math.max(0, amount - discount + tax),
      currency: body.currency || 'INR',
      status: body.status || 'issued',
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      notes: body.notes || undefined,
    },
  });
  await writeAudit(request, 'invoice.create', 'invoice', invoice.id, { number: invoice.number });
  return NextResponse.json({ success: true, invoice }, { status: 201 });
}

export async function PATCH(request: Request) {
  if (!isSuperAdminRequest(request)) return unauthorized();
  const body = await request.json();
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const invoice = await db.invoice.update({
    where: { id: body.id },
    data: {
      status: body.status,
      paidAt: body.status === 'paid' ? new Date() : undefined,
      notes: body.notes,
    },
  });
  await writeAudit(request, 'invoice.update', 'invoice', invoice.id, { status: invoice.status });
  return NextResponse.json({ success: true, invoice });
}
