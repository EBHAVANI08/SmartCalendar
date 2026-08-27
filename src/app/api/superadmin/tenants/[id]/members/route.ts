import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { TENANT_ROLE_MODULES } from '@/lib/access';
import { isSuperAdminRequest, seatUsage, unauthorized, writeAudit } from '@/lib/superadmin';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  if (!isSuperAdminRequest(request)) return unauthorized();
  const { id } = await ctx.params;
  const members = await db.workspaceMember.findMany({ where: { schoolId: id }, orderBy: { createdAt: 'desc' } });
  const seats = await seatUsage(id);
  return NextResponse.json({ members, seats });
}

export async function POST(request: Request, ctx: Ctx) {
  if (!isSuperAdminRequest(request)) return unauthorized();
  const { id } = await ctx.params;
  const body = await request.json();
  const { name, email, password, role, modules, status } = body;
  if (!name || !email) {
    return NextResponse.json({ error: 'name and email are required' }, { status: 400 });
  }

  const seats = await seatUsage(id);
  if (seats && seats.remaining <= 0) {
    return NextResponse.json({
      error: `Seat limit reached (${seats.used}/${seats.allowed}). Grant extra seats from the tenant page.`,
    }, { status: 409 });
  }

  const existing = await db.workspaceMember.findUnique({ where: { email: String(email).toLowerCase() } });
  if (existing) return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 });

  const teacherEmail = await db.teacher.findFirst({ where: { email: String(email).toLowerCase() } });
  if (teacherEmail) return NextResponse.json({ error: 'This email is already used by a faculty login' }, { status: 409 });

  const memberRole = role || 'staff';
  const mods = Array.isArray(modules) && modules.length ? modules : (TENANT_ROLE_MODULES[memberRole] || TENANT_ROLE_MODULES.staff);

  const member = await db.workspaceMember.create({
    data: {
      schoolId: id,
      name,
      email: String(email).toLowerCase(),
      password: password || 'member123',
      role: memberRole,
      modules: JSON.stringify(mods),
      status: status || 'active',
    },
  });

  if (memberRole === 'teacher') {
    await db.teacher.create({
      data: {
        name,
        email: String(email).toLowerCase(),
        password: password || 'teacher123',
        subject: body.subject || 'General',
        schoolId: id,
      },
    }).catch(() => null);
  }

  await writeAudit(request, 'member.create', 'workspaceMember', member.id, { schoolId: id, role: memberRole });
  return NextResponse.json({ success: true, member, password: password || 'member123' }, { status: 201 });
}

export async function PATCH(request: Request, ctx: Ctx) {
  if (!isSuperAdminRequest(request)) return unauthorized();
  const { id } = await ctx.params;
  const body = await request.json();
  if (!body.memberId) return NextResponse.json({ error: 'memberId required' }, { status: 400 });
  const member = await db.workspaceMember.update({
    where: { id: body.memberId },
    data: {
      name: body.name,
      role: body.role,
      status: body.status,
      modules: Array.isArray(body.modules) ? JSON.stringify(body.modules) : body.modules,
      password: body.password || undefined,
    },
  });
  await writeAudit(request, 'member.update', 'workspaceMember', member.id, { schoolId: id });
  return NextResponse.json({ success: true, member });
}
