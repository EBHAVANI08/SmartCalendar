import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { TENANT_ROLE_MODULES } from '@/lib/access';
import { isSuperAdminRequest, seatUsage, unauthorized, writeAudit } from '@/lib/superadmin';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  if (!(await isSuperAdminRequest(request))) return unauthorized();
  const { id } = await ctx.params;
  const members = await db.workspaceMember.findMany({ where: { schoolId: id }, orderBy: { createdAt: 'desc' } });
  const seats = await seatUsage(id);
  return NextResponse.json({
    members: members.map(({ password: _p, ...m }) => m),
    seats,
  });
}

export async function POST(request: Request, ctx: Ctx) {
  if (!(await isSuperAdminRequest(request))) return unauthorized();
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

  const existing = await db.workspaceMember.findFirst({
    where: { schoolId: id, email: String(email).toLowerCase() },
  });
  if (existing) return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 });

  const teacherEmail = await db.teacher.findFirst({ where: { email: String(email).toLowerCase() } });
  if (teacherEmail) return NextResponse.json({ error: 'This email is already used by a faculty login' }, { status: 409 });

  const memberRole = role || 'staff';
  const mods = Array.isArray(modules) && modules.length ? modules : (TENANT_ROLE_MODULES[memberRole] || TENANT_ROLE_MODULES.staff);

  const rawPassword = password || `Member${Math.random().toString(36).slice(2, 8)}`;
  const hashedPassword = await bcrypt.hash(rawPassword, 10);

  const member = await db.workspaceMember.create({
    data: {
      schoolId: id,
      name,
      email: String(email).toLowerCase(),
      password: hashedPassword,
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
        password: hashedPassword,
        subject: body.subject || 'General',
        schoolId: id,
      },
    }).catch(() => null);
  }

  await writeAudit(request, 'member.create', 'workspaceMember', member.id, { schoolId: id, role: memberRole });
  const { password: _p, ...safeMember } = member;
  return NextResponse.json({ success: true, member: safeMember }, { status: 201 });
}

export async function PATCH(request: Request, ctx: Ctx) {
  if (!(await isSuperAdminRequest(request))) return unauthorized();
  const { id } = await ctx.params;
  const body = await request.json();
  if (!body.memberId) return NextResponse.json({ error: 'memberId required' }, { status: 400 });
  const hashedPassword = body.password ? await bcrypt.hash(body.password, 10) : undefined;
  const member = await db.workspaceMember.update({
    where: { id: body.memberId },
    data: {
      name: body.name,
      role: body.role,
      status: body.status,
      modules: Array.isArray(body.modules) ? JSON.stringify(body.modules) : body.modules,
      password: hashedPassword,
    },
  });
  await writeAudit(request, 'member.update', 'workspaceMember', member.id, { schoolId: id });
  const { password: _p, ...safeMember } = member;
  return NextResponse.json({ success: true, member: safeMember });
}
