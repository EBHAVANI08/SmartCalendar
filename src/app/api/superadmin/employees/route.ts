import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { OWNER_ROLE_MODULES } from '@/lib/access';
import { isSuperAdminRequest, unauthorized, writeAudit } from '@/lib/superadmin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!isSuperAdminRequest(request)) return unauthorized();
  const employees = await db.ownerEmployee.findMany({ orderBy: { createdAt: 'desc' } });
  return NextResponse.json({
    employees: employees.map(({ password: _p, ...e }) => e),
  });
}

export async function POST(request: Request) {
  if (!isSuperAdminRequest(request)) return unauthorized();
  const body = await request.json();
  if (!body.name || !body.email || !body.password) {
    return NextResponse.json({ error: 'name, email and password are required' }, { status: 400 });
  }
  const email = String(body.email).toLowerCase();
  const exists = await db.ownerEmployee.findUnique({ where: { email } });
  if (exists) return NextResponse.json({ error: 'An employee with this email already exists' }, { status: 409 });

  const role = body.role || 'support';
  const modules = Array.isArray(body.modules) && body.modules.length
    ? body.modules
    : (OWNER_ROLE_MODULES[role] || OWNER_ROLE_MODULES.support);

  const employee = await db.ownerEmployee.create({
    data: {
      name: body.name,
      email,
      password: body.password,
      role,
      modules: JSON.stringify(modules),
      status: 'active',
      isDemo: Boolean(body.isDemo) || role === 'demo',
      notes: body.notes || undefined,
    },
  });
  await writeAudit(request, 'employee.create', 'ownerEmployee', employee.id, { role, email });
  const { password: _p, ...safe } = employee;
  return NextResponse.json({ success: true, employee: safe }, { status: 201 });
}

export async function PATCH(request: Request) {
  if (!isSuperAdminRequest(request)) return unauthorized();
  const body = await request.json();
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const employee = await db.ownerEmployee.update({
    where: { id: body.id },
    data: {
      name: body.name,
      role: body.role,
      status: body.status,
      isDemo: body.isDemo,
      notes: body.notes,
      password: body.password || undefined,
      modules: Array.isArray(body.modules) ? JSON.stringify(body.modules) : body.modules,
    },
  });
  await writeAudit(request, 'employee.update', 'ownerEmployee', employee.id);
  const { password: _p, ...safe } = employee;
  return NextResponse.json({ success: true, employee: safe });
}
