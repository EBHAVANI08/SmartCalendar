import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { actorFrom, isSuperAdminRequest, unauthorized, writeAudit } from '@/lib/superadmin';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  if (!isSuperAdminRequest(request)) return unauthorized();
  const { id } = await ctx.params;
  const body = await request.json();
  if (!body.body) return NextResponse.json({ error: 'Reply body required' }, { status: 400 });
  const actor = actorFrom(request);
  const reply = await db.ticketReply.create({
    data: {
      ticketId: id,
      authorName: actor.email,
      authorEmail: actor.email,
      authorRole: 'superadmin',
      body: body.body,
    },
  });
  await db.supportTicket.update({
    where: { id },
    data: { status: body.close ? 'resolved' : 'pending' },
  });
  await writeAudit(request, 'ticket.reply', 'ticket', id);
  return NextResponse.json({ success: true, reply });
}
