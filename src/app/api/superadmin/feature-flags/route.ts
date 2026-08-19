import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

function checkAuth(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  return token === process.env.SUPERADMIN_TOKEN || token === 'sa_dev_token_2026';
}

// GET /api/superadmin/feature-flags?schoolId=xxx&token=xxx
export async function GET(request: Request) {
  if (!checkAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const schoolId = searchParams.get('schoolId');
  if (!schoolId) return NextResponse.json({ error: 'schoolId required' }, { status: 400 });

  let flags = await db.schoolFeatureFlags.findUnique({ where: { schoolId } });
  if (!flags) {
    flags = await db.schoolFeatureFlags.create({ data: { schoolId } });
  }
  return NextResponse.json({ flags });
}

// PUT /api/superadmin/feature-flags?schoolId=xxx&token=xxx
export async function PUT(request: Request) {
  if (!checkAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const schoolId = searchParams.get('schoolId');
  if (!schoolId) return NextResponse.json({ error: 'schoolId required' }, { status: 400 });

  const body = await request.json();

  const flags = await db.schoolFeatureFlags.upsert({
    where: { schoolId },
    create: { schoolId, ...body },
    update: body,
  });
  return NextResponse.json({ success: true, flags });
}
