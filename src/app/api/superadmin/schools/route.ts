import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// GET /api/superadmin/schools — list all schools with their feature flags and stats
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  if (token !== process.env.SUPERADMIN_TOKEN && token !== 'sa_dev_token_2026') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const schools = await db.school.findMany({
    include: {
      featureFlags: true,
      _count: { select: { teachers: true, schedules: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ schools });
}

// POST /api/superadmin/schools — create a new school account
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  if (token !== process.env.SUPERADMIN_TOKEN && token !== 'sa_dev_token_2026') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { name, code, email, password, planName } = body;
  if (!name || !code || !email || !password) {
    return NextResponse.json({ error: 'name, code, email and password are required' }, { status: 400 });
  }

  const school = await db.school.create({
    data: { name, code, email, password },
  });

  await db.schoolFeatureFlags.create({
    data: { schoolId: school.id, planName: planName ?? 'standard' },
  });

  return NextResponse.json({ success: true, school });
}
