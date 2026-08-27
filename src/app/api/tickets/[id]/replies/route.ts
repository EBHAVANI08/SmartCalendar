import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await request.json();
  if (!body.body) return NextResponse.json({ error: 'Reply required' }, { status: 400 });
  const email = request.headers.get('x-user-email') || 'user';
  const role = request.headers.get('x-user-role') || 'school';
  const ticket = await db.supportTicket.findUnique({ where: { id } });
  if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });

  const reply = await db.ticketReply.create({
    data: {
      ticketId: id,
      authorName: email,
      authorEmail: email,
      authorRole: role,
      body: body.body,
    },
  });
  await db.supportTicket.update({ where: { id }, data: { status: 'pending' } });
  return NextResponse.json({ success: true, reply });
}
