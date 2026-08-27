import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { isSuperAdminRequest, unauthorized, writeAudit } from '@/lib/superadmin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!isSuperAdminRequest(request)) return unauthorized();

  const schools = await db.school.findMany({
    include: {
      featureFlags: true,
      _count: { select: { teachers: true, schedules: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ schools });
}

export async function POST(request: Request) {
  if (!isSuperAdminRequest(request)) return unauthorized();

  const body = await request.json();
  const { name, code, email, password, planName } = body;
  if (!name || !code || !email || !password) {
    return NextResponse.json({ error: 'name, code, email and password are required' }, { status: 400 });
  }

  const school = await db.school.create({
    data: { name, code: String(code).toUpperCase(), email: String(email).toLowerCase(), password },
  });

  await db.schoolFeatureFlags.create({
    data: { schoolId: school.id, planName: planName ?? 'standard' },
  });

  await writeAudit(request, 'tenant.create', 'school', school.id, { via: 'legacy-schools' });
  return NextResponse.json({ success: true, school });
}
